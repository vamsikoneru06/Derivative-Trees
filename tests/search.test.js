import { test } from 'node:test';
import assert from 'node:assert';
import { parseGrammar } from '../js/core/parse-grammar.js';
import { findLeftmost } from '../js/core/derive.js';
import { findTwoTrees } from '../js/core/ambiguity.js';
import { tokenizeTarget } from '../js/core/tokenize.js';
import { minLengths, makePruner } from '../js/core/prune.js';
import { recognizes } from '../js/core/recognize.js';

const g = text => parseGrammar(text).grammar;
const ANBN = g(`S -> aSb | ε`);
const PARENS = g(`S -> (S) | SS | ε`);
const EXPR = g(`E -> E + E | E * E | ( E ) | id`);

test('Tokenize a target without spaces using longest terminal match', () => {
    assert.deepStrictEqual(tokenizeTarget('id+id*id', EXPR).tokens, ['id', '+', 'id', '*', 'id']);
    assert.deepStrictEqual(tokenizeTarget('id + id*(id)', EXPR).tokens, ['id', '+', 'id', '*', '(', 'id', ')']);
    assert.deepStrictEqual(tokenizeTarget('', ANBN).tokens, []);
    assert.strictEqual(tokenizeTarget('id+x', EXPR).tokens, null);
});

test('Shortest yield length per nonterminal', () => {
    assert.strictEqual(minLengths(ANBN).get('S'), 0);
    assert.strictEqual(minLengths(EXPR).get('E'), 1);
    assert.strictEqual(minLengths(g(`S -> aS`)).get('S'), Infinity);
});

test('Pruner checks prefix, suffix and minimum length', () => {
    const keep = makePruner(ANBN, ['a', 'a', 'b', 'b']);
    assert.strictEqual(keep(['a', 'S', 'b']), true);
    assert.strictEqual(keep(['b', 'S', 'b']), false);
    assert.strictEqual(keep(['a', 'S', 'a']), false);
    assert.strictEqual(keep(['a', 'a', 'a', 'S', 'b', 'b', 'b']), false);
    assert.strictEqual(keep(['a', 'a', 'b', 'b']), true);
});

test('Recognizer handles ε-rules, left recursion and cycles', () => {
    assert.strictEqual(recognizes(PARENS, ['(', '(', ')', ')', '(', ')']), true);
    assert.strictEqual(recognizes(PARENS, ['(', '(', ')']), false);
    assert.strictEqual(recognizes(PARENS, []), true);
    assert.strictEqual(recognizes(EXPR, ['id', '+', 'id', '*', 'id']), true);
    assert.strictEqual(recognizes(EXPR, ['id', '+', '*', 'id']), false);
    assert.strictEqual(recognizes(g(`S -> A\nA -> S | a`), ['a']), true);
});

test('Find a leftmost derivation for a target typed without spaces', () => {
    const res = findLeftmost(EXPR, 'id+id*id');
    assert.strictEqual(res.found, true);
    assert.deepStrictEqual(res.derivation.result, ['id', '+', 'id', '*', 'id']);
});

test('Reject an underivable string quickly in an ε-grammar', () => {
    const t0 = performance.now();
    const res = findLeftmost(PARENS, '(()');
    assert.strictEqual(res.found, false);
    assert.strictEqual(res.reason, 'not derivable');
    assert.ok(performance.now() - t0 < 100);
});

test('Ambiguity search terminates on S -> (S) | SS | ε', () => {
    const res = findTwoTrees(PARENS, '()()()');
    assert.strictEqual(res.ambiguous, true);
    assert.strictEqual(res.trees.length, 2);
});

test('The two trees for id+id*id differ at the root', () => {
    const res = findTwoTrees(EXPR, 'id+id*id');
    assert.strictEqual(res.ambiguous, true);
    const rootOps = res.trees.map(t => t.children[1].symbol).sort();
    assert.deepStrictEqual(rootOps, ['*', '+']);
});

test('An unambiguous grammar reports no second tree', () => {
    const res = findTwoTrees(ANBN, 'aaabbb');
    assert.strictEqual(res.ambiguous, false);
    assert.match(res.reason, /no second tree/);
});

test('Presets derive strings of length 10 in under 1 s', () => {
    const cases = [
        [ANBN, 'aaaaabbbbb'],
        [PARENS, '(()())()()'],
        [g(`S -> aSa | bSb | a | b | ε`), 'abbaaaabba'],
        [EXPR, 'id+id*id+id'],
    ];
    for (const [grammar, target] of cases) {
        const t0 = performance.now();
        findLeftmost(grammar, target);
        findTwoTrees(grammar, target);
        assert.ok(performance.now() - t0 < 1000, `${target} took too long`);
    }
});

const yieldOf = node => node.children.length === 0
    ? (node.kind === 'terminal' ? [node.symbol] : [])
    : node.children.flatMap(yieldOf);
const shape = node => `${node.symbol}(${node.children.map(shape).join(',')})`;

function assertTwoDistinctTrees(res, target) {
    assert.strictEqual(res.ambiguous, true);
    const [t1, t2] = res.trees;
    assert.deepStrictEqual(yieldOf(t1), target);
    assert.deepStrictEqual(yieldOf(t2), target);
    assert.notStrictEqual(shape(t1), shape(t2));
}

test('Finds two trees when derivations of different lengths merge (unit rules)', () => {
    // S => Y => a and S => X => Y => a: Y is reached at BFS levels 1 and 2.
    const res = findTwoTrees(g(`S -> X | Y\nX -> Y\nY -> a`), 'a');
    assertTwoDistinctTrees(res, ['a']);
});

test('Finds two trees through an ε-cycle without hanging', () => {
    // S => SS => S (S -> ε) returns to the start form.
    assertTwoDistinctTrees(findTwoTrees(PARENS, '()'), ['(', ')']);
    assertTwoDistinctTrees(findTwoTrees(PARENS, '()()()'), ['(', ')', '(', ')', '(', ')']);
});

test('Both ambiguity trees for id+id*id yield the string', () => {
    assertTwoDistinctTrees(findTwoTrees(EXPR, 'id+id*id'), ['id', '+', 'id', '*', 'id']);
});
