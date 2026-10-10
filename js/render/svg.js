const SVG_NS = 'http://www.w3.org/2000/svg';

export const NODE_R = 19;

function make(tag, attrs = {}, parent = null) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
}

const fmt = n => (Math.round(n * 100) / 100).toString();

// Writes an attribute only when its value changed since the last write.
function write(el, attr, value) {
    const cache = el.__written || (el.__written = {});
    if (cache[attr] === value) return;
    cache[attr] = value;
    el.setAttribute(attr, value);
}

/**
 * Base for everything the timeline animates. Tweens call set(prop, value);
 * the view calls flush() once per frame to write the values to the DOM.
 */
class Handle {
    constructor(values) {
        this.v = values;
    }

    set(prop, value) {
        this.v[prop] = value;
    }
}

/**
 * Tree node: shape by kind (circle = nonterminal, rounded square = terminal,
 * dashed circle = ε) so states never rely on colour alone.
 * Props: x, y, scale, opacity, ring (expanding pulse), done (expanded fill),
 * settle (terminal settled fill), glow (ambiguity highlight).
 */
class NodeHandle extends Handle {
    constructor(node, layer) {
        super({ x: 0, y: 0, scale: 1, opacity: 1, ring: 0, done: 0, settle: 0, glow: 0 });
        this.node = node;
        const kind = node.kind === 'nonterminal' ? 'nt' : node.kind === 'terminal' ? 'term' : 'eps';
        this.el = make('g', { class: `node node--${kind}`, 'data-id': node.id }, layer);
        const r = NODE_R;

        this.glowEl = make('circle', { class: 'node__glow', r: r + 9, opacity: 0 }, this.el);
        this.ringEl = make('circle', { class: 'node__ring', r: r + 4, opacity: 0 }, this.el);
        if (kind === 'term') {
            const box = { x: -r, y: -r, width: 2 * r, height: 2 * r, rx: 7 };
            this.baseEl = make('rect', { class: 'node__base', ...box }, this.el);
            this.fillEl = make('rect', { class: 'node__fill', ...box, opacity: 0 }, this.el);
        } else {
            this.baseEl = make('circle', { class: 'node__base', r }, this.el);
            this.fillEl = make('circle', { class: 'node__fill', r, opacity: 0 }, this.el);
        }
        const label = make('text', { class: 'node__label', 'text-anchor': 'middle', dy: '0.35em' }, this.el);
        label.textContent = node.symbol;
        if (node.symbol.length > 2) label.setAttribute('textLength', 2 * r - 8);
    }

    flush() {
        const v = this.v;
        write(this.el, 'transform', `translate(${fmt(v.x)} ${fmt(v.y)}) scale(${fmt(v.scale)})`);
        write(this.el, 'opacity', fmt(v.opacity));
        write(this.ringEl, 'opacity', fmt(v.ring));
        write(this.ringEl, 'r', fmt(NODE_R + 3 + 5 * v.ring));
        write(this.fillEl, 'opacity', fmt(Math.max(v.done, v.settle)));
        write(this.glowEl, 'opacity', fmt(v.glow));
    }
}

/** Edge from parent to child; follows both nodes. Props: draw (0..1), glow. */
class EdgeHandle extends Handle {
    constructor(from, to, layer) {
        super({ draw: 0, glow: 0 });
        this.from = from;
        this.to = to;
        this.el = make('g', { class: 'edge' }, layer);
        this.glowEl = make('line', { class: 'edge__glow', opacity: 0 }, this.el);
        this.lineEl = make('line', { class: 'edge__line' }, this.el);
    }

    flush() {
        const a = this.from.v, b = this.to.v;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        for (const line of [this.lineEl, this.glowEl]) {
            write(line, 'x1', fmt(a.x));
            write(line, 'y1', fmt(a.y));
            write(line, 'x2', fmt(b.x));
            write(line, 'y2', fmt(b.y));
        }
        write(this.lineEl, 'stroke-dasharray', `${fmt(len)} ${fmt(len + 1)}`);
        write(this.lineEl, 'stroke-dashoffset', fmt(len * (1 - this.v.draw)));
        write(this.lineEl, 'opacity', this.v.draw > 0 ? '1' : '0');
        write(this.glowEl, 'opacity', fmt(this.v.glow * this.v.draw));
    }
}

