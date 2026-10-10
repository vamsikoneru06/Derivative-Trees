import { Grammar } from '../core/grammar.js';
import { findLeftmost, toRightmost } from '../core/derive.js';
import { buildTree } from '../core/tree.js';
import { tokenizeTarget } from '../core/tokenize.js';
import { recognizes } from '../core/recognize.js';
import { createTreeView } from '../render/svg.js';
import { preorder } from '../render/layout.js';
import { buildSequence, productionLabel } from '../anim/sequences.js';
import { mountEditor } from '../ui/grammar-editor.js';
import { mountControls } from '../ui/controls.js';
import { mountSteps } from '../ui/steps-panel.js';
import { PRESETS, findPreset, fillPresetSelect } from '../ui/presets.js';
import { setStatus, exportSvg, nextFrame } from './shared.js';

const $ = id => document.getElementById(id);
const els = {
    preset: $('preset'),
    target: $('target'),
    derive: $('derive'),
    status: $('status'),
    svg: $('tree'),
    empty: $('canvas-empty'),
    summary: $('tree-summary'),
    steps: $('steps'),
    exportBtn: $('export'),
    order: $('order'),
    practice: $('practice'),
    prompt: $('practice-prompt'),
    choices: $('practice-choices'),
    feedback: $('practice-feedback'),
};

const view = createTreeView(els.svg);
const controls = mountControls($('playbar'));

const state = {
    grammar: null,
    tokens: null,
    leftmost: null,     // { derivation, tree }
    rightmost: null,
    order: 'leftmost',
    mode: 'auto',
    timeline: null,
    stepsPanel: null,
    practice: null,     // { steps, form }
};

const editor = mountEditor($('editor'), result => {
    const preset = findPreset(els.preset.value);
    if (preset && result.text !== preset.grammar) els.preset.value = '';
});

fillPresetSelect(els.preset);
els.preset.addEventListener('change', () => {
    const preset = findPreset(els.preset.value);
    if (!preset) return;
    editor.setText(preset.grammar);
    els.target.value = preset.target;
    derive();
});

els.derive.addEventListener('click', derive);
els.target.addEventListener('keydown', e => {
    if (e.key === 'Enter') derive();
});

els.order.addEventListener('click', e => {
    const button = e.target.closest('button[data-order]');
    if (!button || button.dataset.order === state.order || state.mode !== 'auto') return;
    state.order = button.dataset.order;
    pressed(els.order, 'order', state.order);
    if (state.leftmost) show(state.timeline ? state.timeline.stepAt() : 0);
});

document.querySelector('[aria-labelledby="mode-label"]').addEventListener('click', e => {
    const button = e.target.closest('button[data-mode]');
    if (!button || button.dataset.mode === state.mode) return;
    setMode(button.dataset.mode);
});

$('practice-reset').addEventListener('click', startPractice);
els.exportBtn.addEventListener('click', () => exportSvg(els.svg, 'derivation-tree.svg'));

// ---------------------------------------------------------------------------

function pressed(group, attr, value) {
    group.querySelectorAll(`button[data-${attr}]`).forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset[attr] === value));
    });
}

function reset(message) {
    if (state.timeline) state.timeline.pause();
    if (state.stepsPanel) state.stepsPanel.destroy();
    state.timeline = null;
    state.stepsPanel = null;
    state.leftmost = state.rightmost = null;
    view.clear();
    els.steps.replaceChildren();
    els.empty.hidden = false;
    els.empty.textContent = message;
    els.exportBtn.disabled = true;
    controls.setTimeline(null);
}

async function derive() {
    const result = editor.result();
    if (!result || result.errors.length > 0 || !result.grammar) {
        setStatus(els.status, 'bad', 'Fix the grammar first');
        reset('The grammar has errors. See the messages under the editor.');
        return;
    }

    setStatus(els.status, 'info', 'Searching…');
    await nextFrame();

    const grammar = result.grammar;
    const out = findLeftmost(grammar, els.target.value);
    if (!out.found) {
        if (out.reason.startsWith('limit')) {
            setStatus(els.status, 'warn', 'Not found within the search limit');
        } else if (out.reason === 'not derivable' || out.reason.startsWith('not derivable')) {
            setStatus(els.status, 'bad', 'Not derivable');
        } else {
            setStatus(els.status, 'bad', out.reason);
        }
        reset('No derivation to show for this string.');
        return;
    }

    state.grammar = grammar;
    state.tokens = tokenizeTarget(els.target.value, grammar).tokens;
    const lmTree = buildTree(out.derivation, grammar);
    const rmDerivation = toRightmost(lmTree);
    state.leftmost = { derivation: out.derivation, tree: lmTree };
    state.rightmost = { derivation: rmDerivation, tree: buildTree(rmDerivation, grammar) };

    const k = out.derivation.steps.length;
    setStatus(els.status, 'ok', `Derivable · ${k} step${k === 1 ? '' : 's'}`);

    if (state.mode === 'practice') startPractice();
    else show(0);
}

