// commands/slash/save.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const basicHandlers = require('../handlers/basic');
const { InteractionAdapter } = require('../../adapters/interactionAdapter');
const { checkPermissions } = require('../../helpers');

const ROLL_CHOICES = [
    { name: 'Normal', value: 'normal' },
    { name: 'Advantage', value: 'adv' },
    { name: 'Disadvantage', value: 'dis' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('save')
        .setDescription('Saving throw (1d100 + mods)')
        .addStringOption(o => o.setName('roll')
            .setDescription('Roll type (default: Normal)')
            .addChoices(...ROLL_CHOICES))
        .addStringOption(o => o.setName('mods')
            .setDescription('Numeric modifiers, space-separated (e.g. "5 -3 2")'))
        .addStringOption(o => o.setName('comment')
            .setDescription('Save type keyword (fortitude/reflex/will) + NG1')),

    async execute(interaction) {
        const adapter = new InteractionAdapter(interaction);
        if (!checkPermissions(adapter)) {
            return interaction.reply({
                content: 'This command is not allowed in this channel.',
                flags: MessageFlags.Ephemeral
            });
        }

        const roll = interaction.options.getString('roll') ?? 'normal';
        const mods = interaction.options.getString('mods');
        const comment = interaction.options.getString('comment');

        const args = ['save'];
        if (roll === 'adv' || roll === 'dis') args.push(roll);
        if (mods) args.push(...mods.trim().split(/\s+/));

        const formattedComment = comment ? `\n> *${comment}*` : '';

        await basicHandlers.handleSave(adapter, args, formattedComment);
    }
};
