import { Grammar } from '../core/grammar.js';
import { findLeftmost, toRightmost } from '../core/derive.js';
import { buildTree } from '../core/tree.js';
import { tokenizeTarget } from '../core/tokenize.js';
import { recognizes } from '../core/recognize.js';
import { createTreeView } from '../render/svg.js';
import { preorder } from '../render/layout.js';
import { buildSequence, BEAT_MS, YIELD_MS } from '../anim/sequences.js';
import { mountEditor } from '../ui/grammar-editor.js';
import { mountSteps, completedSteps } from '../ui/steps-panel.js';
import { PRESETS, findPreset, fillPresetSelect } from '../ui/presets.js';
import { nextFrame } from './shared.js';
import { createSheet } from '../ui/mobile-shell.js';

const SPEEDS = [0.25, 0.5, 1, 2, 4];
const $ = id => document.getElementById(id);
const dock = document.querySelector('.dock');
const els = {
    preset: $('preset'),
    target: $('target'),
    derive: $('derive'),
    badge: $('badge'),
    badgeNote: $('badge-note'),
    kicker: $('kicker'),
    caption: $('caption'),
    yieldBtn: $('yield-btn'),
    yieldChip: $('yield-chip'),
    yieldStr: $('yield-str'),
    steps: $('steps'),
    stepsNote: $('steps-note'),
    practice: $('practice'),
    pracTitle: $('prac-title'),
    pracScore: $('prac-score'),
    pracNote: $('prac-note'),
    choices: $('choices'),
    play: dock.querySelector('[data-act="play"]'),
    back: dock.querySelector('[data-act="back"]'),
    forward: dock.querySelector('[data-act="forward"]'),
    roll: dock.querySelector('.dock__roll-col'),
    total: dock.querySelector('.dock__total'),
    ticks: dock.querySelector('.dock__ticks'),
    modeSeg: document.querySelector('.seg--mode'),
    orderSegs: [...document.querySelectorAll('.seg--order')],
    speedSeg: document.querySelector('.seg--speed'),
};

const view = createTreeView($('tree'));

const state = {
    order: 'leftmost',
    mode: 'auto',
    speed: 1,
    grammar: null,
    tokens: null,
    found: null,        // { leftmost: {derivation, tree}, rightmost: {...} } or null
    failure: null,      // why there is no tree
    derivation: null,   // the one on screen
    tl: null,
    stepsPanel: null,
    practice: null,     // { steps, form, right, tries, pick, verdict }
};

// ---- segmented controls ----------------------------------------------------

function setSeg(seg, attr, value) {
    const buttons = [...seg.querySelectorAll(`button[data-${attr}]`)];
    const i = Math.max(0, buttons.findIndex(b => b.dataset[attr] === String(value)));
    buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    const thumb = seg.querySelector('.seg__thumb');
    thumb.style.width = `calc((100% - 6px) / ${buttons.length})`;
    thumb.style.transform = `translateX(${i * 100}%)`;
    seg.dataset.value = value;
}

els.speedSeg.innerHTML = '<span class="seg__thumb" aria-hidden="true"></span>'
    + SPEEDS.map(v => `<button type="button" data-speed="${v}" aria-pressed="false">${v}×</button>`).join('');
setSeg(els.speedSeg, 'speed', 1);
setSeg(els.modeSeg, 'mode', 'auto');
els.orderSegs.forEach(seg => setSeg(seg, 'order', 'leftmost'));

els.speedSeg.addEventListener('click', e => {
    const b = e.target.closest('button[data-speed]');
    if (!b) return;
    state.speed = Number(b.dataset.speed);
    setSeg(els.speedSeg, 'speed', b.dataset.speed);
    if (state.tl) state.tl.setSpeed(state.speed);
});
els.orderSegs.forEach(seg => seg.addEventListener('click', e => {
    const b = e.target.closest('button[data-order]');
    if (!b || b.dataset.order === state.order) return;
    state.order = b.dataset.order;
    els.orderSegs.forEach(other => setSeg(other, 'order', state.order));
    if (!state.found) return render();
    setBadgeFound();
    if (state.mode === 'practice') startPractice();
    else showAuto(false);
}));
els.modeSeg.addEventListener('click', e => {
    const b = e.target.closest('button[data-mode]');
    if (!b || b.dataset.mode === state.mode) return;
    state.mode = b.dataset.mode;
    setSeg(els.modeSeg, 'mode', state.mode);
    els.practice.hidden = state.mode !== 'practice';
    document.body.classList.toggle('vz-practicing', state.mode === 'practice');
    if (!state.found) return render();
    if (state.mode === 'practice') startPractice();
    else showAuto(false);
});

