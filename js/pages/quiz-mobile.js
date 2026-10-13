// Phone Quiz (Mobile Pages design): 10 questions. Six are multiple choice
// (three of them read a finished tree), four ask you to build the tree by
// picking productions. A wrong pick in a build question shakes and counts the
// question as missed, but you still finish the tree.
import { Grammar } from '../core/grammar.js';
import { parseGrammar } from '../core/parse-grammar.js';
import { findLeftmost } from '../core/derive.js';
import { findTwoTrees } from '../core/ambiguity.js';
import { buildTree } from '../core/tree.js';
import { tokenizeTarget } from '../core/tokenize.js';
import { recognizes } from '../core/recognize.js';
import { buildSequence } from '../anim/sequences.js';
import { createTreeView } from '../render/svg.js';
import { preorder } from '../render/layout.js';
import { playWhenVisible } from './shared.js';

const Q = [
    { type: 'tree', k: 'Read the tree', q: 'What string does this tree yield?', g: 'S → a S b\nS → ε', s: 'aaabbb', opts: ['aaabbb', 'ababab', 'aabbb', 'aaabb'], a: 0, why: 'Read the leaves left to right and skip ε.', short: 'Yield of a tree' },
    { type: 'build', k: 'Build the tree', q: 'Build the tree for aabb.', g: 'S → a S b\nS → ε', s: 'aabb', short: 'Build aabb' },
    { type: 'mc', k: 'Choose one', q: 'Which is a leftmost derivation of id + id?', gl: 'E → E + E | id', opts: ['E ⇒ E + E ⇒ id + E ⇒ id + id', 'E ⇒ E + E ⇒ E + id ⇒ id + id'], a: 0, why: 'The second one replaces the right E first, so it is rightmost.', short: 'Leftmost derivation' },
    { type: 'tree', k: 'Read the tree', q: 'Which production was used at the root?', g: 'E → E * E\nE → E + E\nE → id', s: 'id + id * id', root: '*', opts: ['E → E + E', 'E → E * E', 'E → id'], a: 1, why: 'The root has three children: E, * and E.', short: 'Root production' },
    { type: 'build', k: 'Build the tree', q: 'Build the tree for ()().', g: 'S → ( S ) S\nS → ε', s: '()()', short: 'Build ()()' },
    { type: 'mc', k: 'Choose one', q: 'Which grammar is ambiguous?', opts: ['E → E + E | id', 'S → a S b | ε', 'S → ( S ) S | ε'], a: 0, why: 'id + id + id has two trees under E → E + E | id.', short: 'Spot the ambiguous grammar' },
    { type: 'mc', k: 'Choose one', q: 'The leaves of a parse tree are always', opts: ['terminals or ε', 'nonterminals', 'productions', 'the start symbol'], a: 0, sans: true, why: 'Leaves are never expanded, so they are terminals, or ε for an empty production.', short: 'What leaves are' },
    { type: 'build', k: 'Build the tree', q: 'Build the tree for aba.', g: 'S → a S a | b S b\nS → a | b | ε', s: 'aba', short: 'Build aba' },
    { type: 'tree', k: 'Read the tree', q: 'Which operator sits deeper in this tree?', g: 'E → E + T | T\nT → T * F | F\nF → id', s: 'id + id * id', opts: ['+', '*', 'Same depth'], a: 1, sans: true, why: 'T handles *, and T sits below E, so * is grouped first.', short: 'Operator depth' },
    { type: 'build', k: 'Build the tree', q: 'Build the tree for id * id.', g: 'E → E + E\nE → E * E\nE → id', s: 'id * id', short: 'Build id * id' },
];

const $ = id => document.getElementById(id);
const view = createTreeView($('qm-tree'));
const state = { q: -1, res: Array(Q.length).fill(null), pick: null, build: null };
let tl = null;

// ---- intro: a palindrome tree on a loop ----
{
    const { grammar } = parseGrammar('S → a S a | b S b\nS → a | b | ε');
    const { derivation } = findLeftmost(grammar, 'abba');
    const svg = $('qm-intro-tree');
    playWhenVisible(svg, buildSequence(derivation, buildTree(derivation, grammar), createTreeView(svg), { yield: false, character: true }));
}

function showView(name) {
    for (const v of ['intro', 'question', 'done']) $(`qm-${v}`).hidden = v !== name;
    window.scrollTo({ top: 0 });
}

