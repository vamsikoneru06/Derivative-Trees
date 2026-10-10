// Built-in example grammars. `target` is the string loaded with the preset;
// `ambiguousTarget` is a string with two different trees, for the ambiguity page.
export const PRESETS = [
    {
        id: 'anbn',
        name: 'aⁿbⁿ',
        grammar: 'S -> aSb | ε',
        target: 'aabb',
    },
    {
        id: 'parens',
        name: 'Balanced parentheses',
        grammar: 'S -> (S) | SS | ε',
        target: '(())()',
        ambiguousTarget: '()()()',
    },
    {
        id: 'palindromes',
        name: 'Palindromes over {a, b}',
        grammar: 'S -> aSa | bSb | a | b | ε',
        target: 'abbba',
    },
    {
        id: 'expr',
        name: 'Ambiguous expressions',
        grammar: 'E -> E + E | E * E | id',
        target: 'id + id * id',
        ambiguousTarget: 'id + id * id',
    },
    {
        id: 'expr-parens',
        name: 'Expressions with parentheses',
        grammar: 'E -> E + E | E * E | ( E ) | id',
        target: '( id + id ) * id',
        ambiguousTarget: 'id * id + id',
    },
    {
        id: 'expr-unambiguous',
        name: 'Unambiguous expressions',
        grammar: 'E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id',
        target: 'id + id * id',
        ambiguousTarget: 'id + id * id',
    },
];

export function findPreset(id) {
    return PRESETS.find(p => p.id === id);
}

/** Fill a <select> with the presets. */
export function fillPresetSelect(select, filter = () => true) {
    select.replaceChildren();
    const custom = document.createElement('option');
    custom.value = '';
    custom.textContent = 'Custom grammar';
    select.appendChild(custom);
    for (const preset of PRESETS.filter(filter)) {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.name;
        select.appendChild(option);
    }
}
