import { parseGrammar } from '../core/parse-grammar.js';

/**
 * Grammar text area with line numbers. Parses as you type (debounced) and
 * marks the lines that have errors.
 *
 * @param el        container element
 * @param onChange  called with { text, grammar, errors, warnings }
 * @returns { setText(text), getText(), result() }
 */
export function mountEditor(el, onChange, { label = 'Grammar', delay = 250 } = {}) {
    const id = `grammar-${Math.random().toString(36).slice(2, 8)}`;
    el.innerHTML = `
        <label class="field-label" for="${id}">${label}</label>
        <div class="editor">
            <div class="editor__gutter" aria-hidden="true"></div>
            <textarea class="editor__text" id="${id}" spellcheck="false" autocomplete="off"
                autocapitalize="off" rows="5" aria-describedby="${id}-msgs"></textarea>
        </div>
        <ul class="messages" id="${id}-msgs" aria-live="polite"></ul>
        <p class="hint">One rule per line: <code>S -&gt; aSb | ε</code>. Use spaces between symbols
        for multi-letter tokens: <code>E -&gt; E + E | id</code>.</p>`;

    const box = el.querySelector('.editor');
    const gutter = el.querySelector('.editor__gutter');
    const textarea = el.querySelector('textarea');
    const messages = el.querySelector('.messages');
    let last = null;
    let timer = 0;

    function renderGutter() {
        const lineCount = textarea.value.split('\n').length;
        const errorLines = new Set((last ? last.errors : []).map(e => e.line));
        gutter.replaceChildren(...Array.from({ length: lineCount }, (_, i) => {
            const span = document.createElement('span');
            span.textContent = i + 1;
            if (errorLines.has(i + 1)) span.className = 'is-error';
            return span;
        }));
    }

    function render(result) {
        renderGutter();
        messages.replaceChildren(
            ...result.errors.map(e => item('error', e.line ? `Line ${e.line}: ${e.message}` : e.message)),
            ...result.warnings.map(w => item('warning', w)),
        );
        box.dataset.state = result.errors.length ? 'error' : 'ok';
        textarea.setAttribute('aria-invalid', result.errors.length ? 'true' : 'false');
    }

    function item(kind, text) {
        const li = document.createElement('li');
        li.className = kind;
        li.textContent = text;
        return li;
    }

    function update() {
        const text = textarea.value;
        const result = parseGrammar(text);
        last = { text, ...result };
        render(result);
        onChange(last);
    }

    textarea.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(update, delay);
        renderGutter();
    });
    textarea.addEventListener('scroll', () => {
        gutter.scrollTop = textarea.scrollTop;
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
