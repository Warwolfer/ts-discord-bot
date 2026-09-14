// commands/d100Check.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");

const { advantageAt, rollD100, checkParts } = require("./d100Check");

// A roll function that hands back a fixed queue and records every call.
function scripted(values) {
    const queue = values.slice();
    const calls = [];
    const fn = (min, max) => {
        calls.push([min, max]);
        if (queue.length === 0) throw new Error("scripted roll ran dry");
        return queue.shift();
    };
    fn.calls = calls;
    return fn;
}

test("advantageAt reads adv/advantage/dis/disadvantage in any case and moves past it", () => {
    assert.deepStrictEqual(advantageAt(["save", "adv", "70"], 1), { mode: "adv", next: 2 });
    assert.deepStrictEqual(advantageAt(["save", "ADVANTAGE", "70"], 1), { mode: "adv", next: 2 });
    assert.deepStrictEqual(advantageAt(["save", "dis", "70"], 1), { mode: "dis", next: 2 });
    assert.deepStrictEqual(advantageAt(["save", "Disadvantage", "70"], 1), { mode: "dis", next: 2 });
});

test("advantageAt leaves the index alone when there is no adv/dis word", () => {
    assert.deepStrictEqual(advantageAt(["save", "70"], 1), { mode: "none", next: 1 });
    assert.deepStrictEqual(advantageAt(["save"], 1), { mode: "none", next: 1 });
    assert.deepStrictEqual(advantageAt(["custom", "1abc", "fortitude", "70"], 3), { mode: "none", next: 3 });
    assert.deepStrictEqual(advantageAt(["custom", "1abc", "fortitude", "adv", "70"], 3), { mode: "adv", next: 4 });
});

test("a plain d100 rolls once and displays as the handlers always have", () => {
    const roll = scripted([54]);
    assert.deepStrictEqual(rollD100(roll, "none"), { kept: 54, display: "1d100 (54)" });
    assert.deepStrictEqual(roll.calls, [[1, 100]]);
});

test("advantage rolls twice, first then second, and keeps the higher", () => {
    const roll = scripted([54, 71]);
    assert.deepStrictEqual(rollD100(roll, "adv"), { kept: 71, display: "2d100kh1 (54, 71)" });
    assert.deepStrictEqual(roll.calls, [[1, 100], [1, 100]]);
});

test("disadvantage rolls twice and keeps the lower", () => {
    const roll = scripted([54, 71]);
    assert.deepStrictEqual(rollD100(roll, "dis"), { kept: 54, display: "2d100kl1 (54, 71)" });
});

test("checkParts for a save: display, mods only when non-zero, NG only when positive", () => {
    assert.deepStrictEqual(checkParts("1d100 (54)", null, 0, 0), ["1d100 (54)"]);
    assert.deepStrictEqual(checkParts("1d100 (54)", null, 70, 0), ["1d100 (54)", "70 (mods)"]);
    assert.deepStrictEqual(checkParts("1d100 (54)", null, -10, 0), ["1d100 (54)", "-10 (mods)"]);
    assert.deepStrictEqual(checkParts("1d100 (54)", null, 70, 5), ["1d100 (54)", "70 (mods)", "5 (NG⋅1)"]);
});

test("checkParts for a mastery or expertise check puts the rank right after the dice", () => {
    assert.deepStrictEqual(
        checkParts("2d100kh1 (54, 71)", { value: 30, letter: "A" }, 0, 5),
        ["2d100kh1 (54, 71)", "30 (MR-A)", "5 (NG⋅1)"],
    );
    assert.deepStrictEqual(
        checkParts("1d100 (54)", { value: 0, letter: "E" }, 10, 0),
        ["1d100 (54)", "0 (MR-E)", "10 (mods)"],
    );
});

test("the NG label uses the dot operator the save handler already prints", () => {
    const parts = checkParts("1d100 (1)", null, 0, 5);
    assert.strictEqual(parts[1], "5 (NG\u22C51)");
});
