const test = require('node:test');
const assert = require('node:assert');
const { splitRollLines } = require('./bulkLines');

test('one roll line comes back as a one-element array', () => {
    assert.deepStrictEqual(
        splitRollLines('?r attack a s 10 # Lethal', '?'),
        ['?r attack a s 10 # Lethal']
    );
});

test('three roll lines come back in order', () => {
    const paste = '?r attack a s 10\n?r heal b 5\n?r rush';
    assert.deepStrictEqual(splitRollLines(paste, '?'), [
        '?r attack a s 10',
        '?r heal b 5',
        '?r rush'
    ]);
});

test('chat text between roll lines is dropped', () => {
    const paste = '?r attack a s 10\nhere goes nothing\n?r heal b 5';
    assert.deepStrictEqual(splitRollLines(paste, '?'), [
        '?r attack a s 10',
        '?r heal b 5'
    ]);
});

test('the ?roll alias is kept', () => {
    assert.deepStrictEqual(
        splitRollLines('?roll attack a s 10', '?'),
        ['?roll attack a s 10']
    );
});

test('an uppercase ?R is kept', () => {
    assert.deepStrictEqual(
        splitRollLines('?R attack a s 10', '?'),
        ['?R attack a s 10']
    );
});

test('a ?collect line is dropped', () => {
    const paste = '?r attack a s 10\n?collect\n?r heal b 5';
    assert.deepStrictEqual(splitRollLines(paste, '?'), [
        '?r attack a s 10',
        '?r heal b 5'
    ]);
});

test('a command that merely starts with r is not a roll line', () => {
    assert.deepStrictEqual(splitRollLines('?rush', '?'), []);
});

test('blank lines are dropped', () => {
    const paste = '?r attack a s 10\n\n   \n?r heal b 5';
    assert.deepStrictEqual(splitRollLines(paste, '?'), [
        '?r attack a s 10',
        '?r heal b 5'
    ]);
});

test('\\r\\n endings are trimmed off', () => {
    const paste = '?r attack a s 10\r\n?r heal b 5';
    assert.deepStrictEqual(splitRollLines(paste, '?'), [
        '?r attack a s 10',
        '?r heal b 5'
    ]);
});

test('a comment containing the text ?r does not split the line', () => {
    const line = '?r attack a s 10 # use ?r next turn too';
    assert.deepStrictEqual(splitRollLines(line, '?'), [line]);
});

test('a bare ?r survives, so the help embed still fires', () => {
    assert.deepStrictEqual(splitRollLines('?r', '?'), ['?r']);
});

test('a comment glued straight to the token is kept', () => {
    assert.deepStrictEqual(splitRollLines('?r#note', '?'), ['?r#note']);
});

test('the prefix is treated as text, not as a pattern', () => {
    // "?" is a regex quantifier. Escaped, "!r x" must not match a "?" prefix.
    assert.deepStrictEqual(splitRollLines('!r attack', '?'), []);
    assert.deepStrictEqual(splitRollLines('!r attack', '!'), ['!r attack']);
});

test('null and undefined content give an empty array', () => {
    assert.deepStrictEqual(splitRollLines(null, '?'), []);
    assert.deepStrictEqual(splitRollLines(undefined, '?'), []);
});
