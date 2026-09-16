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

// commentHas ------------------------------------------------------

test("commentHas finds a needle not touching the build sheet's separator", () => {
    // The user's actual case: a period instead of the middle dot leaves
    // tagsFromComment with one unsplittable tag, but commentHas still finds
    // the name and the thread code inside it.
    assert.strictEqual(core.commentHas("Astor . 1234C2", "Astor"), true);
    assert.strictEqual(core.commentHas("Astor . 1234C2", "1234C2"), true);
});

test("commentHas keeps the cycle-suffix distinction: 1234 does not match 1234C2", () => {
    assert.strictEqual(core.commentHas("Astor . 1234C2", "1234"), false);
});

test("commentHas does not require adjacency to the build sheet's dot separator", () => {
    assert.strictEqual(
        core.commentHas("Aeromancy · Elemental · Character Name · Lethal · Code", "Character Name"),
        true,
    );
});

test("commentHas is case-insensitive", () => {
    assert.strictEqual(core.commentHas("Fortitude · Lune · 2768", "lune"), true);
});

test("commentHas does not match a needle that is only a prefix of a word", () => {
    assert.strictEqual(core.commentHas("Lunetta · 2768", "Lune"), false);
});

test("commentHas does not match a needle that is only a suffix of a word", () => {
    assert.strictEqual(core.commentHas("x2768", "2768"), false);
});

test("commentHas matches a needle that is the whole comment", () => {
    assert.strictEqual(core.commentHas("2768", "2768"), true);
});

test("commentHas uses a unicode-aware boundary, not ASCII \\w", () => {
    assert.strictEqual(core.commentHas("Lünë · 2768", "Lünë"), true);
});

test("commentHas escapes regex metacharacters in the needle", () => {
    assert.strictEqual(core.commentHas("C++ · 2768", "C++"), true);
});

test("commentHas treats the needle as literal text, not a pattern", () => {
    // "a.c" would match /abc/ only if "." were a wildcard.
    assert.strictEqual(core.commentHas("a.c · 2768", "abc"), false);
});

