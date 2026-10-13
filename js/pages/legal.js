import { parseGrammar } from '../core/parse-grammar.js';
import { findLeftmost } from '../core/derive.js';
import { buildTree } from '../core/tree.js';
import { createTreeView } from '../render/svg.js';
import { buildSequence } from '../anim/sequences.js';
import { playWhenVisible } from './shared.js';

const PAGES = {
    terms: {
        g: 'S → V N\nV → please read\nN → the terms',
        s: 'please read the terms',
        intro: 'Derivation Tree Explorer is a student project for a Formal Languages and Automata course. By using it you agree to the points below.',
        sections: [
            ['Purpose', 'The site is a learning tool. You can use it for study and for teaching, free of charge.'],
            ['Fair use of the site', 'Please do not try to break, overload or copy the site in ways that stop others from using it.'],
            ['No guarantee', 'The derivation engine can make mistakes or hit its search limit. Check important results against your course material.'],
            ['Your content', 'Grammars and strings you type are yours. They are processed in your browser.'],
            ['Changes', 'These terms may change as the project develops. The date at the top shows the latest version.'],
            ['Contact', 'Questions go to the project repository on GitHub.'],
        ],
    },
    privacy: {
        g: 'S → N V\nN → your data\nV → stays here',
        s: 'your data stays here',
        intro: 'This page explains what the site does with information about you. The short version: it does not collect any.',
        sections: [
            ['No accounts', 'There is no sign-up and no login. We do not ask for your name or email.'],
            ['What you type', 'Grammars, strings and quiz answers are processed in your browser and are not sent to a server.'],
            ['Settings', 'Your theme choice may be kept in your browser so it is there next time. You can clear it in your browser settings.'],
            ['Third parties', 'The site loads no third-party scripts or fonts. The GitHub link takes you to GitHub, which has its own policy.'],
            ['No tracking', 'No analytics, advertising cookies or tracking pixels are used.'],
            ['Contact', 'Privacy questions go to the project repository on GitHub.'],
        ],
    },
};

const page = PAGES[document.body.dataset.legal];
document.getElementById('legal-intro').textContent = page.intro;
document.getElementById('legal-sections').replaceChildren(...page.sections.map(([h, p], i) => {
    const section = document.createElement('section');
    section.className = 'legal-section';
    section.innerHTML = '<h2><span class="m-kicker"></span><span></span></h2><p></p>';
    section.querySelector('.m-kicker').textContent = String(i + 1).padStart(2, '0');
    section.querySelector('h2 span:last-child').textContent = h;
    section.querySelector('p').textContent = p;
    return section;
}));

// The header tree derives the page's own sentence, on a loop.
const { grammar } = parseGrammar(page.g);
const { derivation } = findLeftmost(grammar, page.s);
const svg = document.getElementById('legal-tree');
const timeline = buildSequence(derivation, buildTree(derivation, grammar), createTreeView(svg), { character: true, yield: false });
playWhenVisible(svg, timeline);
