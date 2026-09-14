// commands/customRoll.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const Codec = require("./custom-action-codec");
const { KIND_TITLES, parseCustomArgs, rollCustom, describe, escapeMarkdown, MAX_DESCRIPTION } = require("./customRoll");

const FIXTURES = JSON.parse(fs.readFileSync(path.join(__dirname, "custom-action-fixtures.json"), "utf8"));
const SPLITTER = Codec.decodeActionSync(FIXTURES.splitter.rollCode);
const SMASH = Codec.decodeActionSync(FIXTURES.smash.rollCode);

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

// --- parseCustomArgs ---------------------------------------------------------

test("a save-kind command parses with the bonus at index 3", () => {
    assert.deepStrictEqual(parseCustomArgs(["custom", "1abc", "fortitude", "70"]),
        { payload: "1abc", kind: "fortitude", mode: "none", bonusIndex: 3, needsRank: false });
});

test("adv/dis sits between the kind and the bonus", () => {
    assert.deepStrictEqual(parseCustomArgs(["custom", "1abc", "reflex", "dis", "15"]),
        { payload: "1abc", kind: "reflex", mode: "dis", bonusIndex: 4, needsRank: false });
});

test("mastery and expertise kinds need a rank letter next", () => {
    assert.deepStrictEqual(parseCustomArgs(["custom", "1abc", "Mastery", "a"]),
        { payload: "1abc", kind: "mastery", mode: "none", bonusIndex: 3, needsRank: true });
    assert.deepStrictEqual(parseCustomArgs(["custom", "1abc", "expertise", "adv", "b", "10"]),
        { payload: "1abc", kind: "expertise", mode: "adv", bonusIndex: 4, needsRank: true });
});

test("a missing payload is refused", () => {
    assert.match(parseCustomArgs(["custom"]).error, /code is missing/i);
});

test("a number where the payload belongs is refused by name", () => {
    assert.match(parseCustomArgs(["custom", "70", "fortitude"]).error, /second word must be the action code/i);
    assert.match(parseCustomArgs(["custom", "-5", "fortitude"]).error, /second word must be the action code/i);
});

test("an unknown or missing kind lists the five that exist", () => {
    const e1 = parseCustomArgs(["custom", "1abc", "charisma", "70"]).error;
    assert.match(e1, /"charisma" is not a roll type/);
    assert.match(e1, /fortitude, reflex, will, mastery or expertise/);
    const e2 = parseCustomArgs(["custom", "1abc"]).error;
    assert.match(e2, /is not a roll type/);
});

// --- rollCustom: order and arithmetic ----------------------------------------

test("Tide Splitter at a 129 total: base dice, the save, the (121-140) band, then 4d20", () => {
    // 20 base d20s, one d100 = 54, then the band's 4d20.
    const base = [12, 7, 19, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4]; // sums to 90
    const roll = scripted(base.concat([54], [16, 3, 11, 9]));
    const r = rollCustom({ action: SPLITTER, kind: "fortitude", mode: "none", rank: null, modsTotal: 70, ngBonus: 5, roll });

    assert.strictEqual(r.pre.length, 1);
    assert.strictEqual(r.pre[0].label, "Base damage");
    assert.strictEqual(r.pre[0].dice, "20d20");
    assert.strictEqual(r.pre[0].total, 90);
    assert.deepStrictEqual(r.pre[0].rolls, base);

    assert.strictEqual(r.check.title, "Fortitude Save");
    assert.strictEqual(r.check.calculation, "1d100 (54) + 70 (mods) + 5 (NG⋅1)");
    assert.strictEqual(r.check.total, 129);

    assert.strictEqual(r.degreeIndex, 5);
    assert.strictEqual(r.band, "(121-140)");
    assert.strictEqual(r.text, "Take an additional 4d20 damage");
    assert.deepStrictEqual(r.outcomes, [{ raw: "4d20", rolls: [16, 3, 11, 9], total: 39 }]);

    // Every die was rolled in the fixed order: 20 d20, 1 d100, 4 d20.
    const kinds = roll.calls.map(([, max]) => max);
    assert.deepStrictEqual(kinds, new Array(20).fill(20).concat([100], new Array(4).fill(20)));
});

test("advantage rolls the twin d100 right after the first, before any outcome dice", () => {
    const base = new Array(20).fill(1);
    const roll = scripted(base.concat([10, 90], new Array(6).fill(2)));
    const r = rollCustom({ action: SPLITTER, kind: "fortitude", mode: "adv", rank: null, modsTotal: 30, ngBonus: 0, roll });
    assert.strictEqual(r.check.calculation, "2d100kh1 (10, 90) + 30 (mods)");
    assert.strictEqual(r.check.total, 120);
    assert.strictEqual(r.band, "(101-120)");
    assert.strictEqual(r.text, "Take an additional 6d20 damage");
    assert.strictEqual(roll.calls.length, 20 + 2 + 6);
});

test("a mastery check adds the rank value and prints MR-<letter>", () => {
    const base = new Array(20).fill(1);
    const roll = scripted(base.concat([50], new Array(8).fill(1)));
    const r = rollCustom({ action: SPLITTER, kind: "mastery", mode: "none", rank: { value: 30, letter: "A" }, modsTotal: 10, ngBonus: 0, roll });
    assert.strictEqual(r.check.title, "Mastery Check");
    assert.strictEqual(r.check.calculation, "1d100 (50) + 30 (MR-A) + 10 (mods)");
    assert.strictEqual(r.check.total, 90);
    assert.strictEqual(r.band, "(81-100)");
    assert.strictEqual(r.outcomes[0].raw, "8d20");
});

