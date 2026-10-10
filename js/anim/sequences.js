import { Timeline } from './timeline.js';
import { tween } from './tween.js';
import { linear, easeOutCubic, easeInOutCubic, easeOutBack } from './easing.js';
import { layoutTree, bounds, preorder, leaves } from '../render/layout.js';
import { NODE_R, CARD_DX, CARD_DY, CARD_H } from '../render/svg.js';
import { Builder } from '../render/builder.js';

export const ROOT_MS = 500;
export const BEAT_MS = 2600;   // one expansion
export const HOLD_MS = 900;    // pause before the next one when playing
export const STEP_MS = BEAT_MS + HOLD_MS;
export const YIELD_MS = 3000;

const R = NODE_R;
const backBy = c => p => 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);

export function prefersReducedMotion() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Build the whole animation for one derivation. Step k (1-based) starts at
 * offset + ROOT_MS + (k - 1) * STEP_MS and its expansion lasts BEAT_MS.
 * As fractions u of the beat:
 *
 *  0.00–0.30  the builder walks to the node                    (builder.js)
 *  0.00–0.86  A2  node is "being expanded" (ring + accent fill); pulse 0.28–0.50
 *  0.34–0.50  A3  production card slides in above-right of the node; out 0.86–0.98
 *  0.30–0.80      camera reframes to fit the new tree
 *  0.50–0.86  A6  existing nodes glide to their new places
 *  0.50–0.80  A4  children grow out of the parent
 *  0.52–0.80  A5  edges draw in, accent-coloured with a moving tip
 *  0.72–0.98  A7  each new child lands with a burst; new terminals settle 0.88–1.00
 *
 * After the last step: A8 yield (leaves move into a row, ghosts stay behind)
 * and, with opts.glowIds, the A10 ambiguity glow.
 * With reduced motion every tween is instant, but steps keep their spacing.
 *
 * @param derivation  { steps } — only its length is used; may be null
 * @param root        TreeNode whose expandedAtStep values give the order
 * @param view        createTreeView(...) result
 * @param opts        { timeline, offset, yield, glowIds, character, pending, reducedMotion }
 *                    pending: id of the nonterminal waiting for a practice answer
 */
