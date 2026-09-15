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
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 100;

let timer = null;

function filePath(dir) {
    return path.join(dir || DEFAULT_DIR, FILE);
}

/**
 * Caps a tags array to MAX_TAGS entries of at most MAX_TAG_LENGTH characters
 * each. There is no length cap on a roll comment anywhere upstream
 * (`commands/parseCommand.js` takes everything after the first `#` verbatim,
 * bounded only by Discord's ~2000-character message limit), so without this
 * a single entry's tags could grow the line past the point where an
 * `O_APPEND` write is still atomic. No real character name or thread code
 * comes close to either bound, so this never affects matching.
 * @param {*} tags
 * @returns {*} the capped array, or the input unchanged if it is not an array
 */
function capTags(tags) {
    if (!Array.isArray(tags)) return tags;
    return tags.slice(0, MAX_TAGS).map(function (t) {
        return typeof t === "string" ? t.slice(0, MAX_TAG_LENGTH) : t;
    });
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
        // Cap tags before stringifying — see capTags() for why the line
        // needs to stay small.
        const capped = Object.assign({}, entry, { tags: capTags(entry.tags) });
        await fs.mkdir(dir || DEFAULT_DIR, { recursive: true });
        await fs.appendFile(filePath(dir), JSON.stringify(capped) + "\n", "utf8");
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
            // typeof [] === "object" and [] is truthy, so an array literal
            // would otherwise slip through as if it were an entry.
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) out.push(parsed);
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
