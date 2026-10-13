// Phone Learn page (Mobile Pages design): four lessons behind sideways tabs,
// each with a looping tree. The derivations lesson highlights the sentential
// form in step with the tree.
import { parseGrammar } from '../core/parse-grammar.js';
import { findLeftmost } from '../core/derive.js';
import { findTwoTrees } from '../core/ambiguity.js';
import { buildTree } from '../core/tree.js';
import { buildSequence } from '../anim/sequences.js';
import { createTreeView } from '../render/svg.js';
import { completedSteps } from '../ui/steps-panel.js';
import { playWhenVisible } from './shared.js';

const LESSONS = [
    {
        tab: 'Grammars', title: 'Context-free grammars', g: 'S → a S b\nS → ε', s: 'aabb', cap: 'S → a S b | ε, deriving aabb',
        body: [
            'A context-free grammar has four parts: nonterminals (uppercase, like S), terminals (the symbols that end up in strings, like a and b), productions, and a start symbol.',
            'A production such as S → a S b says S can be replaced by a S b wherever it appears. The surrounding symbols never matter, which is what context-free means.',
        ],
        terms: [['Nonterminal', 'A symbol that still gets replaced. Written in uppercase.'], ['Terminal', 'A symbol of the final string. Never replaced.'], ['Production', 'A rule A → α that rewrites A as α.'], ['Start symbol', 'Where every derivation begins. Here, S.']],
    },
    {
        tab: 'Derivations', title: 'Derivations', g: 'E → E + E\nE → id', s: 'id + id', cap: 'E → E + E | id, leftmost', forms: true,
        body: [
            'A derivation starts at the start symbol and applies one production per step. Each line in between is a sentential form.',
            'A leftmost derivation always replaces the leftmost nonterminal; a rightmost derivation replaces the rightmost. Both build the same tree in a different order.',
        ],
        terms: [['Sentential form', 'Any line of a derivation, terminals and nonterminals mixed.'], ['⇒', 'Derives in one step.'], ['Leftmost', 'Always expand the leftmost nonterminal next.'], ['Rightmost', 'Always expand the rightmost nonterminal next.']],
    },
    {
        tab: 'Parse trees', title: 'Parse trees', g: 'S → ( S ) S\nS → ε', s: '()()', cap: 'S → ( S ) S | ε, deriving ()()',
        body: [
            'A parse tree records which productions were used, but not their order. The root is the start symbol. Each inner node is a nonterminal, and its children are the right side of the production applied to it.',
            'Read the leaves from left to right to get the yield: the string the tree derives.',
        ],
        terms: [['Root', 'The start symbol.'], ['Inner node', 'A nonterminal that was expanded.'], ['Leaf', 'A terminal, or ε for an empty production.'], ['Yield', 'The leaves read left to right.']],
    },
    {
        tab: 'Ambiguity', title: 'Ambiguity', g: 'E → E + E | E * E | id', s: 'id + id * id', cap: 'E → E + E | E * E | id, one of two trees', starRoot: true,
        body: [
            'If some string has two different parse trees, the grammar is ambiguous. This matters to compilers: the tree decides how an expression is evaluated.',
            'Many ambiguous grammars can be rewritten to remove the ambiguity. Some languages are inherently ambiguous, meaning every grammar for them is.',
        ],
        terms: [['Ambiguous', 'Some string has two or more parse trees.'], ['Unambiguous', 'Every string has at most one parse tree.'], ['Inherently ambiguous', 'A language with no unambiguous grammar.']],
    },
];

const $ = id => document.getElementById(id);
const tabs = document.querySelector('.learn-m-tabs');
const svg = $('lm-tree');
const view = createTreeView(svg);
let lesson = 0;
let tl = null;
let loop = null;

tabs.replaceChildren(...LESSONS.map((l, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.innerHTML = `<span class="learn-m-tab__n">${i + 1}</span><span></span>`;
    b.lastChild.textContent = l.tab;
    b.addEventListener('click', () => show(i));
    return b;
}));

function treeFor(l) {
    const { grammar } = parseGrammar(l.g);
    if (l.starRoot) {
        // The ambiguity lesson shows the tree with * at the root.
        const { trees } = findTwoTrees(grammar, l.s);
        return { derivation: null, tree: trees.find(t => t.children[1].symbol === '*') || trees[0] };
    }
    const { derivation } = findLeftmost(grammar, l.s);
    return { derivation, tree: buildTree(derivation, grammar) };
}

function show(i) {
    lesson = i;
    const l = LESSONS[i];
    [...tabs.children].forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
    tabs.children[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    $('lm-kicker').textContent = `LESSON ${i + 1} OF ${LESSONS.length}`;
    $('lm-title').textContent = l.title;
    $('lm-body').replaceChildren(...l.body.map(text => {
        const p = document.createElement('p');
        p.textContent = text;
        return p;
    }));
    $('lm-cap').textContent = l.cap;
    $('lm-terms').replaceChildren(...l.terms.map(([t, d]) => {
        const row = document.createElement('div');
        row.innerHTML = '<b></b><span></span>';
        row.firstChild.textContent = t;
        row.lastChild.textContent = d;
        return row;
    }));
    $('lm-prev').disabled = i === 0;
    $('lm-next').textContent = i < LESSONS.length - 1 ? 'Next lesson' : 'Compare trees';

    if (tl) {
        tl.pause();
        if (tl.dispose) tl.dispose();
    }
    if (loop) loop.stop();
    view.clear();
    const { derivation, tree } = treeFor(l);
    tl = buildSequence(derivation, tree, view, { yield: false, character: true });
    loop = playWhenVisible(svg, tl);

    const forms = $('lm-forms');
    forms.hidden = !l.forms;
    if (l.forms) {
        const all = [...derivation.steps.map(s => s), null];
        forms.replaceChildren(...all.map((step, k) => {
            const form = step ? step.form : derivation.result;
            const li = document.createElement('li');
            li.innerHTML = `<span class="learn-m-arrow">${k ? '⇒' : ''}</span><span class="learn-m-form"></span>`;
            form.forEach((sym, j) => {
                const span = document.createElement('span');
                span.textContent = sym;
                if (step && j === step.index) span.className = 'learn-m-mark';
                li.lastChild.appendChild(span);
            });
            return li;
        }));
        const mark = () => {
            const k = completedSteps(tl);
            [...forms.children].forEach((li, j) => {
                li.classList.toggle('is-current', j === k);
                li.classList.toggle('is-upcoming', j > k);
            });
        };
        tl.on('time', mark);
        mark();
    }
}

$('lm-prev').addEventListener('click', () => show(Math.max(0, lesson - 1)));
$('lm-next').addEventListener('click', () => {
    if (lesson < LESSONS.length - 1) show(lesson + 1);
    else location.href = 'ambiguity.html';
});

show(0);
