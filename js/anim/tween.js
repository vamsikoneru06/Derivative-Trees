import { linear } from './easing.js';

/**
 * A tween moves one numeric property of a target from `from` to `to`
 * between `start` and `start + duration` (milliseconds on the timeline).
 * The target is any object with set(prop, value), e.g. a view handle.
 */
export function tween(target, prop, from, to, start, duration, ease = linear) {
    return { target, prop, from, to, start, duration, ease };
}

/** Value of the tween at absolute time t. Pure: depends only on t. */
export function valueAt(tw, t) {
    if (tw.duration <= 0) return t >= tw.start ? tw.to : tw.from;
    const p = Math.min(1, Math.max(0, (t - tw.start) / tw.duration));
    return tw.from + (tw.to - tw.from) * tw.ease(p);
}