// ---- grammar, string, derive -----------------------------------------------

const editor = mountEditor($('editor'), result => {
    const preset = findPreset(els.preset.value);
    if (preset && result.text !== preset.grammar) els.preset.value = '';
    els.derive.disabled = result.errors.length > 0;
    renderPhoneGrammar(result);
}, { label: null });

fillPresetSelect(els.preset, p => p.visualizer);
els.preset.addEventListener('change', () => {
    const preset = findPreset(els.preset.value);
    if (!preset) return;
    editor.setText(preset.grammar);
    els.target.value = preset.target;
    derive(true);
});
els.derive.addEventListener('click', () => derive(true));
els.target.addEventListener('keydown', e => {
    if (e.key === 'Enter') derive(true);
});
els.target.addEventListener('input', () => els.target.setAttribute('aria-invalid', 'false'));

function setBadge(kind, icon, text, note) {
    els.badge.dataset.kind = kind;
    els.badge.querySelector('.vz-badge__icon').textContent = icon;
    els.badge.querySelector('.vz-badge__text').textContent = text;
    els.badgeNote.textContent = note;
}

function setBadgeFound() {
    const n = state.found.leftmost.derivation.steps.length;
    setBadge('ok', '✓', phone.matches ? `Derivable, ${n} step${n === 1 ? '' : 's'}` : 'Derivable', `${n} step${n === 1 ? '' : 's'}, ${state.order}`);
}

async function derive(autoplay) {
    const result = editor.result();
    if (!result || result.errors.length) return;
    setBadge('info', '…', 'Searching', '');
    els.derive.disabled = true;
    await nextFrame();
    await new Promise(r => setTimeout(r, 250));
    els.derive.disabled = false;

    const grammar = result.grammar;
    const input = els.target.value;
    state.grammar = grammar;
    state.found = null;
    state.failure = null;

    const { tokens, error } = tokenizeTarget(input, grammar);
    if (!tokens) {
        const symbol = (error.match(/'(.+?)'/) || [])[1] || input;
        setBadge('bad', '✕', 'Not derivable', `"${symbol}" is not a terminal here`);
        els.target.setAttribute('aria-invalid', 'true');
        return clearTree();
    }
    state.tokens = tokens;

    const out = findLeftmost(grammar, tokens);
    if (!out.found) {
        setBadge('bad', '✕', 'Not derivable', out.reason.startsWith('limit') ? 'Search limit reached' : 'No derivation exists');
        return clearTree();
    }

    const tree = buildTree(out.derivation, grammar);
    const rightmost = toRightmost(tree);
    state.found = {
        leftmost: { derivation: out.derivation, tree },
        rightmost: { derivation: rightmost, tree: buildTree(rightmost, grammar) },
    };
    setBadgeFound();
    if (state.mode === 'practice') startPractice();
    else showAuto(autoplay);
}

// ---- the tree and its timeline -----------------------------------------------

function mount(derivation, tree, opts) {
    if (state.tl) {
        state.tl.pause();
        if (state.tl.dispose) state.tl.dispose();
    }
    if (state.stepsPanel) state.stepsPanel.destroy();
    view.clear();

    const tl = buildSequence(derivation, tree, view, { character: true, ...opts });
    tl.setSpeed(state.speed);
    tl.on('time', render);
    tl.on('state', render);
    state.tl = tl;
    state.derivation = derivation;
    state.stepsPanel = mountSteps(els.steps, derivation, tl, i => (state.mode === 'practice' ? undoTo(i) : go(i)));
    buildTicks(derivation.steps.length);
    return tl;
}