export function buildSequence(derivation, root, view, opts = {}) {
    const tl = opts.timeline ?? new Timeline();
    const reduce = opts.reducedMotion ?? prefersReducedMotion();
    const offset = opts.offset ?? 0;
    const nodes = preorder(root);
    const byId = new Map(nodes.map(n => [n.id, n]));
    const stepCount = derivation
        ? derivation.steps.length
        : Math.max(0, ...nodes.map(n => n.expandedAtStep ?? 0));
    const gaps = { gapX: R * (opts.character ? 3.9 : 3.4), gapY: R * 4.4 };

    const add = (target, prop, from, to, start, duration, ease = linear) =>
        tl.add(tween(target, prop, from, to, offset + start, reduce ? 0 : duration, ease));
    const jump = (target, prop, from, to, start) => add(target, prop, from, to, start, 0);

    const expandedAt = new Map(nodes.filter(n => n.expandedAtStep !== null).map(n => [n.expandedAtStep, n]));
    const layouts = [];
    for (let k = 0; k <= stepCount; k++) layouts.push(layoutTree(root, k, gaps));
    const final = layouts[stepCount];
    const stepStart = k => ROOT_MS + (k - 1) * STEP_MS;

    // ---- camera: a box around the tree (plus the card and the builder) ----
    const camera = view.camera;
    const box = (positions, extra = []) => {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const p of [...positions.values(), ...extra]) {
            x0 = Math.min(x0, p.x - (p.w0 ?? R)); x1 = Math.max(x1, p.x + (p.w1 ?? R));
            y0 = Math.min(y0, p.y - (p.h0 ?? R)); y1 = Math.max(y1, p.y + (p.h1 ?? R));
        }
        x0 -= R * (opts.character ? 2.8 : 1.2); x1 += R * 1.2; y0 -= R * 1.2; y1 += R * 1.3;
        const minW = R * 15, minH = R * 9.5;
        if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
        if (y1 - y0 < minH) { const c = (y0 + y1) / 2; y0 = c - minH / 2; y1 = c + minH / 2; }
        return { x0, y0, x1, y1 };
    };
    const cardBox = (node, positions) => {
        const p = positions.get(node.id);
        return { x: p.x + CARD_DX, y: p.y + CARD_DY, w0: 0, w1: 190, h0: 0, h1: CARD_H + 4 };
    };
    let cam = box(layouts[0]);
    const moveCamera = (to, start, duration) => {
        for (const k of ['x0', 'y0', 'x1', 'y1']) add(camera, k, cam[k], to[k], start, duration, easeInOutCubic);
        cam = to;
    };
    for (const k of ['x0', 'y0', 'x1', 'y1']) jump(camera, k, cam[k], cam[k], 0);

    // Two trees can share one timeline (ambiguity explorer): add each step marker once.
    const marker = (k, start, end) => {
        if (!tl.markers.some(m => m.step === k)) tl.addMarker(k, start, end);
    };

    // ---- A1: root appears ----
    const rootH = view.ensureNode(root);
    jump(rootH, 'x', 0, 0, 0);
    jump(rootH, 'y', 0, 0, 0);
    add(rootH, 'opacity', 0, 1, 0, 300);
    add(rootH, 'scale', 0.4, 1, 0, ROOT_MS - 50, easeOutBack);
    if (root.kind === 'nonterminal') jump(rootH, 'open', 0, 1, 0);
    marker(0, offset, offset + ROOT_MS);

    // ---- one block per derivation step ----
    for (let k = 1; k <= stepCount; k++) {
        const t0 = stepStart(k);
        const at = u => t0 + u * BEAT_MS;
        const span = (a, b) => (b - a) * BEAT_MS;
        marker(k, offset + t0, offset + t0 + BEAT_MS);

        const parent = expandedAt.get(k);
        if (!parent) continue;
        const p = view.ensureNode(parent);
        const prev = layouts[k - 1];
        const next = layouts[k];

        // A2: highlight, pulse and a little squash as it opens.
        jump(p, 'open', 1, 0, at(0));
        jump(p, 'act', 0, 1, at(0));
        add(p, 'pulse', 0, 1, at(0.28), span(0.28, 0.5), easeOutCubic);
        add(p, 'scale', 1, 0.86, at(0.42), span(0.42, 0.5), easeOutCubic);
        add(p, 'scale', 0.86, 1, at(0.5), span(0.5, 0.64), backBy(3));
        add(p, 'act', 1, 0, at(0.86), span(0.86, 1));

        // A3: production card.
        const card = view.card(k, productionLabel(parent), parent);
        add(card, 'opacity', 0, 1, at(0.34), span(0.34, 0.4));
        add(card, 'slide', 22, 0, at(0.34), span(0.34, 0.5), backBy(1.6));
        add(card, 'opacity', 1, 0, at(0.86), span(0.86, 0.98));

        moveCamera(box(next, [cardBox(parent, next)]), at(0.3), span(0.3, 0.8));
        // After the last card fades, centre on the finished tree alone.
        if (k === stepCount) moveCamera(box(next), at(0.86), span(0.86, 1));

        // A6: nodes that already exist glide to their new places.
        for (const [id, a] of prev) {
            const b = next.get(id);
            if (a.x === b.x && a.y === b.y) continue;
            const h = view.ensureNode(byId.get(id));
            add(h, 'x', a.x, b.x, at(0.5), span(0.5, 0.86), backBy(0.7));
            add(h, 'y', a.y, b.y, at(0.5), span(0.5, 0.86), backBy(0.7));
        }

        // A4 + A5 + A7: children grow out, edges draw, children land.
        const from = prev.get(parent.id);
        for (const child of parent.children) {
            const h = view.ensureNode(child);
            const to = next.get(child.id);
            add(h, 'x', from.x, to.x, at(0.5), span(0.5, 0.8), backBy(1.2));
            add(h, 'y', from.y, to.y, at(0.5), span(0.5, 0.8), backBy(1.2));
            add(h, 'scale', 0.15, 1, at(0.5), span(0.5, 0.8), backBy(2.6));
            add(h, 'opacity', 0, 1, at(0.5), span(0.5, 0.56));
            add(h, 'burst', 0, 1, at(0.72), span(0.72, 0.98));
            if (child.kind === 'nonterminal') jump(h, 'open', 0, 1, at(0.5));
            if (child.kind === 'terminal') {
                jump(h, 'fresh', 0, 1, at(0.5));
                add(h, 'fresh', 1, 0, at(0.88), span(0.88, 1));
            }

            const edge = view.ensureEdge(parent, child);
            jump(edge, 'active', 0, 1, at(0.5));
            add(edge, 'draw', 0, 1, at(0.52), span(0.52, 0.8), easeOutCubic);
            jump(edge, 'active', 1, 0, at(0.9));
        }
    }

    const lastBeatEnd = stepCount ? stepStart(stepCount) + BEAT_MS : ROOT_MS;
    let end = lastBeatEnd;

    // ---- practice: the next nonterminal waits for the student's choice ----
    if (opts.pending != null && byId.has(opts.pending)) {
        const node = byId.get(opts.pending);
        const h = view.ensureNode(node);
        jump(h, 'act', 0, 1, lastBeatEnd);
        const card = view.card('pending', `${node.symbol} → ?`, node);
        jump(card, 'dashed', 0, 1, lastBeatEnd);
        add(card, 'opacity', 0, 1, lastBeatEnd, 200);
        moveCamera(box(final, [cardBox(node, final)]), lastBeatEnd, 400);
        end = lastBeatEnd + 400;
    }

    // ---- A10: differing nodes glow (ambiguity explorer), top-down ----
    if (opts.glowIds && opts.glowIds.length > 0) {
        const start = end + 200;
        const glowing = new Set(opts.glowIds);
        for (const n of nodes.filter(n => glowing.has(n.id))) {
            const t = start + (final.get(n.id).y / gaps.gapY) * 150;
            add(view.ensureNode(n), 'glow', 0, 1, t, 400, easeOutCubic);
            if (n.parent && glowing.has(n.parent.id)) add(view.ensureEdge(n.parent, n), 'glow', 0, 1, t, 400);
        }
        end = start + 1200;
    }

    // ---- A8: yield — the leaves move into a row that spells the string ----
    const terminals = leaves(root).filter(n => n.kind === 'terminal');
    let yieldInfo = null;
    if (opts.yield !== false && terminals.length > 0 && opts.pending == null) {
        const start = end + 400;
        const n = terminals.length;
        const maxY = bounds(final).maxY;
        const rowY = maxY + gaps.gapY * 0.95;
        const stagger = n > 1 ? Math.min(0.09, 0.5 / (n - 1)) : 0;
        const each = (1 - (n - 1) * stagger) * YIELD_MS;
        const targets = terminals.map((leaf, i) => ({ x: (i - (n - 1) / 2) * R * 2.6, y: rowY }));

        terminals.forEach((leaf, i) => {
            const h = view.ensureNode(leaf);
            const from = final.get(leaf.id);
            const t = start + i * stagger * YIELD_MS;
            jump(h, 'ghostX', from.x, from.x, 0);
            jump(h, 'ghostY', from.y, from.y, 0);
            add(h, 'x', from.x, targets[i].x, t, each, easeInOutCubic);
            add(h, 'y', from.y, targets[i].y, t, each, easeInOutCubic);
            add(h, 'ybar', 0, 1, t, each, easeInOutCubic);
            add(h, 'ghost', 0, 0.6, t, each, easeInOutCubic);
            if (leaf.parent) add(view.ensureEdge(leaf.parent, leaf), 'fade', 0, 1, t, each);
        });
        // Leave room under the row for the page's "Yield" label.
        const rowBox = targets.map(p => ({ ...p, h1: R * 4.2 }));
        moveCamera(box(final, rowBox), start, YIELD_MS * 0.6);
        yieldInfo = { start, end: start + YIELD_MS, rightEnd: targets[n - 1] };
        end = start + YIELD_MS;
    }

    tl.minDuration = Math.max(tl.minDuration, offset + end);
    tl.yieldStart = yieldInfo ? offset + yieldInfo.start : null;
    tl.onRender(() => view.flush());

    if (opts.character && (stepCount > 0 || opts.pending != null)) {
        attachBuilder(tl, view, {
            offset, byId, layouts, stepCount, expandedAt, stepStart,
            pending: opts.pending, yieldInfo, reduce,
        });
    }

    tl.seek(0);
    return tl;
}

