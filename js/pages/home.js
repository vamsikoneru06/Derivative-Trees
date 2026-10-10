import { parseGrammar } from '../core/parse-grammar.js';
import { findLeftmost } from '../core/derive.js';
import { buildTree } from '../core/tree.js';
import { createTreeView } from '../render/svg.js';
import { buildSequence } from '../anim/sequences.js';
import { playWhenVisible } from './shared.js';

// A11: the tree for S → aSb | ε deriving aabb builds itself, on a loop.
const { grammar } = parseGrammar('S -> aSb | ε');
const { derivation } = findLeftmost(grammar, 'aabb');
const svg = document.getElementById('hero-tree');
const timeline = buildSequence(derivation, buildTree(derivation, grammar), createTreeView(svg));
timeline.setSpeed(1.25);
playWhenVisible(svg, timeline);
