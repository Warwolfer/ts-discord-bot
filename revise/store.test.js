const test = require('node:test');
const assert = require('node:assert');
const store = require('./store');

function makeRecord(overrides = {}) {
    return {
        commandText: 'attack a s 10',
        rootId: 'msg-1',
        userId: 'user-1',
        channelId: 'chan-1',
        rootUrl: 'https://discord.com/channels/1/2/3',
        revisionCount: 0,
        ...overrides
    };
}

test('put then get returns the record', () => {
    store._reset();
    store.put('msg-1', makeRecord());

    const found = store.get('msg-1');
    assert.strictEqual(found.commandText, 'attack a s 10');
    assert.strictEqual(found.userId, 'user-1');
});

test('get returns null for an unknown id', () => {
    store._reset();
    assert.strictEqual(store.get('nope'), null);
});

test('put stamps createdAt when the record has none', () => {
    store._reset();
    store.put('msg-1', makeRecord());
    assert.strictEqual(typeof store.get('msg-1').createdAt, 'number');
});

test('get past the TTL returns null and drops the record', () => {
    store._reset();
    const now = Date.now();
    store.put('msg-1', makeRecord({ createdAt: now }));

    assert.notStrictEqual(store.get('msg-1', now + store.TTL_MS - 1000), null);
    assert.strictEqual(store.get('msg-1', now + store.TTL_MS + 1000), null);
    assert.strictEqual(store.get('msg-1', now), null, 'the expired record is deleted, not just hidden');
});

test('sweep drops expired records and keeps fresh ones', () => {
    store._reset();
    const now = Date.now();
    store.put('old', makeRecord({ createdAt: now - store.TTL_MS - 1 }));
    store.put('new', makeRecord({ createdAt: now }));

    store.sweep(now);

    assert.strictEqual(store.get('old', now), null);
    assert.notStrictEqual(store.get('new', now), null);
});

test('exceeding the size cap evicts the oldest record first', () => {
    store._reset();
    for (let i = 0; i < store.MAX_RECORDS + 2; i++) {
        store.put(`msg-${i}`, makeRecord());
    }

    assert.strictEqual(store.get('msg-0'), null, 'oldest evicted');
    assert.strictEqual(store.get('msg-1'), null, 'second oldest evicted');
    assert.notStrictEqual(store.get(`msg-${store.MAX_RECORDS + 1}`), null, 'newest kept');
});

// --- chain tapes -------------------------------------------------------
// The tape belongs to the whole revision chain, not to one message. Storing
// it per-message let a modifier-only revision clone the shorter tape into a
// sibling record, and each sibling could then roll its own version of the
// same added die — pick-the-best over as many siblings as you cared to mint.

test('putTape then getTape round trips, keyed by the chain root', () => {
    store._reset();
    store.putTape('root-1', { '1-100': [47] });

    assert.deepStrictEqual(store.getTape('root-1'), { '1-100': [47] });
    assert.strictEqual(store.getTape('other-root'), null);
});

test('getTape distinguishes an empty tape from a missing one', () => {
    store._reset();
    store.putTape('root-1', {});

    assert.deepStrictEqual(store.getTape('root-1'), {}, 'a roll that rolled no dice');
    assert.strictEqual(store.getTape('nope'), null, 'no such chain');
});

test('every record in a chain sees the same tape, so a sibling cannot fork it', () => {
    store._reset();
    store.putTape('root-1', { '1-100': [47, 12] });
    store.put('root-1', { rootId: 'root-1', userId: 'u1' });
    store.put('sibling', { rootId: 'root-1', userId: 'u1' });

    // The chain grows once, from whichever record the player clicked.
    store.putTape('root-1', { '1-100': [47, 12, 88] });

    const fromRoot = store.getTape(store.get('root-1').rootId);
    const fromSibling = store.getTape(store.get('sibling').rootId);
    assert.deepStrictEqual(fromRoot, fromSibling, 'siblings must not hold their own copy');
    assert.deepStrictEqual(fromSibling, { '1-100': [47, 12, 88] });
});

test('re-writing a chain tape does not extend its expiry', () => {
    store._reset();
    const now = Date.now();
    store.putTape('root-1', { '1-100': [47] }, now);

    store.putTape('root-1', { '1-100': [47, 88] });   // a later revision grows it

    assert.notStrictEqual(store.getTape('root-1', now + store.TTL_MS - 1000), null);
    assert.strictEqual(
        store.getTape('root-1', now + store.TTL_MS + 1000), null,
        'growing the tape must not buy the chain another full TTL'
    );
});

test('sweep drops expired chain tapes', () => {
    store._reset();
    const now = Date.now();
    store.putTape('old', { '1-100': [1] }, now - store.TTL_MS - 1);
    store.putTape('new', { '1-100': [2] }, now);

    store.sweep(now);

    assert.strictEqual(store.getTape('old', now), null);
    assert.notStrictEqual(store.getTape('new', now), null);
});

test('_reset clears chain tapes as well as records', () => {
    store.putTape('root-1', { '1-100': [47] });
    store._reset();
    assert.strictEqual(store.getTape('root-1'), null);
});