function clearTree() {
    if (state.tl) {
        state.tl.pause();
        if (state.tl.dispose) state.tl.dispose();
    }
    if (state.stepsPanel) state.stepsPanel.destroy();
    state.tl = null;
    state.derivation = null;
    state.stepsPanel = null;
    view.clear();
    els.steps.replaceChildren();
    els.choices.replaceChildren();
    buildTicks(0);
    render();
}

function showAuto(autoplay) {
    const { derivation, tree } = state.found[state.order];
    const tl = mount(derivation, tree, { yield: true });
    tl.playTo(tl.stepEnd(0));
    if (autoplay) setTimeout(() => {
        // Still on the root (the user has not stepped): play the whole derivation.
        if (state.tl === tl && tl.time <= tl.stepEnd(0) + 1) tl.playTo(tl.stepEnd(stepCount()));
    }, 700);
    render();
}

const stepCount = () => (state.derivation ? state.derivation.steps.length : 0);
const markerStart = i => state.tl.markers.find(m => m.step === i).start;

/** Move to "i steps done", animating: quick when jumping, normal for one step. */
function go(i) {
    const tl = state.tl;
    if (!tl) return;
    i = Math.max(0, Math.min(stepCount(), i));
    const target = tl.stepEnd(i);
    const done = completedSteps(tl);
    if (target > tl.time) {
        if (i === done + 1) {
            if (tl.time < markerStart(i)) tl.seek(markerStart(i)); // skip the pause between steps
            tl.playTo(target);
        } else {
            tl.playTo(target, { rate: Math.max(1, (target - tl.time) / (700 * tl.speed)) });
        }
    } else {
        tl.playTo(target, { rate: Math.max(1.5, (tl.time - target) / (450 * tl.speed)) });
    }
}

function togglePlay() {
    const tl = state.tl;
    if (!tl || state.mode !== 'auto' || !stepCount()) return;
    if (tl.playing) return tl.pause();
    const end = tl.stepEnd(stepCount());
    if (tl.time >= end - 1) tl.seek(tl.stepEnd(0));
    tl.playTo(end);
}

function restart() {
    if (state.mode === 'practice') return startPractice();
    go(0);
}

dock.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'play') togglePlay();
    else if (act === 'restart') restart();
    else if (act === 'back') state.mode === 'practice' ? undoTo(stepCount() - 1) : go(completedSteps(state.tl) - 1);
    else if (act === 'forward') go(completedSteps(state.tl) + 1);
    else if (act === 'speed') cycleSpeed();
    else if (act === 'steps') stepsSheet.open();
});

els.yieldBtn.addEventListener('click', () => {
    const tl = state.tl;
    if (!tl) return;
    const end = tl.stepEnd(stepCount());
    if (tl.time > end + 1) tl.playTo(end, { rate: 1.5 });
    else tl.playTo(tl.duration);
});

document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!state.tl) return;
    if (e.key === ' ' && tag !== 'button') {
        e.preventDefault();
        togglePlay();
    } else if (e.key === 'ArrowRight' && state.mode === 'auto') {
        go(completedSteps(state.tl) + 1);
    } else if (e.key === 'ArrowLeft') {
        state.mode === 'practice' ? undoTo(stepCount() - 1) : go(completedSteps(state.tl) - 1);
    } else if (e.key === 'r' || e.key === 'R') {
        restart();
    }
});

// ---- dock and caption --------------------------------------------------------

function buildTicks(n) {
    els.ticks.replaceChildren(...Array.from({ length: n }, (_, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'dock__tick';
        b.setAttribute('aria-label', `Go to step ${i + 1}`);
        b.appendChild(document.createElement('span'));
        b.addEventListener('click', () => (state.mode === 'practice' ? undoTo(i + 1) : go(i + 1)));
        return b;
    }));
    els.roll.replaceChildren(...Array.from({ length: n + 1 }, (_, i) => {
        const s = document.createElement('span');
        s.textContent = i;
        return s;
    }));
}

const yieldText = () => (state.tokens && state.tokens.length ? state.tokens.join(' ') : 'ε');