/** Build the timeline for the current order and land on `step`. */
function show(step) {
    const { derivation, tree } = state.order === 'leftmost' ? state.leftmost : state.rightmost;
    const tl = mountTimeline(derivation, tree, { yield: true });
    // A1: on a fresh derive the root grows in; on an order switch, land on the same step.
    if (step > 0) tl.seekToStep(Math.min(step, derivation.steps.length));
    else tl.playTo(tl.stepEnd(0));
}

function mountTimeline(derivation, tree, opts) {
    if (state.timeline) state.timeline.pause();
    if (state.stepsPanel) state.stepsPanel.destroy();
    view.clear();
    els.empty.hidden = true;
    els.exportBtn.disabled = false;

    const tl = buildSequence(derivation, tree, view, opts);
    const expandedAt = new Map(preorder(tree).filter(n => n.expandedAtStep).map(n => [n.expandedAtStep, n]));
    const total = derivation.steps.length;
    tl.on('step', k => {
        els.summary.textContent = k === 0
            ? `Start symbol ${tree.symbol}. ${total} steps to go.`
            : `Step ${k} of ${total}: ${productionLabel(expandedAt.get(k))}`;
    });

    state.timeline = tl;
    state.stepsPanel = mountSteps(els.steps, derivation, tl);
    controls.setTimeline(tl);
    return tl;
}

// ---- Practice mode (F13) -------------------------------------------------

function setMode(mode) {
    state.mode = mode;
    pressed(document.querySelector('[aria-labelledby="mode-label"]'), 'mode', mode);
    els.practice.hidden = mode !== 'practice';
    els.order.querySelectorAll('button').forEach(b => { b.disabled = mode === 'practice'; });
    if (!state.leftmost) return;
    if (mode === 'practice') {
        state.order = 'leftmost';
        pressed(els.order, 'order', 'leftmost');
        startPractice();
    } else {
        show(0);
    }
}

function startPractice() {
    if (!state.leftmost) {
        els.prompt.textContent = 'Derive a string first, then build its tree yourself.';
        els.choices.replaceChildren();
        return;
    }
    state.practice = { steps: [], form: [state.grammar.start] };
    els.feedback.textContent = '';
    renderPractice(false);
}

/** Can `form` still derive the target string? Exact check with the Earley recognizer. */
function canDerive(form) {
    const g = state.grammar;
    const start = '⟨form⟩';
    const productions = new Map(g.productions);
    productions.set(start, [form]);
    const grammar = new Grammar(start, new Set([...g.nonterminals, start]), g.terminals, productions);
    return recognizes(grammar, state.tokens);
}

function renderPractice(animateLast) {
    const { steps, form } = state.practice;
    const derivation = { order: 'leftmost', steps, result: form };
    const tree = buildTree(derivation, state.grammar);
    const index = form.findIndex(sym => state.grammar.isNonterminal(sym));
    const done = index === -1;

    const tl = mountTimeline(derivation, tree, { yield: done });
    if (animateLast && steps.length > 0) {
        tl.seekToStep(steps.length - 1);
        tl.playTo(done ? tl.duration : tl.stepEnd(steps.length));
    } else {
        tl.seekToStep(steps.length);
    }

    els.choices.replaceChildren();
    if (done) {
        els.prompt.innerHTML = '<strong>Done!</strong> The leaves now spell the target string.';
        return;
    }

    const lhs = form[index];
    els.prompt.innerHTML = '';
    els.prompt.append('Expand the leftmost nonterminal ', strong(lhs), '. Which production?');

    for (const rhs of state.grammar.productions.get(lhs) || []) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'choice';
        button.textContent = `${lhs} → ${rhs.length ? rhs.join(rhs.some(s => s.length > 1) ? ' ' : '') : 'ε'}`;
        button.addEventListener('click', () => choose(button, index, lhs, rhs));
        li.appendChild(button);
        els.choices.appendChild(li);
    }
}

function choose(button, index, lhs, rhs) {
    const { form } = state.practice;
    const next = [...form.slice(0, index), ...rhs, ...form.slice(index + 1)];
    if (!canDerive(next)) {
        button.classList.remove('is-wrong');
        void button.offsetWidth; // restart the shake animation
        button.classList.add('is-wrong');
        els.feedback.textContent = `${button.textContent} would give ${next.join(' ') || 'ε'}, which can no longer derive the string. Try another.`;
        return;
    }
    state.practice.steps.push({ form, index, lhs, rhs });
    state.practice.form = next;
    els.feedback.textContent = `✓ ${button.textContent}`;
    renderPractice(true);
    const first = els.choices.querySelector('.choice');
    if (first) first.focus();
}

function strong(text) {
    const s = document.createElement('strong');
    s.className = 'mono';
    s.textContent = text;
    return s;
}

// ---- start with the first preset -------------------------------------------

const first = PRESETS[0];
els.preset.value = first.id;
editor.setText(first.grammar);
els.target.value = first.target;
derive();
