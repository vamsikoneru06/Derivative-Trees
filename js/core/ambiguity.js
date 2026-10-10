import { buildTree } from './tree.js';

export function findTwoTrees(grammar, targetStr, limits = { maxNodes: 200000, maxMs: 800 }) {
    let targetTokens;
    if (typeof targetStr === 'string') {
        if (targetStr.includes(' ') || Array.from(grammar.terminals).some(t => t.length > 1)) {
            targetTokens = targetStr.includes(' ') ? targetStr.split(/\s+/) : targetStr.split('');
        } else {
            targetTokens = targetStr.split('');
        }
    } else {
        targetTokens = targetStr;
    }

    const targetKey = targetTokens.join(' ');
    
    const startTime = performance.now();
    let nodesVisited = 0;

    const queue = [ [grammar.start] ];
    
    // parents map: formKey -> Array of { parentForm: string[], step: Object }
    const parents = new Map();
    parents.set(grammar.start, []); 

    let hasEpsilon = false;
    for (const rules of grammar.productions.values()) {
        if (rules.some(r => r.length === 0)) hasEpsilon = true;
    }

    let foundTarget = false;

    while (queue.length > 0) {
        nodesVisited++;
        if (nodesVisited > limits.maxNodes || (performance.now() - startTime > limits.maxMs)) {
            break; 
        }

        const form = queue.shift();
        const formKey = form.join(' ');

        if (formKey === targetKey) {
            foundTarget = true;
            break;
        }

        let leftmostIndex = -1;
        for (let i = 0; i < form.length; i++) {
            if (grammar.isNonterminal(form[i])) {
                leftmostIndex = i;
                break;
            }
        }

        if (leftmostIndex === -1) continue;

        const terminalPrefix = form.slice(0, leftmostIndex);
        let prefixMatch = true;
        for (let i = 0; i < terminalPrefix.length; i++) {
            if (i >= targetTokens.length || terminalPrefix[i] !== targetTokens[i]) {
                prefixMatch = false;
                break;
            }
        }
        if (!prefixMatch) continue;

        const terminalsInForm = form.filter(sym => !grammar.isNonterminal(sym)).length;
        if (terminalsInForm > targetTokens.length) continue;

        if (!hasEpsilon && form.length > targetTokens.length) continue;

        const lhs = form[leftmostIndex];
        const productions = grammar.productions.get(lhs) || [];

        for (const rhs of productions) {
            const nextForm = [
                ...form.slice(0, leftmostIndex),
                ...rhs,
                ...form.slice(leftmostIndex + 1)
            ];
            
            const nextFormKey = nextForm.join(' ');
            const stepRecord = {
                parentForm: form,
                step: { form: form, index: leftmostIndex, lhs: lhs, rhs: rhs }
            };

            if (!parents.has(nextFormKey)) {
                parents.set(nextFormKey, [stepRecord]);
                queue.push(nextForm);
            } else {
                const existing = parents.get(nextFormKey);
                const isDuplicate = existing.some(e => 
                    e.parentForm.join(' ') === formKey && 
                    e.step.rhs.join(' ') === rhs.join(' ')
                );
                
                if (!isDuplicate) {
                    existing.push(stepRecord);
                }
            }
        }
    }

    if (!foundTarget && !parents.has(targetKey)) {
        return { ambiguous: false, reason: "target not found or limit reached" };
    }

    let mergeFormKey = null;
    const backQueue = [targetKey];
    const backVisited = new Set();
    backVisited.add(targetKey);
    
    while (backQueue.length > 0) {
        const k = backQueue.shift();
        const pList = parents.get(k) || [];
        
        if (pList.length > 1) {
            mergeFormKey = k;
            break;
        }
        
        for (const p of pList) {
            const pKey = p.parentForm.join(' ');
            if (!backVisited.has(pKey)) {
                backVisited.add(pKey);
                backQueue.push(pKey);
            }
        }
    }
    
    if (!mergeFormKey) {
        return { ambiguous: false, reason: "no second tree found within limit" };
    }
    
    const deriv1Steps = buildDerivation(mergeFormKey, parents, 0);
    const deriv2Steps = buildDerivation(mergeFormKey, parents, 1);
    const suffixSteps = buildSuffix(mergeFormKey, targetKey, parents);
    
    const d1 = { order: "leftmost", steps: [...deriv1Steps, ...suffixSteps], result: targetTokens };
    const d2 = { order: "leftmost", steps: [...deriv2Steps, ...suffixSteps], result: targetTokens };
    
    const tree1 = buildTree(d1, grammar);
    const tree2 = buildTree(d2, grammar);
    
    const diffNodeIds = diffTrees(tree1, tree2);
    
    return {
        ambiguous: true,
        trees: [tree1, tree2],
        diffNodeIds: diffNodeIds
    };
}

function buildDerivation(startFormKey, parents, branchIndexAtStart) {
    let steps = [];
    let curr = startFormKey;
    let first = true;
    
    while (curr !== null) {
        const pList = parents.get(curr);
        if (!pList || pList.length === 0) break;
        
        const record = first && pList.length > 1 ? pList[branchIndexAtStart] : pList[0];
        first = false;
        
        steps.unshift(record.step);
        curr = record.parentForm.join(' ');
    }
    return steps;
}

function buildSuffix(fromFormKey, targetKey, parents) {
    const childrenMap = new Map();
    const backQueue = [targetKey];
    const backVisited = new Set();
    backVisited.add(targetKey);
    
    while (backQueue.length > 0) {
        const k = backQueue.shift();
        if (k === fromFormKey) break;
        
        const pList = parents.get(k) || [];
        for (const p of pList) {
            const pKey = p.parentForm.join(' ');
            if (!childrenMap.has(pKey)) childrenMap.set(pKey, []);
            childrenMap.get(pKey).push({ childKey: k, step: p.step });
            
            if (!backVisited.has(pKey)) {
                backVisited.add(pKey);
                backQueue.push(pKey);
            }
        }
    }
    
    let steps = [];
    let curr = fromFormKey;
    while (curr !== targetKey) {
        const cList = childrenMap.get(curr);
        if (!cList || cList.length === 0) break;
        const record = cList[0]; 
        steps.push(record.step);
        curr = record.childKey;
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
