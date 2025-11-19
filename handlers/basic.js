// basic.js - Basic and utility action handlers for the Sphera RPG Discord bot

const { EmbedBuilder } = require('discord.js');
const { roll, getRankData, parseModifiers, sendReply } = require('../helpers');

// --- BASIC HANDLERS ---

async function handleAttack(message, args, comment) {
    const mrData = getRankData(args[1], 'mastery');
    const wrData = getRankData(args[2], 'weapon');

    if (!mrData || !wrData) {
        const embed = new EmbedBuilder().setColor('Red').setTitle('Invalid Rank').setDescription('Please provide a valid Mastery Rank (E-S) and Weapon Rank (E-S).');
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

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setAuthor({ name: `${message.author.displayName}'s Roll`, iconURL: message.author.displayAvatarURL() })
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
    const embed = new EmbedBuilder()
        .setColor('#F1C40F') // Color Generic
        .setAuthor({ name: `${message.author.displayName}'s Action`, iconURL: message.author.displayAvatarURL() })
        .setTitle('(BA) Rush')
        .setThumbnail('https://terrarp.com/db/action/rush.png')
        .setDescription('Gain 2 extra movements this cycle.');

    if (comment) {
        embed.addFields({ name: '', value: comment });
    }

    await sendReply(message, embed, '');
}


async function handleRange(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;

  // Trigger: Extend
  const extendActive = typeof comment === 'string' && /\bextend\b/i.test(comment);

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#5f6587')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(extendActive ? 'Range (Extend)' : 'Range')
    .setThumbnail('https://terrarp.com/db/action/range.png');

  // Description
  let description = '';
  if (extendActive) {
    description += `► **Bonus Action.** You have **2** additional range this cycle (passive included).\n`;
  } else {
    description += `► ***Passive.*** You have 1 additional range.\n`;
  }

  if (comment) description += `${comment}`;

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}


module.exports = {
    handleAttack,
    handleRush,
    handleRange
};