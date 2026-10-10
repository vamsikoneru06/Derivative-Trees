const SVG_NS = 'http://www.w3.org/2000/svg';

/** Node radius in tree units. Layout gaps in sequences.js are multiples of it. */
export const NODE_R = 22;

function make(tag, attrs = {}, parent = null) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
}

const fmt = n => (Math.round(n * 100) / 100).toString();
const easeOut = p => 1 - Math.pow(1 - p, 3);

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
 * Tree node. Kinds differ by shape and fill, not colour alone:
 * nonterminal = filled disc (with a dashed ring while still open),
 * terminal = outlined disc, ε = dashed outline.
 *
 * Props: x, y, scale, opacity,
 *   open   dashed ring on a nonterminal that has not been expanded yet
 *   act    being expanded: solid ring + accent fill
 *   pulse  0..1 progress of the expanding ring that ripples outwards
 *   fresh  terminal just created (accent tint)
 *   burst  0..1 progress of the ring that pops when a child lands
 *   ybar   0..1 progress of the yield (underline, shadow fades)
 *   ghost  opacity of the dashed placeholder left behind during the yield
 *   glow   ambiguity highlight
 */
class NodeHandle extends Handle {
    constructor(node, layers) {
        super({
            x: 0, y: 0, scale: 1, opacity: 1, open: 0, act: 0, pulse: 0, fresh: 0,
            burst: 0, ybar: 0, ghost: 0, ghostX: 0, ghostY: 0, glow: 0,
        });
        this.node = node;
        const r = NODE_R;
        const kind = node.kind === 'nonterminal' ? 'nt' : node.kind === 'terminal' ? 'term' : 'eps';
        this.kind = kind;

        this.ghostEl = make('circle', { class: 'node-ghost', r, opacity: 0 }, layers.ghost);
        this.burstEl = make('circle', { class: 'node-burst', opacity: 0 }, layers.burst);

        this.el = make('g', { class: `node node--${kind}`, 'data-id': node.id }, layers.nodes);
        this.glowEl = make('circle', { class: 'node__glow', r: r + 10, opacity: 0 }, this.el);
        this.shadowEl = make('ellipse', { class: 'node__shadow', cy: r + 6, rx: r * 0.78, ry: r * 0.17 }, this.el);
        if (kind === 'nt') {
            this.openEl = make('circle', { class: 'node__open', r: r + 6, opacity: 0 }, this.el);
            this.pulseEl = make('circle', { class: 'node__pulse', r: r + 6, opacity: 0 }, this.el);
            this.ringEl = make('circle', { class: 'node__ring', r: r + 6, opacity: 0 }, this.el);
            make('circle', { class: 'node__base', r }, this.el);
            this.overEl = make('circle', { class: 'node__over', r, opacity: 0 }, this.el);
        } else if (kind === 'term') {
            make('circle', { class: 'node__base', r }, this.el);
            this.overEl = make('circle', { class: 'node__over', r, opacity: 0 }, this.el);
            this.barEl = make('line', { class: 'node__bar', x1: -r * 0.55, x2: r * 0.55, y1: r + 10, y2: r + 10, opacity: 0 }, this.el);
        } else {
            make('circle', { class: 'node__base', r }, this.el);
        }
        this.label = make('text', {
            class: 'node__label', 'text-anchor': 'middle', 'dominant-baseline': 'central', y: 1,
            'font-size': node.symbol.length > 1 ? r * 0.68 : r * 0.82,
        }, this.el);
        this.label.textContent = node.symbol;
    }

