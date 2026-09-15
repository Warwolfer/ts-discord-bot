// commands/collectCore.js
// The parts of /collect that are just rules: which comment a command carries,
// what its tags are, which index entries a request matches, and how the
// answer is cut up for delivery. Kept apart from commands/slash/collect.js so
// they can be tested — that file imports discord.js and this repo has no
// node_modules.
"use strict";

/**
 * The raw comment a roll carried: everything after the first "#". The rest of
 * the string may contain more hashes; only the first one separates.
 * @param {string} commandText - e.g. "save adv 5 # Fortitude · Lune · 2768"
 * @returns {string} "" when the command carried no comment
 */
function commentFromCommandText(commandText) {
    if (typeof commandText !== "string") return "";
    const at = commandText.indexOf("#");
    if (at === -1) return "";
    return commandText.slice(at + 1).trim();
}

/**
 * A comment's tags: the pieces between the middle dots the build sheet stamps.
 * @param {string} raw
 * @returns {string[]}
 */
function tagsFromComment(raw) {
    if (typeof raw !== "string" || !raw) return [];
    return raw.split("·")
        .map(function (piece) { return piece.trim(); })
        .filter(function (piece) { return piece.length > 0; });
}

// Discord's message limit is 2000. A chunk is wrapped in a code fence and
// nothing else, so 1900 leaves room for the fence and a stray newline.
const MAX_CHUNK = 1900;
// Past this many chunks the DM becomes a wall of messages, so the whole thing
// goes as one file instead.
const MAX_CHUNKS = 6;

/**
 * Does this index entry belong to the asked-for character and thread, in this
 * channel? Tags are matched whole and case-insensitively, so "2768" does not
 * match a "2768C1" cycle collection.
 * @param {object} entry
 * @param {string} channelId
 * @param {string} character
 * @param {string} thread
 * @returns {boolean}
 */
function entryMatches(entry, channelId, character, thread) {
    if (!entry || entry.channelId !== channelId) return false;
    if (!Array.isArray(entry.tags)) return false;
    const lower = entry.tags.map(function (t) { return String(t).trim().toLowerCase(); });
    return lower.indexOf(String(character).trim().toLowerCase()) !== -1 &&
        lower.indexOf(String(thread).trim().toLowerCase()) !== -1;
}

/**
 * The comment a posted roll carries, read back off its embed. The build sheet
 * stamps it as the last `> *…*` line of the description.
 * @param {string} description
 * @returns {string}
 */
function commentFromDescription(description) {
    if (typeof description !== "string") return "";
    const matches = description.match(/^> \*(.+)\*$/gm);
    if (!matches || !matches.length) return "";
    const last = matches[matches.length - 1];
    return last.replace(/^> \*/, "").replace(/\*$/, "").trim();
}

/**
 * Joins BBCode blocks with one blank line and cuts the result into pieces no
 * longer than `limit`, always at a block boundary — a roll split down the
 * middle is not pasteable. A single block over the limit is emitted whole
 * rather than mangled; the caller's file path handles that case. A non-array
 * `blocks` (e.g. null/undefined) yields no chunks rather than throwing.
 * @param {string[]} blocks
 * @param {number} [limit] - defaults to MAX_CHUNK
 * @returns {string[]}
 */
function chunkBlocks(blocks, limit) {
    if (!Array.isArray(blocks)) return [];
    const max = limit || MAX_CHUNK;
    const chunks = [];
    let current = "";
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const candidate = current ? current + "\n\n" + block : block;
        if (current && candidate.length > max) {
            chunks.push(current);
            current = block;
        } else {
            current = candidate;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

/**
 * A safe attachment name. Both halves come from what the player typed, so
 * everything outside a conservative set becomes a dash.
 * @param {string} character
 * @param {string} thread
 * @returns {string}
 */
function attachmentName(character, thread) {
    const stem = (String(character) + "-" + String(thread))
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "")
        .slice(0, 60);
    return (stem || "rolls") + ".txt";
}

/**
 * The DM's body when nothing matched, so the caller has one string to send.
 * @param {string} character
 * @param {string} thread
 * @returns {string}
 */
function noHitsMessage(character, thread) {
    return "No rolls found for " + character + " · " + thread +
        " in this channel in the last 14 days.";
}

module.exports = {
    commentFromCommandText: commentFromCommandText,
    tagsFromComment: tagsFromComment,
    entryMatches: entryMatches,
    commentFromDescription: commentFromDescription,
    chunkBlocks: chunkBlocks,
    attachmentName: attachmentName,
    noHitsMessage: noHitsMessage,
    MAX_CHUNK: MAX_CHUNK,
    MAX_CHUNKS: MAX_CHUNKS,
};
