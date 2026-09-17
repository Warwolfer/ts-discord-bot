// commands/embedLimits.js
//
// Discord refuses an embed whose description is over 4096 characters, and the
// refusal comes back from message.reply as a thrown error — which runRoll
// catches and turns into a generic "an error occurred" embed. The dice are
// already rolled by then, so the player loses the roll outright.
//
// A normal account cannot reach the limit: the whole command has to fit in 2000
// characters, and the worst encodable custom action renders 1606, which leaves
// the total around 3.4k. With Nitro a message can be 4000 characters, so a long
// enough comment does push it over. Every handler appends its comment the same
// way, so the guard belongs here rather than in any one of them.
//
// Its own file, not helpers.js, because helpers.js requires discord.js and this
// repo deliberately has no node_modules — anything importable by `node --test`
// has to stay clear of that import.

const EMBED_DESCRIPTION_LIMIT = 4096;
const TRIM_NOTE = "\n… (trimmed to fit)";

/**
 * Trims an embed's description to something Discord will accept.
 *
 * Trimmed from the end, because the end is the comment the player typed and the
 * start is the dice they actually need.
 *
 * @param {{data: {description?: string}, setDescription: Function}} embed
 */
function clampDescription(embed) {
    const text = (embed && embed.data && embed.data.description) || "";
    if (text.length <= EMBED_DESCRIPTION_LIMIT) return;
    embed.setDescription(
        text.slice(0, EMBED_DESCRIPTION_LIMIT - TRIM_NOTE.length) + TRIM_NOTE
    );
}

module.exports = { clampDescription, EMBED_DESCRIPTION_LIMIT, TRIM_NOTE };
