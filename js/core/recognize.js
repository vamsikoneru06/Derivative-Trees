import { minLengths } from './prune.js';

/**
 * Earley recognizer: does the grammar derive exactly `tokens`?
 * Works for every CFG (left recursion, ε-rules, cycles) in polynomial time,
 * so the derivation search can say "not derivable" without exhausting its limits.
 * Nullable nonterminals are skipped at prediction time (Aycock & Horspool).
 */
export function recognizes(grammar, tokens) {
    const min = minLengths(grammar);
    const nullable = sym => min.get(sym) === 0;
    const n = tokens.length;

    const sets = Array.from({ length: n + 1 }, () => []);
    const seen = Array.from({ length: n + 1 }, () => new Set());

    // An item is "lhs → rhs with the dot before rhs[dot], started at position origin".
    const add = (i, lhs, rhs, dot, origin) => {
        const key = `${lhs}\u0000${rhs.join('\u0001')}\u0000${dot}\u0000${origin}`;
        if (seen[i].has(key)) return;
        seen[i].add(key);
        sets[i].push({ lhs, rhs, dot, origin });
    };

    for (const rhs of grammar.productions.get(grammar.start) || []) {
        add(0, grammar.start, rhs, 0, 0);
    }

    for (let i = 0; i <= n; i++) {
        for (let j = 0; j < sets[i].length; j++) {
            const { lhs, rhs, dot, origin } = sets[i][j];

            if (dot === rhs.length) {
                // Complete: advance every item in the origin set that was waiting for lhs.
                for (const item of sets[origin]) {
                    if (item.rhs[item.dot] === lhs) {
                        add(i, item.lhs, item.rhs, item.dot + 1, item.origin);
                    }
                }
                continue;
            }

            const next = rhs[dot];
            if (grammar.isNonterminal(next)) {
                for (const nextRhs of grammar.productions.get(next) || []) {
                    add(i, next, nextRhs, 0, i);
                }
                if (nullable(next)) add(i, lhs, rhs, dot + 1, origin);
            } else if (i < n && tokens[i] === next) {
                add(i + 1, lhs, rhs, dot + 1, origin);
            }
        }
    }

    return sets[n].some(item =>
        item.lhs === grammar.start && item.dot === item.rhs.length && item.origin === 0
    );
}
