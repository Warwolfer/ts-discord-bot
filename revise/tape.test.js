const test = require('node:test');
const assert = require('node:assert');
const tape = require('./tape');

test('records and replays values in order', () => {
    const t = tape.createTape();
    tape.record(t, 1, 100, 47);
    tape.record(t, 1, 100, 88);

    const cursor = tape.startReplay(t);
    assert.strictEqual(cursor.take(1, 100), 47);
    assert.strictEqual(cursor.take(1, 100), 88);
});

test('die types have separate queues', () => {
    const t = tape.createTape();
    tape.record(t, 1, 100, 47);
    tape.record(t, 1, 20, 14);

    const cursor = tape.startReplay(t);
    assert.strictEqual(cursor.take(1, 20), 14, 'a d20 must not consume the d100 value');
    assert.strictEqual(cursor.take(1, 100), 47);
});

test('taking from an exhausted queue throws NeedsFreshDice with the bounds', () => {
    const t = tape.createTape();
    tape.record(t, 1, 100, 47);

    const cursor = tape.startReplay(t);
    cursor.take(1, 100);
    assert.throws(
        () => cursor.take(1, 100),
        (err) => err.name === 'NeedsFreshDice' && err.min === 1 && err.max === 100
    );
});

test('taking a die type that was never recorded throws NeedsFreshDice', () => {
    const t = tape.createTape();
    tape.record(t, 1, 100, 47);

    const cursor = tape.startReplay(t);
    assert.throws(() => cursor.take(1, 20), (err) => err.name === 'NeedsFreshDice');
});

test('hasLeftovers is true when the replay used fewer dice than recorded', () => {
    const t = tape.createTape();
    tape.record(t, 1, 20, 14);
    tape.record(t, 1, 20, 3);

    const cursor = tape.startReplay(t);
    cursor.take(1, 20);
    assert.strictEqual(cursor.hasLeftovers(), true);
    cursor.take(1, 20);
    assert.strictEqual(cursor.hasLeftovers(), false);
});

test('startReplay does not mutate the stored tape', () => {
    const t = tape.createTape();
    tape.record(t, 1, 100, 47);

    tape.startReplay(t).take(1, 100);

    const second = tape.startReplay(t);
    assert.strictEqual(second.take(1, 100), 47, 'the same tape must replay identically twice');
});

test('isEmpty distinguishes no dice from some dice', () => {
    assert.strictEqual(tape.isEmpty(tape.createTape()), true);
    assert.strictEqual(tape.isEmpty(null), true);
    assert.strictEqual(tape.isEmpty(undefined), true);

    const t = tape.createTape();
    tape.record(t, 1, 6, 4);
    assert.strictEqual(tape.isEmpty(t), false);
});