/** Drive the builder from the timeline, plus a light idle loop while paused. */
function attachBuilder(tl, view, s) {
    const builder = new Builder(view.underLayer);
    const steps = [];
    for (let k = 1; k <= s.stepCount; k++) steps.push({ node: s.expandedAt.get(k).id });
    builder.setScene({ nodes: s.byId, layouts: s.layouts, steps });

    const render = () => {
        const t = tl.time - s.offset;
        let k = 0, u = 0;
        for (let j = 1; j <= s.stepCount; j++) {
            const start = s.stepStart(j);
            if (t < start) break;
            if (t < start + BEAT_MS) { k = j - 1; u = (t - start) / BEAT_MS; break; }
            k = j;
        }
        const harvest = s.yieldInfo ? Math.min(1, Math.max(0, (t - s.yieldInfo.start) / YIELD_MS)) : 0;
        builder.render({
            k, u, harvest,
            pending: s.pending != null && k === s.stepCount ? { node: s.pending } : null,
            yieldEnd: s.yieldInfo ? s.yieldInfo.rightEnd : null,
            pos: id => { const h = view.node(id); return h ? h.v : null; },
            time: s.reduce ? 0 : performance.now() / 1000,
        });
    };
    tl.onRender(render);

    if (s.reduce) return;
    let raf = 0;
    const idle = () => {
        if (!tl.playing && !document.hidden) render();
        raf = requestAnimationFrame(idle);
    };
    raf = requestAnimationFrame(idle);
    tl.dispose = () => cancelAnimationFrame(raf);
}

/** "S → a S b" for an expanded node. */
export function productionLabel(node) {
    const rhs = node.children.filter(c => c.kind !== 'epsilon').map(c => c.symbol);
    return `${node.symbol} → ${rhs.length ? rhs.join(' ') : 'ε'}`;
}
