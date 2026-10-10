import { test } from 'node:test';
import assert from 'node:assert';
import { parseGrammar } from '../js/core/parse-grammar.js';

test('Parse simple grammar', () => {
    const text = `S -> a S b | ε`;
    const result = parseGrammar(text);
    
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.grammar.start, 'S');
    assert.ok(result.grammar.nonterminals.has('S'));
    assert.ok(result.grammar.terminals.has('a'));
    assert.ok(result.grammar.terminals.has('b'));
    
    const prods = result.grammar.productions.get('S');
    assert.strictEqual(prods.length, 2);
    assert.deepStrictEqual(prods[0], ['a', 'S', 'b']);
    assert.deepStrictEqual(prods[1], []);
});

test('Parse grammar with tokens separated by spaces', () => {
    const text = `E -> E + E | id`;
    const result = parseGrammar(text);
    
    assert.strictEqual(result.errors.length, 0);
    assert.ok(result.grammar.terminals.has('+'));
    assert.ok(result.grammar.terminals.has('id'));
    const prods = result.grammar.productions.get('E');
    assert.deepStrictEqual(prods[0], ['E', '+', 'E']);
    assert.deepStrictEqual(prods[1], ['id']);
});
