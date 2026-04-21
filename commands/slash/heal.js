// commands/slash/heal.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const supportHandlers = require('../handlers/support');
const { InteractionAdapter } = require('../../adapters/interactionAdapter');
const { checkPermissions } = require('../../helpers');
const { RANK_CHOICES } = require('./_choices');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('heal')
        .setDescription('Healing action (MR + WR based)')
        .addStringOption(o => o.setName('mr')
            .setDescription('Mastery Rank')
            .setRequired(true)
            .addChoices(...RANK_CHOICES))
        .addStringOption(o => o.setName('wr')
            .setDescription('Weapon Rank')
            .setRequired(true)
            .addChoices(...RANK_CHOICES))
        .addStringOption(o => o.setName('mods')
            .setDescription('Numeric modifiers, space-separated (e.g. "5 -3 2")'))
        .addStringOption(o => o.setName('comment')
            .setDescription('Flavor text + tags (Blessed, NG1, Combat Focus)')),

    async execute(interaction) {
        const adapter = new InteractionAdapter(interaction);
        if (!checkPermissions(adapter)) {
            return interaction.reply({
                content: 'This command is not allowed in this channel.',
                flags: MessageFlags.Ephemeral
            });
        }

        const mr = interaction.options.getString('mr');
        const wr = interaction.options.getString('wr');
        const mods = interaction.options.getString('mods');
        const comment = interaction.options.getString('comment');

        const args = ['heal', mr, wr];
        if (mods) args.push(...mods.trim().split(/\s+/));

        const formattedComment = comment ? `\n> *${comment}*` : '';

        await supportHandlers.handleHeal(adapter, args, formattedComment);
    }
};
