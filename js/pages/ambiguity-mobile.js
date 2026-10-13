// Phone Ambiguity page (Mobile Pages design): the two trees for id + id * id,
// stepped together by one dock, then the unambiguous E / T / F grammar on a loop.
import { parseGrammar } from '../core/parse-grammar.js';
import { findLeftmost } from '../core/derive.js';
import { findTwoTrees } from '../core/ambiguity.js';
import { buildTree } from '../core/tree.js';
import { Timeline } from '../anim/timeline.js';
import { buildSequence } from '../anim/sequences.js';
import { createTreeView } from '../render/svg.js';
import { completedSteps } from '../ui/steps-panel.js';
import { playWhenVisible } from './shared.js';

const $ = id => document.getElementById(id);
const opts = { yield: false, character: true };

// ---- the two trees, one clock ----
const { trees } = findTwoTrees(parseGrammar('E → E + E | E * E | id').grammar, 'id + id * id');
// Tree 1 is the one with + at the root.
if (trees[0].children[1].symbol !== '+') trees.reverse();
const tl = new Timeline();
trees.forEach((tree, i) => buildSequence(null, tree, createTreeView($(`amb-m-${i + 1}`)), { ...opts, timeline: tl }));
const total = Math.max(...tl.markers.map(m => m.step));
const markerStart = k => tl.markers.find(m => m.step === k).start;

const dock = document.querySelector('.m-dock');
const play = dock.querySelector('[data-amb="play"]');
function render() {
    const k = completedSteps(tl);
    $('amb-m-step').textContent = `STEP ${k} / ${total}`;
    play.classList.toggle('is-playing', tl.playing);
    play.setAttribute('aria-label', tl.playing ? 'Pause' : 'Play');
    dock.querySelector('[data-amb="back"]').disabled = k === 0 && tl.time <= tl.stepEnd(0) + 1;
    dock.querySelector('[data-amb="forward"]').disabled = k >= total;
}
tl.on('time', render);
tl.on('state', render);

function go(k) {
    k = Math.max(0, Math.min(total, k));
    const target = tl.stepEnd(k);
    if (target > tl.time && k === completedSteps(tl) + 1) {
        if (tl.time < markerStart(k)) tl.seek(markerStart(k));
        tl.playTo(target);
    } else {
        tl.playTo(target, { rate: Math.max(1.5, Math.abs(tl.time - target) / 500) });
    }
}
dock.addEventListener('click', e => {
    const b = e.target.closest('button[data-amb]');
    if (!b || b.disabled) return;
    const k = completedSteps(tl);
    if (b.dataset.amb === 'back') go(k - 1);
    else if (b.dataset.amb === 'forward') go(k + 1);
    else if (tl.playing) tl.pause();
    else {
        if (k >= total) tl.seek(0);
        tl.playTo(tl.stepEnd(total));
    }
});

// Start playing the first time the trees come into view.
const io = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    setTimeout(() => tl.playTo(tl.stepEnd(total)), 600);
}, { threshold: 0.4 });
io.observe($('amb-m-1'));
render();

// ---- the fix, on a loop ----
const fix = parseGrammar('E → E + T | T\nT → T * F | F\nF → id').grammar;
const { derivation } = findLeftmost(fix, 'id + id * id');
const fixSvg = $('amb-m-fix');
playWhenVisible(fixSvg, buildSequence(derivation, buildTree(derivation, fix), createTreeView(fixSvg), opts));
