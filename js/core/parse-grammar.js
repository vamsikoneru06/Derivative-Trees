import { Grammar } from './grammar.js';

export function parseGrammar(text) {
    const lines = text.split('\n');
    const nonterminals = new Set();
    const terminals = new Set();
    const productions = new Map();
    const errors = [];
    const warnings = [];
    let startSymbol = null;

    let spaceSeparated = false;
    lines.forEach(line => {
        const parts = line.split(/->|→/);
        if (parts.length === 2) {
            const alts = parts[1].split('|');
            if (alts.some(alt => alt.trim().includes(' '))) {
                spaceSeparated = true;
            }
        }
    });

    lines.forEach((line, index) => {
        const lineNum = index + 1;
        const trimmed = line.trim();
        if (!trimmed) return;

        // Split by -> or →
        const arrowRegex = /->|→/;
        const parts = trimmed.split(arrowRegex);
        
        if (parts.length !== 2) {
            errors.push({ line: lineNum, message: "Missing or multiple arrows ('->' or '→')" });
            return;
        }

        const lhs = parts[0].trim();
        if (!lhs) {
            errors.push({ line: lineNum, message: "Empty left-hand side" });
            return;
        }

        if (lhs.includes(' ')) {
            errors.push({ line: lineNum, message: "Left-hand side must be a single nonterminal" });
            return;
        }

        if (!startSymbol) {
            startSymbol = lhs;
        }

        nonterminals.add(lhs);
        
        if (!productions.has(lhs)) {
            productions.set(lhs, []);
        }
        
        const rhsText = parts[1].trim();
        const alternatives = rhsText.split('|');

        alternatives.forEach(alt => {
            const altTrimmed = alt.trim();
            let rhsSymbols = [];
            
            if (altTrimmed === 'ε' || altTrimmed === 'eps' || altTrimmed === '') {
                // Epsilon production
                rhsSymbols = [];
            } else if (spaceSeparated) {
                // Space-separated tokens for whole grammar
                rhsSymbols = altTrimmed.split(/\s+/);
            } else {
                // Character-by-character if no spaces in whole grammar
                rhsSymbols = altTrimmed.split('');
            }
            
            productions.get(lhs).push(rhsSymbols);
        });
    });

    if (!startSymbol) {
        errors.push({ line: 0, message: "Grammar is empty" });
        return { grammar: null, errors, warnings };
    }

    // Identify terminals
    for (const rhsList of productions.values()) {
        for (const rhs of rhsList) {
            for (const symbol of rhs) {
                if (!nonterminals.has(symbol)) {
                    terminals.add(symbol);
                }
            }
        }
    }

    // A single uppercase letter with no productions is almost always a typo
    for (const t of terminals) {
        if (/^[A-Z]$/.test(t)) {
            warnings.push(`'${t}' has no productions, so it is treated as a terminal.`);
        }
    }

    // Check for unreachable symbols (warning)
    const reachable = new Set([startSymbol]);
    const queue = [startSymbol];
    while (queue.length > 0) {
        const curr = queue.shift();
        const rules = productions.get(curr) || [];
        for (const rule of rules) {
            for (const sym of rule) {
                if (nonterminals.has(sym) && !reachable.has(sym)) {
                    reachable.add(sym);
                    queue.push(sym);
                }
            }
        }
    }

    for (const nt of nonterminals) {
        if (!reachable.has(nt)) {
            warnings.push(`Nonterminal '${nt}' is unreachable from start symbol '${startSymbol}'.`);
        }
    }

    const grammar = new Grammar(startSymbol, nonterminals, terminals, productions);
    return { grammar, errors, warnings };
}
