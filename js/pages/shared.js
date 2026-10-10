// Small helpers shared by the page scripts.

/** Show a status badge: kind is 'ok' | 'bad' | 'warn' | 'info'. */
export function setStatus(el, kind, text) {
    el.replaceChildren();
    const badge = document.createElement('span');
    badge.className = `badge badge--${kind} is-new`;
    badge.textContent = text;
    el.appendChild(badge);
}

/**
 * Resolve after the browser has painted, so a "Searching…" badge shows first.
 * Background tabs get no animation frames, so a timeout resolves it there.
 */
export function nextFrame() {
    return new Promise(resolve => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
        setTimeout(resolve, 50);
    });
}

const STYLE_PROPS = [
    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
    'stroke-linecap', 'font-family', 'font-size', 'font-weight', 'font-style',
];

/** Download the SVG with its computed styles inlined, so it looks the same outside the site. */
export function exportSvg(svg, filename) {
    const clone = svg.cloneNode(true);
    const source = svg.querySelectorAll('*');
    const target = clone.querySelectorAll('*');
    source.forEach((el, i) => {
        const style = getComputedStyle(el);
        target[i].setAttribute('style', STYLE_PROPS.map(p => `${p}:${style.getPropertyValue(p)}`).join(';'));
    });
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const bg = getComputedStyle(document.body).backgroundColor;
    clone.style.background = bg;

    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Play `timeline` whenever `el` is on screen, pause when it leaves; optionally loop. */
export function playWhenVisible(el, timeline, { loop = true, pauseMs = 2200 } = {}) {
    let visible = false;
    let timer = 0;
    timeline.on('end', () => {
        if (!loop) return;
        timer = setTimeout(() => {
            if (visible) {
                timeline.seek(0);
                timeline.play();
            }
        }, pauseMs);
    });
    const observer = new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        if (visible) timeline.play();
        else {
            clearTimeout(timer);
            timeline.pause();
        }
    }, { threshold: 0.35 });
    observer.observe(el);
}