test("commentHas never throws on bad input", () => {
    assert.strictEqual(core.commentHas(null, "x"), false);
    assert.strictEqual(core.commentHas("x", ""), false);
    assert.strictEqual(core.commentHas("x", null), false);
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

test("entryMatches prefers entry.comment and matches an unusual separator", () => {
    const withComment = {
        channelId: "c1",
        comment: "Astor . 1234C2",
        // No tags: this entry is the shape a comment-carrying write produces.
    };
    assert.strictEqual(core.entryMatches(withComment, "c1", "Astor", "1234C2"), true);
});

test("entryMatches falls back to tags for an entry written before comments were kept", () => {
    // No comment field at all — this is what pre-change entries look like on
    // disk. The fallback joins tags with " · " and searches that instead.
    const oldEntry = { channelId: "c1", tags: ["Fortitude", "Lune", "NG1", "2768C1"] };
    assert.strictEqual(core.entryMatches(oldEntry, "c1", "Lune", "2768C1"), true);
});

test("entryMatches keeps the cycle-suffix distinction through the comment path", () => {
    const withComment = { channelId: "c1", comment: "Fortitude · Lune · 2768C1" };
    assert.strictEqual(core.entryMatches(withComment, "c1", "lune", "2768"), false);
});

// Note: "a thread code is matched whole, so 2768 does not match 2768C1"
// (above) already covers the tags-fallback path via the shared `entry`
// fixture, which carries no `comment` field.

test("entryMatches still fails on the wrong channel when the entry carries a comment", () => {
    const withComment = { channelId: "c1", comment: "Astor . 1234C2" };
    assert.strictEqual(core.entryMatches(withComment, "c2", "Astor", "1234C2"), false);
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
    const blocks = ["a".repeat(30), "b".repeat(30), "c".repeat(30)];
    const out = core.chunkBlocks(blocks, 70);
    assert.strictEqual(out.length, 2);
    assert.ok(out.every((c) => c.length <= 70));
    assert.ok(out[0].startsWith("a"));
    // The property the test name claims: every chunk, split back on the
    // blank-line join, must be made up only of whole original blocks. A
    // naive character slicer (e.g. joined.match(/.{1,70}/g)) would pass the
    // assertions above too, but would fail this one by cutting mid-block.
    const pieces = out.flatMap((chunk) => chunk.split("\n\n"));
    assert.ok(pieces.every((piece) => blocks.includes(piece)));
});

test("a single block longer than the limit is still emitted whole", () => {
    const big = "x".repeat(500);
    const out = core.chunkBlocks([big], 100);
    assert.deepStrictEqual(out, [big]);
});

test("no blocks means no chunks", () => {
    assert.deepStrictEqual(core.chunkBlocks([], 100), []);
});

test("a non-array blocks value yields no chunks rather than throwing", () => {
    assert.deepStrictEqual(core.chunkBlocks(null, 100), []);
    assert.deepStrictEqual(core.chunkBlocks(undefined, 100), []);
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

// needsAttachment ------------------------------------------------------

test("a chunk right at the framed limit does not need an attachment", () => {
    // 2000 - 8 (fence overhead) = 1992, so the framed message lands exactly
    // on Discord's limit.
    const chunk = "x".repeat(core.DISCORD_MESSAGE_LIMIT - core.CHUNK_FRAME_OVERHEAD);
    assert.strictEqual(core.needsAttachment([chunk]), false);
});

test("a chunk one character past the framed limit needs an attachment", () => {
    const chunk = "x".repeat(core.DISCORD_MESSAGE_LIMIT - core.CHUNK_FRAME_OVERHEAD + 1);
    assert.strictEqual(core.needsAttachment([chunk]), true);
});

test("seven small chunks need an attachment on count alone", () => {
    const chunks = new Array(7).fill("small");
    assert.strictEqual(chunks.length > core.MAX_CHUNKS, true);
    assert.strictEqual(core.needsAttachment(chunks), true);
});

test("an empty chunk list never needs an attachment", () => {
    assert.strictEqual(core.needsAttachment([]), false);
});

test("a non-array chunks value never needs an attachment", () => {
    assert.strictEqual(core.needsAttachment(null), false);
    assert.strictEqual(core.needsAttachment(undefined), false);
});

// dedupeByMessageId ------------------------------------------------------

test("dedupeByMessageId keeps one entry per messageId, first wins", () => {
    const entries = [
        { messageId: "1", tags: ["a"] },
        { messageId: "2", tags: ["b"] },
        { messageId: "1", tags: ["a-dup"] },
    ];
    const out = core.dedupeByMessageId(entries);
    assert.deepStrictEqual(out.map((e) => e.messageId), ["1", "2"]);
    assert.deepStrictEqual(out[0].tags, ["a"]);
});

test("dedupeByMessageId on an already-doubled index comes back clean", () => {
    const entries = [
        { messageId: "1" }, { messageId: "2" }, { messageId: "3" },
        { messageId: "1" }, { messageId: "2" }, { messageId: "3" },
    ];
    assert.deepStrictEqual(
        core.dedupeByMessageId(entries).map((e) => e.messageId),
        ["1", "2", "3"],
    );
});

test("dedupeByMessageId on an empty or non-array input yields an empty list", () => {
    assert.deepStrictEqual(core.dedupeByMessageId([]), []);
    assert.deepStrictEqual(core.dedupeByMessageId(null), []);
    assert.deepStrictEqual(core.dedupeByMessageId(undefined), []);
});

// dropSuperseded ------------------------------------------------------

test("dropSuperseded removes an entry named in another's supersedes", () => {
    const entries = [
        { messageId: "1" },
        { messageId: "2", supersedes: "1" },
    ];
    assert.deepStrictEqual(
        core.dropSuperseded(entries).map((e) => e.messageId),
        ["2"],
    );
});

test("dropSuperseded collapses a chain of revisions to just the newest", () => {
    const entries = [
        { messageId: "1" },
        { messageId: "2", supersedes: "1" },
        { messageId: "3", supersedes: "2" },
    ];
    assert.deepStrictEqual(
        core.dropSuperseded(entries).map((e) => e.messageId),
        ["3"],
    );
});

test("dropSuperseded leaves entries alone when nothing supersedes them", () => {
    const entries = [{ messageId: "1" }, { messageId: "2" }];
    assert.deepStrictEqual(core.dropSuperseded(entries), entries);
});

test("dropSuperseded on an empty or non-array input yields an empty list", () => {
    assert.deepStrictEqual(core.dropSuperseded([]), []);
    assert.deepStrictEqual(core.dropSuperseded(null), []);
    assert.deepStrictEqual(core.dropSuperseded(undefined), []);
});
