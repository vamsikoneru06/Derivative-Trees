// Small helpers shared by the page scripts.

import { preorder } from '../render/layout.js';

/** Show a status badge: kind is 'ok' | 'bad' | 'warn' | 'info'. */
export function setStatus(el, kind, text) {
    el.replaceChildren();
    const badge = document.createElement('span');
    badge.className = `badge badge--${kind} is-new`;
    badge.textContent = text;
    el.appendChild(badge);
}

/**
 * Resolve after the browser has painted, so a "Searching…" badge shows first.
 * Background tabs get no animation frames, so a timeout resolves it there.
 */
export function nextFrame() {
    return new Promise(resolve => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
        setTimeout(resolve, 50);
    });
}

/** Play `timeline` whenever `el` is on screen, pause when it leaves; optionally loop. */
export function playWhenVisible(el, timeline, { loop = true, pauseMs = 2200, from = 0 } = {}) {
    let visible = false;
    let timer = 0;
    const restart = () => {
        timeline.seek(from);
        timeline.play();
    };
    const offEnd = timeline.on('end', () => {
        if (!loop) return;
        timer = setTimeout(() => {
            if (visible) restart();
        }, pauseMs);
    });
    const observer = new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        if (visible) {
            if (timeline.time < from || timeline.time >= timeline.duration) restart();
            else timeline.play();
        }
        else {
            clearTimeout(timer);
            timeline.pause();
        }
    }, { threshold: 0.35 });
    observer.observe(el);
    const stop = () => {
        observer.disconnect();
        clearTimeout(timer);
        offEnd();
        timeline.pause();
    };
    return { restart, stop };
}

/**
 * Nodes of `tree` with no identical subtree, covering the same part of the
 * string, in `other`. Shared pieces (like each lone `id`) stay plain.
 */
export function unshared(tree, other) {
    const otherKeys = new Set(subtreeKeys(other).values());
    const keys = subtreeKeys(tree);
    return preorder(tree).filter(n => !otherKeys.has(keys.get(n)));
}

function subtreeKeys(root) {
    const keys = new Map();
    let pos = 0;
    const walk = node => {
        const start = pos;
        let inner = node.symbol;
        if (node.children.length > 0) inner = node.children.map(walk).join(',');
        else if (node.kind !== 'epsilon') pos += 1;
        const key = `${node.symbol}[${start}-${pos}](${inner})`;
        keys.set(node, key);
        return key;
    };
    walk(root);
    return keys;
}

function code(text) {
    const c = document.createElement('code');
    c.textContent = text;
    return c;
}
