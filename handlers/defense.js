const { EmbedBuilder } = require('discord.js');
const { roll, getRankData, parseModifiers, sendReply, getPassiveModifiers, getDisplayName, parseNGTrigger, finalizeAndSend } = require('../helpers');
const { RANK_DATA, EMBED_COLORS } = require('../constants');

// Defense Action MA Protect
async function handleProtect(message, args, comment) {
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

    const calculation = `1d100 (${roll1}) + ${mrData.value} (MR⋅${mrData.rank}) + ${wrData.value} (WR⋅${wrData.rank})${modifiers.display}`;

    const embed = new EmbedBuilder()
        .setColor('#d78747') // Defense Color alt=d77e37
        .setAuthor({ name: `${message.author.displayName}'s Roll`, iconURL: message.author.displayAvatarURL() })
        .setTitle(`Protect ${critString}`)
        .setThumbnail('https://terrarp.com/db/action/protect.png')
        .addFields(
            { name: '', value: `***Action.*** Make an attack and grant yourself or an ally within range the Protected State.` },
            { name: '', value: `\`${calculation}\`` },
            { name: '', value: `**${total} damage**` }
        );

    if (comment) {
        embed.addFields({ name: '', value: comment });
    }

    sendReply(message, embed, '');
}

// Defense Action MA Counter
async function handleCounter(message, args, comment) {
    const mrData = getRankData(args[1], 'mastery');
    const wrData = getRankData(args[2], 'weapon');

    if (!mrData || !wrData) {
        const embed = new EmbedBuilder().setColor(EMBED_COLORS.error).setTitle('Invalid Rank').setDescription('Please provide a valid Mastery Rank (E-S) and Weapon Rank (E-S).');
        return sendReply(message, embed, '');
    }

    const modifiers = parseModifiers(args, 3);

    // Parse NG trigger
    const ng = parseNGTrigger(comment);
    const ngBonus = ng.bonus;
    const ngNote = ng.note;

    const roll1 = roll(1, 100);
    let total = roll1 + mrData.value + wrData.value + modifiers.total + ngBonus;
    let critString = "";

    if (roll1 === 100) {
        total *= 2;
        critString = " (Crit!)";
    } else if (roll1 === 1) {
        critString = " (Critical Failure...)";
    }

    // --- Mitigation logic ---
    let mitigation = 0;
    switch (mrData.rank) {
        case 'D':
            mitigation = '10 (D)';
            break;
        case 'C':
            mitigation = '15 (C)';
            break;
        case 'B':
            mitigation = '20 (B)';
            break;
        case 'A':
            mitigation = '25 (A)';
            break;
        case 'S':
            mitigation = '30 (S)';
            break;
        default:
            mitigation = '0 (E)'; // Or adjust as needed
    }

    const parts = [
        `1d100 (${roll1})`,
        `${mrData.value} (MR⋅${mrData.rank})`,
        `${wrData.value} (WR⋅${wrData.rank})`
    ];
    if (modifiers.total !== 0) parts.push(`${modifiers.total} (mods)`);
    if (ngBonus > 0) parts.push(`${ngBonus} (NG⋅1)`);

    const calculation = parts.join(' + ');

    // Detect passive ability tags
    const passiveTags = getPassiveModifiers('attack', comment);
    const passiveDisplay = passiveTags.length > 0 ? `\n${passiveTags.join(', ')}` : '';

    const displayName = getDisplayName(message);
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.defense)
        .setAuthor({ name: `${displayName}'s Roll`, iconURL: message.author.displayAvatarURL() })
        .setTitle(`Counter ${critString}`)
        .setThumbnail('https://terrarp.com/db/action/counter.png')
        .addFields(
            { name: '', value: `***Action.*** Make an attack and distribute **${mitigation}** mitigation between and up to 3 targets in multiples of 5s.` },
            { name: '', value: `\`${calculation}\`${passiveDisplay}${ngNote ? `\n${ngNote}` : ''}` },
            { name: '', value: `**${total} damage**` }
        );

    if (comment) {
        embed.addFields({ name: '', value: comment });
    }

    sendReply(message, embed, '');
}

