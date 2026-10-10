import { parseGrammar } from '../core/parse-grammar.js';
import { findLeftmost, toRightmost } from '../core/derive.js';
import { buildTree } from '../core/tree.js';
import { findTwoTrees } from '../core/ambiguity.js';
import { Timeline } from '../anim/timeline.js';
import { tween } from '../anim/tween.js';
import { easeOutCubic, easeInOutCubic, easeOutBack, pulse } from '../anim/easing.js';
import { buildSequence, prefersReducedMotion } from '../anim/sequences.js';
import { createTreeView } from '../render/svg.js';
import { playWhenVisible, unshared } from './shared.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const reduce = prefersReducedMotion();
const $ = id => document.getElementById(id);

function make(tag, attrs, parent) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent.appendChild(el);
    return el;
}

/** Animatable wrapper for any SVG element: x, y, scale, opacity. */
function handle(el, values = {}) {
    const h = {
        v: { x: 0, y: 0, scale: 1, opacity: 0, ...values },
        set(prop, value) { this.v[prop] = value; },
        flush() {
            el.setAttribute('transform', `translate(${this.v.x} ${this.v.y}) scale(${this.v.scale})`);
            el.setAttribute('opacity', this.v.opacity);
        },
    };
    return h;
}

/** Timeline for a hand-built scene; returns [timeline, add]. */
function scene(handles) {
    const tl = new Timeline();
    const add = (h, prop, from, to, start, duration, ease) =>
        tl.add(tween(h, prop, from, to, start, reduce ? 0 : duration, ease));
    tl.onRender(() => handles.forEach(h => h.flush()));
    return [tl, add];
}

function grammar(text) {
    return parseGrammar(text).grammar;
}

function wire(svgOrBox, timeline, opts) {
    const box = svgOrBox.closest('.anim-box');
    const control = playWhenVisible(box, timeline, opts);
    box.querySelector('.anim-box__replay').addEventListener('click', control.restart);
}

// ---- 1. Anatomy of a CFG ------------------------------------------------------

function cfgScene() {
    const svg = $('anim-cfg');
    const symbols = [
        { text: 'S', kind: 'nt', x: 70 },
        { text: '→', kind: 'op', x: 115 },
        { text: 'a', kind: 'term', x: 160 },
        { text: 'S', kind: 'nt', x: 200 },
        { text: 'b', kind: 'term', x: 240 },
        { text: '|', kind: 'op', x: 285 },
        { text: 'ε', kind: 'eps', x: 330 },
    ];
    const handles = [];
    const tokens = symbols.map(s => {
        const g = make('g', {}, svg);
        if (s.kind === 'nt') make('circle', { r: 19, class: 'learn-shape learn-shape--nt' }, g);
        if (s.kind === 'term') make('rect', { x: -19, y: -19, width: 38, height: 38, rx: 7, class: 'learn-shape learn-shape--term' }, g);
        if (s.kind === 'eps') make('circle', { r: 19, class: 'learn-shape learn-shape--eps' }, g);
        const t = make('text', { 'text-anchor': 'middle', dy: '0.35em', class: 'learn-glyph' }, g);
        t.textContent = s.text;
        const h = handle(g, { x: s.x, y: 130 });
        handles.push(h);
        return { ...s, h };
    });

    const labels = [
        { text: 'nonterminals', x: 135, y: 62, kinds: ['nt'] },
        { text: 'terminals', x: 200, y: 210, kinds: ['term'] },
        { text: 'empty string', x: 330, y: 210, kinds: ['eps'] },
        { text: 'start symbol: the first left side', x: 200, y: 262, kinds: [] },
    ].map(l => {
        const t = make('text', { 'text-anchor': 'middle', class: 'learn-label' }, svg);
        t.textContent = l.text;
        const h = handle(t, { x: l.x, y: l.y });
        handles.push(h);
        return { ...l, h };
    });

    const [tl, add] = scene(handles);
    tokens.forEach((tok, i) => {
        add(tok.h, 'opacity', 0, 1, i * 120, 250);
        add(tok.h, 'y', 150, 130, i * 120, 400, easeOutCubic);
    });
    labels.forEach((label, i) => {
        const t = 1200 + i * 1100;
        add(label.h, 'opacity', 0, 1, t, 300);
        add(label.h, 'y', label.y + 10, label.y, t, 400, easeOutCubic);
        for (const tok of tokens.filter(tk => label.kinds.includes(tk.kind))) {
            add(tok.h, 'scale', 1, 1.25, t, 450, pulse);
        }
    });
    tl.minDuration = 1200 + labels.length * 1100 + 600;
    tl.seek(0);
    wire(svg, tl);
}

// ---- 2. A derivation, rewriting one symbol per step ---------------------------

