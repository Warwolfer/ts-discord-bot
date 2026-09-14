// revise/tape.js
// Pure dice-tape data module. Records every die a roll produced so the
// same numbers can be replayed when a command is revised. No imports:
// this file must stay loadable without node_modules so it can be tested.

/** Bucket key for a die type. A 1d20 and a 1d100 never share a queue. */
function bucketKey(min, max) {
    return `${min}-${max}`;
}

/** A fresh, empty tape. */
function createTape() {
    return {};
}

/** Appends a rolled value to the matching bucket. */
function record(tape, min, max, value) {
    if (!tape) return;
    const key = bucketKey(min, max);
    if (!tape[key]) tape[key] = [];
    tape[key].push(value);
}

/** How many dice the tape holds, across every bucket. */
function countDice(tape) {
    if (!tape) return 0;
    return Object.values(tape).reduce((n, queue) => n + queue.length, 0);
}

/** True when the tape holds no dice at all. */
function isEmpty(tape) {
    if (!tape) return true;
    return Object.values(tape).every(queue => queue.length === 0);
}

/**
 * The union of two tapes, keeping the longer queue in each bucket.
 *
 * A revision may legitimately use fewer dice than the chain holds (see
 * revise/policy.js: a custom roll's outcome dice belong to the degree its
 * total landed in, and a modifier edit can move it to a smaller degree).
 * The chain tape must still never shrink: the dropped dice are on screen in
 * the original message, and a later revision back to the first modifier has
 * to replay them rather than roll new ones. Since a run replays each bucket
 * from the front, a shorter bucket is always a prefix of the longer one, so
 * keeping the longer is lossless.
 */
function merge(chain, produced) {
    const out = {};
    const keys = new Set([...Object.keys(chain || {}), ...Object.keys(produced || {})]);
    for (const key of keys) {
        const a = (chain || {})[key] || [];
        const b = (produced || {})[key] || [];
        out[key] = b.length >= a.length ? b.slice() : a.slice();
    }
    return out;
}

/**
 * Returns a cursor that hands back the recorded values in order.
 * The queues are copied, so the stored tape is never consumed and can be
 * replayed any number of times.
 */
function startReplay(tape) {
    const remaining = {};
    for (const [key, queue] of Object.entries(tape || {})) {
        remaining[key] = queue.slice();
    }

    return {
        // null means "the original never rolled this die". A revision may add
        // dice, so the caller rolls a fresh one and records it. Removing dice
        // is still refused, by hasLeftovers() below.
        take(min, max) {
            const queue = remaining[bucketKey(min, max)];
            if (!queue || queue.length === 0) return null;
            return queue.shift();
        },
        hasLeftovers() {
            return Object.values(remaining).some(queue => queue.length > 0);
        }
    };
}

module.exports = { createTape, record, countDice, isEmpty, startReplay, merge };