function render() {
    const tl = state.tl;
    const N = stepCount();
    const k = tl ? completedSteps(tl) : 0;
    const practice = state.mode === 'practice';
    const playing = !!tl && tl.playing && !practice;
    const end = tl ? tl.stepEnd(N) : 0;
    const finished = !!tl && N > 0 && (practice ? isPracticeDone() : k >= N);

    // Caption over the stage.
    if (!tl) {
        els.kicker.textContent = 'NO TREE';
        els.caption.textContent = `Fix the grammar or string, then ${phone.matches ? 'tap' : 'press'} Derive.`;
    } else if (finished) {
        els.kicker.textContent = 'FINISHED';
        els.caption.textContent = `Done. The leaves spell ${yieldText()}.`;
    } else if (practice) {
        const lhs = practiceLhs();
        els.kicker.textContent = `STEP ${k + 1}`;
        els.caption.textContent = lhs ? `Pick a production for the highlighted ${lhs}.` : '';
    } else {
        const step = state.derivation.steps[k];
        els.kicker.textContent = `STEP ${k + 1} OF ${N}`;
        els.caption.textContent = k === 0 && !playing && tl.time <= tl.stepEnd(0) + 1
            ? `Ready. ${phone.matches ? 'Tap' : 'Press'} play to start from ${state.derivation.steps[0].form[0]}.`
            : `Expand ${step.lhs} with ${step.lhs} → ${step.rhs.length ? step.rhs.join(' ') : 'ε'}`;
    }

    // Dock.
    els.play.classList.toggle('is-playing', playing);
    els.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    els.play.disabled = practice || !N;
    els.back.disabled = !tl || (practice ? N === 0 : k === 0 && tl.time <= tl.stepEnd(0) + 1);
    els.forward.disabled = !tl || practice || k >= N;
    els.roll.style.transform = `translateY(calc(${-k} * var(--roll-h, 20px)))`;
    els.total.textContent = `/ ${practice ? Math.max(N, state.found ? state.found.leftmost.derivation.steps.length : 0) : N}`;
    [...els.ticks.children].forEach((tick, i) => {
        const fill = tl ? Math.min(1, Math.max(0, (tl.time - markerStart(i + 1)) / BEAT_MS)) : 0;
        tick.firstChild.style.transform = `scaleX(${fill})`;
        tick.classList.toggle('is-last', i === k - 1);
    });

    // Yield.
    const canYield = finished && k >= N && tl.yieldStart != null;
    els.yieldBtn.hidden = !canYield;
    els.yieldBtn.textContent = tl && tl.time > end + 1 ? 'Back to tree' : 'Show yield';
    els.yieldStr.textContent = yieldText();
    els.yieldChip.classList.toggle('is-visible', canYield && tl.time >= tl.yieldStart + YIELD_MS * 0.65);

    els.stepsNote.textContent = `${state.order === 'leftmost' ? 'Leftmost' : 'Rightmost'}. The underlined symbol is replaced next.`;
}

// ---- practice (F13) ----------------------------------------------------------

const isNT = sym => state.grammar.isNonterminal(sym);

function practiceIndex(form) {
    if (state.order === 'leftmost') return form.findIndex(isNT);
    for (let i = form.length - 1; i >= 0; i--) if (isNT(form[i])) return i;
    return -1;
}
const practiceLhs = () => {
    if (!state.practice) return null;
    const i = practiceIndex(state.practice.form);
    return i === -1 ? null : state.practice.form[i];
};
const isPracticeDone = () => !!state.practice && practiceIndex(state.practice.form) === -1;

/** Can `form` still derive the target string? Exact check with the Earley recognizer. */
function canDerive(form) {
    const g = state.grammar;
    const start = '⟨form⟩';
    const productions = new Map(g.productions);
    productions.set(start, [form]);
    const grammar = new Grammar(start, new Set([...g.nonterminals, start]), g.terminals, productions);
    return recognizes(grammar, state.tokens);
}

function startPractice() {
    state.practice = { steps: [], form: [state.grammar.start], right: 0, tries: 0, pick: null, verdict: null };
    showPractice(false);
}

function undoTo(n) {
    const p = state.practice;
    if (!p || n < 0 || n >= p.steps.length) return;
    p.form = p.steps[n].form;
    p.steps = p.steps.slice(0, n);
    p.pick = p.verdict = null;
    showPractice(false);
}

