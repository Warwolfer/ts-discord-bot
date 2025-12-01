// basic.js - Basic and utility action handlers for the Sphera RPG Discord bot

const { EmbedBuilder } = require('discord.js');
const { roll, getRankData, parseModifiers, sendReply, getPassiveModifiers, getDisplayName, parseTriggers, finalizeAndSend } = require('../helpers');
const { EMBED_COLORS } = require('../constants');

// Import resource files
const masteries = require('../resources/masteries');
const expertise = require('../resources/expertise');

// Break types
const BREAK_TYPES = ['construct', 'elemental', 'physical', 'order', 'dark'];

// --- HELPER FUNCTIONS ---

/**
 * Detects expertise name from comment string
 * @param {string} commentString - The comment to scan
 * @returns {string} - The expertise name found, or empty string
 */
function detectExpertiseName(commentString) {
  if (!commentString || typeof commentString !== 'string') return '';

  // Remove formatting characters
  const cleanComment = commentString.replace(/[>*_]/g, '').toLowerCase();

  // Search for expertise names (case-insensitive)
  for (const exp of expertise) {
    // Check for exact name match (case-insensitive, word boundary)
    const nameRegex = new RegExp(`\\b${exp.name.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (nameRegex.test(cleanComment)) {
      return exp.name;
    }
  }

  return '';
}

/**
 * Detects mastery name from comment string
 * @param {string} commentString - The comment to scan
 * @returns {string} - The mastery name found, or empty string
 */
function detectMasteryName(commentString) {
  if (!commentString || typeof commentString !== 'string') return '';

  // Remove formatting characters
  const cleanComment = commentString.replace(/[>*_]/g, '').toLowerCase();

  // Search for mastery names (case-insensitive)
  for (const mastery of masteries) {
    // Check for exact name match (case-insensitive, word boundary)
    const nameRegex = new RegExp(`\\b${mastery.name.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (nameRegex.test(cleanComment)) {
      return mastery.name;
    }

    // Check for alternative name if it exists
    if (mastery.alt) {
      const altRegex = new RegExp(`\\b${mastery.alt.replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (altRegex.test(cleanComment)) {
        return mastery.name;
      }
    }
  }

  return '';
}

/**
 * Detects break type from comment string
 * @param {string} commentString - The comment to scan
 * @returns {string} - The break type found, or empty string
 */
function detectBreakType(commentString) {
  if (!commentString || typeof commentString !== 'string') return '';

  // Remove formatting characters and convert to lowercase
  const cleanComment = commentString.replace(/[>*_]/g, '').toLowerCase();

  // Search for break types (case-insensitive, word boundary)
  for (const breakType of BREAK_TYPES) {
    const breakRegex = new RegExp(`\\b${breakType}\\b`, 'i');
    if (breakRegex.test(cleanComment)) {
      // Return capitalized version
      return breakType.charAt(0).toUpperCase() + breakType.slice(1);
    }
  }

  return '';
}

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

    // Detect passive ability tags
    const passiveTags = getPassiveModifiers('attack', comment);
    const passiveDisplay = passiveTags.length > 0 ? `\n${passiveTags.join(', ')}` : '';

    // Detect break type from comment
    const commentString = typeof comment === 'string' ? comment : '';
    const breakType = detectBreakType(commentString);
    const breakTypeDisplay = breakType ? ` · ${breakType}` : '';

    const displayName = getDisplayName(message);
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.offense)
        .setAuthor({ name: `${displayName}'s Roll`, iconURL: message.author.displayAvatarURL() })
        .setTitle(`Attack${breakTypeDisplay} ${critString}`)
        .setThumbnail('https://terrarp.com/db/action/attack.png')
        .addFields(
            { name: '', value: `\`${calculation}\`${passiveDisplay}` },
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


async function handleSave(message, args, comment) {
  const displayName = getDisplayName(message);

  // Parse advantage/disadvantage and bonus
  let hasAdvantage = false;
  let hasDisadvantage = false;
  let bonusIndex = 1;

  // Check if first arg is advantage/disadvantage
  if (args[1]) {
    const arg1Lower = args[1].toLowerCase();
    if (arg1Lower === 'adv' || arg1Lower === 'advantage') {
      hasAdvantage = true;
      bonusIndex = 2;
    } else if (arg1Lower === 'dis' || arg1Lower === 'disadvantage') {
      hasDisadvantage = true;
      bonusIndex = 2;
    }
  }

  // Parse bonus modifier
  const modifiers = parseModifiers(args, bonusIndex);

  // Roll dice
  let roll1 = roll(1, 100);
  let roll2 = 0;
  let rollDisplay = `1d100 (${roll1})`;

  if (hasAdvantage) {
    roll2 = roll(1, 100);
    roll1 = Math.max(roll1, roll2);
    rollDisplay = `2d100kh1 (${roll1}, ${roll2})`;
  } else if (hasDisadvantage) {
    roll2 = roll(1, 100);
    roll1 = Math.min(roll1, roll2);
    rollDisplay = `2d100kl1 (${roll1}, ${roll2})`;
  }

  // Calculate total
  const total = roll1 + modifiers.total;

  // Build calculation string
  const calculation = `${rollDisplay}${modifiers.display}`;

  // Parse save type from comment
  const commentString = typeof comment === 'string' ? comment : '';
  let saveType = 'Save';
  if (/\bfortitude\b/i.test(commentString)) {
    saveType = 'Fortitude Save';
  } else if (/\breflex\b/i.test(commentString)) {
    saveType = 'Reflex Save';
  } else if (/\bwill\b/i.test(commentString)) {
    saveType = 'Will Save';
  }

  // Embed
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.utility)
    .setAuthor({ name: `${displayName}'s Roll`, iconURL: message.author.displayAvatarURL() })
    .setTitle(saveType)
    .setDescription(`\`${calculation}\`\n\n**Total: ${total}**`);

  if (comment) {
    const currentDescription = embed.data.description || '';
    embed.setDescription(currentDescription + comment);
  }

  embed.setDescription((embed.data.description || '') + ` · *[Roll Link](${message.url})*`);

  return sendReply(message, embed);
}


async function handleExpertise(message, args, comment) {
  const displayName = getDisplayName(message);

  // Parse advantage/disadvantage and rank
  let hasAdvantage = false;
  let hasDisadvantage = false;
  let rankIndex = 1;

  // Check if first arg is advantage/disadvantage
  if (args[1]) {
    const arg1Lower = args[1].toLowerCase();
    if (arg1Lower === 'adv' || arg1Lower === 'advantage') {
      hasAdvantage = true;
      rankIndex = 2;
    } else if (arg1Lower === 'dis' || arg1Lower === 'disadvantage') {
      hasDisadvantage = true;
      rankIndex = 2;
    }
  }

  // Get rank data
  const mrData = getRankData(args[rankIndex], 'mastery');
  if (!mrData) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.error)
      .setTitle('Invalid Rank')
      .setDescription('Please provide a valid Mastery Rank (E-S).');
    return sendReply(message, embed, '');
  }

  // Parse additional modifiers (if any)
  const modifiers = parseModifiers(args, rankIndex + 1);

  // Roll dice
  let roll1 = roll(1, 100);
  let roll2 = 0;
  let rollDisplay = `1d100 (${roll1})`;

  if (hasAdvantage) {
    roll2 = roll(1, 100);
    roll1 = Math.max(roll1, roll2);
    rollDisplay = `2d100kh1 (${roll1}, ${roll2})`;
  } else if (hasDisadvantage) {
    roll2 = roll(1, 100);
    roll1 = Math.min(roll1, roll2);
    rollDisplay = `2d100kl1 (${roll1}, ${roll2})`;
  }

  // Calculate total
  const total = roll1 + mrData.value + modifiers.total;

  // Build calculation string
  const calculation = `${rollDisplay} + ${mrData.value} (MR-${mrData.rank})${modifiers.display}`;

  // Detect expertise name from comment
  const commentString = typeof comment === 'string' ? comment : '';
  const expertiseName = detectExpertiseName(commentString);
  const titleSuffix = expertiseName ? ` - ${expertiseName}` : '';

  // Embed
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.utility)
    .setAuthor({ name: `${displayName}'s Roll`, iconURL: message.author.displayAvatarURL() })
    .setTitle(`Expertise Check${titleSuffix}`)
    .setDescription(`\`${calculation}\`\n\n**Total: ${total}**`);

  if (comment) {
    const currentDescription = embed.data.description || '';
    embed.setDescription(currentDescription + comment);
  }

  embed.setDescription((embed.data.description || '') + ` · *[Roll Link](${message.url})*`);

  return sendReply(message, embed);
}


async function handleMastery(message, args, comment) {
  const displayName = getDisplayName(message);

  // Parse advantage/disadvantage and rank
  let hasAdvantage = false;
  let hasDisadvantage = false;
  let rankIndex = 1;

  // Check if first arg is advantage/disadvantage
  if (args[1]) {
    const arg1Lower = args[1].toLowerCase();
    if (arg1Lower === 'adv' || arg1Lower === 'advantage') {
      hasAdvantage = true;
      rankIndex = 2;
    } else if (arg1Lower === 'dis' || arg1Lower === 'disadvantage') {
      hasDisadvantage = true;
      rankIndex = 2;
    }
  }

  // Get rank data
  const mrData = getRankData(args[rankIndex], 'mastery');
  if (!mrData) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.error)
      .setTitle('Invalid Rank')
      .setDescription('Please provide a valid Mastery Rank (E-S).');
    return sendReply(message, embed, '');
  }

  // Parse additional modifiers (if any)
  const modifiers = parseModifiers(args, rankIndex + 1);

  // Roll dice
  let roll1 = roll(1, 100);
  let roll2 = 0;
  let rollDisplay = `1d100 (${roll1})`;

  if (hasAdvantage) {
    roll2 = roll(1, 100);
    roll1 = Math.max(roll1, roll2);
    rollDisplay = `2d100kh1 (${roll1}, ${roll2})`;
  } else if (hasDisadvantage) {
    roll2 = roll(1, 100);
    roll1 = Math.min(roll1, roll2);
    rollDisplay = `2d100kl1 (${roll1}, ${roll2})`;
  }

  // Calculate total
  const total = roll1 + mrData.value + modifiers.total;

  // Build calculation string
  const calculation = `${rollDisplay} + ${mrData.value} (MR-${mrData.rank})${modifiers.display}`;

  // Detect mastery name and break type from comment
  const commentString = typeof comment === 'string' ? comment : '';
  const masteryName = detectMasteryName(commentString);
  const breakType = detectBreakType(commentString);

  // Build title suffix with mastery name and break type
  let titleSuffix = '';
  if (masteryName && breakType) {
    titleSuffix = ` - ${masteryName} · ${breakType}`;
  } else if (masteryName) {
    titleSuffix = ` - ${masteryName}`;
  } else if (breakType) {
    titleSuffix = ` · ${breakType}`;
  }

  // Embed
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.utility)
    .setAuthor({ name: `${displayName}'s Roll`, iconURL: message.author.displayAvatarURL() })
    .setTitle(`Mastery Check${titleSuffix}`)
    .setDescription(`\`${calculation}\`\n\n**Total: ${total}**`);

  if (comment) {
    const currentDescription = embed.data.description || '';
    embed.setDescription(currentDescription + comment);
  }

  embed.setDescription((embed.data.description || '') + ` · *[Roll Link](${message.url})*`);

  return sendReply(message, embed);
}


module.exports = {
    handleAttack,
    handleRush,
    handleRange,
    handleSave,
    handleExpertise,
    handleMastery
};
