import { parseGrammar } from '../core/parse-grammar.js';

/**
 * Grammar text area with line numbers. Parses as you type (debounced),
 * marks the first line with an error and shows one status line under it.
 *
 * @param el        container element
 * @param onChange  called with { text, grammar, errors, warnings }
 * @param opts      { label: visible label text or null, delay: ms }
 * @returns { textarea, setText(text), getText(), result() }
 */
export function mountEditor(el, onChange, { label = 'Grammar', delay = 200 } = {}) {
    const id = `grammar-${Math.random().toString(36).slice(2, 8)}`;
    el.innerHTML = `
        ${label ? `<label class="field-label" for="${id}">${label}</label>` : ''}
        <div class="editor">
            <div class="editor__gutter" aria-hidden="true"></div>
            <textarea class="editor__text" id="${id}" spellcheck="false" autocomplete="off"
                autocapitalize="off" aria-label="Grammar" aria-describedby="${id}-status"></textarea>
        </div>
        <p class="editor__status" id="${id}-status" aria-live="polite">
            <span class="editor__icon" aria-hidden="true"></span><span class="editor__msg"></span>
        </p>`;

    const box = el.querySelector('.editor');
    const gutter = el.querySelector('.editor__gutter');
    const textarea = el.querySelector('textarea');
    const status = el.querySelector('.editor__status');
    const icon = el.querySelector('.editor__icon');
    const msg = el.querySelector('.editor__msg');
    let last = null;
    let timer = 0;

    function renderGutter() {
        const lines = textarea.value.split('\n').length;
        textarea.rows = Math.max(4, lines);
        const errorLine = last && last.errors.length ? last.errors[0].line : -1;
        gutter.replaceChildren(...Array.from({ length: Math.max(4, lines) }, (_, i) => {
            const span = document.createElement('span');
            span.textContent = i + 1;
            if (i + 1 === errorLine) span.className = 'is-error';
            return span;
        }));
    }

    function render(result) {
        renderGutter();
        const error = result.errors[0];
        let state, text;
        if (error) {
            state = 'error';
            text = error.line ? `Line ${error.line}: ${error.message}` : error.message;
        } else if (result.warnings.length) {
            state = 'warn';
            text = result.warnings[0];
        } else {
            state = 'ok';
            text = `Looks good. Start symbol is ${result.grammar.start}.`;
        }
        box.dataset.state = state;
        status.dataset.state = state;
        icon.textContent = state === 'ok' ? '✓' : '!';
        msg.textContent = text;
        textarea.setAttribute('aria-invalid', error ? 'true' : 'false');
    }

    function update() {
        const text = textarea.value;
        last = { text, ...parseGrammar(text) };
        render(last);
        onChange(last);
    }

    textarea.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(update, delay);
        renderGutter();
    });

    return {
        textarea,
        setText(text) {
            textarea.value = text;
            update();
        },
        getText: () => textarea.value,
        result: () => last,
    };
}
