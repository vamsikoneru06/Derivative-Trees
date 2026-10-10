/**
 * List of sentential forms, kept in step with the timeline (A9).
 * Row i is the form after i steps; the current row underlines the symbol the
 * next step replaces, and shows the production that produced it.
 *
 * @param el        an <ol class="steps"> element
 * @param timeline  Timeline built by buildSequence
 * @param onGo      called with i when row i is clicked
 * @returns { destroy() }
 */
export function mountSteps(el, derivation, timeline, onGo) {
    const steps = derivation.steps;
    const forms = [...steps.map(s => s.form), derivation.result];

    el.replaceChildren(...forms.map((form, i) => {
        const li = document.createElement('li');
        li.className = 'step';
        li.tabIndex = 0;

        const n = document.createElement('span');
        n.className = 'step__n';
        n.textContent = i + 1;
        const arrow = document.createElement('span');
        arrow.className = 'step__arrow';
        arrow.textContent = i ? '⇒' : '';

        const body = document.createElement('span');
        body.className = 'step__body';
        const symbols = document.createElement('span');
        symbols.className = 'step__form';
        const mark = i < steps.length ? steps[i].index : -1;
        if (form.length === 0) symbols.textContent = 'ε';
        form.forEach((sym, j) => {
            const span = document.createElement('span');
            span.textContent = sym;
            if (j === mark) span.className = 'step__mark';
            symbols.appendChild(span);
        });
        const prod = document.createElement('span');
        prod.className = 'step__prod';
        const s = steps[i - 1];
        prod.textContent = i ? `${s.lhs} → ${s.rhs.length ? s.rhs.join(' ') : 'ε'}` : 'start symbol';
        body.append(symbols, prod);

        li.append(n, arrow, body);
        li.setAttribute('aria-label', `Step ${i + 1}: ${form.join(' ') || 'ε'}`);
        li.addEventListener('click', () => onGo(i));
        li.addEventListener('keydown', e => {
            if (e.key === 'Enter') onGo(i);
        });
        return li;
    }));

    let shown = -1;
    function update() {
        const current = completedSteps(timeline);
        if (current === shown) return;
        shown = current;
        [...el.children].forEach((li, i) => {
            li.classList.toggle('is-current', i === current);
            li.classList.toggle('is-past', i < current);
            li.classList.toggle('is-upcoming', i > current);
            if (i === current) li.setAttribute('aria-current', 'step');
            else li.removeAttribute('aria-current');
        });
        const row = el.children[current];
        const list = el.closest('.steps-card') || el;
        if (row && list.scrollHeight > list.clientHeight) {
            const top = row.offsetTop - list.offsetTop;
            if (top < list.scrollTop) list.scrollTop = top - 8;
            else if (top + row.offsetHeight > list.scrollTop + list.clientHeight) {
                list.scrollTop = top + row.offsetHeight - list.clientHeight + 8;
            }
        }
    }

    const off = timeline.on('time', update);
    update();
    return { destroy: off };
}

/** Number of steps whose expansion has finished at the timeline's current time. */
export function completedSteps(timeline) {
    let done = 0;
    for (const m of timeline.markers) {
        if (m.step > 0 && timeline.stepEnd(m.step) <= timeline.time + 0.5) done = Math.max(done, m.step);
    }
    return done;
}