test("Tidal Smash has no base dice and its bands roll nothing", () => {
    const roll = scripted([95]);
    const r = rollCustom({ action: SMASH, kind: "reflex", mode: "none", rank: null, modsTotal: 40, ngBonus: 0, roll });
    assert.deepStrictEqual(r.pre, []);
    assert.strictEqual(r.check.total, 135);
    assert.strictEqual(r.band, "(121+)");
    assert.strictEqual(r.text, "No damage");
    assert.deepStrictEqual(r.outcomes, []);
    assert.deepStrictEqual(roll.calls, [[1, 100]]);
});

test("a very low total lands in the first band", () => {
    const roll = scripted([1]);
    const r = rollCustom({ action: SMASH, kind: "will", mode: "none", rank: null, modsTotal: 0, ngBonus: 0, roll });
    assert.strictEqual(r.band, "(20 or under)");
    assert.strictEqual(r.text, "Take 40 damage");
});

test("a band with two dice expressions rolls both, in text order", () => {
    const action = { v: 1, n: "Twin", g: [[null, "2d6 fire and 1d20 cold"]] };
    const roll = scripted([50, 3, 4, 17]);
    const r = rollCustom({ action, kind: "fortitude", mode: "none", rank: null, modsTotal: 0, ngBonus: 0, roll });
    assert.deepStrictEqual(r.outcomes, [
        { raw: "2d6", rolls: [3, 4], total: 7 },
        { raw: "1d20", rolls: [17], total: 17 },
    ]);
    assert.deepStrictEqual(roll.calls, [[1, 100], [1, 6], [1, 6], [1, 20]]);
});

test("a dice row with an empty label is labelled by its dice", () => {
    const action = { v: 1, n: "X", p: [["", "2d6"]], g: [[null, "ok"]] };
    const roll = scripted([1, 2, 50]);
    const r = rollCustom({ action, kind: "fortitude", mode: "none", rank: null, modsTotal: 0, ngBonus: 0, roll });
    assert.strictEqual(r.pre[0].label, "2d6");
});

// --- describe ----------------------------------------------------------------

test("describe renders the spec's example line for line", () => {
    const base = [12, 7, 19, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4];
    const roll = scripted(base.concat([54], [16, 3, 11, 9]));
    const r = rollCustom({ action: SPLITTER, kind: "fortitude", mode: "none", rank: null, modsTotal: 70, ngBonus: 5, roll });
    assert.strictEqual(describe(r), [
        "Base damage: `20d20 (" + base.join(" + ") + ")` = **90**",
        "Fortitude Save: `1d100 (54) + 70 (mods) + 5 (NG⋅1)`",
        "**Total: 129**",
        "**(121-140)** Take an additional 4d20 damage",
        "Outcome: `4d20 (16 + 3 + 11 + 9)` = **39**",
    ].join("\n"));
});

test("describe omits the outcome line when the band has no dice", () => {
    const roll = scripted([95]);
    const r = rollCustom({ action: SMASH, kind: "reflex", mode: "none", rank: null, modsTotal: 40, ngBonus: 0, roll });
    assert.strictEqual(describe(r), [
        "Reflex Save: `1d100 (95) + 40 (mods)`",
        "**Total: 135**",
        "**(121+)** No damage",
    ].join("\n"));
});

test("describe escapes markdown in the DM's free text but not in the numbers", () => {
    const action = { v: 1, n: "X", p: [["*Base*", "1d6"]], g: [[null, "Take `5` **damage** ~now~ |ok| > 1 back\\slash"]] };
    const roll = scripted([3, 50]);
    const r = rollCustom({ action, kind: "fortitude", mode: "none", rank: null, modsTotal: 0, ngBonus: 0, roll });
    const text = describe(r);
    assert.ok(text.startsWith("\\*Base\\*: `1d6 (3)` = **3**"), text);
    assert.ok(text.endsWith("**(any)** Take \\`5\\` \\*\\*damage\\*\\* \\~now\\~ \\|ok\\| \\> 1 back\\\\slash"), text);
});

test("describe collapses every dice list when the full text would pass 3800 characters", () => {
    const rows = [];
    for (let i = 0; i < 5; i++) rows.push(["Row " + i, "100d1000"]);
    const action = { v: 1, n: "Huge", p: rows, g: [[null, "Take 100d1000 more"]] };
    const values = [];
    for (let i = 0; i < 500; i++) values.push(1000);
    values.push(50);
    for (let i = 0; i < 100; i++) values.push(1000);
    const r = rollCustom({ action, kind: "fortitude", mode: "none", rank: null, modsTotal: 0, ngBonus: 0, roll: scripted(values) });
    const text = describe(r);
    assert.ok(text.length <= MAX_DESCRIPTION, `description is ${text.length} characters`);
    assert.match(text, /Row 0: `100d1000 \(100 dice\)` = \*\*100000\*\*/);
    assert.match(text, /Outcome: `100d1000 \(100 dice\)` = \*\*100000\*\*/);
});

test("escapeMarkdown covers every character Discord treats as formatting", () => {
    assert.strictEqual(escapeMarkdown("a*b_c~d`e|f>g\\h"), "a\\*b\\_c\\~d\\`e\\|f\\>g\\\\h");
    assert.strictEqual(escapeMarkdown("[terrarp.com](https://evil.example)"),
        "\\[terrarp.com\\](https://evil.example)");
    assert.strictEqual(escapeMarkdown("# Reward - take it"), "\\# Reward \\- take it");
    assert.strictEqual(escapeMarkdown("plain text 12d20"), "plain text 12d20");
    assert.strictEqual(escapeMarkdown(""), "");
});

test("KIND_TITLES names every kind the codec allows", () => {
    assert.deepStrictEqual(Object.keys(KIND_TITLES).sort(), Codec.KINDS.slice().sort());
});