    flush() {
        const v = this.v;
        write(this.el, 'transform', `translate(${fmt(v.x)} ${fmt(v.y)}) scale(${fmt(v.scale)})`);
        write(this.el, 'opacity', fmt(v.opacity));
        write(this.glowEl, 'opacity', fmt(v.glow));
        write(this.shadowEl, 'opacity', fmt(1 - v.ybar * 0.6));

        if (this.kind === 'nt') {
            write(this.openEl, 'opacity', fmt(v.open * (1 - v.act)));
            write(this.ringEl, 'opacity', fmt(v.act));
            write(this.overEl, 'opacity', fmt(v.act));
            const p = v.pulse;
            write(this.pulseEl, 'r', fmt(NODE_R + 6 + 16 * easeOut(p)));
            write(this.pulseEl, 'opacity', fmt(p > 0 && p < 1 ? 1 - p : 0));
            write(this.el, 'class', `node node--nt${v.act > 0.5 ? ' is-active' : ''}`);
        } else if (this.kind === 'term') {
            write(this.overEl, 'opacity', fmt(v.fresh * (1 - v.ybar)));
            write(this.barEl, 'opacity', fmt(v.ybar));
        }

        const b = v.burst;
        if (b > 0 && b < 1) {
            write(this.burstEl, 'cx', fmt(v.x));
            write(this.burstEl, 'cy', fmt(v.y));
            write(this.burstEl, 'r', fmt(NODE_R + 4 + easeOut(b) * 18));
            write(this.burstEl, 'opacity', fmt((1 - b) * 0.7));
        } else {
            write(this.burstEl, 'opacity', '0');
        }

        write(this.ghostEl, 'cx', fmt(v.ghostX));
        write(this.ghostEl, 'cy', fmt(v.ghostY));
        write(this.ghostEl, 'opacity', fmt(v.ghost));
    }
}

/**
 * Edge from parent to child, trimmed to the node outlines; follows both nodes.
 * Props: draw (0..1), active (accent colour + moving tip while drawing), fade, glow.
 */
class EdgeHandle extends Handle {
    constructor(from, to, layer) {
        super({ draw: 0, active: 0, fade: 0, glow: 0 });
        this.from = from;
        this.to = to;
        this.el = make('g', { class: 'edge' }, layer);
        this.glowEl = make('line', { class: 'edge__glow', opacity: 0 }, this.el);
        this.lineEl = make('line', { class: 'edge__line' }, this.el);
        this.tipEl = make('circle', { class: 'edge__tip', r: 4, opacity: 0 }, this.el);
    }

    flush() {
        const a = this.from.v, b = this.to.v;
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
        const sx = a.x + ux * (NODE_R + 2), sy = a.y + uy * (NODE_R + 2);
        const ex = b.x - ux * (NODE_R + 2) * b.scale, ey = b.y - uy * (NODE_R + 2) * b.scale;
        const l = Math.max(0, Math.hypot(ex - sx, ey - sy));
        const d = this.v.draw;

        for (const line of [this.lineEl, this.glowEl]) {
            write(line, 'x1', fmt(sx));
            write(line, 'y1', fmt(sy));
            write(line, 'x2', fmt(ex));
            write(line, 'y2', fmt(ey));
        }
        write(this.lineEl, 'stroke-dasharray', `${fmt(l)} ${fmt(l + 1)}`);
        write(this.lineEl, 'stroke-dashoffset', fmt(l * (1 - d)));
        write(this.lineEl, 'opacity', d > 0 ? fmt(1 - this.v.fade * 0.5) : '0');
        write(this.lineEl, 'class', `edge__line${this.v.active > 0.5 ? ' is-drawing' : ''}`);
        write(this.glowEl, 'opacity', fmt(this.v.glow * (d > 0 ? 1 : 0)));

        if (this.v.active > 0.5 && d > 0 && d < 1) {
            write(this.tipEl, 'cx', fmt(sx + (ex - sx) * d));
            write(this.tipEl, 'cy', fmt(sy + (ey - sy) * d));
            write(this.tipEl, 'opacity', '1');
        } else {
            write(this.tipEl, 'opacity', '0');
        }
    }
}

/**
 * Production card "S → a S b" above and to the right of a node, in the gap
 * between tree rows so it never covers a sibling; a dashed link ties it to the node.
 * Props: opacity, slide (extra offset while it slides in), dashed (practice "S → ?").
 */
export const CARD_DX = NODE_R * 0.55;   // card's left edge, from the node centre
export const CARD_DY = -NODE_R - 44;    // card's top edge, from the node centre
export const CARD_H = 42;

