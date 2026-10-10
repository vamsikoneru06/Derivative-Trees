export class Grammar {
    /**
     * @param {string} start - The start symbol
     * @param {Set<string>} nonterminals - Set of nonterminal symbols
     * @param {Set<string>} terminals - Set of terminal symbols
     * @param {Map<string, string[][]>} productions - Map of LHS -> Array of RHS arrays
     */
    constructor(start, nonterminals, terminals, productions) {
        this.start = start;
        this.nonterminals = nonterminals;
        this.terminals = terminals;
        this.productions = productions;
    }

    isNonterminal(symbol) {
        return this.nonterminals.has(symbol);
    }
}
