// commands/runRoll.js
// One entry point for running a roll handler. Both the prefix router and the
// slash commands go through here so the roll context and the dice tape start
// in exactly one place.

const { EmbedBuilder } = require('discord.js');
const { setRollContext, clearRollContext, sendReply } = require('../helpers');
const { EMBED_COLORS } = require('./constants');

/**
 * @param {object} opts
 * @param {object} opts.message      Message or an adapter with the same surface
 * @param {string[]} opts.args
 * @param {string} opts.comment      Already formatted, e.g. "\n> *Lethal*"
 * @param {string} opts.commandText  Bare command, e.g. "attack a s 10 # Lethal"
 * @param {Function} opts.handler
 */
async function runRoll({ message, args, comment, commandText, handler }) {
    setRollContext({
        comment,
        userId: message.author.id,
        commandText
    });

    try {
        await handler(message, args, comment);
    } catch (error) {
        console.error(`Error executing ${args[0]}:`, error);
        const errorEmbed = new EmbedBuilder()
            .setColor(EMBED_COLORS.error)
            .setTitle('Error')
            .setDescription('An error occurred while executing this command.');
        await sendReply(message, errorEmbed, comment);
    } finally {
        clearRollContext();
    }
}

module.exports = { runRoll };
