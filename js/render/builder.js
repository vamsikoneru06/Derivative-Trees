/*
 * The builder: a small character who walks along the tree to the node being
 * expanded, chops it open, and dances when the tree is finished.
 * Drawn with plain SVG lines, circles and paths; every pose is computed from
 * (step, progress within the step), so seeking shows the right pose.
 * Idle motion (breathing, dancing) also uses wall-clock time.
 */
import { NODE_R } from './svg.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const back = (t, c = 1.70158) => 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
const phase = (u, a, b) => clamp((u - a) / (b - a));

function make(tag, parent, attrs = {}, cls = '') {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (cls) el.setAttribute('class', cls);
    parent.appendChild(el);
    return el;
}
const set = (el, k, v) => el.setAttribute(k, v);
const move = (el, v) => el.setAttribute('transform', v);

export class Builder {
    constructor(layer) {
        const R = NODE_R;
        this.R = R;
        const s = this.s = (R / 22) * 0.62;
        const g = this.el = make('g', layer, {}, 'builder');
        this.shadow = make('ellipse', g, { rx: 15 * s, ry: 3.2 * s }, 'builder__shadow');
        this.flip = make('g', g);
        const body = this.body = make('g', this.flip);

        this.hip = -14 * s;
        this.shoulder = -31 * s;
        const limb = (w, cls) => make('line', body, { 'stroke-width': w }, cls);
        this.legBack = limb(4.4 * s, 'builder__ink');
        this.legFront = limb(4.4 * s, 'builder__ink');
        this.armBack = limb(3.6 * s, 'builder__ink');
        this.handBack = make('circle', body, { r: 3.2 * s }, 'builder__skin');
        for (const leg of [this.legBack, this.legFront]) {
            set(leg, 'x1', 0); set(leg, 'y1', this.hip); set(leg, 'x2', 0); set(leg, 'y2', 0);
        }
        make('ellipse', body, { cx: 1 * s, cy: -24 * s, rx: 11.5 * s, ry: 12.5 * s }, 'builder__body');
        this.tie = make('path', body, {}, 'builder__tie');

        const head = this.head = make('g', body);
        make('circle', head, { cx: 0, cy: -47 * s, r: 13 * s }, 'builder__skin');
        make('circle', head, { cx: -4 * s, cy: -46 * s, r: 3 * s, 'stroke-width': 1 * s }, 'builder__ear');
        this.hair = make('path', head, { 'stroke-width': 1.8 * s }, 'builder__hair');
        this.eyes = [[4, -50], [10.5, -49]].map(([x, y]) => {
            make('circle', head, { cx: x * s, cy: y * s, r: 4.4 * s, 'stroke-width': 0.8 * s }, 'builder__eye');
            return { x: x * s, y: y * s, pupil: make('circle', head, { r: 2 * s }, 'builder__pupil') };
        });
        this.brow = make('path', head, { 'stroke-width': 2.4 * s }, 'builder__hair');
        make('ellipse', head, { cx: 13.5 * s, cy: -44 * s, rx: 3.2 * s, ry: 2.6 * s }, 'builder__nose');
        this.mouth = make('path', head, { 'stroke-width': 1.6 * s }, 'builder__mouth');

        this.armFront = limb(3.6 * s, 'builder__ink');
        this.hand = make('circle', body, { r: 3.2 * s }, 'builder__skin');
        for (const arm of [this.armBack, this.armFront]) {
            set(arm, 'x1', 0); set(arm, 'y1', this.shoulder); set(arm, 'x2', 0); set(arm, 'y2', this.shoulder + 15 * s);
        }

        this.bubble = make('g', g);
        this.bubbleBox = make('rect', this.bubble, { rx: 8 }, 'builder__bubble');
        this.bubbleText = make('text', this.bubble, {
            'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': R * 0.62,
        }, 'builder__say');
        this.said = null;
        this.lastX = null;
        this.pupilDrift = 0;
    }

    /** Tree data for the current derivation. */
    setScene({ nodes, layouts, steps }) {
        this.nodes = nodes;       // Map id -> TreeNode
        this.layouts = layouts;   // layouts[k] = Map id -> {x, y} after k steps
        this.steps = steps;       // steps[i] = { node: id } for step i + 1
    }

    /** Path of node ids from a to b through their lowest common ancestor. */
    path(a, b) {
        const ancestors = new Set();
        for (let x = this.nodes.get(a); x; x = x.parent) ancestors.add(x.id);
        const down = [];
        let y = this.nodes.get(b);
        while (!ancestors.has(y.id)) {
            down.push(y.id);
            y = y.parent;
        }
        const up = [];
        for (let x = this.nodes.get(a); x.id !== y.id; x = x.parent) up.push(x.id);
        up.push(y.id);
        return up.concat(down.reverse());
    }

