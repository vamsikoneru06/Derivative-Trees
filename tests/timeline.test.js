import { test } from 'node:test';
import assert from 'node:assert';
import { Timeline } from '../js/anim/timeline.js';
import { tween, valueAt } from '../js/anim/tween.js';
import { linear, easeOutBack, easeOutCubic } from '../js/anim/easing.js';

const target = () => ({ v: {}, set(prop, value) { this.v[prop] = value; } });

test('Easings start at 0 and end at 1', () => {
    for (const ease of [linear, easeOutBack, easeOutCubic]) {
        assert.ok(Math.abs(ease(0)) < 1e-9);
        assert.ok(Math.abs(ease(1) - 1) < 1e-9);
    }
});

test('Tween value is clamped to its interval', () => {
    const tw = tween(target(), 'x', 10, 20, 100, 100);
    assert.strictEqual(valueAt(tw, 0), 10);
    assert.strictEqual(valueAt(tw, 150), 15);
    assert.strictEqual(valueAt(tw, 999), 20);
});

test('Zero-duration tween jumps at its start time', () => {
    const tw = tween(target(), 'x', 0, 1, 50, 0);
    assert.strictEqual(valueAt(tw, 49), 0);
    assert.strictEqual(valueAt(tw, 50), 1);
});

test('Latest started tween wins; before any start, the first tween sets from', () => {
    const a = target();
    const tl = new Timeline();
    tl.add(tween(a, 'x', 0, 10, 100, 100));
    tl.add(tween(a, 'x', 10, 30, 300, 100));

    tl.seek(0);
    assert.strictEqual(a.v.x, 0);
    tl.seek(250);
    assert.strictEqual(a.v.x, 10);
    tl.seek(350);
    assert.strictEqual(a.v.x, 20);
    tl.seek(1000);
    assert.strictEqual(a.v.x, 30);
});

test('Seeking backwards gives the same state as seeking forwards', () => {
    const a = target();
    const tl = new Timeline();
    tl.add(tween(a, 'x', 0, 100, 0, 400, easeOutBack));
    tl.add(tween(a, 'opacity', 0, 1, 200, 100));
    tl.add(tween(a, 'x', 100, 50, 500, 300));

    const snapshots = [];
    for (let t = 0; t <= 800; t += 50) {
        tl.seek(t);
        snapshots.push({ ...a.v });
    }
    for (let t = 800; t >= 0; t -= 50) {
        tl.seek(t);
        assert.deepStrictEqual(a.v, snapshots[t / 50], `state differs at t=${t}`);
    }
});

test('Markers map time to steps and steps to end times', () => {
    const tl = new Timeline();
    tl.addMarker(0, 0, 400);
    tl.addMarker(1, 400);
    tl.addMarker(2, 1400, 2400);

    assert.strictEqual(tl.stepEnd(0), 400);
    assert.strictEqual(tl.stepEnd(1), 1400);
    assert.strictEqual(tl.stepEnd(2), 2400);
    assert.strictEqual(tl.duration, 2400);

    assert.strictEqual(tl.stepAt(0), 0);
    assert.strictEqual(tl.stepAt(400), 0);   // end of step 0
    assert.strictEqual(tl.stepAt(401), 1);
    assert.strictEqual(tl.stepAt(1400), 1);  // end of step 1
    assert.strictEqual(tl.stepAt(2000), 2);
});

test('Step events fire when seeking across markers', () => {
    const tl = new Timeline();
    tl.addMarker(0, 0, 100);
    tl.addMarker(1, 100, 200);
    const seen = [];
    tl.on('step', k => seen.push(k));
    tl.seek(50);
    tl.seek(150);
    tl.seek(160);
    tl.seek(10);
    assert.deepStrictEqual(seen, [0, 1, 0]);
});

test('Speed is clamped to 0.25..4', () => {
    const tl = new Timeline();
    tl.setSpeed(10);
    assert.strictEqual(tl.speed, 4);
    tl.setSpeed(0);
    assert.strictEqual(tl.speed, 0.25);
});
