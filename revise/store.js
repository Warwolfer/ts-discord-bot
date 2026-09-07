// revise/store.js
// In-memory store of revisable rolls, keyed by the bot's reply message id.
// Cleared by a bot restart, which is intentional: see the design doc.
// No imports: this file must stay loadable without node_modules.

const TTL_MS = 24 * 60 * 60 * 1000;   // 24 hours
const MAX_RECORDS = 5000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;   // hourly

// A Map iterates in insertion order, which gives oldest-first eviction free.
const records = new Map();

/** Saves a record. Stamps createdAt when the caller did not supply one. */
function put(messageId, record) {
    records.set(messageId, {
        ...record,
        createdAt: record.createdAt ?? Date.now()
    });

    while (records.size > MAX_RECORDS) {
        const oldest = records.keys().next().value;
        records.delete(oldest);
    }
}

/** Returns the record, or null when it is missing or older than the TTL. */
function get(messageId, now = Date.now()) {
    const record = records.get(messageId);
    if (!record) return null;

    if (now - record.createdAt > TTL_MS) {
        records.delete(messageId);
        return null;
    }
    return record;
}

/** Drops every expired record. */
function sweep(now = Date.now()) {
    for (const [id, record] of records) {
        if (now - record.createdAt > TTL_MS) records.delete(id);
    }
}

/** Test helper. Not used by the bot. */
function _reset() {
    records.clear();
}

const sweepTimer = setInterval(() => sweep(), SWEEP_INTERVAL_MS);
// Without unref the timer keeps the process alive and `node --test` hangs.
if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

module.exports = { put, get, sweep, _reset, TTL_MS, MAX_RECORDS };