function derivationScene() {
    const svg = $('anim-derivation');
    const { derivation } = findLeftmost(grammar('S -> aSb | ε'), 'aabb');
    const forms = [...derivation.steps.map(s => s.form), derivation.result];
    const W = 30;
    const rowY = r => 50 + r * 62;
    const xOf = (form, i) => 200 - ((form.length - 1) * W) / 2 + i * W;

    const handles = [];
    const ring = make('circle', { r: 15, class: 'learn-ring' }, svg);
    const ringH = handle(ring);
    handles.push(ringH);

    const [tl, add] = scene(handles);
    forms.forEach((form, r) => {
        const t0 = 300 + r * 1300;
        if (r > 0) {
            const arrow = make('text', { class: 'learn-glyph learn-glyph--muted', 'text-anchor': 'middle', dy: '0.35em' }, svg);
            arrow.textContent = '⇒';
            const ah = handle(arrow, { x: 200 - ((form.length - 1) * W) / 2 - 40, y: rowY(r) });
            handles.push(ah);
            add(ah, 'opacity', 0, 1, t0, 300);
        }

        const step = r > 0 ? derivation.steps[r - 1] : null;
        const prev = r > 0 ? forms[r - 1] : null;
        form.forEach((sym, i) => {
            const isNt = sym === 'S';
            const text = make('text', { class: `learn-glyph${isNt ? ' learn-glyph--nt' : ''}`, 'text-anchor': 'middle', dy: '0.35em' }, svg);
            text.textContent = sym;
            const h = handle(text);
            handles.push(h);

            // Where does this symbol come from in the previous form?
            let src = i;
            const fresh = step && i >= step.index && i < step.index + step.rhs.length;
            if (step) src = fresh ? step.index : i < step.index ? i : i - step.rhs.length + 1;
            const fromX = prev ? xOf(prev, src) : 200;
            const fromY = prev ? rowY(r - 1) : rowY(0) - 12;

            add(h, 'x', fromX, xOf(form, i), t0 + 300, 600, easeInOutCubic);
            add(h, 'y', fromY, rowY(r), t0 + 300, 600, easeInOutCubic);
            add(h, 'opacity', 0, 1, t0 + 300, 250);
            if (fresh) add(h, 'scale', 0.4, 1, t0 + 300, 600, easeOutBack);
        });

        // Ring on the symbol the next step will replace.
        if (r < derivation.steps.length) {
            const idx = derivation.steps[r].index;
            const t = t0 + 1000;
            add(ringH, 'x', xOf(form, idx), xOf(form, idx), t, 0);
            add(ringH, 'y', rowY(r), rowY(r), t, 0);
            add(ringH, 'opacity', 0, 1, t, 200);
            add(ringH, 'scale', 0.6, 1, t, 300, easeOutBack);
            add(ringH, 'opacity', 1, 0, t + 900, 250);
        }
    });
    tl.minDuration = 300 + forms.length * 1300 + 400;
    tl.seek(0);
    wire(svg, tl);
}

// ---- 3–6: scenes built with the tree engine -----------------------------------

function orderScene() {
    const g = grammar('S -> AB\nA -> aA | a\nB -> bB | b');
    const { derivation } = findLeftmost(g, 'aabb');
    const left = buildTree(derivation, g);
    const rightDerivation = toRightmost(left);
    const right = buildTree(rightDerivation, g);
    const layout = { gapX: 46, gapY: 70 };
    const tl = new Timeline();
    buildSequence(derivation, left, createTreeView($('anim-order-left')), { timeline: tl, yield: false, layout });
    buildSequence(rightDerivation, right, createTreeView($('anim-order-right')), { timeline: tl, yield: false, layout });
    tl.setSpeed(1.5);
    wire($('anim-order-left'), tl);
}

function treeScene() {
    const g = grammar('E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id');
    const { derivation } = findLeftmost(g, 'id + id * id');
    const tl = buildSequence(derivation, buildTree(derivation, g), createTreeView($('anim-tree')), { yield: false });
    tl.setSpeed(2);
    wire($('anim-tree'), tl);
}

function yieldScene() {
    const g = grammar('S -> aSb | ε');
    const { derivation } = findLeftmost(g, 'aabb');
    const tl = buildSequence(derivation, buildTree(derivation, g), createTreeView($('anim-yield')));
    // Start with the tree already built, so the loop is all about the yield.
    wire($('anim-yield'), tl, { from: tl.stepEnd(derivation.steps.length) });
}

function ambiguityScene() {
    const g = grammar('E -> E + E | E * E | id');
    const { trees } = findTwoTrees(g, 'id + id * id');
    const tl = new Timeline();
    const glow = [unshared(trees[0], trees[1]), unshared(trees[1], trees[0])];
    trees.forEach((tree, i) => {
        buildSequence(null, tree, createTreeView($(`anim-amb-${i + 1}`)), {
            timeline: tl, yield: false, glowIds: glow[i].map(n => n.id), layout: { gapX: 44, gapY: 66 },
        });
    });
    tl.setSpeed(1.5);
    wire($('anim-amb-1'), tl);
}

cfgScene();
derivationScene();
orderScene();
treeScene();
yieldScene();
ambiguityScene();

// ---- table of contents: active section and reading progress -------------------

const links = new Map([...document.querySelectorAll('.toc a')].map(a => [a.hash.slice(1), a]));
const tocObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        links.forEach(a => a.classList.remove('is-active'));
        links.get(entry.target.id)?.classList.add('is-active');
    }
}, { rootMargin: '-40% 0px -55% 0px' });
document.querySelectorAll('.learn-section').forEach(s => tocObserver.observe(s));

const progress = document.querySelector('.toc__progress span');
function updateProgress() {
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.width = `${max > 0 ? (100 * scrollY) / max : 100}%`;
}
addEventListener('scroll', updateProgress, { passive: true });
updateProgress();
