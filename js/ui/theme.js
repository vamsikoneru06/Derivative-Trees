// Light / Dark toggle in the site header. The choice is remembered per browser;
// without one, the system setting applies (see css/tokens.css).

const KEY = 'dte-theme';
const root = document.documentElement;

function current() {
    if (root.dataset.theme) return root.dataset.theme;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function show(toggle) {
    const theme = current();
    toggle.dataset.value = theme;
    toggle.querySelectorAll('button[data-theme-set]').forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.themeSet === theme));
    });
}

for (const toggle of document.querySelectorAll('.theme-toggle')) {
    show(toggle);
    toggle.addEventListener('click', e => {
        const button = e.target.closest('button[data-theme-set]');
        if (!button) return;
        root.dataset.theme = button.dataset.themeSet;
        try {
            localStorage.setItem(KEY, button.dataset.themeSet);
        } catch {
            // Storage can be unavailable (private mode); the toggle still works for this page.
        }
        show(toggle);
    });
}
