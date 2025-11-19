// basic.js - Basic and utility action handlers for the Sphera RPG Discord bot

const { EmbedBuilder } = require('discord.js');
const { roll, getRankData, parseModifiers, sendReply, getDisplayName, parseTriggers, finalizeAndSend } = require('../helpers');
const { EMBED_COLORS } = require('../constants');

// --- BASIC HANDLERS ---

async function handleAttack(message, args, comment) {
    const mrData = getRankData(args[1], 'mastery');
    const wrData = getRankData(args[2], 'weapon');

    if (!mrData || !wrData) {
        const embed = new EmbedBuilder().setColor(EMBED_COLORS.error).setTitle('Invalid Rank').setDescription('Please provide a valid Mastery Rank (E-S) and Weapon Rank (E-S).');
        return sendReply(message, embed, '');
    }

    const modifiers = parseModifiers(args, 3);
    const roll1 = roll(1, 100);
    let total = roll1 + mrData.value + wrData.value + modifiers.total;
    let critString = "";

    if (roll1 === 100) {
        total *= 2;
        critString = " (Crit!)";
    } else if (roll1 === 1) {
        critString = " (Critical Failure...)";
    }

    const calculation = `1d100 (${roll1}) + ${mrData.value} (MR-${mrData.rank}) + ${wrData.value} (WR-${wrData.rank})${modifiers.display}`;

    const displayName = getDisplayName(message);
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.offense)
        .setAuthor({ name: `${displayName}'s Roll`, iconURL: message.author.displayAvatarURL() })
        .setTitle(`Attack ${critString}`)
        .setThumbnail('https://terrarp.com/db/action/attack.png')
        .addFields(
            { name: '', value: `\`${calculation}\`` },
            { name: '', value: `**${total} damage**` }
        );

    if (comment) {
        embed.addFields({ name: '', value: comment });
    }

    sendReply(message, embed, '');
}


async function handleRush(message, args, comment) {
    const displayName = getDisplayName(message);
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.utility)
        .setAuthor({ name: `${displayName}'s Action`, iconURL: message.author.displayAvatarURL() })
        .setTitle('(BA) Rush')
        .setThumbnail('https://terrarp.com/db/action/rush.png')
        .setDescription('Gain 2 extra movements this cycle.');

    if (comment) {
        embed.addFields({ name: '', value: comment });
    }

    await sendReply(message, embed, '');
}


async function handleRange(message, args, comment) {
  const displayName = getDisplayName(message);

  // Parse triggers
  const triggers = parseTriggers(comment, {
    extend: /\bextend\b/i
  });

  // Embed
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.utility)
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(triggers.extend ? 'Range (Extend)' : 'Range')
    .setThumbnail('https://terrarp.com/db/action/range.png');

  // Description
  let description = '';
  if (triggers.extend) {
    description += `► **Bonus Action.** You have **2** additional range this cycle (passive included).\n`;
  } else {
    description += `► ***Passive.*** You have 1 additional range.\n`;
  }

  return finalizeAndSend(message, embed, description, comment);
}


module.exports = {
    handleAttack,
    handleRush,
    handleRange
};