// Phone header and menu sheet (Mobile Pages / Visualizer Mobile designs).
// Shown below 760px instead of the desktop header; see css/mobile.css.

const LINKS = [
    ['Home', 'index.html'],
    ['Visualizer', 'visualizer.html'],
    ['Ambiguity', 'ambiguity.html'],
    ['Learn', 'learn.html'],
    ['Quiz', 'quiz.html'],
    ['Team', 'team.html'],
];
const LEGAL = [['Terms', 'terms.html'], ['Privacy', 'privacy.html']];
const GITHUB = 'https://github.com/vamsikoneru06/Derivative-Trees';

const ICON_MENU = '<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h14M4 15h9"/></svg>';
const ICON_THEME = `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" style="overflow:visible">
    <g class="m-sun"><circle cx="11" cy="11" r="4"/><path d="M11 2.5v2M11 17.5v2M2.5 11h2M17.5 11h2M5 5l1.4 1.4M15.6 15.6 17 17M5 17l1.4-1.4M15.6 6.4 17 5"/></g>
    <path class="m-moon" d="M17.5 13.2A7 7 0 0 1 8.8 4.5a7 7 0 1 0 8.7 8.7z" fill="currentColor" stroke="none"/></svg>`;
const LOGO = '<svg viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="5" r="4" fill="var(--ink)"/><circle cx="5" cy="17" r="3.4" fill="none" stroke="var(--tree-t)" stroke-width="1.6"/><circle cx="17" cy="17" r="3.4" fill="var(--tree-active)"/><path d="M9.2 8.4 6.4 14M12.8 8.4l2.8 5.6" stroke="var(--ink-3)" stroke-width="1.4"/></svg>';
const CHEVRON = '<svg class="m-chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1.5 1.5 6.5 7l-5 5.5"/></svg>';

let scrim = null;
const sheets = new Set();

const here = location.pathname.split('/').pop() || 'index.html';
const title = document.body.dataset.title || document.title.split(' · ')[0];
const isHome = here === 'index.html';

// ---- header ----
const header = document.createElement('header');
header.className = `m-header${isHome ? ' m-header--home' : ''}`;
header.innerHTML = isHome
    ? `<a class="m-header__brand" href="index.html">${LOGO}<span>Derivation Tree Explorer</span></a>
       <button type="button" class="m-icon-btn" data-m="theme" aria-label="Toggle theme">${ICON_THEME}</button>
       <button type="button" class="m-icon-btn" data-m="menu" aria-label="Menu" aria-expanded="false">${ICON_MENU.replace('M4 15h9', 'M8 15h10')}</button>`
    : `<button type="button" class="m-icon-btn" data-m="menu" aria-label="Menu" aria-expanded="false">${ICON_MENU}</button>
       <div class="m-header__title">${LOGO}<span>${title}</span></div>
       <button type="button" class="m-icon-btn" data-m="theme" aria-label="Toggle theme">${ICON_THEME}</button>`;
document.body.prepend(header);

// The title fades in once the page's own big heading has scrolled away.
const alwaysTitle = document.body.dataset.mobileTitle === 'always';
function onScroll() {
    const scrolled = alwaysTitle || window.scrollY > 44;
    header.classList.toggle('is-scrolled', scrolled);
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ---- menu sheet ----
const { open: openMenu, sheet } = createSheet('Menu', `
    <nav class="m-menu">
        <div class="m-list">
            ${LINKS.map(([t, h]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ''}>${t}${CHEVRON}</a>`).join('')}
        </div>
        <div class="m-menu__legal">
            ${LEGAL.map(([t, h]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ''}>${t}</a>`).join('')}
            <a href="${GITHUB}">GitHub</a>
        </div>
    </nav>`);
sheet.classList.add('m-sheet--menu');
header.querySelector('[data-m="menu"]').addEventListener('click', openMenu);

// ---- theme ----
header.querySelector('[data-m="theme"]').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = (root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
    root.dataset.theme = dark ? 'light' : 'dark';
    try {
        localStorage.setItem('dte-theme', root.dataset.theme);
    } catch {
        // Storage can be unavailable; the switch still applies to this page.
    }
    document.querySelectorAll('.theme-toggle').forEach(t => {
        t.dataset.value = root.dataset.theme;
        t.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === root.dataset.theme)));
    });
});

/**
 * A bottom sheet with a grab handle, shared scrim, Escape to close and
 * swipe-down to close. Returns { sheet, body, open, close, onClose }.
 * Pages use this for the Visualizer's grammar and steps sheets too.
 */
export function createSheet(label, html = '', { className = '' } = {}) {
    if (!scrim) {
        scrim = document.createElement('div');
        scrim.className = 'm-scrim';
        scrim.addEventListener('click', () => sheets.forEach(s => s.close()));
        document.body.appendChild(scrim);
        addEventListener('keydown', e => {
            if (e.key === 'Escape') sheets.forEach(s => s.close());
        });
    }
    const sheet = document.createElement('div');
    sheet.className = `m-sheet ${className}`.trim();
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', label);
    sheet.setAttribute('aria-modal', 'true');
    sheet.innerHTML = `<div class="m-sheet__grab" aria-hidden="true"><span></span></div><div class="m-sheet__body">${html}</div>`;
    document.body.appendChild(sheet);
    const body = sheet.querySelector('.m-sheet__body');
    const listeners = [];
    let lastFocus = null;

    const api = {
        sheet,
        body,
        open() {
            sheets.forEach(s => s !== api && s.close());
            lastFocus = document.activeElement;
            sheet.classList.add('is-open');
            scrim.classList.add('is-open');
            document.documentElement.classList.add('m-sheet-open');
            header.querySelector('[data-m="menu"]').setAttribute('aria-expanded', String(sheet.classList.contains('m-sheet--menu')));
            const first = sheet.querySelector('a, button, input, textarea, select');
            if (first) setTimeout(() => first.focus({ preventScroll: true }), 50);
        },
        close() {
            if (!sheet.classList.contains('is-open')) return;
            sheet.classList.remove('is-open');
            if (![...sheets].some(s => s.sheet.classList.contains('is-open'))) {
                scrim.classList.remove('is-open');
                document.documentElement.classList.remove('m-sheet-open');
            }
            header.querySelector('[data-m="menu"]').setAttribute('aria-expanded', 'false');
            listeners.forEach(fn => fn());
            if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
        },
        onClose(fn) {
            listeners.push(fn);
        },
    };
    sheets.add(api);

    // Drag the handle down to close.
    let startY = null;
    const grab = sheet.querySelector('.m-sheet__grab');
    grab.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
    grab.addEventListener('touchend', e => {
        if (startY != null && e.changedTouches[0].clientY - startY > 60) api.close();
        startY = null;
    });
    return api;
}