function start() {
    state.res = Array(Q.length).fill(null);
    ask(0);
}

function ask(i) {
    state.q = i;
    state.pick = null;
    if (i >= Q.length) return finish();
    const q = Q[i];
    showView('question');
    $('qm-num').textContent = `Question ${i + 1} of ${Q.length}`;
    $('qm-kicker').textContent = q.k.toUpperCase();
    $('qm-text').textContent = q.q;
    $('qm-grammar').textContent = q.g ? q.g.replace(/\n/g, '   ') : q.gl || '';
    $('qm-stage').hidden = !q.g;
    $('qm-stage').classList.toggle('is-build', q.type === 'build');
    $('qm-feedback').textContent = '';
    $('qm-feedback').className = 'm-note';
    nextButton(false);

    if (q.type === 'build') {
        const { grammar } = parseGrammar(q.g);
        state.build = { grammar, tokens: tokenizeTarget(q.s, grammar).tokens, steps: [], form: [grammar.start], wrong: 0, busy: false };
        drawBuild(false);
    } else {
        state.build = null;
        if (q.g) drawFinished(q);
        renderOptions();
    }
    renderProgress();
}

// ---- read the tree / multiple choice ----

function drawFinished(q) {
    const { grammar } = parseGrammar(q.g);
    let derivation = null;
    let tree;
    if (q.root) {
        const { trees } = findTwoTrees(grammar, q.s);
        tree = trees.find(t => t.children[1] && t.children[1].symbol === q.root) || trees[0];
    } else {
        derivation = findLeftmost(grammar, q.s).derivation;
        tree = buildTree(derivation, grammar);
    }
    mount(derivation, tree, {});
    tl.seek(tl.stepEnd(Math.max(...tl.markers.map(m => m.step))));
}

function renderOptions() {
    const q = Q[state.q];
    const answered = state.pick != null;
    $('qm-prompt').hidden = true;
    const box = $('qm-options');
    box.className = 'quiz-m-options';
    box.replaceChildren(...q.opts.map((text, i) => {
        const b = choiceButton(text, q.sans || (q.type === 'tree' && !text.includes('→') && text.length < 3) ? 'm-choice--sans' : '');
        const right = answered && i === q.a;
        const wrong = answered && i === state.pick && i !== q.a;
        b.classList.toggle('is-right', right);
        b.classList.toggle('is-wrong', wrong);
        b.querySelector('.m-choice__tag').textContent = right ? 'Correct' : wrong ? 'Your pick' : '';
        b.disabled = answered;
        b.addEventListener('click', () => {
            state.pick = i;
            state.res[state.q] = i === q.a;
            renderOptions();
            renderProgress();
            const fb = $('qm-feedback');
            fb.textContent = (i === q.a ? 'Correct. ' : 'Not quite. ') + q.why;
            fb.className = `m-note ${i === q.a ? 'is-ok' : 'is-bad'}`;
            nextButton(true);
        });
        return b;
    }));
}

function choiceButton(text, extra = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `m-choice ${extra}`.trim();
    b.innerHTML = '<span class="m-choice__dot" aria-hidden="true"></span><span class="m-choice__text"></span><span class="m-choice__tag"></span>';
    b.querySelector('.m-choice__text').textContent = text;
    return b;
}

// ---- build the tree ----

function canDerive(grammar, tokens, form) {
    const start = '⟨form⟩';
    const productions = new Map(grammar.productions);
    productions.set(start, [form]);
    return recognizes(new Grammar(start, new Set([...grammar.nonterminals, start]), grammar.terminals, productions), tokens);
}

