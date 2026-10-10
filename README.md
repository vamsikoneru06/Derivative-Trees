# Derivation Tree Explorer

Type a context-free grammar and a string, and watch its derivation tree grow one
production at a time, kept in sync with the list of sentential forms.

Built for the Formal Languages & Automata course. Every animation, the tree
layout and the animation engine are hand-written: there are no runtime
libraries and no external scripts.

## Pages

| Page | What it does |
|------|--------------|
| `index.html` | Home, with a tree that builds itself |
| `learn.html` | CFGs, derivations, leftmost/rightmost, trees, yield, ambiguity, each with an animation |
| `visualizer.html` | The main tool: grammar editor, presets, playback, steps panel, leftmost/rightmost toggle, practice mode, SVG export |
| `ambiguity.html` | Finds two different trees for one string and highlights where they differ |
| `quiz.html` | Eight short questions |
| `team.html` | Who built what |

## Run it locally

ES modules do not load over `file://`, so serve the folder:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Tests

Node 18 or newer, no dependencies:

```bash
npm test
```

## Grammar format

```
S -> aSb | ε
E -> E + E | E * E | ( E ) | id
```

- `->` or `→` separates the sides, `|` separates alternatives.
- `ε`, `eps` or an empty alternative is the empty string.
- If any alternative contains a space, every alternative is split on spaces
  (`E + E`, `id`); otherwise each character is a symbol (`aSb`).
- Symbols on a left side are nonterminals; everything else is a terminal.
- The first left side is the start symbol.

The target string may be typed with or without spaces: `id+id*id` is split
into terminals by longest match.

## Keyboard

| Key | Action |
|-----|--------|
| <kbd>Space</kbd> | Play / pause |
| <kbd>←</kbd> / <kbd>→</kbd> | Step back / forward |
| <kbd>R</kbd> | Restart |

## Code layout

```
js/core/     grammar parsing, derivation search, trees, ambiguity   (A)
js/anim/     easing, tween, timeline, step sequences                (B)
js/render/   tree layout and SVG view                               (B)
js/ui/       grammar editor, playback controls, steps panel, presets (C)
js/pages/    one entry script per page                              (all)
css/         tokens, base, layout, components, tree, animations
tests/       node --test suites
```

The animation engine is time-based: the picture at time `t` is a pure function
of `t`, so stepping back is a seek and always matches what playing would show.

`css/tokens.css` holds every colour, font and spacing value, taken from the
Claude Design hand-off (Apple-like, system fonts, graphite accent). The header's
Light / Dark toggle overrides the system setting and is remembered per browser.
No web fonts are loaded: the font stack falls back to the system UI font.
