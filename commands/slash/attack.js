// commands/slash/attack.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const basicHandlers = require('../handlers/basic');
const { InteractionAdapter } = require('../../adapters/interactionAdapter');
const { checkPermissions } = require('../../helpers');
const { RANK_CHOICES } = require('./_choices');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('attack')
        .setDescription('Standard attack roll (1d100 + MR + WR + mods)')
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
            .setDescription('Flavor text + tags (Lethal, NG1, Combat Focus, break type)')),

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

        const args = ['attack', mr, wr];
        if (mods) args.push(...mods.trim().split(/\s+/));

        const formattedComment = comment ? `\n> *${comment}*` : '';

        await basicHandlers.handleAttack(adapter, args, formattedComment);
    }
};