/** Production card "S → aSb" centred above a node. Props: opacity, rise (slide-up offset). */
class CardHandle extends Handle {
    constructor(text, anchor, layer) {
        super({ opacity: 0, rise: 0 });
        this.anchor = anchor;
        this.el = make('g', { class: 'prod-card', opacity: 0 }, layer);
        this.box = make('rect', { class: 'prod-card__box', rx: 8, height: 28, y: -14 }, this.el);
        const label = make('text', { class: 'prod-card__text', 'text-anchor': 'middle', dy: '0.35em' }, this.el);
        label.textContent = text;
        const measured = label.getComputedTextLength ? label.getComputedTextLength() : 0;
        const width = (measured || text.length * 9) + 22;
        this.box.setAttribute('width', width);
        this.box.setAttribute('x', -width / 2);
    }

    flush() {
        // Siblings share the node's row, so above the node is the free spot.
        const a = this.anchor.v;
        const y = a.y - NODE_R - 22 + this.v.rise;
        write(this.el, 'transform', `translate(${fmt(a.x)} ${fmt(y)})`);
        write(this.el, 'opacity', fmt(this.v.opacity));
    }
}

/** A symbol of the yield row. Props: x, y, opacity, scale. */
class TokenHandle extends Handle {
    constructor(text, layer) {
        super({ x: 0, y: 0, opacity: 0, scale: 1 });
        this.el = make('g', { class: 'yield-token', opacity: 0 }, layer);
        const label = make('text', { 'text-anchor': 'middle', dy: '0.35em' }, this.el);
        label.textContent = text;
    }

    flush() {
        const v = this.v;
        write(this.el, 'transform', `translate(${fmt(v.x)} ${fmt(v.y)}) scale(${fmt(v.scale)})`);
        write(this.el, 'opacity', fmt(v.opacity));
    }
}

/** Underline below the yield row. Props: draw (0..1). */
class BarHandle extends Handle {
    constructor(layer) {
        super({ x1: 0, x2: 0, y: 0, draw: 0 });
        this.el = make('line', { class: 'yield-bar', opacity: 0 }, layer);
    }

    flush() {
        const v = this.v;
        const mid = (v.x1 + v.x2) / 2;
        const half = ((v.x2 - v.x1) / 2) * v.draw;
        write(this.el, 'x1', fmt(mid - half));
        write(this.el, 'x2', fmt(mid + half));
        write(this.el, 'y1', fmt(v.y));
        write(this.el, 'y2', fmt(v.y));
        write(this.el, 'opacity', v.draw > 0 ? '1' : '0');
    }
}

/**
 * Wraps an <svg> element. Elements are created on demand and keyed, so a
 * sequence can ask for the same node twice and get the same handle.
 */
export function createTreeView(svgEl) {
    svgEl.classList.add('tree-view');
    const edgeLayer = make('g', { class: 'layer-edges' }, svgEl);
    const nodeLayer = make('g', { class: 'layer-nodes' }, svgEl);
    const overlayLayer = make('g', { class: 'layer-overlay' }, svgEl);

    let handles = new Map();

    const get = (key, create) => {
        if (!handles.has(key)) handles.set(key, create());
        return handles.get(key);
    };

    return {
        svg: svgEl,

        ensureNode(node) {
            return get(`n${node.id}`, () => new NodeHandle(node, nodeLayer));
        },

        ensureEdge(parent, child) {
            return get(`e${parent.id}-${child.id}`, () =>
                new EdgeHandle(this.ensureNode(parent), this.ensureNode(child), edgeLayer));
        },

        card(key, text, anchorNode) {
            return get(`c${key}`, () => new CardHandle(text, this.ensureNode(anchorNode), overlayLayer));
        },

        token(key, text) {
            return get(`t${key}`, () => new TokenHandle(text, overlayLayer));
        },

        bar(key) {
            return get(`b${key}`, () => new BarHandle(overlayLayer));
        },

        el(id) {
            const h = handles.get(`n${id}`);
            return h ? h.el : null;
        },

        /** Fit the drawing area to a box in tree coordinates. */
        fit({ minX, maxX, minY, maxY }, pad = 40) {
            const w = maxX - minX + 2 * pad;
            const h = maxY - minY + 2 * pad;
            svgEl.setAttribute('viewBox', `${fmt(minX - pad)} ${fmt(minY - pad)} ${fmt(w)} ${fmt(h)}`);
        },

        flush() {
            for (const h of handles.values()) h.flush();
        },

        clear() {
            edgeLayer.replaceChildren();
            nodeLayer.replaceChildren();
            overlayLayer.replaceChildren();
            handles = new Map();
        },
    };
}
