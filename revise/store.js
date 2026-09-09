// revise/store.js
// In-memory store of revisable rolls, keyed by the bot's reply message id.
// Cleared by a bot restart, which is intentional: see the design doc.
// No imports: this file must stay loadable without node_modules.

const TTL_MS = 72 * 60 * 60 * 1000;   // 72 hours
const MAX_RECORDS = 5000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;   // hourly

// A Map iterates in insertion order, which gives oldest-first eviction free.
const records = new Map();

// The dice tape belongs to a revision CHAIN, not to one message, and lives
// here keyed by the chain's root message id. Storing it on each record let a
// modifier-only revision clone the shorter tape into a sibling; each sibling
// could then roll its own version of the same added die, so a player could
// mint siblings and pick the best. One tape per chain removes the copies.
const chainTapes = new Map();

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

/**
 * Saves the dice tape for a chain, keyed by its root message id. Re-writing a
 * chain's tape keeps the original createdAt, so growing it does not buy the
 * chain another full TTL.
 */
function putTape(rootId, tape, createdAt) {
    const existing = chainTapes.get(rootId);
    chainTapes.set(rootId, {
        tape,
        createdAt: createdAt ?? existing?.createdAt ?? Date.now()
    });

    while (chainTapes.size > MAX_RECORDS) {
        const oldest = chainTapes.keys().next().value;
        chainTapes.delete(oldest);
    }
}

/**
 * The chain's tape, or null when it is missing or expired. Null and `{}` mean
 * different things: `{}` is a roll that legitimately rolled no dice, null is a
 * chain we no longer know about, which callers must treat as unrevisable.
 */
function getTape(rootId, now = Date.now()) {
    const entry = chainTapes.get(rootId);
    if (!entry) return null;

    if (now - entry.createdAt > TTL_MS) {
        chainTapes.delete(rootId);
        return null;
    }
    // Never hand back a nullish tape. Callers gate on "is this null" to decide
    // whether the chain still exists, and an `undefined` slipping through that
    // gate would read as "rolled no dice" and unlock the rank and DC refusals.
    return entry.tape ?? null;
}

/** Drops every expired record and chain tape. */
function sweep(now = Date.now()) {
    for (const [id, record] of records) {
        if (now - record.createdAt > TTL_MS) records.delete(id);
    }
    for (const [id, entry] of chainTapes) {
        if (now - entry.createdAt > TTL_MS) chainTapes.delete(id);
    }
}

/** Test helper. Not used by the bot. */
function _reset() {
    records.clear();
    chainTapes.clear();
}

const sweepTimer = setInterval(() => sweep(), SWEEP_INTERVAL_MS);
// Without unref the timer keeps the process alive and `node --test` hangs.
if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

module.exports = { put, get, putTape, getTape, sweep, _reset, TTL_MS, MAX_RECORDS };