// Defense Action SA UltraCounter
async function handleUltraCounter(message, args, comment) {
    const mrData = getRankData(args[1], 'mastery');
    const wrData = getRankData(args[2], 'weapon');

    if (!mrData || !wrData) {
        const embed = new EmbedBuilder()
            .setColor('Red')
            .setTitle('Invalid Rank')
            .setDescription('Check your Mastery and Weapon rank inputs.');
        return sendReply(message, embed, comment);
    }

    const modifiers = parseModifiers(args, 3);

    // NG trigger (only NG1 enabled)
    let ngBonus = 0;
    let ngNote = '';
    if (typeof comment === 'string') {
        const m = comment.match(/\bng(\d+)\b/i);
        if (m) {
            const level = parseInt(m[1], 10);
            if (level === 1) {
                ngBonus = 5;
            } else {
                ngNote = `► NG⋅${level} is currently disabled.`;
            }
        }
    }

    const roll1 = roll(1, 100);

    // New rank-based thresholds: 35 (D), 30 (B), 25 (S)
    const mrRank = mrData.rank.toLowerCase();
    const COUNTER_THRESHOLDS = { e: 40, d: 35, c: 30, b: 30, a: 25, s: 25 };
    const threshold = COUNTER_THRESHOLDS[mrRank] ?? 30;

    // Success check
    const success = roll1 >= threshold;

    // On success, use the MR rank's counterDMG; on failure, 0
    const counterDmg = success ? mrData.counterDMG : 0;

    // Melee toggle via comment
    const meleeActive = typeof comment === 'string' && /\bmelee\b/i.test(comment);
    const meleeBonus = meleeActive ? 30 : 0;

    // Check if we should show mods
    const hasMods = /\d/.test(modifiers.display);

    // Base total
    const baseTotal = roll1 + counterDmg + mrData.value + wrData.value + modifiers.total + meleeBonus + ngBonus;

    // Crit handling
    let total = baseTotal;
    let critString = "";
    if (roll1 === 100) {
        total *= 2;
        critString = " (Crit!)";
    } else if (roll1 === 1) {
        critString = " (Critical Failure...)";
    }

    // Clean the modifiers string so it doesn't start with "+"
    const rawMods = (modifiers.display ?? '').toString();
    const modsClean = rawMods
      .replace(/^\s*\+\s*/, '')   // remove one leading "+", if present
      .trim();                    // trim stray spaces

    // Calculation string
    const parts = [
      `1d100 (${roll1})`,
      `${counterDmg} (ctr dmg)`,
      `${mrData.value} (MR⋅${mrData.rank})`,
      `${wrData.value} (WR⋅${wrData.rank})`,
    ];

    if (meleeActive) parts.push(`${meleeBonus} (melee)`);

    // Only push if there are numeric mods and the cleaned string isn't empty
    if (hasMods && modsClean.length > 0) {
      parts.push(`${modsClean} (mods)`);
    }

    if (ngBonus > 0) parts.push(`${ngBonus} (NG⋅1)`);

    const calculation = parts.join(' + ');

    // Detect passive ability tags
    const passiveTags = getPassiveModifiers('attack', comment);
    const passiveDisplay = passiveTags.length > 0 ? `${passiveTags.join(', ')}\n` : '';

    // Messages
    const counterComment = success
        ? `► Successful counter on ${threshold}+! ${mrData.counterDMG} damage added. Vulnerability negated.`
        : `► Failed counter (need ${threshold}+). 0 damage added. You are vulnerable.`;

    const meleeNote = meleeActive
        ? `► Melee triggered. 30 damage added.`
        : `► Melee not triggered. If you are adjacent to or are on the target's space, manually add 30 damage.`;

    const displayName = message.member?.displayName ?? message.author.username;

    const embed = new EmbedBuilder()
        .setColor('#E67E22')
        .setAuthor({ name: `${displayName}'s Special Action`, iconURL: message.author.displayAvatarURL() })
        .setTitle(`Ultra Counter ${critString}`)
        .setThumbnail('https://terrarp.com/db/action/ucounter.png')
        let description = `\`${calculation}\`\n${passiveDisplay}\n**${total} damage**\n\n${counterComment}\n${meleeNote}\n${ngNote ? `${ngNote}\n` : ''}`;
        if (comment){
          description += `${comment}`;
          }

        description += ` · *[Roll Link](${message.url})*`;

        embed.setDescription(description);

    return sendReply(message, embed);
}
async function handleUltraProtect(message, args, comment) {
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

    const calculation = `1d100 (${roll1}) + ${mrData.value} (MR⋅${mrData.rank}) + ${wrData.value} (WR⋅${wrData.rank})${modifiers.display}`;

    const embed = new EmbedBuilder()
        .setColor('#da6c41')
        .setAuthor({ name: `${message.author.displayName}'s Roll`, iconURL: message.author.displayAvatarURL() })
        .setTitle(`Ultra Protect ${critString}`)
        .setThumbnail('https://terrarp.com/db/action/uprotect.png')
        .addFields(
            { name: '', value: `***Special Action.*** Make an attack and grant up to 3 allies within range the Protected State. You are *Vulnerable*.` },
            { name: '', value: `\`${calculation}\`` },
            { name: '', value: `**${total} damage**` }
        );

    if (comment) {
        embed.addFields({ name: '', value: comment });
    }

    sendReply(message, embed, '');
}
async function handleTorment(message, args, comment) {
    const mrData = getRankData(args[1], 'mastery');
    if (!mrData) {
        const embed = new EmbedBuilder()
            .setColor('Red')
            .setTitle('Invalid Rank')
            .setDescription('Check your Mastery rank input.');
        return sendReply(message, embed, comment);
    }

    // Torment damage by MR rank
    const TORMENT_DMG = { e: 0, d: 5, c: 10, b: 15, a: 20, s: 25 };
    const mrRank = (mrData.rank ?? String(args[1] ?? '')).toLowerCase();
    const baseTorment = TORMENT_DMG[mrRank] ?? 0;

    // Bonus action toggles from the comment
    const ultraActive  = typeof comment === 'string' && /\bultra\b/i.test(comment);
    const radialActive = typeof comment === 'string' && /\bradial\b/i.test(comment);

    // Enforce: only one bonus action per go (prefer Ultra if both found)
    let appliedMode = null;
    let modeNote = '';
    if (ultraActive && radialActive) {
        appliedMode = 'Ultra Torment';
        modeNote = 'Illegal! Defaulting to Ultra.';
    } else if (ultraActive) {
        appliedMode = 'Ultra Torment';
    } else if (radialActive) {
        appliedMode = 'Radial Torment';
    }

    // Damage: Ultra doubles ONLY the Torment portion
    const ultraBonus = (appliedMode === 'Ultra Torment') ? baseTorment : 0;
    const totalDamage = baseTorment + ultraBonus;

    // Target text changes if Radial Torment is active
    const targetText = (appliedMode === 'Radial Torment')
      ? 'to all adjacent enemies.'
      : 'to 1 adjacent enemy.';

    // Action type changes if Ultra or Radial Torment is active
    const actionType = (appliedMode === 'Ultra Torment' || appliedMode === 'Radial Torment')
      ? '**Bonus Action.**'
      : '**Free Action.**';

    // Calculation string
    const parts = [
      `${baseTorment} (MR⋅${mrRank.toUpperCase()})`
    ];
    if (ultraBonus) parts.push(`${ultraBonus} (Ultra x2)`);
    const calculation = parts.join(' + ');

    // Embed
    const displayName = message.member?.displayName ?? message.author.username;
    const titleText = appliedMode || 'Torment'; // if not bonus mode, defaults to Torment
    const embed = new EmbedBuilder()
      .setColor('#5f6587')
      .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
      .setTitle(titleText)
      .setThumbnail('https://terrarp.com/db/action/torment.png');

    let description =
      `${actionType} Deal **${totalDamage} damage** ${targetText}\n` +
      (appliedMode === 'Ultra Torment' ? `\n► Ultra Torment activated. Torment damage doubled.\n` : '') +
      (appliedMode === 'Radial Torment' ? `\n► Radial Torment activated. All adjacent/melee enemies (battle map or narrative) take torment damage.\n` : '') +
      (modeNote ? `► ${modeNote}\n` : '');

    if (comment) description += `${comment}`;

    description += ` · *[Roll Link](${message.url})*`;

    embed.setDescription(description);
    return sendReply(message, embed);
}
async function handleCover(message, args, comment) {
  // Parse mode from the comment
  const partialActive = typeof comment === 'string' && /\bpartial\s*cover\b/i.test(comment);
  const fullActive    = typeof comment === 'string' && /\bfull\s*cover\b/i.test(comment);

  // Enforce: only one bonus action (prefer Full if both found)
  let appliedMode = null; // 'Partial' | 'Full' | null
  let modeNote = '';
  if (partialActive && fullActive) {
    appliedMode = 'Full';
    modeNote = 'Illegal! Defaulting to Full.';
  } else if (fullActive) {
    appliedMode = 'Full';
  } else if (partialActive) {
    appliedMode = 'Partial';
  }

  // Error if neither chosen
  if (!appliedMode) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Cover')
      .setDescription('You must specify either **Partial Cover** or **Full Cover** in your comment.');
    return sendReply(message, embed, comment);
  }

  // Action type is always Bonus for Cover
  const actionType = '**Bonus Action.**';

  // Title text: Cover (Partial) / Cover (Full)
  const titleText = `Cover (${appliedMode})`;

  // Rules text per mode
  const ruleText =
    appliedMode === 'Full'
      ? 'Take the full damage dealt to your target after modifiers the next time they take damage.'
      : 'Take half of the damage dealt to your target after modifiers the next time they take damage. Your target takes half.';

  // Embed
  const displayName = message.member?.displayName ?? message.author.username;
  const embed = new EmbedBuilder()
    .setColor('#5f6587')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(titleText)
    .setThumbnail('https://terrarp.com/db/action/dba.png');

  let description =
    `${actionType} ${ruleText}\n` +
    (modeNote ? `► ${modeNote}\n` : '');

  if (comment) description += `${comment}`;

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}
async function handleTaunt(message, args, comment) {
  // Try to read MR rank, but don't error if it's missing
  const mrData = getRankData?.(args?.[1], 'mastery');
  const rankRaw = (mrData && mrData.rank) || (typeof args?.[1] === 'string' ? args[1] : '');
  const rankLabel = rankRaw ? `(${String(rankRaw).toUpperCase()}-rank mastery)` : '';

  // Embed
  const displayName = message.member?.displayName ?? message.author.username;
  const embed = new EmbedBuilder()
    .setColor('#5f6587')
    .setAuthor({ name: `${displayName}'s Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Taunt')
    .setThumbnail('https://terrarp.com/db/action/dba.png');

  let description =
    `**Free Action.** When you perform an attack action on an enemy, taunt that enemy ${rankLabel}.\n`;

  if (comment) description += `${comment}`;

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

async function handleSturdy(message, args, comment) {
  const displayName = getDisplayName(message);

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.error)
      .setTitle('Invalid Rank')
      .setDescription('**Sturdy** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Define HP bonus: 25 + 5 per MR (D=30, C=35, B=40, A=45, S=50), max +50
  const STURDY_HP = { d: 30, c: 35, b: 40, a: 45, s: 50 };
  const hpBonus = STURDY_HP[mrRank] ?? 0;

  // Embed
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.supportPassive)
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Sturdy')
    .setThumbnail('https://terrarp.com/db/action/sturdy.png');

  const description = `► **Passive.** Gain **+${hpBonus} HP** maximum (MR⋅${mrRankUp}), capped at **+50 HP**.\n`;

  return finalizeAndSend(message, embed, description, comment);
}


module.exports = {
    handleProtect,
    handleCounter,
    handleUltraCounter,
    handleUltraProtect,
    handleTorment,
    handleCover,
    handleTaunt,
    handleSturdy
};
