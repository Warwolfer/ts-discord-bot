"use strict";
const { test } = require("node:test");
const assert = require("node:assert");

const {
    computeRiskyConversion,
    formatRiskyNote,
    RISKY_DIE_COST,
} = require("./riskyConversion");

test("a die costs 40", () => {
    assert.strictEqual(RISKY_DIE_COST, 40);
});

test("nothing to convert leaves nothing behind", () => {
    assert.deepStrictEqual(computeRiskyConversion(0), {
        dice: 0,
        converted: 0,
        remainder: 0,
    });
});

test("a pool under one die stays as remainder", () => {
    assert.deepStrictEqual(computeRiskyConversion(39), {
        dice: 0,
        converted: 0,
        remainder: 39,
    });
});

test("each full 40 buys one die", () => {
    assert.deepStrictEqual(computeRiskyConversion(40), {
        dice: 1,
        converted: 40,
        remainder: 0,
    });
    assert.deepStrictEqual(computeRiskyConversion(85), {
        dice: 2,
        converted: 80,
        remainder: 5,
    });
});

// The bug: NG1 was added after the split, so +35 mods on an NG+ character
// bought no die even though the roll carried 40 points of flat bonus.
test("the NG1 bonus counts toward the pool", () => {
    const modsTotal = 35;
    const ngBonus = 5;
    assert.deepStrictEqual(computeRiskyConversion(modsTotal + ngBonus), {
        dice: 1,
        converted: 40,
        remainder: 0,
    });
});

test("a net-negative pool buys no die and keeps its sign", () => {
    assert.deepStrictEqual(computeRiskyConversion(-10), {
        dice: 0,
        converted: 0,
        remainder: -10,
    });
});

test("a missing or junk pool reads as zero", () => {
    assert.deepStrictEqual(computeRiskyConversion(undefined), {
        dice: 0,
        converted: 0,
        remainder: 0,
    });
});

test("the note keeps one space before the dice tally", () => {
    assert.strictEqual(
        formatRiskyNote({ converted: 40, dice: 1, diceSum: 88, remainder: 0 }),
        "Risky activated: converted 40 into 1d100 (88), remainder: +0.",
    );
});

test("the note names the NG1 bonus when it fed the pool", () => {
    assert.strictEqual(
        formatRiskyNote({ converted: 80, dice: 2, diceSum: 100, remainder: 5, ngBonus: 5 }),
        "Risky activated: converted 80 into 2d100 (100), remainder: +5." +
            " NG⋅1 +5 counted toward the conversion.",
    );
});

test("a pool too small for a die says so instead of printing 0d100", () => {
    assert.strictEqual(
        formatRiskyNote({ converted: 0, dice: 0, diceSum: 0, remainder: 35 }),
        "Risky activated: nothing to convert (40 needed per d100), remainder: +35.",
    );
});

test("a negative remainder keeps its own minus sign", () => {
    assert.strictEqual(
        formatRiskyNote({ converted: 0, dice: 0, diceSum: 0, remainder: -5 }),
        "Risky activated: nothing to convert (40 needed per d100), remainder: -5.",
    );
});

test("the forced-dice note reads like the real one", () => {
    assert.strictEqual(
        formatRiskyNote({ dice: 1, diceSum: 1, remainder: 35, forced: true }),
        "Risky (TEST) activated: generated 1 test d100 (1), remainder: +35.",
    );
});