function drawBuild(animateLast) {
    const b = state.build;
    const derivation = { order: 'leftmost', steps: b.steps, result: b.form };
    const tree = buildTree(derivation, b.grammar);
    const index = b.form.findIndex(sym => b.grammar.isNonterminal(sym));
    const open = preorder(tree).filter(n => n.children.length === 0 && n.kind !== 'epsilon');
    const pending = index === -1 ? null : open[index].id;
    mount(derivation, tree, { pending });
    const n = b.steps.length;
    const start = tl.markers.find(m => m.step === n).start;
    if (animateLast && n > 0) {
        tl.seek(start);
        tl.playTo(tl.duration);
    } else {
        tl.seek(n === 0 ? 0 : tl.duration);
        tl.playTo(tl.duration);
    }

    const box = $('qm-options');
    box.className = 'quiz-m-options m-grid2';
    const prompt = $('qm-prompt');
    prompt.hidden = false;
    if (index === -1) {
        prompt.textContent = 'Tree complete';
        box.replaceChildren();
        const fb = $('qm-feedback');
        fb.textContent = b.wrong ? `Finished with ${b.wrong} wrong pick${b.wrong > 1 ? 's' : ''}. Counts as missed.` : 'Finished with no wrong picks.';
        fb.className = `m-note ${b.wrong ? 'is-bad' : 'is-ok'}`;
        state.res[state.q] = b.wrong === 0;
        renderProgress();
        nextButton(true);
        return;
    }
    const lhs = b.form[index];
    prompt.textContent = `Expand the leftmost ${lhs}`;
    box.replaceChildren(...b.grammar.productions.get(lhs).map(rhs => {
        const text = `${lhs} → ${rhs.length ? rhs.join(' ') : 'ε'}`;
        const btn = choiceButton(text);
        btn.querySelector('.m-choice__dot').remove();
        btn.querySelector('.m-choice__tag').remove();
        btn.addEventListener('click', () => pickBuild(btn, index, lhs, rhs));
        return btn;
    }));
}

function pickBuild(btn, index, lhs, rhs) {
    const b = state.build;
    if (b.busy) return;
    const next = [...b.form.slice(0, index), ...rhs, ...b.form.slice(index + 1)];
    const fb = $('qm-feedback');
    if (!canDerive(b.grammar, b.tokens, next)) {
        b.wrong += 1;
        btn.classList.remove('is-wrong');
        void btn.offsetWidth; // restart the shake
        btn.classList.add('is-wrong');
        fb.textContent = `That can't produce ${Q[state.q].s} from here. Try another.`;
        fb.className = 'm-note is-bad';
        return;
    }
    b.busy = true;
    btn.classList.add('is-planted');
    fb.textContent = 'Correct. Watch the builder plant it.';
    fb.className = 'm-note is-ok';
    setTimeout(() => {
        b.steps.push({ form: b.form, index, lhs, rhs });
        b.form = next;
        b.busy = false;
        drawBuild(true);
    }, 650);
}

// ---- shared ----

function mount(derivation, tree, opts) {
    if (tl) {
        tl.pause();
        if (tl.dispose) tl.dispose();
    }
    view.clear();
    tl = buildSequence(derivation, tree, view, { yield: false, character: true, ...opts });
}

function nextButton(enabled) {
    const b = document.querySelector('[data-qm="next"]');
    b.disabled = !enabled;
    b.textContent = state.q >= Q.length - 1 ? 'See results' : 'Next question';
}

function renderProgress() {
    const score = state.res.filter(Boolean).length;
    $('qm-score').textContent = `${score} correct`;
    $('qm-bar').replaceChildren(...state.res.map((r, i) => {
        const s = document.createElement('span');
        s.className = r === true ? 'is-ok' : r === false ? 'is-bad' : i === state.q ? 'is-current' : '';
        return s;
    }));
}

function finish() {
    if (tl) tl.pause();
    showView('done');
    const score = state.res.filter(Boolean).length;
    $('qm-final').textContent = score;
    $('qm-msg').textContent = score >= 9 ? 'Strong result. You read and build trees reliably.'
        : score >= 6 ? 'Good. The lessons cover the ones you missed.'
            : 'Worth another pass through the lessons, then try again.';
    $('qm-review').replaceChildren(...Q.map((q, i) => {
        const row = document.createElement('div');
        row.className = 'quiz-m-review__row';
        row.innerHTML = `<span class="quiz-m-review__n">${i + 1}</span><span class="quiz-m-review__t"></span><span class="quiz-m-review__icon ${state.res[i] ? 'is-ok' : 'is-bad'}">${state.res[i] ? '✓' : '✕'}</span>`;
        row.querySelector('.quiz-m-review__t').textContent = q.short;
        return row;
    }));
}

document.querySelectorAll('[data-qm="start"]').forEach(b => b.addEventListener('click', start));
document.querySelector('[data-qm="next"]').addEventListener('click', () => ask(state.q + 1));
