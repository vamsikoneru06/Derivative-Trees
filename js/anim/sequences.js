import { Timeline } from './timeline.js';
import { tween } from './tween.js';
import { linear, easeOutCubic, easeInOutCubic, easeInOutQuad, easeOutBack } from './easing.js';
import { layoutTree, bounds, preorder, leaves } from '../render/layout.js';

export const ROOT_MS = 500;
export const STEP_MS = 1000;

export function prefersReducedMotion() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Build the whole animation for one derivation (A1–A8, plus A10 glow when
 * opts.diffIds is given). Step k (1-based) runs from
 * offset + ROOT_MS + (k - 1) * STEP_MS for STEP_MS, with these phases:
 *
 *    0–250   A2  ring pulses on the nonterminal being expanded
 *  150–450   A3  production card slides in beside it
 *  300–700   A6  existing nodes glide to their new layout positions
 *  400–800   A4  children grow out of the parent to their own positions
 *  450–850   A5  edges draw from parent to child
 *  800–950   A7  terminal leaves settle; card fades out
 *
 * With reduced motion every tween has duration 0 but steps keep their
 * spacing, so playing and stepping still show every state.
 *
 * @param derivation  { steps } — only its length is used; may be null
 * @param root        TreeNode whose expandedAtStep matches the derivation
 * @param view        createTreeView(...) result
 * @param opts        { timeline, offset, yield, diffIds, reducedMotion, layout }
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

    const add = (target, prop, from, to, start, duration, ease = linear) =>
        tl.add(tween(target, prop, from, to, offset + start, reduce ? 0 : duration, ease));

    const expandedAt = new Map(nodes.filter(n => n.expandedAtStep !== null).map(n => [n.expandedAtStep, n]));
    const layouts = [];
    for (let k = 0; k <= stepCount; k++) layouts.push(layoutTree(root, k, opts.layout));

    const final = layouts[stepCount];
    const box = bounds(final);
    const gapY = opts.layout?.gapY ?? 76;
    const yieldY = box.maxY + gapY;

    // Room above the root for its production card and below for the yield row.
    view.fit({ minX: Math.min(box.minX, -150), maxX: Math.max(box.maxX, 150), minY: -40, maxY: yieldY });

    // ---- A1: root appears ----
    const rootH = view.ensureNode(root);
    add(rootH, 'x', 0, 0, 0, 0);
    add(rootH, 'y', 0, 0, 0, 0);
    add(rootH, 'opacity', 0, 1, 0, 300);
    add(rootH, 'scale', 0.4, 1, 0, ROOT_MS - 50, easeOutBack);
    // Two trees can share one timeline (ambiguity explorer): add each step marker once.
    const marker = (k, start, end) => {
        if (!tl.markers.some(m => m.step === k)) tl.addMarker(k, start, end);
    };
    marker(0, offset, offset + ROOT_MS);

    // ---- one block per derivation step ----
    for (let k = 1; k <= stepCount; k++) {
        const t0 = ROOT_MS + (k - 1) * STEP_MS;
        marker(k, offset + t0, offset + t0 + STEP_MS);

        const parent = expandedAt.get(k);
        if (!parent) continue;
        const parentH = view.ensureNode(parent);
        const prev = layouts[k - 1];
        const next = layouts[k];

        // A2: highlight pulse; the node keeps a filled "expanded" look afterwards.
        add(parentH, 'ring', 0, 1, t0, 250, easeOutBack);
        add(parentH, 'done', 0, 1, t0 + 250, 300);
        add(parentH, 'ring', 1, 0, t0 + 800, 150);

        // A3: production card, read off the tree so derivation is optional.
        const card = view.card(k, productionLabel(parent), parent);
        add(card, 'opacity', 0, 1, t0 + 150, 300);
        add(card, 'rise', 10, 0, t0 + 150, 300, easeOutCubic);
        add(card, 'opacity', 1, 0, t0 + 800, 150);

        // A6: nodes that already exist glide to their new places.
        for (const [id, p] of prev) {
            const q = next.get(id);
            if (q.x === p.x && q.y === p.y) continue;
            const h = view.ensureNode(byId.get(id));
            add(h, 'x', p.x, q.x, t0 + 300, 400, easeInOutCubic);
        }

        // A4 + A5: children grow out of the parent; edges draw in.
        const from = next.get(parent.id);
        for (const child of parent.children) {
            const h = view.ensureNode(child);
            const to = next.get(child.id);
            add(h, 'x', from.x, to.x, t0 + 400, 400, easeOutCubic);
            add(h, 'y', from.y, to.y, t0 + 400, 400, easeOutCubic);
            add(h, 'scale', 0.35, 1, t0 + 400, 400, easeOutBack);
            add(h, 'opacity', 0, 1, t0 + 400, 200);
            add(view.ensureEdge(parent, child), 'draw', 0, 1, t0 + 450, 400, easeInOutQuad);

            // A7: terminal and ε leaves settle.
            if (child.kind !== 'nonterminal') add(h, 'settle', 0, 1, t0 + 800, 150);
        }
    }

    let end = ROOT_MS + stepCount * STEP_MS;

    // ---- A10: differing subtrees glow (ambiguity explorer) ----
    if (opts.diffIds && opts.diffIds.length > 0) {
        const start = end + 200;
        const inDiff = new Set();
        for (const id of opts.diffIds) {
            const top = byId.get(id);
            if (top) preorder(top).forEach(n => inDiff.add(n));
        }
        for (const n of inDiff) {
            const depth = layouts[stepCount].get(n.id).y / gapY;
            const t = start + depth * 120;
            add(view.ensureNode(n), 'glow', 0, 1, t, 400, easeOutCubic);
            if (n.parent && inDiff.has(n.parent)) add(view.ensureEdge(n.parent, n), 'glow', 0, 1, t, 400);
        }
        end = start + 1200;
    }

    // ---- A8: yield — leaves drop into a row that spells the string ----
    if (opts.yield !== false) {
        const start = end + 300;
        let symbols = leaves(root).filter(n => n.kind === 'terminal');
        const fromRoot = symbols.length === 0;
        if (fromRoot) symbols = [{ id: 'eps', symbol: 'ε', fromNode: root }];

        const widths = symbols.map(s => Math.max(26, s.symbol.length * 12 + 10));
        const total = widths.reduce((a, b) => a + b, 0);
        let x = -total / 2;

        symbols.forEach((leaf, i) => {
            const source = final.get(leaf.fromNode ? leaf.fromNode.id : leaf.id);
            const target = x + widths[i] / 2;
            x += widths[i];
            const t = start + i * 140;
            const token = view.token(i, leaf.symbol);
            add(token, 'x', source.x, target, t, 550, easeInOutCubic);
            add(token, 'y', source.y, yieldY, t, 550, easeInOutCubic);
            add(token, 'opacity', 0, 1, t, 150);
            add(token, 'scale', 0.7, 1, t, 550, easeOutBack);
            if (!leaf.fromNode) {
                const leafH = view.ensureNode(leaf);
                add(leafH, 'ring', 0, 1, t, 150);
                add(leafH, 'ring', 1, 0, t + 300, 250);
            }
        });

        const bar = view.bar('yield');
        add(bar, 'x1', -total / 2 - 6, -total / 2 - 6, 0, 0);
        add(bar, 'x2', total / 2 + 6, total / 2 + 6, 0, 0);
        add(bar, 'y', yieldY + 20, yieldY + 20, 0, 0);
        const barStart = start + symbols.length * 140 + 400;
        add(bar, 'draw', 0, 1, barStart, 400, easeOutCubic);
        end = barStart + 400;
    }

    tl.minDuration = Math.max(tl.minDuration, offset + end);
    tl.onRender(() => view.flush());
    tl.seek(0);
    return tl;
}

/** "S → aSb" for an expanded node; symbols are spaced if any is longer than one character. */
export function productionLabel(node) {
    const rhs = node.children.filter(c => c.kind !== 'epsilon').map(c => c.symbol);
    if (rhs.length === 0) return `${node.symbol} → ε`;
    return `${node.symbol} → ${rhs.join(rhs.some(s => s.length > 1) ? ' ' : '')}`;
}
