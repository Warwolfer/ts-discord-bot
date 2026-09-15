"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const core = require("./collectCore");

test("the comment is everything after the first hash", () => {
    assert.strictEqual(
        core.commentFromCommandText("save adv 5 # Fortitude · Lune · 2768"),
        "Fortitude · Lune · 2768",
    );
});

test("a command with no comment yields an empty string", () => {
    assert.strictEqual(core.commentFromCommandText("save adv 5"), "");
});

test("a hash inside the comment is kept", () => {
    assert.strictEqual(
        core.commentFromCommandText("r 1d20 # note #2 · Lune"),
        "note #2 · Lune",
    );
});

test("a missing or non-string command text yields an empty string", () => {
    assert.strictEqual(core.commentFromCommandText(null), "");
    assert.strictEqual(core.commentFromCommandText(undefined), "");
});

test("tags split on the middle dot and are trimmed", () => {
    assert.deepStrictEqual(
        core.tagsFromComment("Fortitude · Lune · NG1 · 2768C1"),
        ["Fortitude", "Lune", "NG1", "2768C1"],
    );
});

test("empty pieces are dropped", () => {
    assert.deepStrictEqual(core.tagsFromComment("Lune ·  · 2768"), ["Lune", "2768"]);
});

test("a comment with no dot is one tag", () => {
    assert.deepStrictEqual(core.tagsFromComment("Lune"), ["Lune"]);
});

test("an empty comment yields no tags", () => {
    assert.deepStrictEqual(core.tagsFromComment(""), []);
    assert.deepStrictEqual(core.tagsFromComment(null), []);
});