function showPractice(animateLast) {
    const p = state.practice;
    const derivation = { order: state.order, steps: p.steps, result: p.form };
    const tree = buildTree(derivation, state.grammar);
    const index = practiceIndex(p.form);
    const open = preorder(tree).filter(n => n.children.length === 0 && n.kind !== 'epsilon');
    const pending = index === -1 ? null : open[index].id;

    const tl = mount(derivation, tree, { pending, yield: pending == null });
    const n = p.steps.length;
    if (animateLast && n > 0) {
        tl.seek(markerStart(n));
        tl.playTo(pending == null ? tl.stepEnd(n) : tl.duration);
    } else if (n === 0) {
        tl.playTo(tl.duration);
    } else {
        tl.seek(pending == null ? tl.stepEnd(n) : tl.duration);
    }
    renderChoices();
    render();
}

function renderChoices() {
    const p = state.practice;
    const index = practiceIndex(p.form);
    els.pracScore.textContent = `${p.right} correct of ${p.tries}`;
    els.choices.replaceChildren();
    if (index === -1) {
        els.pracTitle.textContent = 'All done';
        els.pracNote.textContent = 'Finished. Press Restart to go again.';
        return;
    }
    const lhs = p.form[index];
    els.pracTitle.textContent = `Expand ${lhs}`;
    for (const rhs of state.grammar.productions.get(lhs) || []) {
        const text = `${lhs} → ${rhs.length ? rhs.join(' ') : 'ε'}`;
        const picked = p.pick === text;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'vz-choice'
            + (picked && p.verdict === 'right' ? ' is-right' : '')
            + (picked && p.verdict === 'wrong' ? ' is-wrong' : '');
        b.disabled = p.verdict === 'right';
        b.innerHTML = '<span class="vz-choice__dot" aria-hidden="true"></span><span class="vz-choice__text"></span><span class="vz-choice__tag"></span>';
        b.querySelector('.vz-choice__text').textContent = text;
        b.querySelector('.vz-choice__tag').textContent = picked ? (p.verdict === 'right' ? 'Correct' : 'Not this one') : '';
        b.addEventListener('click', () => choose(index, lhs, rhs, text));
        els.choices.appendChild(b);
    }
    els.pracNote.dataset.tone = p.verdict || '';
    els.pracNote.textContent = p.verdict === 'wrong'
        ? `That choice can't produce ${yieldText()} from here. Try another.`
        : p.verdict === 'right'
            ? 'Correct. Watch the builder plant it.'
            : `Goal: ${yieldText()}. Expand the ${state.order} ${lhs}.`;
}

function choose(index, lhs, rhs, text) {
    const p = state.practice;
    if (p.verdict === 'right') return;
    const next = [...p.form.slice(0, index), ...rhs, ...p.form.slice(index + 1)];
    p.tries += 1;
    p.pick = text;
    if (!canDerive(next)) {
        p.verdict = 'wrong';
        renderChoices();
        return;
    }
    p.verdict = 'right';
    p.right += 1;
    renderChoices();
    setTimeout(() => {
        if (state.practice !== p) return;
        p.steps.push({ form: p.form, index, lhs, rhs });
        p.form = next;
        p.pick = p.verdict = null;
        showPractice(true);
        const first = els.choices.querySelector('button');
        if (first) first.focus({ preventScroll: true });
    }, 650);
}

// ---- phone layout (Visualizer Mobile design) ---------------------------------
// Below 760px the same elements move into a phone shell: the grammar block and
// the steps list become bottom sheets, and the dock sits under the stage.

const phone = matchMedia('(max-width: 759px)');
const grammarSheet = createSheet('Grammar', '', { className: 'vzm-sheet' });
const stepsSheet = createSheet('Derivation steps', '', { className: 'vzm-sheet' });
const slot = name => document.querySelector(`[data-slot="${name}"]`);
const moves = [
    [document.querySelector('.vz-input__derive'), () => slot('derive')],
    [els.badge, () => slot('badge')],
    [els.modeSeg, () => slot('mode')],
    [document.querySelector('.vz-input__grammar'), () => grammarSheet.body],
    [document.querySelector('.steps-card'), () => stepsSheet.body],
    [dock, () => document.querySelector('.vz-stage'), 'after'],
];
// A marker comment remembers each element's desktop position.
const homes = moves.map(([el]) => {
    const mark = document.createComment('home');
    el.before(mark);
    return mark;
});