class CardHandle extends Handle {
    constructor(text, anchor, layer) {
        super({ opacity: 0, slide: 0, dashed: 0 });
        this.anchor = anchor;
        this.el = make('g', { class: 'prod-card', opacity: 0 }, layer);
        this.link = make('line', { class: 'prod-card__link', x1: 10, y1: CARD_H }, this.el);
        this.shadow = make('rect', { class: 'prod-card__shadow', y: 4, height: CARD_H, rx: 11 }, this.el);
        this.box = make('rect', { class: 'prod-card__box', height: CARD_H, rx: 11 }, this.el);
        const label = make('text', { class: 'prod-card__text', x: 15, y: CARD_H / 2, 'dominant-baseline': 'central' }, this.el);
        const [lhs, rhs] = text.split(' → ');
        make('tspan', { class: 'prod-card__lhs' }, label).textContent = lhs;
        make('tspan', { class: 'prod-card__arrow' }, label).textContent = ' → ';
        make('tspan', { class: 'prod-card__rhs' }, label).textContent = rhs;
        const measured = label.getComputedTextLength ? label.getComputedTextLength() : 0;
        this.width = (measured || text.length * 10) + 30;
        this.box.setAttribute('width', this.width);
        this.shadow.setAttribute('width', this.width);
    }

    flush() {
        const a = this.anchor.v;
        const s = this.v.slide;
        write(this.el, 'transform', `translate(${fmt(a.x + CARD_DX + s)} ${fmt(a.y + CARD_DY)})`);
        write(this.el, 'opacity', fmt(this.v.opacity));
        // Link ends at the node's upper-right edge (45 degrees), in card coordinates.
        write(this.link, 'x2', fmt(-CARD_DX - s + NODE_R * 0.7));
        write(this.link, 'y2', fmt(-CARD_DY - NODE_R * 0.7));
        write(this.box, 'class', `prod-card__box${this.v.dashed > 0.5 ? ' is-pending' : ''}`);
    }
}

/** The camera: tweened viewBox corners x0, y0, x1, y1. */
class CameraHandle extends Handle {
    constructor(svg) {
        super({ x0: -150, y0: -100, x1: 150, y1: 100 });
        this.svg = svg;
    }

    flush() {
        const { x0, y0, x1, y1 } = this.v;
        write(this.svg, 'viewBox', `${fmt(x0)} ${fmt(y0)} ${fmt(x1 - x0)} ${fmt(y1 - y0)}`);
    }
}

/**
 * Wraps an <svg> element. Elements are created on demand and keyed, so a
 * sequence can ask for the same node twice and get the same handle.
 */
export function createTreeView(svgEl) {
    svgEl.classList.add('tree-view');
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    let layers;
    let handles;
    let camera;

    function reset() {
        svgEl.replaceChildren();
        layers = {
            ghost: make('g', { class: 'layer-ghosts' }, svgEl),
            edges: make('g', { class: 'layer-edges' }, svgEl),
            burst: make('g', { class: 'layer-bursts' }, svgEl),
            under: make('g', { class: 'layer-under' }, svgEl),
            nodes: make('g', { class: 'layer-nodes' }, svgEl),
            overlay: make('g', { class: 'layer-overlay' }, svgEl),
        };
        handles = new Map();
        camera = new CameraHandle(svgEl);
        handles.set('camera', camera);
    }
    reset();

    const get = (key, create) => {
        if (!handles.has(key)) handles.set(key, create());
        return handles.get(key);
    };

    return {
        svg: svgEl,

        /** Layer drawn between edges and nodes, e.g. for the builder character. */
        get underLayer() {
            return layers.under;
        },

        get camera() {
            return camera;
        },

        ensureNode(node) {
            return get(`n${node.id}`, () => new NodeHandle(node, layers));
        },

        ensureEdge(parent, child) {
            return get(`e${parent.id}-${child.id}`, () =>
                new EdgeHandle(this.ensureNode(parent), this.ensureNode(child), layers.edges));
        },

        card(key, text, anchorNode) {
            return get(`c${key}`, () => new CardHandle(text, this.ensureNode(anchorNode), layers.overlay));
        },

        /** Register any object with flush(); it is flushed every frame. */
        attach(key, handle) {
            handles.set(key, handle);
            return handle;
        },

        el(id) {
            const h = handles.get(`n${id}`);
            return h ? h.el : null;
        },

        node(id) {
            return handles.get(`n${id}`) || null;
        },

        flush() {
            for (const h of handles.values()) h.flush();
        },

        clear: reset,
    };
}
