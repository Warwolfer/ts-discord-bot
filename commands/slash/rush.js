// commands/slash/rush.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const basicHandlers = require('../handlers/basic');
const { InteractionAdapter } = require('../../adapters/interactionAdapter');
const { checkPermissions } = require('../../helpers');
const { runRoll } = require('../runRoll');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rush')
        .setDescription('Bonus Action: Rush — gain 2 extra movements this cycle'),

    async execute(interaction) {
        const adapter = new InteractionAdapter(interaction);
        if (!checkPermissions(adapter)) {
            return interaction.reply({
                content: 'This command is not allowed in this channel.',
                flags: MessageFlags.Ephemeral
            });
        }
        await runRoll({
            message: adapter,
            args: ['rush'],
            comment: '',
            commandText: 'rush',
            handler: basicHandlers.handleRush
        });
    }
};
