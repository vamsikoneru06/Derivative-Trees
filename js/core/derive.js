export function findLeftmost(grammar, targetStr, limits = { maxNodes: 200000, maxMs: 800 }) {
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

    const queue = [{ form: [grammar.start], steps: [] }];
    const visited = new Set();
    visited.add(grammar.start);

    let hasEpsilon = false;
    for (const rules of grammar.productions.values()) {
        if (rules.some(r => r.length === 0)) hasEpsilon = true;
    }

    while (queue.length > 0) {
        nodesVisited++;
        if (nodesVisited > limits.maxNodes) {
            return { found: false, reason: "limit: max nodes exceeded" };
        }
        if (performance.now() - startTime > limits.maxMs) {
            return { found: false, reason: "limit: time exceeded" };
        }

        const { form, steps } = queue.shift();

        if (form.join(' ') === targetKey) {
            return {
                found: true,
                derivation: {
                    order: "leftmost",
                    steps: steps,
                    result: form
                }
            };
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

            const formKey = nextForm.join(' ');
            if (!visited.has(formKey)) {
                visited.add(formKey);
                const nextStep = {
                    form: form,
                    index: leftmostIndex,
                    lhs: lhs,
                    rhs: rhs
                };
                queue.push({
                    form: nextForm,
                    steps: [...steps, nextStep]
                });
            }
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
