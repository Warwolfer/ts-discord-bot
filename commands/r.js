// r.js (Refactored for Discord.js v14) - Main Coordinator
const { EmbedBuilder } = require('discord.js');
const { checkPermissions, parseArguments, sendReply } = require('../helpers');
const { PREFIX, REPLY_DELETE_TIMEOUT } = require('./constants');
const { resolveHandler } = require('./commandHandlers');
const { runRoll } = require('./runRoll');
const { splitRollLines } = require('./bulkLines');

/**
 * One roll, from one line of text.
 *
 * Takes the content rather than reading message.content, so a bulk paste can
 * feed it one line at a time while every reply still attaches to the player's
 * original message.
 */
async function runOne(message, content) {
    const { args, comment, commandText } = parseArguments(content);

    if (args.length === 0) {
        const helpEmbed = new EmbedBuilder()
            .setColor('#FEE75C')
            .setTitle('Sphera Roll Commands')
            .addFields(
                { name: 'Basic Action', value: `\`${PREFIX}r attack MR WR [mods] # comment\`` },
                { name: 'Generic Roll', value: `\`${PREFIX}r XdY [mods] # comment\`` }
            );
        return sendReply(message, helpEmbed, '', { skipRevise: true });
    }

    const commandName = args[0].toLowerCase();
    const handler = resolveHandler(commandName);

    if (!handler) {
        const unknownEmbed = new EmbedBuilder()
            .setColor('Red')
            .setTitle('Unknown Command')
            .setDescription(`The command \`${commandName}\` was not found. Use \`${PREFIX}r\` for help.`);
        return sendReply(message, unknownEmbed, comment, { skipRevise: true });
    }

    await runRoll({ message, args, comment, commandText, handler });
}

// Main export
module.exports = {
    name: 'r',
    aliases: ['roll'],
    description: 'Roll dice for Sphera RPG.',
    async execute(message) {
        if (!checkPermissions(message)) return;

        // Every line is in the same channel, so the permission check above is
        // the only one needed for the whole paste.
        const lines = splitRollLines(message.content, PREFIX);

        // The ordinary single roll, byte for byte what it was before bulk.
        if (lines.length <= 1) {
            await runOne(message, message.content);
            return;
        }

        // Sequential on purpose. helpers.js holds currentTape at module level,
        // so no handler may await between its roll() calls; each roll here has
        // to fully set, roll, send and clear before the next one starts. It is
        // also what makes the replies land in queue order, which is what
        // /collect reads.
        //
        // suppressDelete stops every reply from scheduling its own delete of
        // the paste. The first one would fire five seconds in, and every roll
        // still running after that would be replying to a message Discord had
        // already removed. The paste is deleted once, below, when the last roll
        // has posted.
        //
        // Set once and never cleared. This message object is this paste's, and
        // it is thrown away when the run ends, so there is nothing to restore.
        // Clearing it would only open a window: sendReply reads the flag after
        // its own network round trip, so any handler that forgot to return its
        // sendReply promise would read a flag we had already put back.
        message.suppressDelete = true;
        for (const line of lines) {
            await runOne(message, line);
        }

        setTimeout(() => {
            message.delete().catch(() => {
                // Already gone (deleted by a moderator, say). Nothing to do.
            });
        }, REPLY_DELETE_TIMEOUT);
    }
};
