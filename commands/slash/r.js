// commands/slash/r.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const genericHandlers = require('../handlers/generic');
const { InteractionAdapter } = require('../../adapters/interactionAdapter');
const { checkPermissions } = require('../../helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('r')
        .setDescription('Generic dice roll: XdY, XdYkhN (keep highest), XdYklN (keep lowest)')
        .addStringOption(o => o.setName('dice')
            .setDescription('Dice notation: 1d20, 2d6, 2d20kh1, 4d6kl1')
            .setRequired(true))
        .addStringOption(o => o.setName('mods')
            .setDescription('Numeric modifiers, space-separated (e.g. "5 -3 2")'))
        .addStringOption(o => o.setName('comment')
            .setDescription('Flavor text or tags')),

    async execute(interaction) {
        const adapter = new InteractionAdapter(interaction);
        if (!checkPermissions(adapter)) {
            return interaction.reply({
                content: 'This command is not allowed in this channel.',
                flags: MessageFlags.Ephemeral
            });
        }

        const dice = interaction.options.getString('dice');
        const mods = interaction.options.getString('mods');
        const comment = interaction.options.getString('comment');

        // handleGenericRoll reads args[0] as the dice notation itself
        // (the prefix router does not prepend 'r' for generic rolls).
        const args = [dice];
        if (mods) args.push(...mods.trim().split(/\s+/));

        const formattedComment = comment ? `\n> *${comment}*` : '';

        await genericHandlers.handleGenericRoll(adapter, args, formattedComment);
    }
};
