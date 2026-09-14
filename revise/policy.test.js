"use strict";
const { test } = require("node:test");
const assert = require("node:assert");

const { mayDropDice } = require("./policy");

test("only a custom roll may use fewer dice on revision", () => {
    assert.strictEqual(mayDropDice("custom"), true);
    assert.strictEqual(mayDropDice("CUSTOM"), true);
});

test("every other command keeps the refusal", () => {
    for (const name of ["save", "mastery", "expertise", "attack", "reckless", "2d6", "", undefined, null]) {
        assert.strictEqual(mayDropDice(name), false, String(name));
    }
});
