// r.js (Refactored for Discord.js v14) - Main Coordinator
const { EmbedBuilder } = require('discord.js');
const { checkPermissions, parseArguments, sendReply } = require('../helpers');
const { PREFIX } = require('./constants');
const { resolveHandler } = require('./commandHandlers');
const { runRoll } = require('./runRoll');

// Main export
module.exports = {
    name: 'r',
    aliases: ['roll'],
    description: 'Roll dice for Sphera RPG.',
    async execute(message) {
        if (!checkPermissions(message)) return;

        const { args, comment, commandText } = parseArguments(message.content);

        if (args.length === 0) {
            const helpEmbed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setTitle('Sphera Roll Commands')
                .addFields(
                    { name: 'Basic Action', value: `\`${PREFIX}r attack MR WR [mods] # comment\`` },
                    { name: 'Generic Roll', value: `\`${PREFIX}r XdY [mods] # comment\`` }
                );
            return sendReply(message, helpEmbed, '');
        }

        const commandName = args[0].toLowerCase();
        const handler = resolveHandler(commandName);

        if (!handler) {
            const unknownEmbed = new EmbedBuilder()
                .setColor('Red')
                .setTitle('Unknown Command')
                .setDescription(`The command \`${commandName}\` was not found. Use \`${PREFIX}r\` for help.`);
            return sendReply(message, unknownEmbed, comment);
        }

        await runRoll({ message, args, comment, commandText, handler });
    }
};
