// revise/tape.js
// Pure dice-tape data module. Records every die a roll produced so the
// same numbers can be replayed when a command is revised. No imports:
// this file must stay loadable without node_modules so it can be tested.

class NeedsFreshDice extends Error {
    constructor(min, max) {
        super(`No recorded die left for ${min}-${max}`);
        this.name = 'NeedsFreshDice';
        this.min = min;
        this.max = max;
    }
}

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

/** True when the tape holds no dice at all. */
function isEmpty(tape) {
    if (!tape) return true;
    return Object.values(tape).every(queue => queue.length === 0);
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
        take(min, max) {
            const queue = remaining[bucketKey(min, max)];
            if (!queue || queue.length === 0) throw new NeedsFreshDice(min, max);
            return queue.shift();
        },
        hasLeftovers() {
            return Object.values(remaining).some(queue => queue.length > 0);
        }
    };
}

module.exports = { NeedsFreshDice, createTape, record, isEmpty, startReplay };
