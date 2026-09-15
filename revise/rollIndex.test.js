"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const rollIndex = require("./rollIndex");

function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "rollindex-"));
}

function entry(over) {
    return Object.assign({
        messageId: "1",
        channelId: "c1",
        guildId: "g1",
        userId: "u1",
        tags: ["Fortitude", "Lune", "2768"],
        createdAt: Date.now(),
    }, over || {});
}

test("an appended entry reads back", async () => {
    const dir = tempDir();
    await rollIndex.append(entry(), dir);
    const all = await rollIndex.read(dir);
    assert.strictEqual(all.length, 1);
    assert.deepStrictEqual(all[0].tags, ["Fortitude", "Lune", "2768"]);
});

test("reading a directory with no index yields an empty list", async () => {
    assert.deepStrictEqual(await rollIndex.read(tempDir()), []);
});

test("many appends all survive, in order", async () => {
    const dir = tempDir();
    for (let i = 0; i < 25; i++) await rollIndex.append(entry({ messageId: String(i) }), dir);
    const all = await rollIndex.read(dir);
    assert.strictEqual(all.length, 25);
    assert.strictEqual(all[0].messageId, "0");
    assert.strictEqual(all[24].messageId, "24");
});

test("a malformed line is skipped, not fatal", async () => {
    const dir = tempDir();
    await rollIndex.append(entry({ messageId: "good" }), dir);
    fs.appendFileSync(path.join(dir, rollIndex.FILE), "{ this is not json\n");
    await rollIndex.append(entry({ messageId: "alsogood" }), dir);
    const all = await rollIndex.read(dir);
    assert.deepStrictEqual(all.map((e) => e.messageId), ["good", "alsogood"]);
});

test("a blank line is skipped", async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, rollIndex.FILE), "\n\n");
    assert.deepStrictEqual(await rollIndex.read(dir), []);
});

test("prune drops entries past the retention window", async () => {
    const dir = tempDir();
    const now = Date.now();
    await rollIndex.append(entry({ messageId: "old", createdAt: now - rollIndex.RETENTION_MS - 1000 }), dir);
    await rollIndex.append(entry({ messageId: "new", createdAt: now }), dir);
    const kept = await rollIndex.prune(now, dir);
    assert.strictEqual(kept, 1);
    const all = await rollIndex.read(dir);
    assert.deepStrictEqual(all.map((e) => e.messageId), ["new"]);
});

test("prune on an empty index is a no-op", async () => {
    assert.strictEqual(await rollIndex.prune(Date.now(), tempDir()), 0);
});

test("prune leaves no temp file behind", async () => {
    const dir = tempDir();
    await rollIndex.append(entry(), dir);
    await rollIndex.prune(Date.now(), dir);
    assert.deepStrictEqual(
        fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")),
        [],
    );
});

test("append never throws when the directory path is blocked by a file", async () => {
    // A plain nested path under a writable temp dir just gets created by
    // `fs.mkdir(..., {recursive: true})`, so it never reaches append's catch
    // block. Blocking the path with a regular file forces `mkdir` to fail
    // with ENOTDIR, which is what actually exercises the try/catch.
    const dir = tempDir();
    const blocker = path.join(dir, "blocker");
    fs.writeFileSync(blocker, "not a directory");
    await assert.doesNotReject(() => rollIndex.append(entry(), path.join(blocker, "sub")));
});

test("read never throws on a directory that is not there", async () => {
    assert.deepStrictEqual(await rollIndex.read(path.join(tempDir(), "nope")), []);
});

test("an array line is skipped along with other malformed values", async () => {
    const dir = tempDir();
    fs.writeFileSync(
        path.join(dir, rollIndex.FILE),
        ["5", "null", "[]", JSON.stringify(entry({ messageId: "good" }))].join("\n") + "\n",
    );
    const all = await rollIndex.read(dir);
    assert.deepStrictEqual(all.map((e) => e.messageId), ["good"]);
});

test("append caps tags to 20 entries of at most 100 characters", async () => {
    const dir = tempDir();
    const longTags = [];
    for (let i = 0; i < 50; i++) longTags.push("x".repeat(500));
    await rollIndex.append(entry({ tags: longTags }), dir);
    const all = await rollIndex.read(dir);
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].tags.length, 20);
    for (const tag of all[0].tags) assert.ok(tag.length <= 100);
});