function applyLayout() {
    const isPhone = phone.matches;
    document.body.classList.toggle('vz-mobile', isPhone);
    moves.forEach(([el, target, where], i) => {
        if (!isPhone) homes[i].after(el);
        else if (where === 'after') target().after(el);
        else target().appendChild(el);
    });
    if (!isPhone) {
        grammarSheet.close();
        stepsSheet.close();
    }
    if (state.found) setBadgeFound();
}
phone.addEventListener('change', applyLayout);

$('vzm-grammar').addEventListener('click', () => {
    if (state.tl) state.tl.pause();
    grammarSheet.open();
});
$('vzm-apply').addEventListener('click', () => {
    if (els.derive.disabled) return;
    grammarSheet.close();
    derive(true);
});
$('vzm-steps-done').addEventListener('click', () => stepsSheet.close());

// Examples list in the grammar sheet.
const examples = PRESETS.filter(p => p.visualizer);
$('vzm-examples').replaceChildren(...examples.map(p => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.preset = p.id;
    b.innerHTML = '<span class="vzm-ex__name"></span><span class="vzm-ex__str"></span><svg class="vzm-ex__check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5"/></svg>';
    b.querySelector('.vzm-ex__name').textContent = p.name;
    b.querySelector('.vzm-ex__str').textContent = p.target;
    b.addEventListener('click', () => {
        els.preset.value = p.id;
        editor.setText(p.grammar);
        els.target.value = p.target;
    });
    return b;
}));

// Keys for the symbols phone keyboards lack.
document.querySelector('.vzm-keys').addEventListener('click', e => {
    const b = e.target.closest('button[data-ins]');
    if (!b) return;
    const ta = editor.textarea;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? start;
    ta.value = ta.value.slice(0, start) + b.dataset.ins + ta.value.slice(end);
    ta.selectionStart = ta.selectionEnd = start + b.dataset.ins.length;
    ta.dispatchEvent(new Event('input'));
    ta.focus({ preventScroll: true });
});

function renderPhoneGrammar(result) {
    const preset = examples.find(p => p.grammar === result.text);
    $('vzm-preset').textContent = preset ? preset.name : 'Custom grammar';
    const rules = $('vzm-rules');
    if (result.errors.length) {
        rules.textContent = result.errors[0].line ? `Line ${result.errors[0].line}` : 'Error';
        rules.classList.add('is-error');
    } else {
        let n = 0;
        for (const alts of result.grammar.productions.values()) n += alts.length;
        rules.textContent = `${n} rules`;
        rules.classList.remove('is-error');
    }
    document.querySelectorAll('#vzm-examples button').forEach(b => {
        b.classList.toggle('is-current', !!preset && b.dataset.preset === preset.id);
    });
}

function cycleSpeed() {
    state.speed = SPEEDS[(SPEEDS.indexOf(state.speed) + 1) % SPEEDS.length];
    setSeg(els.speedSeg, 'speed', state.speed);
    if (state.tl) state.tl.setSpeed(state.speed);
    showSpeed();
}
function showSpeed() {
    dock.querySelector('[data-act="speed"]').textContent = `${state.speed}×`;
}
els.speedSeg.addEventListener('click', showSpeed);

// Swipe the tree left or right to step.
let touch = null;
const stage = document.querySelector('.vz-stage');
stage.addEventListener('touchstart', e => {
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
stage.addEventListener('touchend', e => {
    if (!touch || !state.tl || state.mode !== 'auto') return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(completedSteps(state.tl) + (dx < 0 ? 1 : -1));
});

applyLayout();

// ---- start: the first preset, playing on its own -----------------------------

const first = findPreset('expr');
els.preset.value = first.id;
editor.setText(first.grammar);
els.target.value = first.target;
render();
derive(true);
