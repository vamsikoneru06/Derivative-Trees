import { valueAt } from './tween.js';

/**
 * Ordered tweens on one clock. The picture at time t is a pure function of t:
 * seek(t) evaluates every tween from scratch, so playing, pausing, stepping
 * back and changing speed are all just "move the clock and seek".
 *
 * For each (target, prop) the value at time t is that of the latest tween
 * that has started; before any has started, it is the first tween's `from`.
 *
 * Events: 'time' (t), 'step' (k), 'state' (isPlaying), 'end'.
 */
export class Timeline {
    constructor() {
        this.tweens = [];
        this.markers = [];       // { step, start, end }, sorted by start
        this.renderers = [];     // called after every seek, e.g. view.flush
        this.time = 0;
        this.speed = 1;
        this.playing = false;
        this.minDuration = 0;
        this._listeners = new Map();
        this._dirty = true;
        this._stopAt = null;
        this._raf = 0;
        this._lastFrame = 0;
        this._lastStep = null;
        this._dir = 1;
        this._rate = 1;
    }

    add(tw) {
        this.tweens.push(tw);
        this._dirty = true;
        return this;
    }

    /** Step k occupies [start, end). `end` defaults to the next marker's start. */
    addMarker(step, start, end = null) {
        this.markers.push({ step, start, end });
        this.markers.sort((a, b) => a.start - b.start);
    }

    onRender(fn) {
        this.renderers.push(fn);
    }

    on(event, fn) {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(fn);
        return () => this._listeners.get(event).delete(fn);
    }

    _emit(event, value) {
        for (const fn of this._listeners.get(event) || []) fn(value);
    }

    get duration() {
        let d = this.minDuration;
        for (const tw of this.tweens) d = Math.max(d, tw.start + tw.duration);
        for (const m of this.markers) d = Math.max(d, this.stepEnd(m.step));
        return d;
    }

    get stepCount() {
        return this.markers.length;
    }

    stepEnd(step) {
        const i = this.markers.findIndex(m => m.step === step);
        if (i === -1) return 0;
        const m = this.markers[i];
        if (m.end !== null) return m.end;
        return i + 1 < this.markers.length ? this.markers[i + 1].start : m.start;
    }

    /** The step being animated at time t (or the last one that finished). */
    stepAt(t = this.time) {
        if (this.markers.length === 0) return 0;
        let current = this.markers[0].step;
        for (const m of this.markers) {
            if (m.start < t) current = m.step;
        }
        return current;
    }

    _prepare() {
        if (!this._dirty) return;
        this.tweens.sort((a, b) => a.start - b.start);
        const seen = new Map();
        for (const tw of this.tweens) {
            if (!seen.has(tw.target)) seen.set(tw.target, new Set());
            const props = seen.get(tw.target);
            tw.first = !props.has(tw.prop);
            props.add(tw.prop);
        }
        this._dirty = false;
    }

    seek(ms) {
        this._prepare();
        const t = Math.min(Math.max(ms, 0), this.duration);
        this.time = t;
        for (const tw of this.tweens) {
            if (t >= tw.start || tw.first) tw.target.set(tw.prop, valueAt(tw, t));
        }
        for (const fn of this.renderers) fn(t);
        this._emit('time', t);

        const step = this.stepAt(t);
        if (step !== this._lastStep) {
            this._lastStep = step;
            this._emit('step', step);
        }
    }

    seekToStep(step) {
        this.pause();
        this.seek(this.stepEnd(step));
    }

    setSpeed(speed) {
        this.speed = Math.min(4, Math.max(0.25, speed));
    }

    play() {
        if (this.playing && this._dir === 1 && this._stopAt === null) return;
        if (this.time >= this.duration) this.seek(0);
        this._stopAt = null;
        this._dir = 1;
        this._rate = 1;
        if (!this.playing) this._start();
    }

    /**
     * Play towards time ms, forwards or backwards, then pause there.
     * `rate` multiplies the speed, e.g. to rewind quickly.
     */
    playTo(ms, { rate = 1 } = {}) {
        const target = Math.min(Math.max(ms, 0), this.duration);
        if (target === this.time) {
            this.pause();
            this.seek(target);
            return;
        }
        this._stopAt = target;
        this._dir = target > this.time ? 1 : -1;
        this._rate = rate;
        if (!this.playing) this._start();
    }

    pause() {
        if (!this.playing) return;
        this.playing = false;
        cancelAnimationFrame(this._raf);
        this._emit('state', false);
    }

    toggle() {
        if (this.playing) this.pause();
        else this.play();
    }

    _start() {
        this.playing = true;
        this._emit('state', true);
        this._lastFrame = performance.now();
        const frame = now => {
            if (!this.playing) return;
            const dt = Math.max(0, now - this._lastFrame);
            this._lastFrame = now;
            const t = this.time + this._dir * dt * this.speed * this._rate;

            const stop = this._stopAt ?? this.duration;
            if (this._dir > 0 ? t >= stop : t <= stop) {
                this.seek(stop);
                this._stopAt = null;
                this.pause();
                if (stop >= this.duration) this._emit('end');
                return;
            }
            this.seek(t);
            this._raf = requestAnimationFrame(frame);
        };
        this._raf = requestAnimationFrame(frame);
    }
}
