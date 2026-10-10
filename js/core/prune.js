/**
 * Shortest terminal string each nonterminal can derive (Infinity if it derives none).
 * Fixed-point iteration over the productions.
 */
export function minLengths(grammar) {
    const min = new Map();
    for (const nt of grammar.nonterminals) min.set(nt, Infinity);

    const symLen = sym => (grammar.isNonterminal(sym) ? min.get(sym) : 1);

    let changed = true;
    while (changed) {
        changed = false;
        for (const [lhs, rules] of grammar.productions) {
            for (const rhs of rules) {
                const len = rhs.reduce((sum, sym) => sum + symLen(sym), 0);
                if (len < min.get(lhs)) {
                    min.set(lhs, len);
                    changed = true;
                }
            }
        }
    }
    return min;
}

/**
 * Returns keep(form): false when `form` can no longer derive `tokens`.
 * A form survives only if
 *  - the terminals before its first nonterminal are a prefix of the target,
 *  - the terminals after its last nonterminal are a suffix of the target,
 *  - the shortest string it could still derive is not longer than the target,
 *  - and, with no nonterminals left, it equals the target.
 */
export function makePruner(grammar, tokens) {
    const min = minLengths(grammar);
    const n = tokens.length;

    return function keep(form) {
        let first = -1;
        let last = -1;
        let minLen = 0;
        for (let i = 0; i < form.length; i++) {
            if (grammar.isNonterminal(form[i])) {
                if (first === -1) first = i;
                last = i;
                minLen += min.get(form[i]);
            } else {
                minLen += 1;
            }
        }
        if (minLen > n) return false;

        if (first === -1) {
            return form.length === n && form.every((sym, i) => sym === tokens[i]);
        }
        for (let i = 0; i < first; i++) {
            if (form[i] !== tokens[i]) return false;
        }
        const tail = form.length - 1 - last;
        for (let j = 1; j <= tail; j++) {
            if (form[form.length - j] !== tokens[n - j]) return false;
        }
        return true;
    };
}
