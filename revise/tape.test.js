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

test('taking from an exhausted queue returns null so the caller can roll fresh', () => {
    const t = tape.createTape();
    tape.record(t, 1, 100, 47);

    const cursor = tape.startReplay(t);
    assert.strictEqual(cursor.take(1, 100), 47);
    assert.strictEqual(cursor.take(1, 100), null, 'a revision may add dice the original never rolled');
});

test('taking a die type that was never recorded returns null', () => {
    const t = tape.createTape();
    tape.record(t, 1, 100, 47);

    const cursor = tape.startReplay(t);
    assert.strictEqual(cursor.take(1, 20), null);
});

test('an empty tape replays as all-fresh rather than failing', () => {
    const cursor = tape.startReplay(tape.createTape());
    assert.strictEqual(cursor.take(1, 100), null);
    assert.strictEqual(cursor.hasLeftovers(), false, 'nothing recorded means nothing left over');
});

test('countDice totals every bucket', () => {
    assert.strictEqual(tape.countDice(tape.createTape()), 0);
    assert.strictEqual(tape.countDice(null), 0);
    assert.strictEqual(tape.countDice(undefined), 0);

    const t = tape.createTape();
    tape.record(t, 1, 100, 47);
    tape.record(t, 1, 20, 14);
    tape.record(t, 1, 20, 3);
    assert.strictEqual(tape.countDice(t), 3, 'd100 and d20 buckets both count');
});

test('countDice is how a revision reports the dice it added', () => {
    const original = tape.createTape();
    tape.record(original, 1, 100, 47);

    const produced = tape.createTape();
    tape.record(produced, 1, 100, 47);   // replayed
    tape.record(produced, 1, 100, 88);   // added by the revision

    assert.strictEqual(tape.countDice(produced) - tape.countDice(original), 1);
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

test("merge keeps the longer queue in every bucket", () => {
    const chain = { "1-20": [5, 6, 7, 8], "1-100": [59] };
    const produced = { "1-20": [5, 6], "1-100": [59] };
    assert.deepStrictEqual(tape.merge(chain, produced), { "1-20": [5, 6, 7, 8], "1-100": [59] });
    assert.deepStrictEqual(tape.merge(produced, chain), { "1-20": [5, 6, 7, 8], "1-100": [59] });
});

test("merge takes a bucket the other tape does not have", () => {
    assert.deepStrictEqual(tape.merge({ "1-20": [3] }, { "1-6": [4] }), { "1-20": [3], "1-6": [4] });
});

test("merge copies rather than aliasing either input", () => {
    const chain = { "1-20": [1, 2] };
    const out = tape.merge(chain, {});
    out["1-20"].push(99);
    assert.deepStrictEqual(chain["1-20"], [1, 2]);
});

test("merge tolerates a missing tape on either side", () => {
    assert.deepStrictEqual(tape.merge(null, { "1-20": [1] }), { "1-20": [1] });
    assert.deepStrictEqual(tape.merge({ "1-20": [1] }, null), { "1-20": [1] });
});
