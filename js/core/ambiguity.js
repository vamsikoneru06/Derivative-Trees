import { buildTree } from './tree.js';
import { tokenizeTarget } from './tokenize.js';
import { makePruner } from './prune.js';
import { recognizes } from './recognize.js';

export function findTwoTrees(grammar, targetStr, limits = { maxNodes: 200000, maxMs: 800 }) {
    const { tokens: targetTokens, error } = tokenizeTarget(targetStr, grammar);
    if (!targetTokens) {
        return { ambiguous: false, reason: error };
    }
    if (!recognizes(grammar, targetTokens)) {
        return { ambiguous: false, reason: "not derivable" };
    }

    const targetKey = targetTokens.join(' ');
    const keep = makePruner(grammar, targetTokens);

    const startTime = performance.now();

    const queue = [ [grammar.start] ];
    let head = 0;

    // discovery: formKey -> the { parentForm, step } that first enqueued it (null for the
    // start form). Following discovery parents walks a BFS tree, so it always ends at
    // the start form. extras: every later, distinct arrival at a form, from any level,
    // including back-edges such as SS => S via S -> ε.
    const discovery = new Map([[grammar.start, null]]);
    const extras = new Map();

    let foundTarget = false;

    while (head < queue.length) {
        if (head >= limits.maxNodes || ((head & 1023) === 0 && performance.now() - startTime > limits.maxMs)) {
            break;
        }

        const form = queue[head++];
        const formKey = form.join(' ');

        if (formKey === targetKey) {
            foundTarget = true;
            break;
        }

        const leftmostIndex = form.findIndex(sym => grammar.isNonterminal(sym));
        if (leftmostIndex === -1) continue;

        const lhs = form[leftmostIndex];
        const productions = grammar.productions.get(lhs) || [];

        for (const rhs of productions) {
            const nextForm = [
                ...form.slice(0, leftmostIndex),
                ...rhs,
                ...form.slice(leftmostIndex + 1)
            ];
            if (!keep(nextForm)) continue;

            const nextFormKey = nextForm.join(' ');
            const stepRecord = {
                parentForm: form,
                step: { form: form, index: leftmostIndex, lhs: lhs, rhs: rhs }
            };

            if (!discovery.has(nextFormKey)) {
                discovery.set(nextFormKey, stepRecord);
                queue.push(nextForm);
                continue;
            }

            const known = [discovery.get(nextFormKey), ...(extras.get(nextFormKey) || [])];
            const isDuplicate = known.some(e => e &&
                e.parentForm.join(' ') === formKey &&
                e.step.rhs.join(' ') === rhs.join(' ')
            );
            if (!isDuplicate) {
                if (!extras.has(nextFormKey)) extras.set(nextFormKey, []);
                extras.get(nextFormKey).push(stepRecord);
            }
        }
    }

    if (!foundTarget && !discovery.has(targetKey)) {
        return { ambiguous: false, reason: "target not found or limit reached" };
    }

    // Walk back from the target along discovery parents. The first form on the way
    // that was also reached another way is where two derivations merge.
    let mergeFormKey = null;
    for (let k = targetKey; k !== null; k = discovery.get(k) ? discovery.get(k).parentForm.join(' ') : null) {
        if (extras.has(k)) {
            mergeFormKey = k;
            break;
        }
    }

    if (mergeFormKey === null) {
        return { ambiguous: false, reason: "no second tree found within limit" };
    }

    // Derivation 1: the discovery chain to the target.
    // Derivation 2: the discovery chain to the other parent, the other step into the
    // merge form, then derivation 1's steps from the merge form on. If the other parent
    // descends from the merge form (S => SS => S), derivation 2 passes that form twice:
    // still a valid, different derivation.
    const deriv1Steps = discoveryChain(targetKey, discovery);
    const other = extras.get(mergeFormKey)[0];
    const suffixStart = deriv1Steps.findIndex(step => step.form.join(' ') === mergeFormKey);
    const suffixSteps = suffixStart === -1 ? [] : deriv1Steps.slice(suffixStart);
    const deriv2Steps = [...discoveryChain(other.parentForm.join(' '), discovery), other.step, ...suffixSteps];

    const d1 = { order: "leftmost", steps: deriv1Steps, result: targetTokens };
    const d2 = { order: "leftmost", steps: deriv2Steps, result: targetTokens };
    
    const tree1 = buildTree(d1, grammar);
    const tree2 = buildTree(d2, grammar);
    
    const diffNodeIds = diffTrees(tree1, tree2);
    
    return {
        ambiguous: true,
        trees: [tree1, tree2],
        diffNodeIds: diffNodeIds
    };
}

/** Steps from the start form to `formKey`, following discovery parents. */
function discoveryChain(formKey, discovery) {
    const steps = [];
    for (let record = discovery.get(formKey); record; record = discovery.get(record.parentForm.join(' '))) {
        steps.unshift(record.step);
    }
    return steps;
}

function diffTrees(t1, t2) {
    const diffs = [];
    
    function walk(n1, n2) {
        if (!n1 || !n2) return;
        
        const kids1 = n1.children || [];
        const kids2 = n2.children || [];
        
        let diff = false;
        if (kids1.length !== kids2.length) {
            diff = true;
        } else {
            for (let i = 0; i < kids1.length; i++) {
                if (kids1[i].symbol !== kids2[i].symbol) {
                    diff = true;
                    break;
                }
            }
        }
        
        if (diff) {
            diffs.push(n1.id, n2.id); 
        } else {
            for (let i = 0; i < kids1.length; i++) {
                walk(kids1[i], kids2[i]);
            }
        }
    }
    
    walk(t1, t2);
    return diffs;
}
