import { test } from 'node:test';
import assert from 'node:assert';
import { layoutTree, bounds, leaves } from '../js/render/layout.js';

// Builds a TreeNode tree from nested arrays: ['S', 1, [children...]] where
// the number is the step that expands the node (null for leaves).
let nextId = 1;
function node(symbol, expandedAtStep = null, children = [], createdAtStep = 0) {
    const kind = symbol === 'ε' ? 'epsilon' : /^[A-Z]$/.test(symbol) ? 'nonterminal' : 'terminal';
    const n = { id: nextId++, symbol, kind, children: [], parent: null, createdAtStep, expandedAtStep };
    for (const c of children) {
        c.parent = n;
        c.createdAtStep = expandedAtStep;
        n.children.push(c);
    }
    return n;
}

// S ⇒ aSb ⇒ aaSbb ⇒ aabb
function anbnTree() {
    nextId = 1;
    return node('S', 1, [
        node('a'),
        node('S', 2, [node('a'), node('S', 3, [node('ε')]), node('b')]),
        node('b'),
    ]);
}

const GAP = 50;

test('Only the root is placed before any step', () => {
    const root = anbnTree();
    const pos = layoutTree(root, 0, { gapX: GAP });
    assert.strictEqual(pos.size, 1);
    assert.deepStrictEqual(pos.get(root.id), { x: 0, y: 0 });
});

test('Leaves line up in yield order with equal gaps', () => {
    const root = anbnTree();
    const pos = layoutTree(root, 3, { gapX: GAP });
    const xs = leaves(root).map(n => pos.get(n.id).x);
    assert.deepStrictEqual(leaves(root).map(n => n.symbol), ['a', 'a', 'ε', 'b', 'b']);
    for (let i = 1; i < xs.length; i++) assert.strictEqual(xs[i] - xs[i - 1], GAP);
});

test('Each parent is centred over its first and last child', () => {
    const root = anbnTree();
    const pos = layoutTree(root, 3, { gapX: GAP });
    const check = n => {
        if (n.children.length === 0) return;
        const first = pos.get(n.children[0].id).x;
        const last = pos.get(n.children[n.children.length - 1].id).x;
        assert.strictEqual(pos.get(n.id).x, (first + last) / 2);
        n.children.forEach(check);
    };
    check(root);
});

test('Depth sets y and the leaf row is centred on 0', () => {
    const root = anbnTree();
    const pos = layoutTree(root, 3, { gapX: GAP, gapY: 80 });
    const b = bounds(pos);
    assert.strictEqual(b.minX, -b.maxX);
    assert.strictEqual(b.minY, 0);
    assert.strictEqual(b.maxY, 3 * 80);
});

test('Nodes at the same depth never overlap', () => {
    const root = anbnTree();
    for (let step = 0; step <= 3; step++) {
        const pos = layoutTree(root, step, { gapX: GAP });
        const byDepth = new Map();
        for (const { x, y } of pos.values()) {
            if (!byDepth.has(y)) byDepth.set(y, []);
            byDepth.get(y).push(x);
        }
        for (const xs of byDepth.values()) {
            xs.sort((a, b) => a - b);
            for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= GAP);
        }
    }
});

test('The tree widens step by step', () => {
    const root = anbnTree();
    const widths = [0, 1, 2, 3].map(step => {
        const b = bounds(layoutTree(root, step, { gapX: GAP }));
        return b.maxX - b.minX;
    });
    assert.deepStrictEqual(widths, [0, 2 * GAP, 4 * GAP, 4 * GAP]);
});
