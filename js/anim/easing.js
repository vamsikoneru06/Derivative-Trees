// Easing curves: each maps progress p in [0, 1] to eased progress.

export const linear = p => p;

export const easeOutCubic = p => 1 - Math.pow(1 - p, 3);

export const easeInOutQuad = p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

export const easeInOutCubic = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

// Overshoots slightly past 1 before settling, for "pop" entrances.
export const easeOutBack = p => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
};

// Rises to 1 at the midpoint and falls back to 0, for pulses.
export const pulse = p => Math.sin(Math.PI * p);
