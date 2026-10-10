// Built-in example grammars. `target` is the string loaded with the preset;
// `ambiguousTarget` is a string with two different trees, for the ambiguity page.
// `visualizer` marks the presets offered on the Visualizer (from the design).
export const PRESETS = [
    {
        id: 'expr',
        name: 'Arithmetic expressions',
        grammar: 'E → E + E\nE → E * E\nE → ( E )\nE → id',
        target: 'id + id * id',
        ambiguousTarget: 'id + id * id',
        visualizer: true,
    },
    {
        id: 'anbn',
        name: 'aⁿbⁿ',
        grammar: 'S → a S b\nS → ε',
        target: 'aabb',
        visualizer: true,
    },
    {
        id: 'palindromes',
        name: 'Palindromes over a, b',
        grammar: 'S → a S a | b S b\nS → a | b | ε',
        target: 'abba',
        visualizer: true,
    },
    {
        id: 'parens',
        name: 'Balanced parentheses',
        grammar: 'S → ( S ) S\nS → ε',
        target: '(())()',
        visualizer: true,
    },
    {
        id: 'parens-ambiguous',
        name: 'Balanced parentheses, ambiguous',
        grammar: 'S → ( S ) | S S | ε',
        target: '(())()',
        ambiguousTarget: '()()()',
    },
    {
        id: 'expr-unambiguous',
        name: 'Unambiguous expressions',
        grammar: 'E → E + T | T\nT → T * F | F\nF → ( E ) | id',
        target: 'id + id * id',
        ambiguousTarget: 'id + id * id',
    },
];

export function findPreset(id) {
    return PRESETS.find(p => p.id === id);
}

/** Fill a <select> with the presets that pass `filter`. */
export function fillPresetSelect(select, filter = () => true, { custom = true } = {}) {
    select.replaceChildren();
    if (custom) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Custom grammar';
        select.appendChild(option);
    }
    for (const preset of PRESETS.filter(filter)) {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.name;
        select.appendChild(option);
    }
}
