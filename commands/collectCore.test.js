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

const entry = {
    messageId: "1",
    channelId: "c1",
    tags: ["Fortitude", "Lune", "NG1", "2768C1"],
    createdAt: 0,
};

test("a matching character and thread in the right channel hits", () => {
    assert.strictEqual(core.entryMatches(entry, "c1", "lune", "2768c1"), true);
});

test("matching is case-insensitive on both sides", () => {
    assert.strictEqual(core.entryMatches(entry, "c1", "LUNE", "2768C1"), true);
});

test("another channel never hits", () => {
    assert.strictEqual(core.entryMatches(entry, "c2", "lune", "2768c1"), false);
});

test("a thread code is matched whole, so 2768 does not match 2768C1", () => {
    assert.strictEqual(core.entryMatches(entry, "c1", "lune", "2768"), false);
});

test("a wrong character never hits", () => {
    assert.strictEqual(core.entryMatches(entry, "c1", "eva", "2768c1"), false);
});

test("an entry with no tags never hits", () => {
    assert.strictEqual(core.entryMatches({ channelId: "c1" }, "c1", "lune", "2768c1"), false);
});

test("the comment is read off the last quoted line of a description", () => {
    const desc = "Rolled 42\n> *some note*\n> *Fortitude · Lune · 2768*";
    assert.strictEqual(core.commentFromDescription(desc), "Fortitude · Lune · 2768");
});

test("a description with no quoted line yields an empty string", () => {
    assert.strictEqual(core.commentFromDescription("Rolled 42"), "");
    assert.strictEqual(core.commentFromDescription(null), "");
});

test("blocks under the limit come back as one chunk", () => {
    const out = core.chunkBlocks(["aaa", "bbb"], 100);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0], "aaa\n\nbbb");
});

test("chunking cuts at block boundaries, never inside a block", () => {
    const out = core.chunkBlocks(["a".repeat(30), "b".repeat(30), "c".repeat(30)], 70);
    assert.strictEqual(out.length, 2);
    assert.ok(out.every((c) => c.length <= 70));
    assert.ok(out[0].startsWith("a"));
});

test("a single block longer than the limit is still emitted whole", () => {
    const big = "x".repeat(500);
    const out = core.chunkBlocks([big], 100);
    assert.deepStrictEqual(out, [big]);
});

test("no blocks means no chunks", () => {
    assert.deepStrictEqual(core.chunkBlocks([], 100), []);
});

test("the attachment name uses the inputs when they are tame", () => {
    assert.strictEqual(core.attachmentName("Lune", "2768C1"), "Lune-2768C1.txt");
});

test("the attachment name strips anything that is not safe", () => {
    const name = core.attachmentName("../../etc/passwd", "a b");
    assert.match(name, /^[A-Za-z0-9._-]+\.txt$/);
    assert.doesNotMatch(name, /\.\./);
    assert.doesNotMatch(name, /\//);
});

test("an unusable name falls back", () => {
    assert.strictEqual(core.attachmentName("···", "···"), "rolls.txt");
});

test("the attachment name is capped", () => {
    assert.ok(core.attachmentName("x".repeat(200), "y".repeat(200)).length <= 64 + 4);
});

test("the no-hits message names both inputs", () => {
    assert.strictEqual(
        core.noHitsMessage("Lune", "2768C1"),
        "No rolls found for Lune · 2768C1 in this channel in the last 14 days.",
    );
});
