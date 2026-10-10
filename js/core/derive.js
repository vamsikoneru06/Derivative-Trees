import { tokenizeTarget } from './tokenize.js';
import { makePruner } from './prune.js';
import { recognizes } from './recognize.js';

export function findLeftmost(grammar, targetStr, limits = { maxNodes: 200000, maxMs: 800 }) {
    const { tokens: targetTokens, error } = tokenizeTarget(targetStr, grammar);
    if (!targetTokens) {
        return { found: false, reason: error };
    }
    if (!recognizes(grammar, targetTokens)) {
        return { found: false, reason: "not derivable" };
    }

    const targetKey = targetTokens.join(' ');
    const keep = makePruner(grammar, targetTokens);
    const startTime = performance.now();

    // Each entry points back to the entry it came from; steps are rebuilt at the end.
    const queue = [{ form: [grammar.start], step: null, prev: null }];
    let head = 0;
    const visited = new Set([grammar.start]);

    while (head < queue.length) {
        if (head >= limits.maxNodes) {
            return { found: false, reason: "limit: max nodes exceeded" };
        }
        if ((head & 1023) === 0 && performance.now() - startTime > limits.maxMs) {
            return { found: false, reason: "limit: time exceeded" };
        }

        const entry = queue[head++];
        const { form } = entry;

        if (form.join(' ') === targetKey) {
            const steps = [];
            for (let e = entry; e.step; e = e.prev) steps.unshift(e.step);
            return {
                found: true,
                derivation: {
                    order: "leftmost",
                    steps: steps,
                    result: form
                }
            };
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

            const formKey = nextForm.join(' ');
            if (visited.has(formKey) || !keep(nextForm)) continue;
            visited.add(formKey);
            queue.push({
                form: nextForm,
                step: { form: form, index: leftmostIndex, lhs: lhs, rhs: rhs },
                prev: entry
            });
        }
    }

    return { found: false, reason: "not derivable (exhausted search space)" };
}

export function toRightmost(treeRoot) {
    const steps = [];
    let formNodes = [treeRoot];

    const getFormStr = (nodes) => nodes.map(n => n.symbol);

    while (true) {
        let rightmostIndex = -1;
        for (let i = formNodes.length - 1; i >= 0; i--) {
            const node = formNodes[i];
            if (node.kind === "nonterminal" && node.children && node.children.length > 0) {
                rightmostIndex = i;
                break;
            }
        }

        if (rightmostIndex === -1) break; 

        const nodeToExpand = formNodes[rightmostIndex];
        
        steps.push({
            form: getFormStr(formNodes),
            index: rightmostIndex,
            lhs: nodeToExpand.symbol,
            rhs: nodeToExpand.children.filter(c => c.kind !== "epsilon").map(c => c.symbol)
        });

        const children = nodeToExpand.children;
        if (children.length === 1 && children[0].kind === "epsilon") {
            formNodes = [
                ...formNodes.slice(0, rightmostIndex),
                ...formNodes.slice(rightmostIndex + 1)
            ];
        } else {
            formNodes = [
                ...formNodes.slice(0, rightmostIndex),
                ...children,
                ...formNodes.slice(rightmostIndex + 1)
            ];
        }
    }

    return {
        order: "rightmost",
        steps: steps,
        result: getFormStr(formNodes)
    };
}
