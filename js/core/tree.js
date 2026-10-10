let nextNodeId = 1;

export function buildTree(derivation, grammar) {
    nextNodeId = 1;

    if (!grammar) {
        throw new Error("Grammar is required to build tree");
    }

    const rootSymbol = derivation.steps.length > 0 ? derivation.steps[0].form[0] : derivation.result[0] || grammar.start;

    const root = {
        id: nextNodeId++,
        symbol: rootSymbol,
        kind: "nonterminal",
        children: [],
        parent: null,
        createdAtStep: 0,
        expandedAtStep: null
    };

    let currentLeaves = [root];

    for (let stepIndex = 0; stepIndex < derivation.steps.length; stepIndex++) {
        const step = derivation.steps[stepIndex];
        
        const targetNode = currentLeaves[step.index];
        targetNode.expandedAtStep = stepIndex + 1; 

        const newLeaves = [];

        if (step.rhs.length === 0) {
            const epsNode = {
                id: nextNodeId++,
                symbol: "ε",
                kind: "epsilon",
                children: [],
                parent: targetNode,
                createdAtStep: stepIndex + 1,
                expandedAtStep: null
            };
            targetNode.children.push(epsNode);
        } else {
            for (let i = 0; i < step.rhs.length; i++) {
                const sym = step.rhs[i];
                const isNonterm = grammar.isNonterminal(sym);
                const node = {
                    id: nextNodeId++,
                    symbol: sym,
                    kind: isNonterm ? "nonterminal" : "terminal",
                    children: [],
                    parent: targetNode,
                    createdAtStep: stepIndex + 1,
                    expandedAtStep: null
                };
                targetNode.children.push(node);
                newLeaves.push(node);
            }
        }

        currentLeaves = [
            ...currentLeaves.slice(0, step.index),
            ...newLeaves,
            ...currentLeaves.slice(step.index + 1)
        ];
    }

    return root;
}
