const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

const ICONS = {
    restart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9.5 12z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15L19.5 12z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/></svg>',
    forward: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l10.5-7z"/></svg>',
};

/**
 * Playback bar: restart, step back, play/pause, step forward, progress,
 * step counter and speed. Keyboard: Space, ←, →, R.
 * Call setTimeline() again whenever the page builds a new timeline.
 *
 * @returns { setTimeline(tl), forward(), back() }
 */
export function mountControls(el, timeline = null) {
    el.insertAdjacentHTML('afterbegin', `
        <div class="playbar__group">
            <button class="btn btn--icon" data-act="restart" title="Restart (R)" aria-label="Restart">${ICONS.restart}</button>
            <button class="btn btn--icon" data-act="back" title="Step back (←)" aria-label="Step back">${ICONS.back}</button>
            <button class="btn btn--icon btn--primary" data-act="play" title="Play / pause (Space)" aria-label="Play">${ICONS.play}</button>
            <button class="btn btn--icon" data-act="forward" title="Step forward (→)" aria-label="Step forward">${ICONS.forward}</button>
        </div>
        <span class="playbar__counter" aria-live="off">Step 0 / 0</span>
        <div class="playbar__progress" role="slider" aria-label="Animation position" tabindex="-1"><span></span></div>
        <label class="playbar__speed">Speed
            <input type="range" min="0" max="${SPEEDS.length - 1}" step="1" value="3" aria-valuetext="1×">
            <output>1×</output>
        </label>`);

    const btn = act => el.querySelector(`[data-act="${act}"]`);
    const playBtn = btn('play');
    const counter = el.querySelector('.playbar__counter');
    const progress = el.querySelector('.playbar__progress');
    const bar = progress.querySelector('span');
    const speedInput = el.querySelector('.playbar__speed input');
    const speedOut = el.querySelector('.playbar__speed output');

    let tl = null;
    let unsubscribe = [];

    function update() {
        const disabled = !tl;
        el.querySelectorAll('button[data-act]').forEach(b => { b.disabled = disabled; });
        if (!tl) {
            counter.textContent = 'Step 0 / 0';
            bar.style.width = '0%';
            return;
        }
        const last = tl.stepCount - 1;
        counter.textContent = `Step ${tl.stepAt()} / ${last}`;
        bar.style.width = `${tl.duration ? (100 * tl.time) / tl.duration : 0}%`;
        playBtn.innerHTML = tl.playing ? ICONS.pause : ICONS.play;
        playBtn.setAttribute('aria-label', tl.playing ? 'Pause' : 'Play');
        progress.setAttribute('aria-valuenow', Math.round(tl.time));
        progress.setAttribute('aria-valuemax', Math.round(tl.duration));
    }

    function setTimeline(next) {
        unsubscribe.forEach(off => off());
        tl = next;
        unsubscribe = tl ? ['time', 'state', 'step'].map(evt => tl.on(evt, update)) : [];
        if (tl) tl.setSpeed(SPEEDS[speedInput.value]);
        update();
    }

    function forward() {
        if (!tl) return;
        const k = tl.stepAt();
        const end = tl.stepEnd(k);
        if (tl.time < end - 1) tl.playTo(end);
        else if (k + 1 < tl.stepCount) tl.playTo(tl.stepEnd(k + 1));
        else tl.playTo(tl.duration);
    }

    function back() {
        if (!tl) return;
        const k = tl.stepAt();
        tl.seekToStep(tl.time > tl.stepEnd(k) + 1 ? k : Math.max(0, k - 1));
    }

    function restart() {
        if (!tl) return;
        tl.pause();
        tl.seek(0);
        tl.play();
    }

    btn('restart').addEventListener('click', restart);
    btn('back').addEventListener('click', back);
    btn('forward').addEventListener('click', forward);
    playBtn.addEventListener('click', () => tl && tl.toggle());

    progress.addEventListener('click', e => {
        if (!tl) return;
        const rect = progress.getBoundingClientRect();
        tl.pause();
        tl.seek(((e.clientX - rect.left) / rect.width) * tl.duration);
    });

    speedInput.addEventListener('input', () => {
        const speed = SPEEDS[speedInput.value];
        speedOut.textContent = `${speed}×`;
        speedInput.setAttribute('aria-valuetext', `${speed}×`);
        if (tl) tl.setSpeed(speed);
    });

    document.addEventListener('keydown', e => {
        if (!tl || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (e.key === ' ' && t.tagName !== 'BUTTON') {
            e.preventDefault();
            tl.toggle();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            forward();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            back();
        } else if (e.key === 'r' || e.key === 'R') {
            restart();
        }
    });

    setTimeline(timeline);
    return { setTimeline, forward, back };
}
