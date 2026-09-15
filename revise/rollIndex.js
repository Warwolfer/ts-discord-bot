// revise/rollIndex.js
// Which bot message holds which roll, so /collect can answer from a file read
// instead of crawling the channel. One JSON object per line, appended and
// never rewritten in place — an append of a short line is atomic, so two rolls
// landing at once cannot clobber each other and no read-modify-write is
// needed. A crash mid-write costs one malformed line, which read() skips.
//
// No discord.js import, on purpose: this file must stay loadable without
// node_modules so it can be tested.
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const FILE = "roll-index.jsonl";
const DEFAULT_DIR = path.join(__dirname, "..", "data");
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;   // 14 days
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;        // hourly

let timer = null;

function filePath(dir) {
    return path.join(dir || DEFAULT_DIR, FILE);
}

/**
 * Records one roll. Never throws: a full disk or a read-only mount must cost
 * a /collect hit, not the roll the player is waiting for.
 * @param {{messageId: string, channelId: string, guildId: string|null,
 *          userId: string, tags: string[], createdAt: number}} entry
 * @param {string} [dir] - tests point this at a temp directory
 * @returns {Promise<void>}
 */
async function append(entry, dir) {
    try {
        await fs.mkdir(dir || DEFAULT_DIR, { recursive: true });
        await fs.appendFile(filePath(dir), JSON.stringify(entry) + "\n", "utf8");
    } catch (err) {
        console.error("[rollIndex] append failed:", err.message);
    }
}

/**
 * Every entry still on disk, oldest first. A line that will not parse is
 * skipped — one torn write must not make the whole index unreadable.
 * @param {string} [dir]
 * @returns {Promise<Array<object>>}
 */
async function read(dir) {
    let raw;
    try {
        raw = await fs.readFile(filePath(dir), "utf8");
    } catch (err) {
        return [];   // no index yet, or no directory
    }
    const out = [];
    for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === "object") out.push(parsed);
        } catch (err) {
            // A torn or hand-edited line. Skip it.
        }
    }
    return out;
}

/**
 * Drops entries older than the retention window by writing a sibling file and
 * renaming over the original, so a reader never sees a half-written index.
 * @param {number} [now]
 * @param {string} [dir]
 * @returns {Promise<number>} how many entries survived
 */
async function prune(now, dir) {
    const cutoff = (now || Date.now()) - RETENTION_MS;
    const all = await read(dir);
    if (!all.length) return 0;
    const kept = all.filter(function (e) { return Number(e.createdAt) >= cutoff; });

    const target = filePath(dir);
    const tmp = target + ".tmp";
    try {
        await fs.writeFile(tmp, kept.map(function (e) { return JSON.stringify(e); }).join("\n") + (kept.length ? "\n" : ""), "utf8");
        await fs.rename(tmp, target);
    } catch (err) {
        console.error("[rollIndex] prune failed:", err.message);
        try {
            await fs.unlink(tmp);
        } catch (e) {
            // The temp file was never created. Nothing to clean.
        }
        return all.length;
    }
    return kept.length;
}

/**
 * Starts the hourly prune, plus one immediately. Called from index.js only —
 * a timer started at import time would keep `node --test` alive forever.
 * @returns {void}
 */
function startPruning() {
    if (timer) return;
    prune().catch(function () {});
    timer = setInterval(function () {
        prune().catch(function () {});
    }, PRUNE_INTERVAL_MS);
    // The bot should still be able to exit on a signal.
    if (timer.unref) timer.unref();
}

/**
 * Stops the hourly prune started by startPruning(). Safe to call when no
 * timer is running.
 * @returns {void}
 */
function stopPruning() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
}

module.exports = {
    append: append,
    read: read,
    prune: prune,
    startPruning: startPruning,
    stopPruning: stopPruning,
    FILE: FILE,
    RETENTION_MS: RETENTION_MS,
};
