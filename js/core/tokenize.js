/**
 * Split a target string into terminal tokens.
 * Whitespace always separates tokens; inside each chunk the longest matching
 * terminal wins, so "id+id*id" becomes ["id", "+", "id", "*", "id"].
 *
 * @returns {{ tokens: string[] | null, error?: string }}
 */
export function tokenizeTarget(target, grammar) {
    if (Array.isArray(target)) return { tokens: target };

    const terminals = Array.from(grammar.terminals).sort((a, b) => b.length - a.length);
    const tokens = [];
    const chunks = target.trim().split(/\s+/).filter(c => c.length > 0);

    for (const chunk of chunks) {
        let i = 0;
        while (i < chunk.length) {
            const match = terminals.find(t => chunk.startsWith(t, i));
            if (!match) {
                return { tokens: null, error: `'${chunk[i]}' is not a terminal of this grammar` };
            }
            tokens.push(match);
            i += match.length;
        }
    }
    return { tokens };
}