    /**
     * @param k         steps completed
     * @param u         progress (0..1) of step k + 1, or 0 between steps
     * @param pending   step waiting for a practice answer: { node } or null
     * @param harvest   yield progress 0..1
     * @param yieldEnd  { x, y } right end of the yield row
     * @param pos       id -> current {x, y} of a node
     * @param time      wall-clock seconds, for idle motion
     */
    render({ k, u, pending, harvest, yieldEnd, pos, time }) {
        const R = this.R, s = this.s, N = this.steps.length;
        if (!N && !pending) {
            set(this.el, 'opacity', 0);
            return null;
        }
        set(this.el, 'opacity', 1);

        const step = pending || (k < N ? this.steps[k] : null);
        const practice = !!pending;
        const L0 = this.layouts[Math.min(k, N)];
        const spot = q => ({ x: q.x - R * 1.62, y: q.y + R * 1.1 });

        let at, dir = 1, dist = 0, walking = false, arm = -18, crouch = 0;
        if (step) {
            const prev = practice ? step.node : k > 0 ? this.steps[k - 1].node : null;
            let pts;
            if (prev == null) {
                const root = spot(L0.get(step.node));
                pts = [{ x: root.x - R * 5, y: root.y }, root];
            } else {
                pts = this.path(prev, step.node).map(id => spot(L0.get(id)));
            }

            const wp = phase(u, 0, 0.3);
            if (u < 0.3) {
                const segs = [];
                let total = 0;
                for (let i = 1; i < pts.length; i++) {
                    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
                    segs.push(l);
                    total += l;
                }
                let d = easeInOut(wp) * total;
                dist = d;
                at = pts[0];
                for (let i = 0; i < segs.length; i++) {
                    if (d <= segs[i] || i === segs.length - 1) {
                        const f = segs[i] ? Math.min(1, d / segs[i]) : 1;
                        at = { x: lerp(pts[i].x, pts[i + 1].x, f), y: lerp(pts[i].y, pts[i + 1].y, f) };
                        if (Math.abs(pts[i + 1].x - pts[i].x) > 1) dir = pts[i + 1].x < pts[i].x ? -1 : 1;
                        break;
                    }
                    d -= segs[i];
                }
                walking = wp > 0 && wp < 1 && total > 1;
                if (u === 0 && practice) arm = -40 + Math.sin(time * 2) * 6;
            } else {
                at = spot(pos(step.node) || L0.get(step.node));
            }
            const a = phase(u, 0.28, 0.42), b = phase(u, 0.42, 0.52), c = phase(u, 0.62, 0.82);
            if (a > 0) arm = lerp(-18, -160, easeOut(a));
            if (b > 0) arm = lerp(-160, -62, back(b, 2));
            if (c > 0) arm = lerp(-62, -18, easeInOut(c));
            crouch = Math.sin(phase(u, 0.42, 0.6) * Math.PI) * 4 * s;
        } else {
            const last = this.steps[N - 1].node;
            const base = spot(pos(last) || this.layouts[N].get(last));
            at = base;
            if (harvest > 0 && yieldEnd) {
                const target = { x: yieldEnd.x + R * 2.2, y: yieldEnd.y + R * 0.98 };
                const w = easeInOut(clamp(harvest * 1.5));
                at = { x: lerp(base.x, target.x, w), y: lerp(base.y, target.y, w) };
                dist = Math.hypot(at.x - base.x, at.y - base.y);
                walking = w > 0 && w < 1;
                dir = target.x < base.x && walking ? -1 : 1;
                if (w >= 1) {
                    arm = -150 + Math.sin(time * 9) * 18;
                    dir = -1;
                }
            }
        }

        const wp = step ? phase(u, 0, 0.3) : 0;
        const trip = step && !practice && k % 3 === 2 && wp > 0.45 && wp < 0.85;
        const chop = step && u > 0.28 && u < 0.62;
        const dance = !step && !walking;
        const scratch = step && u === 0 && practice;
        const swing = walking ? Math.sin((dist / (R * 0.55)) * Math.PI) : 0;
        let bob = walking ? -Math.abs(swing) * 5 * s : 0;
        let lean = walking ? swing * 9 : 0;
        let armBack = swing * 40;
        let say = '';

        if (chop) {
            const j = phase(u, 0.3, 0.44), l = phase(u, 0.44, 0.52);
            bob += -Math.sin(j * Math.PI) * 12 * s + Math.sin(l * Math.PI) * 4 * s;
            lean = l > 0 ? 14 * (1 - phase(u, 0.5, 0.62)) : -8 * j;
            armBack = 30 + 30 * j;
            if (u > 0.42) say = 'HYAH!';
        }
        if (trip) {
            const tt = phase(wp, 0.45, 0.85);
            lean = Math.sin(tt * Math.PI) * 48;
            armBack = -150 * Math.sin(tt * Math.PI);
            bob += Math.sin(tt * Math.PI) * 3 * s;
            say = 'whoa';
        }
        if (scratch) {
            arm = -175 + Math.sin(time * 14) * 10;
            say = 'uhh…';
        }
        if (dance) {
            const q = Math.sin(time * 6);
            lean = q * 10;
            bob = -Math.abs(Math.sin(time * 6)) * 6 * s;
            arm = q > 0 ? -165 : -40;
            armBack = q > 0 ? 20 : 150;
            say = harvest === 0 || harvest >= 1 ? 'nailed it' : '';
        }

        const breath = walking || dance ? 1 : 1 + Math.sin(time * 2.4) * 0.025;
        move(this.el, `translate(${at.x} ${at.y})`);
        move(this.flip, `scale(${dir} 1)`);
        move(this.body, `translate(0 ${bob + crouch}) rotate(${lean}) scale(1 ${breath})`);

        const legAngle = dance ? Math.sin(time * 6) * 18 : swing * 38;
        move(this.legFront, `rotate(${legAngle} 0 ${this.hip})`);
        move(this.legBack, `rotate(${-legAngle} 0 ${this.hip})`);

        const A = walking && !trip ? -swing * 40
            : trip ? -160 * Math.sin(phase(wp, 0.45, 0.85) * Math.PI) - 10
            : arm;
        const reach = 15 * s;
        const handAt = angle => {
            const r = (angle * Math.PI) / 180;
            return [-Math.sin(r) * reach, this.shoulder + Math.cos(r) * reach];
        };
        move(this.armFront, `rotate(${A} 0 ${this.shoulder})`);
        move(this.armBack, `rotate(${armBack} 0 ${this.shoulder})`);
        let h = handAt(A);
        set(this.hand, 'cx', h[0]); set(this.hand, 'cy', h[1]);
        h = handAt(armBack);
        set(this.handBack, 'cx', h[0]); set(this.handBack, 'cy', h[1]);

        const P = (x, y) => `${x * s} ${y * s}`;
        const flap = walking ? swing * 25 : dance ? Math.sin(time * 6) * 30 : 0;
        set(this.tie, 'd', `M${P(1.5, -35)}L${P(5, -33)}L${P(4, -18)}L${P(1.5, -14)}L${P(-1, -18)}Z`);
        move(this.tie, `rotate(${-flap - lean * 0.6} ${1.5 * s} ${-35 * s})`);
        const hairBob = walking ? Math.abs(swing) * 4 : dance ? Math.abs(Math.sin(time * 6)) * 5 : Math.sin(time * 3) * 0.6;
        set(this.hair, 'd', `M${P(-11, -52)}C${P(-8, -63 - hairBob)} ${P(6, -66 - hairBob)} ${P(12, -56)}`);
        move(this.head, `rotate(${chop ? -6 : walking ? swing * 4 : 0} 0 ${-36 * s})`);

        const dx = this.lastX == null ? 0 : at.x - this.lastX;
        this.lastX = at.x;
        this.pupilDrift += (-Math.max(-1, Math.min(1, dx * 0.6)) * dir - this.pupilDrift) * 0.18;
        const look = walking || chop ? 0.9 : Math.sin(time * 0.8) * 0.9;
        this.eyes.forEach((e, i) => {
            set(e.pupil, 'cx', e.x + (look + this.pupilDrift) * 1.8 * s);
            set(e.pupil, 'cy', e.y + (trip ? -1.8 : chop ? -1 : 0.4 + Math.cos(time * 1.3 + i) * 0.4) * s);
        });
        const browY = chop || trip ? -57.5 : scratch ? -56 + Math.sin(time * 7) : -55.5;
        set(this.brow, 'd', `M${P(0, browY + 1)}Q${P(7, browY - 2.5)} ${P(14.5, browY + 0.5)}`);
        set(this.mouth, 'd', dance || chop
            ? `M${P(5, -39.5)}Q${P(9.5, -33.5)} ${P(13, -39)}`
            : trip
                ? `M${P(7, -38)}Q${P(9, -41)} ${P(11, -38)}Q${P(9, -35)} ${P(7, -38)}`
                : `M${P(6, -38.5)}Q${P(9, -37)} ${P(12, -39)}`);
        move(this.shadow, `scale(${1 + bob / (30 * s)} 1)`);

        if (say !== this.said) {
            this.said = say;
            this.bubbleText.textContent = say;
            this.bubbleWidth = say ? this.bubbleText.getComputedTextLength() + R * 0.7 : 0;
        }
        if (say) {
            const bw = this.bubbleWidth, bh = R * 1.05;
            set(this.bubbleBox, 'x', -bw / 2); set(this.bubbleBox, 'y', -bh / 2);
            set(this.bubbleBox, 'width', bw); set(this.bubbleBox, 'height', bh);
            move(this.bubble, `translate(${dir * 22 * s} ${-78 * s - R * 0.5 + bob})`);
            set(this.bubble, 'opacity', 1);
        } else {
            set(this.bubble, 'opacity', 0);
        }
        return at;
    }
}
