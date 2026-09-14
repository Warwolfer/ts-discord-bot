// commands/customRoll.js
//
// The pure core of `?r custom`: reads the arguments, rolls a DM's custom
// action in the fixed order the revise tape relies on, and renders the embed
// text. handleCustom in handlers/basic.js is the glue around this.
//
// No discord.js here, on purpose: this file must stay loadable without
// node_modules so it can be tested. The roll function is injected for the
// same reason.
"use strict";

const Codec = require("./custom-action-codec");
const { advantageAt, rollD100, checkParts } = require("./d100Check");

const KIND_TITLES = {
    fortitude: "Fortitude Save",
    reflex: "Reflex Save",
    will: "Will Save",
    mastery: "Mastery Check",
    expertise: "Expertise Check",
};

// These two take a rank letter where a save takes a number.
const RANKED_KINDS = { mastery: true, expertise: true };

// Discord's embed description limit is 4096. The handler appends the NG note,
// the player's comment and, on a revision, a "Revised from" line, so the
// rendered dice lists have to leave room for all of it. Collapsing early
// costs almost nothing: the collapsed form of even a maximal chart is about
// 2.5k characters.
const MAX_DESCRIPTION = 2000;

/**
 * ?r custom <payload> <kind> [adv|dis] <bonus|rank> [mods...]
 * @returns {{payload, kind, mode, bonusIndex, needsRank}|{error: string}}
 */
function parseCustomArgs(args) {
    const payload = args[1];
    if (!payload) {
        return { error: "The action code is missing. Paste the code the DM gave you as the second word." };
    }
    if (/^[+-]?\d+$/.test(payload)) {
        return { error: "The second word must be the action code, not a number." };
    }

    const kindWord = String(args[2] == null ? "" : args[2]).toLowerCase();
    if (Codec.KINDS.indexOf(kindWord) === -1) {
        const shown = args[2] == null ? "" : args[2];
        return { error: `"${shown}" is not a roll type. Use fortitude, reflex, will, mastery or expertise.` };
    }

    const adv = advantageAt(args, 3);
    return {
        payload: payload,
        kind: kindWord,
        mode: adv.mode,
        bonusIndex: adv.next,
        needsRank: !!RANKED_KINDS[kindWord],
    };
}

function rollDice(rollFn, count, sides) {
    const rolls = [];
    let total = 0;
    for (let i = 0; i < count; i++) {
        const value = rollFn(1, sides);
        rolls.push(value);
        total += value;
    }
    return { rolls: rolls, total: total };
}

/**
 * Rolls the whole action. Order is fixed and must not change: every p row,
 * then the d100 (and its adv/dis twin), then the dice in the matched degree's
 * text. A revision replays the tape in exactly this order.
 *
 * @param {object} o
 * @param {object} o.action    decoded payload ({v, n, p?, g})
 * @param {string} o.kind      one of Codec.KINDS
 * @param {string} o.mode      "adv" | "dis" | "none"
 * @param {{value:number, letter:string}|null} o.rank  mastery/expertise only
 * @param {number} o.modsTotal every numeric modifier summed (the save bonus included)
 * @param {number} o.ngBonus   0 or 5
 * @param {Function} o.roll    (min, max) => number
 */
function rollCustom(o) {
    const action = o.action;

    const pre = (action.p || []).map(function (row) {
        const label = row[0];
        const dice = row[1];
        const spec = Codec.diceIn(dice)[0];   // validated on decode, so always one
        const rolled = rollDice(o.roll, spec.count, spec.sides);
        return { label: label || dice, dice: dice, rolls: rolled.rolls, total: rolled.total };
    });

    const d100 = rollD100(o.roll, o.mode);
    const parts = checkParts(d100.display, o.rank, o.modsTotal, o.ngBonus);
    const total = d100.kept + (o.rank ? o.rank.value : 0) + o.modsTotal + o.ngBonus;

    const degreeIndex = Codec.matchDegree(action.g, total);
    const text = action.g[degreeIndex][1];
    const outcomes = Codec.diceIn(text).map(function (spec) {
        const rolled = rollDice(o.roll, spec.count, spec.sides);
        return { raw: spec.raw, rolls: rolled.rolls, total: rolled.total };
    });

    return {
        pre: pre,
        check: {
            title: KIND_TITLES[o.kind],
            display: d100.display,
            calculation: parts.join(" + "),
            total: total,
        },
        degreeIndex: degreeIndex,
        band: Codec.rangeLabel(action.g, degreeIndex),
        text: text,
        outcomes: outcomes,
    };
}

// Everything Discord renders as formatting inside an embed description. The
// DM's labels and degree texts are free text and go through this; the
// numbers and the band label are ours and do not. This also covers the link
// brackets `[` and `]` (unescaped, a DM's free text could carry a masked
// link inside a bot-authored embed) and the line-start heading/bullet
// characters `#` and `-` (a row label can sit at the start of a line).
function escapeMarkdown(text) {
    return String(text == null ? "" : text).replace(/[\\*_~`|>\[\]#-]/g, "\\$&");
}

function diceList(rolls, collapsed) {
    return collapsed ? `${rolls.length} dice` : rolls.join(" + ");
}

/**
 * The embed description, without the NG note or the comment (the handler
 * appends those). Collapses the dice lists when the text would run long.
 */
function describe(result, collapsed) {
    const lines = [];
    for (let i = 0; i < result.pre.length; i++) {
        const row = result.pre[i];
        lines.push(`${escapeMarkdown(row.label)}: \`${row.dice} (${diceList(row.rolls, collapsed)})\` = **${row.total}**`);
    }
    lines.push(`${result.check.title}: \`${result.check.calculation}\``);
    lines.push(`**Total: ${result.check.total}**`);
    lines.push(`**${result.band}** ${escapeMarkdown(result.text)}`);
    for (let i = 0; i < result.outcomes.length; i++) {
        const out = result.outcomes[i];
        lines.push(`Outcome: \`${out.raw} (${diceList(out.rolls, collapsed)})\` = **${out.total}**`);
    }
    const text = lines.join("\n");
    if (!collapsed && text.length > MAX_DESCRIPTION) return describe(result, true);
    return text;
}

module.exports = { KIND_TITLES, parseCustomArgs, rollCustom, describe, escapeMarkdown, MAX_DESCRIPTION };
