// F15: a short quiz. `answer` is the index of the correct option.
const QUESTIONS = [
    {
        q: 'Under S → aSb | ε, which string is derivable?',
        options: ['abab', 'aabb', 'abb', 'ba'],
        answer: 1,
        explain: 'Each S → aSb adds one a on the left and one b on the right, so only aⁿbⁿ strings appear.',
    },
    {
        q: 'Under E → E + E | E * E | id, what is the next leftmost step from E + E using E → id?',
        options: ['E + id', 'id + E', 'id + id', 'E + E + id'],
        answer: 1,
        explain: 'A leftmost step rewrites the leftmost nonterminal, which is the first E.',
    },
    {
        q: 'The yield of a derivation tree is…',
        options: [
            'the root symbol',
            'the number of steps in the derivation',
            'the leaves read from left to right, skipping ε',
            'the longest sentential form',
        ],
        answer: 2,
        explain: 'Reading the leaves left to right (ε contributes nothing) gives the derived string.',
    },
    {
        q: 'A grammar is ambiguous when…',
        options: [
            'it has an ε-production',
            'some string has two different derivation trees',
            'it is left-recursive',
            'two rules have the same left side',
        ],
        answer: 1,
        explain: 'Equivalently: some string has two different leftmost derivations.',
    },
    {
        q: 'Is id + id * id ambiguous under E → E + E | E * E | id?',
        options: ['No, it has exactly one tree', 'Yes, it has two different trees', 'It is not derivable'],
        answer: 1,
        explain: 'It can be grouped as id + (id * id) or as (id + id) * id: two trees, two leftmost derivations.',
    },
    {
        q: 'For one derivation tree, the leftmost and the rightmost derivation…',
        options: [
            'end in different strings',
            'use the same productions in a different order',
            'give two different trees',
            'exist only for unambiguous grammars',
        ],
        answer: 1,
        explain: 'The tree fixes which productions are used; the order only decides when each node is expanded.',
    },
    {
        q: 'Under S → (S) | SS | ε, which string is NOT derivable?',
        options: ['()()', '(())', '(()', 'the empty string'],
        answer: 2,
        explain: 'Every rule adds parentheses in matched pairs, so the counts of ( and ) are always equal.',
    },
    {
        q: 'Which expression grammar is unambiguous?',
        options: [
            'E → E + E | E * E | id',
            'E → E + T | T,  T → T * F | F,  F → ( E ) | id',
            'E → E + E | ( E ) | id',
            'E → E * E | E + E | ( E ) | id',
        ],
        answer: 1,
        explain: 'Separate levels for + and * fix both precedence and associativity, so each string has one tree.',
    },
];

const $ = id => document.getElementById(id);
let index = 0;
let score = 0;
let answered = false;
let missed = false;
let finished = false;

function render() {
    const item = QUESTIONS[index];
    answered = false;
    missed = false;
    $('progress').textContent = `Question ${index + 1} of ${QUESTIONS.length}`;
    $('score').textContent = `Score ${score}`;
    $('bar').style.width = `${(100 * index) / QUESTIONS.length}%`;
    $('question').textContent = item.q;
    $('explain').textContent = '';
    $('next').hidden = true;
    $('options').replaceChildren(...item.options.map((text, i) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'choice';
        button.textContent = text;
        button.addEventListener('click', () => choose(button, i));
        li.appendChild(button);
        return li;
    }));
    $('options').querySelector('button').focus({ preventScroll: true });
}

function choose(button, i) {
    if (answered) return;
    const item = QUESTIONS[index];
    const buttons = [...$('options').querySelectorAll('button')];
    if (i === item.answer) {
        answered = true;
        if (!missed) score += 1;
        button.classList.add('is-correct');
        buttons.forEach(b => { b.disabled = true; });
        $('explain').textContent = item.explain;
        $('score').textContent = `Score ${score}`;
        $('next').hidden = false;
        $('next').textContent = index + 1 < QUESTIONS.length ? 'Next question' : 'See result';
        $('next').focus();
    } else {
        // Wrong: shake, mark it, and let the student try again (no point scored).
        missed = true;
        button.classList.remove('is-wrong');
        void button.offsetWidth;
        button.classList.add('is-wrong');
        button.disabled = true;
        $('explain').textContent = 'Not quite. Try another option.';
    }
}

function finish() {
    $('bar').style.width = '100%';
    $('progress').textContent = 'Finished';
    $('question').textContent = `You scored ${score} out of ${QUESTIONS.length}.`;
    $('options').replaceChildren();
    $('explain').textContent = score === QUESTIONS.length
        ? 'Perfect. Try building trees yourself in the Visualizer’s Practice mode.'
        : 'The Learn page has a short animation for each idea in this quiz.';
    $('next').textContent = 'Try again';
    $('next').hidden = false;
}

$('next').addEventListener('click', () => {
    if (finished) {
        finished = false;
        index = 0;
        score = 0;
        render();
    } else if (index + 1 < QUESTIONS.length) {
        index += 1;
        render();
    } else {
        finished = true;
        finish();
    }
});

render();
