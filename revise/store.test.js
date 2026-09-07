const test = require('node:test');
const assert = require('node:assert');
const store = require('./store');

function makeRecord(overrides = {}) {
    return {
        commandText: 'attack a s 10',
        tape: { '1-100': [47] },
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
