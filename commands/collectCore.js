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

module.exports = {
    commentFromCommandText: commentFromCommandText,
    tagsFromComment: tagsFromComment,
};
