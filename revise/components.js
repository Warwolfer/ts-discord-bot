// revise/components.js
// The action row that rides along with every roll embed.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function buildRollButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('copy_result')
            .setLabel('Copy Result')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('revise_command')
            .setLabel('Revise Command')
            .setStyle(ButtonStyle.Secondary)
    );
}

/** For messages that are not rolls and can never be revised. */
function buildCopyOnlyButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('copy_result')
            .setLabel('Copy Result')
            .setStyle(ButtonStyle.Secondary)
    );
}

module.exports = { buildRollButtons, buildCopyOnlyButtons };
