// Phone Home page (Home design, phone width). Scrolling drives two trees:
// the hero tree grows and then shows its yield, and the pinned scene tree
// derives id + id * id while the captions scroll underneath it.
import { parseGrammar } from '../core/parse-grammar.js';
import { findLeftmost } from '../core/derive.js';
import { buildTree } from '../core/tree.js';
import { buildSequence, BEAT_MS, YIELD_MS, prefersReducedMotion } from '../anim/sequences.js';
import { createTreeView } from '../render/svg.js';

const $ = id => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const phone = matchMedia('(max-width: 759px)');

function build(text, target, svg) {
    const { grammar } = parseGrammar(text);
    const { derivation } = findLeftmost(grammar, target);
    const tl = buildSequence(derivation, buildTree(derivation, grammar), createTreeView(svg), { character: true });
    const n = derivation.steps.length;
    // Timeline time for "f steps done" (fractional), then h of the yield.
    const at = (f, h = 0) => {
        if (h > 0 && tl.yieldStart != null) return tl.yieldStart + h * YIELD_MS;
        if (f <= 0) return tl.stepEnd(0);
        if (f >= n) return tl.stepEnd(n);
        const k = Math.floor(f);
        const start = tl.markers.find(m => m.step === k + 1).start;
        return start + (f - k) * BEAT_MS;
    };
    return { tl, derivation, n, at };
}

const hero = build('S → a S b\nS → ε', 'aabb', $('hm-hero'));
const scene = build('E → E + E\nE → E * E\nE → ( E )\nE → id', 'id + id * id', $('hm-scene-tree'));
const heroText = document.querySelector('.home-m-hero__text');
const caps = [...document.querySelectorAll('.home-m-cap')];
const form = $('hm-form');
let started = false;
let lastStep = -1;

function renderForm(k) {
    if (k === lastStep) return;
    lastStep = k;
    const { steps, result } = scene.derivation;
    const syms = k < steps.length ? steps[k].form : result;
    const mark = k < steps.length ? steps[k].index : -1;
    form.replaceChildren();
    if (k > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'home-m-pin__arrow';
        arrow.textContent = '⇒';
        form.appendChild(arrow);
    }
    syms.forEach((sym, j) => {
        const s = document.createElement('span');
        s.textContent = sym;
        if (j === mark) s.className = 'is-next';
        form.appendChild(s);
    });
}

function onScroll() {
    if (!phone.matches) return;
    const y = window.scrollY;
    const vh = window.innerHeight;

    // Hero: text shrinks and fades; the tree grows from 1.5 to 3 steps, then shows its yield.
    const hp = clamp(y / 500);
    heroText.style.transform = `scale(${1 - hp * 0.12}) translateY(${hp * 24}px)`;
    heroText.style.opacity = String(1 - hp * 0.75);
    if (y > 4) {
        hero.tl.pause();
        hero.tl.seek(hero.at(1.5 + 1.5 * clamp(y / 380), clamp((y - 380) / 220)));
    } else if (started && !hero.tl.playing) {
        hero.tl.seek(hero.at(1.5));
    }

    // Scene: progress through the pinned section drives the derivation.
    const r = $('hm-scene').getBoundingClientRect();
    const sp = clamp((vh * 0.55 - r.top) / Math.max(1, r.height - vh * 0.3));
    const f = clamp(sp / 0.86) * scene.n;
    scene.tl.seek(scene.at(f, clamp((sp - 0.9) / 0.1)));
    renderForm(Math.min(scene.n, Math.floor(f + 0.5)));
    const active = Math.min(3, Math.floor(sp * 4));
    caps.forEach((c, i) => {
        c.classList.toggle('is-active', i === active);
        c.classList.toggle('is-past', i < active);
    });
}

let raf = 0;
addEventListener('scroll', () => {
    if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        onScroll();
    });
}, { passive: true });
addEventListener('resize', onScroll);

// The hero builds its first steps on its own, then scrolling takes over.
if (phone.matches && window.scrollY <= 4) {
    started = true;
    if (prefersReducedMotion()) hero.tl.seek(hero.at(1.5));
    else hero.tl.playTo(hero.at(1.5));
}
onScroll();

// Cards rise in when they come into view.
const cards = $('hm-cards');
new IntersectionObserver((entries, io) => {
    if (!entries[0].isIntersecting) return;
    cards.classList.add('is-in');
    io.disconnect();
}, { rootMargin: '0px 0px -18% 0px' }).observe(cards);
