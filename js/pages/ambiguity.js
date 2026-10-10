import { findTwoTrees } from '../core/ambiguity.js';
import { Timeline } from '../anim/timeline.js';
import { createTreeView } from '../render/svg.js';
import { preorder } from '../render/layout.js';
import { buildSequence, productionLabel } from '../anim/sequences.js';
import { mountEditor } from '../ui/grammar-editor.js';
import { mountControls } from '../ui/controls.js';
import { findPreset, fillPresetSelect } from '../ui/presets.js';
import { setStatus, nextFrame, unshared } from './shared.js';

const $ = id => document.getElementById(id);
const views = [createTreeView($('tree-1')), createTreeView($('tree-2'))];
const controls = mountControls($('playbar'));
const preset = $('preset');
const target = $('target');
const status = $('status');
const explain = $('explain');
let timeline = null;

const editor = mountEditor($('editor'), result => {
    const p = findPreset(preset.value);
    if (p && result.text !== p.grammar) preset.value = '';
});

fillPresetSelect(preset, p => p.ambiguousTarget);
preset.addEventListener('change', () => {
    const p = findPreset(preset.value);
    if (!p) return;
    editor.setText(p.grammar);
    target.value = p.ambiguousTarget;
    explore();
});
$('explore').addEventListener('click', explore);
target.addEventListener('keydown', e => {
    if (e.key === 'Enter') explore();
});

function clear(message) {
    if (timeline) timeline.pause();
    timeline = null;
    views.forEach(v => v.clear());
    controls.setTimeline(null);
    explain.textContent = message;
}

async function explore() {
    const result = editor.result();
    if (!result || result.errors.length > 0 || !result.grammar) {
        setStatus(status, 'bad', 'Fix the grammar first');
        clear('');
        return;
    }
    setStatus(status, 'info', 'Searching…');
    await nextFrame();

    const out = findTwoTrees(result.grammar, target.value);
    if (!out.ambiguous) {
        if (out.reason === 'not derivable') {
            setStatus(status, 'bad', 'Not derivable');
            clear('The grammar cannot derive this string at all, so there is no tree to compare.');
        } else if (out.reason.startsWith('no second tree')) {
            setStatus(status, 'warn', 'No second tree found within the search limit');
            clear('Only one tree was found for this string. That does not prove the grammar is unambiguous: '
                + 'another string might have two trees, and ambiguity is undecidable in general.');
        } else if (out.reason.startsWith('target not found')) {
            setStatus(status, 'warn', 'Search limit reached');
            clear('The search stopped before finding a derivation. Try a shorter string.');
        } else {
            setStatus(status, 'bad', out.reason);
            clear('');
        }
        return;
    }

    const [t1, t2] = out.trees;
    const glow = [unshared(t1, t2), unshared(t2, t1)];

    if (timeline) timeline.pause();
    views.forEach(v => v.clear());
    timeline = new Timeline();
    out.trees.forEach((tree, i) => {
        buildSequence(null, tree, views[i], { timeline, yield: false, glowIds: glow[i].map(n => n.id) });
    });
    controls.setTimeline(timeline);
    timeline.play();

    // diffNodeIds holds pairs [node in tree 1, node in tree 2]; the first pair is
    // the topmost place where the two trees chose different productions.
    const [id1, id2] = out.diffNodeIds;
    const label = (tree, id) => productionLabel(preorder(tree).find(n => n.id === id));
    setStatus(status, 'ok', 'Ambiguous: two different trees');
    explain.innerHTML = '';
    explain.append(
        'Same string, two different trees, so the grammar is ambiguous. ',
        'Where Tree 1 uses ', code(label(t1, id1)),
        ', Tree 2 uses ', code(label(t2, id2)),
        '. Highlighted nodes are the ones the other tree does not have.',
    );
}

function code(text) {
    const c = document.createElement('code');
    c.textContent = text;
    return c;
}

const first = findPreset('expr');
preset.value = first.id;
editor.setText(first.grammar);
target.value = first.ambiguousTarget;
explore();
