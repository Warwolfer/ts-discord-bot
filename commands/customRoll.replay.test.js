// commands/customRoll.replay.test.js
//
// A custom roll and its revisions, driven through the real dice tape. This is
// the shape the bot actually runs: the first roll records every die, and each
// revision replays that recording with a different modifier. The rule it
// guards is that a die the player has already read off the screen never
// changes, however the modifiers move.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const Codec = require("./custom-action-codec");
const tape = require("../revise/tape");
const { rollCustom } = require("./customRoll");

const FIXTURES = JSON.parse(fs.readFileSync(path.join(__dirname, "custom-action-fixtures.json"), "utf8"));
const SPLITTER = Codec.decodeActionSync(FIXTURES.splitter.rollCode);

// Rolls once, recording every die, the way helpers.js does on a first roll.
function record(modsTotal) {
    const recorded = tape.createTape();
    let next = 0;
    const fresh = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 1, 2, 3, 4];
    const roll = (min, max) => {
        // Deterministic but distinct per die, so a reroll is visible.
        const value = max === 100 ? 59 : fresh[next++ % fresh.length];
        tape.record(recorded, min, max, value);
        return value;
    };
    const result = rollCustom({ action: SPLITTER, kind: "fortitude", mode: "none", rank: null, modsTotal, ngBonus: 0, roll });
    return { result, recorded };
}

// Re-runs with a different modifier, replaying the chain tape the way
// revise/index.js does: recorded values first, fresh ones only when a bucket
// runs dry.
function revise(chainTape, modsTotal) {
    const cursor = tape.startReplay(chainTape);
    const produced = tape.createTape();
    let freshCount = 0;
    const roll = (min, max) => {
        let value = cursor.take(min, max);
        if (value === null) { value = 99; freshCount++; }
        tape.record(produced, min, max, value);
        return value;
    };
    const result = rollCustom({ action: SPLITTER, kind: "fortitude", mode: "none", rank: null, modsTotal, ngBonus: 0, roll });
    return { result, produced, freshCount, leftovers: cursor.hasLeftovers() };
}

test("a revision with the same modifier replays every die and rolls nothing fresh", () => {
    const first = record(70);
    const again = revise(first.recorded, 70);
    assert.strictEqual(again.freshCount, 0);
    assert.strictEqual(again.leftovers, false);
    assert.deepStrictEqual(again.result, first.result);
});

test("a revision into a smaller band replays the dice it still needs and leaves the rest", () => {
    const first = record(70);          // total 129 -> (121-140) -> 4d20
    assert.strictEqual(first.result.outcomes[0].raw, "4d20");

    const bigger = revise(first.recorded, 90);   // total 149 -> (141+) -> 2d20
    assert.strictEqual(bigger.result.outcomes[0].raw, "2d20");
    assert.strictEqual(bigger.freshCount, 0, "a smaller band needs no new dice");
    assert.strictEqual(bigger.leftovers, true, "the two dice it no longer needs stay unused");

    // The base dice and the check die are untouched, so the lines above the
    // band read exactly as they did.
    assert.deepStrictEqual(bigger.result.pre, first.result.pre);
    assert.strictEqual(bigger.result.check.display, first.result.check.display);
});

test("revising back to the first modifier replays the dropped dice rather than rerolling them", () => {
    const first = record(70);
    const bigger = revise(first.recorded, 90);

    // What revise/index.js commits to the chain after a revision that used
    // fewer dice. Merging is what keeps the dropped dice alive.
    const chain = tape.merge(first.recorded, bigger.produced);

    const back = revise(chain, 70);
    assert.strictEqual(back.freshCount, 0, "no die may be rolled fresh");
    assert.deepStrictEqual(back.result.outcomes, first.result.outcomes,
        "the outcome dice must be the ones already on screen");
    assert.deepStrictEqual(back.result, first.result);
});

test("a revision into a larger band replays what it has and rolls only the extra dice", () => {
    const first = record(90);          // total 149 -> (141+) -> 2d20
    assert.strictEqual(first.result.outcomes[0].raw, "2d20");

    const smaller = revise(first.recorded, 70);   // total 129 -> (121-140) -> 4d20
    assert.strictEqual(smaller.result.outcomes[0].raw, "4d20");
    assert.strictEqual(smaller.freshCount, 2, "exactly the two dice the bigger band adds");
    assert.strictEqual(smaller.leftovers, false);

    // The first two outcome dice are the recorded ones, in order.
    assert.deepStrictEqual(smaller.result.outcomes[0].rolls.slice(0, 2),
        first.result.outcomes[0].rolls);
});
