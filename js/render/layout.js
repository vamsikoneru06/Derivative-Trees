/**
 * Position every node visible after `upToStep` expansions.
 *  - current leaves take consecutive slots, so they line up in yield order;
 *  - an expanded node sits midway between its first and last child;
 *  - y = depth * gapY;
 *  - the leaf row is centred on x = 0.
 *
 * @returns {Map<number, {x: number, y: number}>}
 */
export function layoutTree(root, upToStep, opts = {}) {
    const gapX = opts.gapX ?? 56;
    const gapY = opts.gapY ?? 76;
    const positions = new Map();
    let slot = 0;

    const isExpanded = node =>
        node.expandedAtStep !== null && node.expandedAtStep <= upToStep && node.children.length > 0;

    function place(node, depth) {
        let x;
        if (isExpanded(node)) {
            for (const child of node.children) place(child, depth + 1);
            const first = positions.get(node.children[0].id).x;
            const last = positions.get(node.children[node.children.length - 1].id).x;
            x = (first + last) / 2;
        } else {
            x = slot * gapX;
            slot += 1;
        }
        positions.set(node.id, { x, y: depth * gapY });
    }

    place(root, 0);

    const shift = ((slot - 1) * gapX) / 2;
    for (const p of positions.values()) p.x -= shift;
    return positions;
}

/** Smallest box containing every position. */
export function bounds(positions) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const { x, y } of positions.values()) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    }
    return { minX, maxX, minY, maxY };
}

/** All nodes of the tree, parents before children, left to right. */
export function preorder(root) {
    const out = [];
    const walk = node => {
        out.push(node);
        node.children.forEach(walk);
    };
    walk(root);
    return out;
}

/** Leaves of the finished tree in yield order (ε leaves included). */
export function leaves(root) {
    return preorder(root).filter(node => node.children.length === 0);
}
