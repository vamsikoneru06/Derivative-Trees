import { test } from 'node:test';
import assert from 'node:assert';
import { parseGrammar } from '../js/core/parse-grammar.js';
import { findLeftmost, toRightmost } from '../js/core/derive.js';
import { buildTree } from '../js/core/tree.js';
import { findTwoTrees } from '../js/core/ambiguity.js';

test('Find leftmost derivation', () => {
    const { grammar } = parseGrammar(`S -> a S b | ε`);
    const res = findLeftmost(grammar, 'a a b b');
    
    assert.strictEqual(res.found, true);
    assert.strictEqual(res.derivation.steps.length, 3);
    assert.deepStrictEqual(res.derivation.result, ['a', 'a', 'b', 'b']);
});

test('Convert to rightmost derivation', () => {
    const { grammar } = parseGrammar(`S -> a S b | ε`);
    const res = findLeftmost(grammar, 'a a b b');
    
    const tree = buildTree(res.derivation, grammar);
    const rm = toRightmost(tree);
    
    assert.strictEqual(rm.order, 'rightmost');
    assert.strictEqual(rm.steps.length, 3);
    assert.deepStrictEqual(rm.result, ['a', 'a', 'b', 'b']);
});

test('Ambiguity detection', () => {
    const { grammar } = parseGrammar(`E -> E + E | E * E | id`);
    const res = findTwoTrees(grammar, 'id + id * id');
    
    assert.strictEqual(res.ambiguous, true);
    assert.strictEqual(res.trees.length, 2);
    assert.strictEqual(res.diffNodeIds.length, 2);
});
