// commands/custom-action-codec.test.js
//
// The bot's half of the drift guard. ts-builder holds a byte-identical copy of
// custom-action-codec.js and pins the same fixture; if either copy is edited on
// its own, one of the two suites starts failing here.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const Codec = require("./custom-action-codec");
const FIXTURES = JSON.parse(
    fs.readFileSync(path.join(__dirname, "custom-action-fixtures.json"), "utf8"),
);

test("the pinned import codes decode to the pinned actions", async () => {
    for (const key of ["smash", "splitter"]) {
        assert.deepStrictEqual(await Codec.decodeAction(FIXTURES[key].importCode),
            FIXTURES[key].action, `${key} import code`);
    }
});

test("the pinned roll codes decode to the stripped actions", async () => {
    for (const key of ["smash", "splitter"]) {
        assert.deepStrictEqual(await Codec.decodeAction(FIXTURES[key].rollCode),
            Codec.stripForRoll(FIXTURES[key].action), `${key} roll code`);
    }
});

test("encoding reproduces the pinned codes byte for byte", async () => {
    for (const key of ["smash", "splitter"]) {
        assert.strictEqual(await Codec.encodeAction(FIXTURES[key].action),
            FIXTURES[key].importCode, `${key} import code`);
        assert.strictEqual(await Codec.encodeAction(Codec.stripForRoll(FIXTURES[key].action)),
            FIXTURES[key].rollCode, `${key} roll code`);
    }
});

// What the bot will actually do with a decoded payload, once handleCustom
// exists: find the band a total landed in, name it, and roll the dice written
// in its text.
test("a roll payload drives the degree lookup the handler will do", async () => {
    const action = await Codec.decodeAction(FIXTURES.splitter.rollCode);

    const at129 = Codec.matchDegree(action.g, 129);
    assert.strictEqual(Codec.rangeLabel(action.g, at129), "(121-140)");
    assert.strictEqual(action.g[at129][1], "Take an additional 4d20 damage");
    assert.deepStrictEqual(Codec.diceIn(action.g[at129][1]),
        [{ count: 4, sides: 20, raw: "4d20" }]);

    const at1 = Codec.matchDegree(action.g, 1);
    assert.strictEqual(Codec.rangeLabel(action.g, at1), "(40 or under)");

    const at999 = Codec.matchDegree(action.g, 999);
    assert.strictEqual(Codec.rangeLabel(action.g, at999), "(141+)");
});

test("a chart with no dice in its text rolls nothing", async () => {
    const action = await Codec.decodeAction(FIXTURES.smash.rollCode);
    const at999 = Codec.matchDegree(action.g, 999);
    assert.strictEqual(action.g[at999][1], "No damage");
    assert.deepStrictEqual(Codec.diceIn(action.g[at999][1]), []);
});

test("the pre-roll dice a payload carries are usable as written", async () => {
    const action = await Codec.decodeAction(FIXTURES.splitter.rollCode);
    assert.deepStrictEqual(action.p, [["Base damage", "20d20"]]);
    assert.deepStrictEqual(Codec.diceIn(action.p[0][1]),
        [{ count: 20, sides: 20, raw: "20d20" }]);
});

test("a tampered payload is refused rather than rolled", async () => {
    await assert.rejects(() => Codec.decodeAction("1AAAA"), (e) => {
        assert.strictEqual(e.name, "CodecError");
        return true;
    });
    await assert.rejects(() => Codec.decodeAction("not a code"), (e) => {
        assert.strictEqual(e.name, "CodecError");
        return true;
    });
});

test("the module loads without a browser and without discord.js", () => {
    // The bot repo has no node_modules; this file must never pull one in.
    assert.strictEqual(typeof Codec.decodeAction, "function");
    assert.strictEqual(typeof window, "undefined");
});
