/**
 * Numbered list of sentential forms, kept in step with the timeline (A9).
 * Row k is the form after step k. The symbol that step k+1 replaces is
 * underlined; the symbols step k inserted are tinted. Clicking row k jumps
 * the tree to the end of step k.
 *
 * @param el  an <ol class="steps"> element
 * @returns { destroy() }
 */
export function mountSteps(el, derivation, timeline) {
    const steps = derivation.steps;
    const forms = [...steps.map(s => s.form), derivation.result];
    const spaced = forms.some(f => f.some(sym => sym.length > 1));

    el.replaceChildren(...forms.map((form, k) => {
        const li = document.createElement('li');
        li.dataset.step = k;

        const n = document.createElement('span');
        n.className = 'step__n';
        n.textContent = k;
        const arrow = document.createElement('span');
        arrow.className = 'step__arrow';
        arrow.textContent = k === 0 ? '' : '⇒';
        const body = document.createElement('span');
        body.className = 'step__form';

        const next = k < steps.length ? steps[k].index : -1;
        const added = k > 0 ? steps[k - 1] : null;
        if (form.length === 0) body.textContent = 'ε';
        form.forEach((sym, i) => {
            const span = document.createElement('span');
            span.textContent = sym;
            if (i === next) span.className = 'sym--next';
            else if (added && i >= added.index && i < added.index + added.rhs.length) span.className = 'sym--new';
            body.appendChild(span);
            if (spaced && i < form.length - 1) body.appendChild(document.createTextNode(' '));
        });

        li.append(n, arrow, body);
        li.tabIndex = 0;
        li.setAttribute('aria-label', `Step ${k}: ${form.join(' ') || 'ε'}`);
        li.addEventListener('click', () => timeline.seekToStep(k));
        li.addEventListener('keydown', e => {
            if (e.key === 'Enter') timeline.seekToStep(k);
        });
        return li;
    }));

    function update(current) {
        el.querySelectorAll('li').forEach((li, k) => {
            li.classList.toggle('is-current', k === current);
            li.classList.toggle('is-upcoming', k > current);
            if (k === current) li.setAttribute('aria-current', 'step');
            else li.removeAttribute('aria-current');
        });
        const row = el.children[current];
        if (!row) return;
        // Scroll the list only, never the page.
        if (row.offsetTop < el.scrollTop) el.scrollTop = row.offsetTop - 8;
        else if (row.offsetTop + row.offsetHeight > el.scrollTop + el.clientHeight) {
            el.scrollTop = row.offsetTop + row.offsetHeight - el.clientHeight + 8;
        }
    }

    const off = timeline.on('step', update);
    update(timeline.stepAt());
    return { destroy: off };
}
