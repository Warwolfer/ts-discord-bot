// revise/index.js
// Discord glue for the Revise Command button and its modal.

const {
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');

const store = require('./store');

const MODAL_PREFIX = 'revise_modal:';
const MAX_INPUT_LENGTH = 4000;   // Discord's paragraph text input limit

/** Replies with a note only the clicker can see. */
function ephemeral(interaction, content) {
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

/** Handles a click on the Revise Command button. */
async function onButton(interaction) {
    const record = store.get(interaction.message.id);

    if (!record) {
        return ephemeral(interaction, 'This roll can no longer be revised.');
    }
    if (record.userId !== interaction.user.id) {
        return ephemeral(interaction, 'This is not your roll.');
    }

    const input = new TextInputBuilder()
        .setCustomId('command')
        .setLabel('Command')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(record.commandText.slice(0, MAX_INPUT_LENGTH))
        .setRequired(true);

    const modal = new ModalBuilder()
        .setCustomId(`${MODAL_PREFIX}${interaction.message.id}`)
        .setTitle('Revise Command')
        .addComponents(new ActionRowBuilder().addComponents(input));

    return interaction.showModal(modal);
}

module.exports = { onButton, MODAL_PREFIX };
