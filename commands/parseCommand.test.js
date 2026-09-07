const test = require('node:test');
const assert = require('node:assert');
const { parseCommandString } = require('./parseCommand');

test('splits args on whitespace', () => {
    const { args, comment } = parseCommandString('attack a s 10');
    assert.deepStrictEqual(args, ['attack', 'a', 's', '10']);
    assert.strictEqual(comment, '');
});

test('pulls the comment out and wraps it', () => {
    const { args, comment } = parseCommandString('attack a s 10 # Lethal Combat Focus');
    assert.deepStrictEqual(args, ['attack', 'a', 's', '10']);
    assert.strictEqual(comment, '\n> *Lethal Combat Focus*');
});

test('collapses repeated spaces', () => {
    const { args } = parseCommandString('attack   a  s');
    assert.deepStrictEqual(args, ['attack', 'a', 's']);
});

test('converts non-breaking spaces from mobile', () => {
    const { args } = parseCommandString('attack a s');
    assert.deepStrictEqual(args, ['attack', 'a', 's']);
});

test('handles an empty or missing string', () => {
    assert.deepStrictEqual(parseCommandString('').args, []);
    assert.deepStrictEqual(parseCommandString(undefined).args, []);
    assert.deepStrictEqual(parseCommandString(null).args, []);
});

test('handles a comment with no args', () => {
    const { args, comment } = parseCommandString('# just a note');
    assert.deepStrictEqual(args, []);
    assert.strictEqual(comment, '\n> *just a note*');
});

test('keeps generic dice notation as args[0]', () => {
    const { args } = parseCommandString('2d6 5 # boom');
    assert.deepStrictEqual(args, ['2d6', '5']);
});
