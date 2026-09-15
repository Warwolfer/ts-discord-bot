// revise/bbcode.js
// One embed, rendered as the forum's BBCode. Both the Copy Result button and
// /collect use this, so the order of the replaces below is shared too — and
// that order is load-bearing. Two bugs have already been fixed by moving a
// rule earlier; read the comments before rearranging anything.
//
// No discord.js import, on purpose: this file must stay loadable without
// node_modules so it can be tested. It reads only `.title` and `.description`,
// which a discord.js Embed and a plain object both have.
"use strict";

// Untrusted characters wait here while the conversions run. U+0001 cannot
// appear in an action's text — the codec rejects control characters — and any
// that somehow reaches us is stripped before parking begins.
const PARK = "";
const PARK_TOKEN = /(\d+)/g;

/**
 * @param {{title?: string, description?: string}|null} embed
 * @param {string} [url] - the message's own link; omit for no "Roll Link" line
 * @returns {string} BBCode, or "" for an empty embed
 */
function toBBCode(embed, url) {
    const lines = [];
    if (embed && embed.title) lines.push(`[b]${embed.title}[/b]`);

    if (embed && embed.description) {
        let desc = embed.description;
        // The custom command escapes markdown in a DM's free text so Discord
        // renders it literally (commands/customRoll.js escapeMarkdown). Those
        // backslashes must not reach the forum post — but simply stripping
        // them first, which is what this did until now, handed the text back
        // to the conversions below and to the forum's own BBCode parser. A
        // degree text of "[url='http://evil']gold[/url]" came out live.
        //
        // So park every escaped character instead: parked text takes part in
        // no conversion, and it is restored only at the very end.
        const parked = [];
        // Strip any pre-existing sentinel so a crafted description cannot
        // forge one. The codec already rejects control characters in an
        // action's text, so nothing honest is lost.
        desc = desc.split(PARK).join("");
        desc = desc.replace(/\\([\\*_~`|>\[\]#-])/g, function (match, ch) {
            parked.push(ch);
            return PARK + (parked.length - 1) + PARK;
        });
        // Convert markdown links [text](url) to [url='url']text[/url]. This
        // must run before the inline-code and bold replaces below: bold first
        // would turn **(121-140)** into [b](121-140)[/b], which this regex
        // would then eat.
        desc = desc.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[url='$2']$1[/url]");
        // Inline code `...` to [icode]...[/icode]
        desc = desc.replace(/`([^`]+)`/g, "[icode]$1[/icode]");
        // Bold **...** to [b]...[/b]
        desc = desc.replace(/\*\*([^*]+)\*\*/g, "[b]$1[/b]");
        // Italic *...* to [i]...[/i]
        desc = desc.replace(/\*([^*]+)\*/g, "[i]$1[/i]");
        // Blockquote lines (> ...) to [quote]...[/quote]
        desc = desc.replace(/\n> (.+)$/gm, "\n[quote]$1[/quote]");
        // Collapse double newlines
        desc = desc.replace(/\n\n+/g, "\n");
        // Put the untrusted characters back, last of all. A bare "[" would
        // open a real tag in the forum post, so that one is wrapped in
        // XenForo's [plain], which renders its contents literally. Only "["
        // needs it: a tag cannot start without one, and the brackets the
        // conversions above produced were never parked.
        desc = desc.replace(PARK_TOKEN, function (match, index) {
            const ch = parked[Number(index)];
            return ch === "[" ? "[plain][[/plain]" : ch;
        });
        lines.push(desc.trim());
    }

    if (url) lines.push(`\n[url='${url}']Roll Link[/url]`);

    return lines.join("\n");
}

module.exports = { toBBCode };
