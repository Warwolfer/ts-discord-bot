// commands/d100Check.js
//
// The d100 every save and check starts from: one die, or two keeping the
// higher (adv) or the lower (dis), plus the calculation parts every check
// embed prints. handleSave, handleExpertise and handleMastery each carried a
// copy of this; handleCustom is the fourth user, so it lives here once.
//
// No imports: this file must stay loadable without node_modules so it can be
// tested. The roll function is passed in for the same reason — the real one
// lives in helpers.js, which loads discord.js.
"use strict";

const ADVANTAGE_WORDS = {
    adv: "adv",
    advantage: "adv",
    dis: "dis",
    disadvantage: "dis",
};

/**
 * Reads an optional adv/dis word at args[index].
 * @returns {{mode: "adv"|"dis"|"none", next: number}} next is the index of
 *   whatever follows the word, or index itself when there is no word.
 */
function advantageAt(args, index) {
    const word = String(args[index] == null ? "" : args[index]).toLowerCase();
    const mode = ADVANTAGE_WORDS[word];
    if (mode) return { mode: mode, next: index + 1 };
    return { mode: "none", next: index };
}

/**
 * Rolls the check die. The first die is always rolled first, then the twin,
 * because the revise tape replays dice in the order they were rolled and
 * every existing check handler rolls in this order.
 */
function rollD100(rollFn, mode) {
    const first = rollFn(1, 100);
    if (mode === "adv") {
        const second = rollFn(1, 100);
        return { kept: Math.max(first, second), display: `2d100kh1 (${first}, ${second})` };
    }
    if (mode === "dis") {
        const second = rollFn(1, 100);
        return { kept: Math.min(first, second), display: `2d100kl1 (${first}, ${second})` };
    }
    return { kept: first, display: `1d100 (${first})` };
}

/**
 * The pieces of a check's calculation string, in the order the embeds print
 * them. rank is null for a save (its bonus rides inside modsTotal, as
 * handleSave has always done) or {value, letter} for a mastery or expertise
 * check.
 */
function checkParts(display, rank, modsTotal, ngBonus) {
    const parts = [display];
    if (rank) parts.push(`${rank.value} (MR-${rank.letter})`);
    if (modsTotal !== 0) parts.push(`${modsTotal} (mods)`);
    if (ngBonus > 0) parts.push(`${ngBonus} (NG\u22C51)`);
    return parts;
}

module.exports = { advantageAt, rollD100, checkParts };
