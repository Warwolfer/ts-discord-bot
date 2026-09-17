// commands/bulkLines.js
//
// One pasted message can hold several roll codes, one per line. This picks out
// the lines the bot should actually run.
//
// Newlines only, never back-to-back on one line: the comment after '#' can hold
// anything the player types, including the literal text "?r", so there is no
// safe place to cut inside a single line.
//
// Its own file rather than part of r.js or helpers.js, because both of those
// require discord.js and this repo deliberately has no node_modules — anything
// `node --test` must reach has to stay clear of that import. Same reason as
// commands/embedLimits.js.

/** Escapes a string so it can sit inside a RegExp as a literal. */
function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The roll lines in a pasted message, in order.
 *
 * A line is kept only when it starts with the prefix followed by the command
 * token `r` or `roll`. Everything else — chat the player wrote around the
 * codes, a `?collect`, a blank line — is dropped silently. That is what makes
 * pasting a block of text with rolls in it work at all.
 *
 * A single roll comes back as a one-element array, so the caller needs no
 * special case for the ordinary message.
 *
 * @param {string} content  The whole message, newlines intact
 * @param {string} prefix   The bot prefix, e.g. "?"
 * @returns {string[]}
 */
function splitRollLines(content, prefix) {
    // The prefix is data, not a pattern. The default "?" is a quantifier, and
    // unescaped it would make the match silently wrong rather than merely fail.
    const re = new RegExp('^' + escapeRegExp(prefix) + '(?:r|roll)\\b', 'i');

    return String(content == null ? '' : content)
        .split('\n')
        .map(line => line.trim())
        .filter(line => re.test(line));
}

module.exports = { splitRollLines };
