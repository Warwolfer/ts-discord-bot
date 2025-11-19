const { EmbedBuilder } = require('discord.js');
const { roll, getRankData, parseModifiers, sendReply } = require('../helpers');

// Alter Sub-Action: Defile (replaces Overdrive/Rage/Exchange) — Free Action to mark targets; Bonus Action "Vilify" to add 1d20 per target.
// Rolls: Yes (1d20 per target). NG1: No. Crit: No.
// Minimum Rank: C
// Comment Triggers: "Vilify" activates Vilify mode (Bonus Action), "Enemy" for enemy targeting context

async function handleDefile(message, args, comment) {
  const mrData = getRankData(args[1], 'mastery');
  if (!mrData) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery rank input.');
    return sendReply(message, embed, comment);
  }

  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Rank parsing
  const mrRankRaw = (mrData.rank ?? String(args[1] ?? '')).toString();
  const mrRank = mrRankRaw.toLowerCase();
  const mrRankUp = mrRankRaw.toUpperCase();

  // Rank validation: minimum C
  const restrictedRanks = ['e', 'd'];
  if (restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Unavailable MR Rank')
      .setDescription('**Defile** is available at **MR=C+** only.');
    return sendReply(message, embed, comment);
  }

  // Triggers
  const enemyActive = /\benemy\b/i.test(commentString);
  const vilifyActive = /\bvilify\b/i.test(commentString);

  // Number of targets by rank
  const TARGETS_BY_RANK = { c: 2, b: 3, a: 3, s: 4 };
  const numTargets = TARGETS_BY_RANK[mrRank] ?? 2;

  // Vilify targets by rank (C: 1, A+: 2)
  const VILIFY_TARGETS = { c: 1, b: 1, a: 2, s: 2 };
  const vilifyTargets = VILIFY_TARGETS[mrRank] ?? 1;

  // Embed setup
  const embed = new EmbedBuilder()
    .setColor('#6845a2')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setThumbnail('https://terrarp.com/db/action/defile.png');

  let description = '';
  let calculation = '';

  if (vilifyActive) {
    // Vilify mode (Bonus Action)
    embed.setTitle('**(Alter) Defile**');

    // Roll 1d20 per Vilify target
    const rolls = [];
    for (let i = 0; i < vilifyTargets; i++) {
      rolls.push(roll(1, 20));
    }
    const totalRoll = rolls.reduce((a, b) => a + b, 0);
    calculation = vilifyTargets > 1 ? `${vilifyTargets}d20 (${rolls.join(', ')})` : `1d20 (${rolls[0]})`;

    description += `\`${calculation}\`\n\n`;
    description += `► **Bonus Action: Vilify.** Add **${totalRoll}** (1d20) to **${vilifyTargets}** (MR⋅${mrRankUp}) already-marked target${vilifyTargets > 1 ? 's' : ''}`;

    // HP loss for second charge at A+
    if (vilifyTargets >= 2) {
      description += `. Lose **20 HP** when applying the second Vilify charge`;
    }
    description += `.\n`;

  } else {
    // Normal mode (Free Action)
    embed.setTitle('**(Alter) Defile**');

    // Roll 1d20 per mark (assuming 1 mark per target for display)
    const rolls = [];
    for (let i = 0; i < numTargets; i++) {
      rolls.push(roll(1, 20));
    }
    const totalRoll = rolls.reduce((a, b) => a + b, 0);
    calculation = `${numTargets}d20 (${rolls.join(', ')})`;

    description += `\`${calculation}\`\n\n`;
    description += `► **Free Action.** Mark **${numTargets} targets** (MR⋅${mrRankUp}) (self, allies, enemies); you may stack the marks on a single target. From now until the end of the next damage cycle, lose your total rolled result **${totalRoll}** to all Saves to obtain the following effects:\n\n`;

    if (enemyActive) {
      description += `◦ **Enemy:** Deal an instance of **1d20 HP or break damage with advantage** per mark.\n`;
    } else {
      description += `◦ **Self & Allies:** The target gains an additional **X (1d20 per mark)** to an attack, buff, or heal.\n`;
    }
  }

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Alter Sub-Action: Vitiate (replaces Wager Future) — Break damage with Amplify/Radial modes.
// Rolls: No. NG1: No. Crit: No.
// Minimum Rank: D
// Comment Triggers: "Amplify" doubles damage (Bonus Action), "Radial" applies to all adjacent enemies (Bonus Action)

async function handleVitiate(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D)
  if (!mrRank) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery rank input.');
    return sendReply(message, embed, comment);
  }

  // Triggers
  const amplifyActive = /\bamplify\b/i.test(commentString);
  const radialActive = /\bradial\b/i.test(commentString);

  // Break damage by rank
  const BREAK_DAMAGE = { d: 5, c: 10, b: 15, a: 20, s: 25 };
  let baseDamage = BREAK_DAMAGE[mrRank] ?? 5;
  let finalDamage = baseDamage;

  // Apply Amplify (doubles damage)
  if (amplifyActive) {
    finalDamage *= 2;
  }

  // Determine action type and title
  let actionType = '**Free Action.**';
  let titleSuffix = '';

  if (amplifyActive) {
      actionType = '**Bonus Action: Amplify.**';
      titleSuffix = ' (Amplify)';
  } else if (radialActive) {
    actionType = '**Bonus Action: Radial.**';
    titleSuffix = ' (Radial)';
  }

  // Embed setup
  const embed = new EmbedBuilder()
    .setColor('#6845a2')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(`**(Alter) Vitiate${titleSuffix}**`)
    .setThumbnail('https://terrarp.com/db/action/vitiate.png');

  let description = `► ${actionType} Deal an instance of **${finalDamage} Break damage** (MR⋅${mrRankUp}) `;

  if (radialActive) {
    description += `to all enemies adjacent to you. When the battle map is not in use, apply damage to all enemies narratively close to you`;
  } else {
    description += `to an enemy adjacent to you`;
  }
  description += `.\n`;

  if (amplifyActive) {
    description += `\n◦ Amplify: Damage doubled from **${baseDamage}** to **${finalDamage}**.\n`;
  }

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Alter Sub-Action: Momentum — Gain an attack bonus based on movement.
// Rolls: No. NG1: No. Crit: No.
// Comment Trigger: "Speed (Y)" -> Calculates bonus. "Blitz" -> Activates bonus action, doubling the bonus.
// Rank Requirements: Blitz unlocks at MR=B.

async function handleMomentum(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Parse triggers from the comment
  const blitzActive = /\bblitz\b/i.test(commentString);
  const speedMatch = /\bspeed\s*\((\d+)\)/i.exec(commentString);

  // --- Rank validation for Blitz ---
  if (blitzActive) {
    const restrictedRanks = ['e', 'd', 'c'];
    if (!mrRank || restrictedRanks.includes(mrRank)) {
      const err = new EmbedBuilder()
        .setColor('Red')
        .setTitle('Invalid Rank')
        .setDescription('The **Blitz** Bonus Action is not available below Mastery Rank (B).');
      return sendReply(message, err, comment);
    }
  }

  // --- Calculate Attack Bonus (X) ---
  let attackBonus = 'X'; // Default value if Speed(Y) is not provided
  if (speedMatch && speedMatch[1]) {
    const speedValueY = parseInt(speedMatch[1], 10);
    // Blitz doubles the bonus
    const multiplier = blitzActive ? 10 : 5;
    attackBonus = `**${speedValueY * multiplier}**`;
  }

  // --- Embed setup ---
  const embed = new EmbedBuilder()
    .setColor('#6845a2')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setThumbnail('https://terrarp.com/db/action/momentum.png');

  let description = '';

  // --- Handle which action is active ---
  if (blitzActive) {
    // Blitz (Bonus Action)
    embed.setTitle('(Alter) Momentum - Blitz');
    description += `► **Bonus Action: Blitz.** Gain a +${attackBonus} attack bonus this cycle when you spend your movements and end your turn on the same space or an adjacent space to your enemy (10 damage per space moved).\n`;

  } else {
    // Momentum (Free Action)
    embed.setTitle('(Alter) Momentum');
    description += `► **Free Action.** Gain a +${attackBonus} attack bonus this cycle.\n`;
  }

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Alter Sub-Action: Rover — Bonus Action for damage reduction.
// Rolls: No. NG1: No. Crit: No.
// Rank Requirements: Minimum MR=C.

async function handleRover(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // --- Rank validation (minimum C rank) ---
  const restrictedRanks = ['e', 'd'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const err = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Rover** is not available below Mastery Rank (C).');
    return sendReply(message, err, comment);
  }

  // --- Embed setup ---
  const embed = new EmbedBuilder()
    .setColor('#6845a2')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('(Alter) Rover')
    .setThumbnail('https://terrarp.com/db/action/rover.png');

  let description = `► **Bonus Action.** Damage resulting from moving is halved.\n`;

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Alter Sub-Action: Acceleration — Free Action for save bonuses.
// Rolls: No. NG1: No. Crit: No.
// Comment Trigger: "Speed(X)" -> Calculates Reflex bonus.
// Rank Requirements: Minimum MR=D.

async function handleAcceleration(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // --- Rank validation (minimum D rank) ---
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const err = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Acceleration** is not available below Mastery Rank (D).');
    return sendReply(message, err, comment);
  }

  // Parse Speed trigger from the comment
  const speedMatch = /\bspeed\s*\((\d+)\)/i.exec(commentString);

  // --- Calculate bonuses based on Speed ---
  let fortWillBonus = '+2';
  let reflexBonus = '+5';

  if (speedMatch && speedMatch[1]) {
    const speedValueX = parseInt(speedMatch[1], 10);
    fortWillBonus = `**+${speedValueX * 2}**`;
    reflexBonus = `**+${speedValueX * 5}**`;
  }

  // --- Embed setup ---
  const embed = new EmbedBuilder()
    .setColor('#6845a2')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('(Alter) Acceleration')
    .setThumbnail('https://terrarp.com/db/action/acceleration.png');

  let description = `► **Free Action.** Gain a ${fortWillBonus} bonus to Fortitude and Will, and ${reflexBonus} to Reflex Save per unspent movement in the next damage phase.\n`;

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Exceed — Free Action to gain attack/heal/buff bonus by reducing max HP.
// Rolls: No. NG1: No. Crit: No.
// Rank requirement: None (available at all ranks).

async function handleExceed(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  if (!mrData) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('Please provide a valid Mastery Rank.');
    return sendReply(message, embed, comment);
  }

  // Define bonus values based on rank
  const EXCEED_BONUS = { e: 5, d: 10, c: 15, b: 20, a: 25, s: 30 };
  const bonusAmount = EXCEED_BONUS[mrRank] ?? 0;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Exceed')
    .setThumbnail('https://terrarp.com/db/action/exceed.png');

  let description = `► **Free Action.** Reduce your maximum HP by **15 HP** to gain a **+${bonusAmount}** (MR⋅${mrRankUp}) bonus modifier on your next attacks, heals, or buffs.\n`;

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Engage — Bonus Action with two modes: Redo or Accretion.
// Rolls: No. NG1: No. Crit: No.
// Comment Triggers: "Accretion" -> switches to Accretion mode; "Regalia" -> reduces HP cost.
// Rank requirement: Minimum MR=C.

async function handleEngage(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum C rank)
  const restrictedRanks = ['e', 'd'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Engage** is not available below Mastery Rank (C).');
    return sendReply(message, embed, comment);
  }

  // Check for triggers
  const accretionActive = /\baccretion\b/i.test(commentString);
  const regaliaActive = /\bregalia\b/i.test(commentString);

  // Calculate HP cost reduction from Regalia
  const REGALIA_REDUCTION = { e: 0, d: 5, c: 5, b: 10, a: 10, s: 15 };
  const reduction = regaliaActive ? (REGALIA_REDUCTION[mrRank] ?? 0) : 0;

  // HP costs
  const baseRedoHPCost = 50;
  const baseAccretionHPCost = 35;
  const finalRedoHPCost = baseRedoHPCost - reduction;
  const finalAccretionHPCost = baseAccretionHPCost - reduction;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(accretionActive ? 'Engage - Accretion' : 'Engage - Redo')
    .setThumbnail('https://terrarp.com/db/action/engage.png');

  let description;
  if (accretionActive) {
    if (regaliaActive && reduction > 0) {
      description = `► **Bonus Action: Accretion.** Lose **${finalAccretionHPCost} HP** (35 - ${reduction} Regalia) to make your Save Roll with advantage.\n`;
    } else {
      description = `► **Bonus Action: Accretion.** Lose **35 HP** to make your Save Roll with advantage.\n`;
    }
  } else {
    if (regaliaActive && reduction > 0) {
      description = `► **Bonus Action: Redo.** Lose **${finalRedoHPCost} HP** (50 - ${reduction} Regalia) to reroll your main action, you must take the new result. Redo Critical Attack uses **1d100** instead of **2d100kh1**.\n`;
    } else {
      description = `► **Bonus Action: Redo.** Lose **50 HP** to reroll your main action, you must take the new result. Redo Critical Attack uses **1d100** instead of **2d100kh1**.\n`;
    }
  }

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Empower — Free Action to gain extra bonus action by reducing HP.
// Rolls: No. NG1: No. Crit: No.
// Rank requirement: Minimum MR=A.

async function handleEmpower(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum A rank)
  const restrictedRanks = ['e', 'd', 'c', 'b'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Empower** is not available below Mastery Rank (A).');
    return sendReply(message, embed, comment);
  }

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Empower')
    .setThumbnail('https://terrarp.com/db/action/empower.png');

  let description = `► **Free Action.** Once per cycle, reduce your HP by **50 HP** and gain **1 extra bonus action**, you cannot use the same BA twice.\n`;

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Mark — Bonus Action to mark enemy for damage bonus.
// Rolls: No. NG1: No. Crit: No.
// Comment Trigger: "Target(X)" -> specifies target name.
// Rank requirement: Minimum MR=D.

async function handleMark(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Mark** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Parse Target from comment
  const targetMatch = /\btarget\s*\(([^)]+)\)/i.exec(commentString);
  const targetName = targetMatch && targetMatch[1] ? targetMatch[1].trim() : 'your marked enemy';

  // Define damage modifier based on rank
  const MARK_BONUS = { d: 10, c: 15, b: 20, a: 25, s: 30 };
  const damageBonus = MARK_BONUS[mrRank] ?? 0;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Mark')
    .setThumbnail('https://terrarp.com/db/action/mark.png');

  let description = `► **Bonus Action.** The next **2 attacks** to **${targetName}** gains a **+${damageBonus}** (MR⋅${mrRankUp}) damage modifier. You cannot recast Mark until all charges are expended, if there are multiple Hyper Sense users, Marks may stack.\n`;

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Hyper Insight — Free Action to grant break damage and imbue.
// Rolls: No. NG1: No. Crit: No.
// Comment Trigger: "Ultra" -> doubles break damage bonus.
// Rank requirement: Minimum MR=D. Ultra requires minimum MR=A.

async function handleHyperInsight(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Hyper Insight** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Check for Ultra trigger
  const ultraInsightActive = /\bultra\b/i.test(commentString);

  // Ultra requires minimum A rank
  if (ultraInsightActive) {
    const ultraRestrictedRanks = ['e', 'd', 'c', 'b'];
    if (ultraRestrictedRanks.includes(mrRank)) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('Invalid Rank')
        .setDescription('**Ultra** is not available below Mastery Rank (A).');
      return sendReply(message, embed, comment);
    }
  }

  // Define break damage based on rank
  const INSIGHT_BONUS = { d: 15, c: 15, b: 20, a: 20, s: 25 };
  const baseBreakDamage = INSIGHT_BONUS[mrRank] ?? 0;
  const finalBreakDamage = ultraInsightActive ? baseBreakDamage * 2 : baseBreakDamage;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(ultraInsightActive ? 'Hyper Insight - Ultra' : 'Hyper Insight')
    .setThumbnail('https://terrarp.com/db/action/hyper-insight.png');

  let description;
  if (ultraInsightActive) {
    description = `► **Bonus Action.** Grant yourself or an ally within range an instance of **${finalBreakDamage}** (${baseBreakDamage} × 2) Break damage and imbue the attack with one of your masteries this cycle.\n`;
  } else {
    description = `► **Free Action.** Grant yourself or an ally within range an instance of **${finalBreakDamage}** (MR⋅${mrRankUp}) Break damage and imbue the attack with one of your masteries this cycle.\n`;
  }
  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Hyper Instinct — Passive to gain save roll bonus.
// Rolls: No. NG1: No. Crit: No.
// Comment Trigger: "Ultra" -> doubles save bonus.
// Rank requirement: Minimum MR=D. Ultra requires minimum MR=A.

async function handleHyperInstinct(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Hyper Instinct** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Check for Ultra trigger
  const ultraInstinctActive = /\bultra\b/i.test(commentString);

  // Ultra requires minimum A rank
  if (ultraInstinctActive) {
    const ultraRestrictedRanks = ['e', 'd', 'c', 'b'];
    if (ultraRestrictedRanks.includes(mrRank)) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('Invalid Rank')
        .setDescription('**Ultra** is not available below Mastery Rank (A).');
      return sendReply(message, embed, comment);
    }
  }

  // Define save bonus based on rank
  const INSTINCT_BONUS = { d: 5, c: 5, b: 10, a: 10, s: 15 };
  const baseSaveBonus = INSTINCT_BONUS[mrRank] ?? 0;
  const finalSaveBonus = ultraInstinctActive ? baseSaveBonus * 2 : baseSaveBonus;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(ultraInstinctActive ? 'Hyper Instinct - Ultra' : 'Hyper Instinct')
    .setThumbnail('https://terrarp.com/db/action/hyper-instinct.png');

  let description;
  if (ultraInstinctActive) {
    description = `► **Bonus Action.** Gain **+${finalSaveBonus}** (${baseSaveBonus} × 2) to a save roll in the next damage phase.\n`;
  } else {
    description = `► **Passive.** Gain **+${finalSaveBonus}** (MR⋅${mrRankUp}) to a save roll in the next damage phase.\n`;
  }

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Regenerate — Passive HP regen or bonus action to share healing.
// Rolls: No. NG1: No. Crit: No.
// Comment Trigger: "Power" -> switches to bonus action mode.
// Rank requirement: Minimum MR=D.

async function handleRegenerate(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Regenerate** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Check for Power trigger
  const powerRegenerateActive = /\bpower\b/i.test(commentString);

  // Define HP regen based on rank
  const REGEN_HP = { d: 5, c: 5, b: 10, a: 10, s: 15 };
  const regenAmount = REGEN_HP[mrRank] ?? 0;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(powerRegenerateActive ? 'Regenerate - Power' : 'Regenerate')
    .setThumbnail('https://terrarp.com/db/action/regenerate.png');

  let description;
  if (powerRegenerateActive) {
    description = `► **Bonus Action: Power.** Gain the rolled HP and grant an ally the same amount, or forgo your own regeneration and grant an ally double the rolled HP.\n`;
    description += `◦ *Base Regen:* **${regenAmount} HP** (MR⋅${mrRankUp})\n`;
  } else {
    description = `► **Passive.** Gain **${regenAmount} HP** (MR⋅${mrRankUp}) every cycle.\n`;
  }

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Infuse — Free Action to heal multiple allies.
// Rolls: No. NG1: No. Crit: No.
// Comment Trigger: "AoE" -> distributes heal in increments of 5.
// Rank requirement: Minimum MR=D. A-rank unlocks 3 targets.

async function handleInfuse(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Infuse** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Check for AoE trigger
  const aoeActive = /\baoe\b/i.test(commentString);

  // Define heal amount based on rank
  const INFUSE_HP = { d: 5, c: 10, b: 15, a: 20, s: 25 };
  const healAmount = INFUSE_HP[mrRank] ?? 0;

  // Determine target count (A+ rank allows 3 targets)
  const targetCount = (mrRank === 'a' || mrRank === 's') ? 3 : 2;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Infuse')
    .setThumbnail('https://terrarp.com/db/action/infuse.png');

  let description;
  if (aoeActive) {
    description = `► **Free Action.** Heal up to **${targetCount} allies** within range, distributing **${healAmount} HP** (MR⋅${mrRankUp}) in increments of **5 HP**.\n`;
  } else {
    description = `► **Free Action.** Heal up to **${targetCount} allies** within range for **${healAmount} HP** (MR⋅${mrRankUp}).\n`;
  }

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Adapt — Passive HP boost or bonus actions with different modes.
// Rolls: No. NG1: No. Crit: No.
// Comment Triggers: "Prowl" -> movement bonus; "Fend" -> save bonus.
// Rank requirement: Minimum MR=D. Prowl A-rank upgrade available.

async function handleAdapt(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Adapt** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Check for mode triggers
  const prowlActive = /\bprowl\b/i.test(commentString);
  const fendActive = /\bfend\b/i.test(commentString);

  // Define values based on rank
  const ADAPT_HP = { d: 30, c: 30, b: 40, a: 40, s: 50 };
  const FEND_BONUS = { d: 10, c: 10, b: 15, a: 15, s: 20 };
  const hpBoost = ADAPT_HP[mrRank] ?? 0;
  const fendBonus = FEND_BONUS[mrRank] ?? 0;

  // Check if A-rank or higher for Prowl upgrade
  const hasARankProwlUpgrade = (mrRank === 'a' || mrRank === 's');

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(prowlActive ? 'Adapt - Prowl' : (fendActive ? 'Adapt - Fend' : 'Adapt'))
    .setThumbnail('https://terrarp.com/db/action/adapt.png');

  let description;
  if (prowlActive) {
    description = `► **Bonus Action: Prowl.** Ignore difficult terrain this cycle.`;
    if (hasARankProwlUpgrade) {
      description += ` And divide movement damage by 2.`;
    }
    description += `\n`;
  } else if (fendActive) {
    description = `► **Bonus Action: Fend.** **+${fendBonus}** (MR⋅${mrRankUp}) to a save roll this cycle.\n`;
  } else {
    description = `► **Passive.** On the first post of a thread, add **${hpBoost} HP** (MR⋅${mrRankUp}) to your current HP. This is not a heal nor does it expand your max HP.\n`;
  }

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Evolve — Passive bonus at beginning of thread.
// Rolls: No. NG1: No. Crit: No.
// Comment Trigger: "Mastery(X)" -> specifies the mastery name.
// Rank requirement: Minimum MR=D.

async function handleEvolve(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Evolve** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Parse Mastery from comment
  const masteryMatch = /\bmastery\s*\(([^)]+)\)/i.exec(commentString);
  const masteryName = masteryMatch && masteryMatch[1] ? masteryMatch[1].trim() : 'X';

  // Check for Shift tag
  const shiftActive = /\bshift\b/i.test(commentString);

  // Define bonus based on rank
  const EVOLVE_BONUS = { d: 10, c: 10, b: 15, a: 15, s: 20 };
  const bonus = EVOLVE_BONUS[mrRank] ?? 0;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Evolve')
    .setThumbnail('https://terrarp.com/db/action/evolve.png');

  let description;
  if (shiftActive) {
    description = `► **Passive.** Evolved Mastery changed to **${masteryName}**, **+${bonus}** (MR⋅${mrRankUp}) bonus to main action rolls made with this mastery.\n`;
  } else {
    description = `► **Passive.** Evolved **${masteryName}**, **+${bonus}** (MR⋅${mrRankUp}) bonus to main action rolls made with this mastery.\n`;
  }

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Coordinate — Free Action to grant modifier to targets.
// Rolls: No. NG1: No. Crit: No.
// Rank requirement: Minimum MR=D. S-rank grants 3 targets instead of 2.

async function handleCoordinate(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Coordinate** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Define modifier based on rank
  const COORDINATE_BONUS = { d: 5, c: 10, b: 15, a: 20, s: 25 };
  const bonus = COORDINATE_BONUS[mrRank] ?? 0;

  // Determine target count (S rank allows 3 targets)
  const targetCount = (mrRank === 's') ? 3 : 2;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Coordinate')
    .setThumbnail('https://terrarp.com/db/action/coordinate.png');

  let description = `► **Free Action.** Grant **${targetCount} targets** a **+${bonus}** (MR⋅${mrRankUp}) modifier to their next attack, heal, or buff action.\n`;

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Aid — Passive HP grant or bonus action to grant modifier.
// Rolls: No. NG1: No. Crit: No.
// Comment Trigger: "Assist" -> switches to bonus action mode.
// Rank requirement: Minimum MR=D. B-rank upgrades passive to 10 HP.

async function handleAid(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Aid** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Check for Assist trigger
  const assistActive = /\bassist\b/i.test(commentString);

  // Define values based on rank
  const passiveHP = (mrRank === 'b' || mrRank === 'a' || mrRank === 's') ? 10 : 5;
  const ASSIST_BONUS = { d: 5, c: 5, b: 10, a: 10, s: 15 };
  const assistBonus = ASSIST_BONUS[mrRank] ?? 0;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(assistActive ? 'Aid - Assist' : 'Aid')
    .setThumbnail('https://terrarp.com/db/action/aid.png');

  let description;
  if (assistActive) {
    description = `► **Bonus Action: Assist.** Grant **+${assistBonus}** (MR⋅${mrRankUp}) modifier to the next mastery check made by any of your Coordinate targets.\n`;
  } else {
    description = `► **Passive.** Once per cycle, if your Coordinate target takes damage, they gain **${passiveHP} HP** (MR⋅${mrRankUp}).\n`;
  }

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Charge — Passive charge pool or bonus actions to charge/release.
// Rolls: No. NG1: No. Crit: No.
// Comment Triggers: "Charge" -> add to pool; "Release" -> use pool for modifier.
// Rank requirement: Minimum MR=D.

async function handleCharge(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Charge** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Check for mode triggers
  const chargingActive = /\bcharging\b/i.test(commentString);
  const releaseMatch = /\brelease\s*\((\d+)\)/i.exec(commentString);
  const releaseActive = releaseMatch !== null;

  // Define dice based on rank
  const PASSIVE_DICE = { d: '1', c: '1', b: '2', a: '2', s: '3' };
  const CHARGING_DICE = { d: '1', c: '1', b: '2', a: '2', s: '2' };
  const passiveDice = PASSIVE_DICE[mrRank] ?? '1';
  const chargingDice = CHARGING_DICE[mrRank] ?? '1';

  // Handle Release with dice rolling
  let rollResult = 0;
  let calculation = '';
  if (releaseActive) {
    const numDice = parseInt(releaseMatch[1], 10);
    const rolls = [];
    for (let i = 0; i < numDice; i++) {
      rolls.push(roll(1, 20));
    }
    rollResult = rolls.reduce((sum, r) => sum + r, 0);
    calculation = `${numDice}d20 (${rolls.join(', ')})`;
  }

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(releaseActive ? 'Charge - Release' : (chargingActive ? 'Charge - Charging' : 'Charge'))
    .setThumbnail('https://terrarp.com/db/action/charge.png');

  let description;
  if (releaseActive) {
    description = `\`${calculation}\`\n\n`;
    description += `► **Bonus Action: Release.** Gain the **+${rollResult}** as a modifier for your attack, buff, heal, or mastery check involving your weapon.\n`;
  } else if (chargingActive) {
    description = `► **Bonus Action: Charging.** Add an extra **${chargingDice}** (MR⋅${mrRankUp}) to your Charge Pool.\n`;
  } else {
    description = `► **Passive.** Add **${passiveDice}** (MR⋅${mrRankUp}) to your Charge Pool at the start of your turn when combat begins.\n`;
  }

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Lethal (Offense Passive) — Increases attack modifier based on MR.
// Rolls: No. NG1: No. Crit: No.
// Minimum Rank: D

async function handleProfane(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Profane** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Check for Apostasy mode (requires B rank)
  const apostasyActive = /\bapostasy\b/i.test(commentString);

  // Apostasy rank validation
  if (apostasyActive && !['b', 'a', 's'].includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Apostasy** mode is not available below Mastery Rank (B).');
    return sendReply(message, embed, comment);
  }

  // Define max HP gain for Apostasy (B=20, A=20, S=40)
  const APOSTASY_MAX = { b: 20, a: 20, s: 40 };
  const maxHP = APOSTASY_MAX[mrRank] ?? 0;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setThumbnail('https://terrarp.com/db/action/profane.png');

  let description;

  if (apostasyActive) {
    // Apostasy mode (Bonus Action)
    embed.setTitle('Profane (Apostasy)');
    description = `► **Bonus Action: Apostasy.** Gain **5 HP per active condition** (MR⋅${mrRankUp}), max **${maxHP} HP**. You cannot cleanse these conditions after gaining the HP.\n`;
  } else {
    // Consume mode (Free Action)
    embed.setTitle('Profane');
    description = `► **Free Action: Consume.** Cleanse **1 curable condition** (MR⋅${mrRankUp}).\n`;

    // Show Apostasy availability
    if (['b', 'a', 's'].includes(mrRank)) {
      description += `\n◦ **B Upgrade:** **Apostasy** mode available (Bonus Action).\n`;
    }
  }

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Regalia (Alter-Evoke Passive) — Reduces HP cost of Engage/Empower based on armor.
// Rolls: No. NG1: No. Crit: No.
// Minimum Rank: D
// Comment Triggers: "Light" for Light Armor, "Medium" for Medium Armor

async function handleRegalia(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Regalia** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Check for armor type
  const lightArmor = /\blight\b/i.test(commentString);
  const mediumArmor = /\bmedium\b/i.test(commentString);

  // Define reduction values
  const LIGHT_REDUCTION = { d: 10, c: 10, b: 15, a: 15, s: 20 };
  const MEDIUM_REDUCTION = { d: 5, c: 5, b: 5, a: 5, s: 10 };

  let reduction, armorType;
  if (lightArmor) {
    reduction = LIGHT_REDUCTION[mrRank] ?? 0;
    armorType = 'Light Armor';
  } else if (mediumArmor) {
    reduction = MEDIUM_REDUCTION[mrRank] ?? 0;
    armorType = 'Medium Armor';
  } else {
    // Default to showing both options
    const lightRed = LIGHT_REDUCTION[mrRank] ?? 0;
    const mediumRed = MEDIUM_REDUCTION[mrRank] ?? 0;

    const embed = new EmbedBuilder()
      .setColor('#8b5cf6')
      .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
      .setTitle('Regalia')
      .setThumbnail('https://terrarp.com/db/action/regalia.png');

    let description = `► **Passive.** Reduces the health cost of **Engage** and **Empower** (MR⋅${mrRankUp}):\n`;
    description += `\n◦ **Light Armor:** Reduces cost by **${lightRed} HP**.\n`;
    description += `◦ **Medium Armor:** Reduces cost by **${mediumRed} HP**.\n`;

    if (comment) {
      description += `${comment}`;
    }

    description += ` · *[Roll Link](${message.url})*`;

    embed.setDescription(description);
    return sendReply(message, embed);
  }

  // Embed for specific armor type
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(`Regalia (${armorType})`)
    .setThumbnail('https://terrarp.com/db/action/regalia.png');

  let description = `► **Passive.** ${armorType} reduces the health cost of **Engage** and **Empower** by **${reduction} HP** (MR⋅${mrRankUp}).\n`;

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Anatomy (Alter-Metamorph Passive) — Adds HP on first post of thread.
// Rolls: No. NG1: No. Crit: No.
// Minimum Rank: D

async function handleAnatomy(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank, only D/B/S have values)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Anatomy** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Define HP bonus: D=30, B=40, S=50 (C and A use closest values)
  const ANATOMY_HP = { d: 30, c: 30, b: 40, a: 40, s: 50 };
  const hpBonus = ANATOMY_HP[mrRank] ?? 30;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Anatomy')
    .setThumbnail('https://terrarp.com/db/action/anatomy.png');

  let description = `► **Passive.** On the first post of a thread, add **${hpBonus} HP** (MR⋅${mrRankUp}) to your current HP. This is not a heal nor does it expand your max HP.\n`;

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Bestowed (Alter-Mend Passive) — Use non-support mastery for support actions.
// Rolls: No. NG1: No. Crit: No.
// Minimum Rank: D

async function handleBestowed(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Bestowed** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Bestowed')
    .setThumbnail('https://terrarp.com/db/action/bestowed.png');

  let description = `► **Passive.** Use the mastery and mastery rank of any non-support masteries to perform support actions (MR⋅${mrRankUp}). You must have at least 1 support mastery on your character sheet to access support actions.\n`;

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Combat Focus (Alter-Praxis Passive) — Bonus to attacks, buffs, heals, and mastery checks.
// Rolls: No. NG1: No. Crit: No.
// Minimum Rank: D

async function handleCombatFocus(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Combat Focus** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Define bonus values: D=5, B=10, S=15 (C and A fill in)
  const COMBAT_BONUS = { d: 5, c: 5, b: 10, a: 10, s: 15 };
  const combatBonus = COMBAT_BONUS[mrRank] ?? 5;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Combat Focus')
    .setThumbnail('https://terrarp.com/db/action/combat-focus.png');

  let description = `► **Passive.** Gain **+${combatBonus}** (MR⋅${mrRankUp}) to attacks, buffs, and heals.\n`;

  // C rank upgrade
  if (['c', 'b', 'a', 's'].includes(mrRank)) {
    description += `\n◦ **C Upgrade:** Gain **+5** to all mastery checks.\n`;
  }

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Utility Focus (Alter-Praxis Passive) — Bonus to Bonus/Free Actions and charge bonuses.
// Rolls: No. NG1: No. Crit: No.
// Minimum Rank: D

async function handleUtilityFocus(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Utility Focus** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Define bonus values: D=5, S=10 (fill in between)
  const ACTION_BONUS = { d: 5, c: 5, b: 7, a: 7, s: 10 };
  const CHARGE_BONUS = { d: 1, c: 1, b: 1, a: 1, s: 2 };
  const actionBonus = ACTION_BONUS[mrRank] ?? 5;
  const chargeBonus = CHARGE_BONUS[mrRank] ?? 1;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Utility Focus')
    .setThumbnail('https://terrarp.com/db/action/utility-focus.png');

  let description = `► **Passive.** Gain **+${actionBonus}** (MR⋅${mrRankUp}) to all Bonus/Free Actions. Haste and Cleanse gain **${chargeBonus}** additional charge.\n`;

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Defense Focus (Alter-Praxis Passive) — HP and Save bonuses. Cannot take Speed Focus.
// Rolls: No. NG1: No. Crit: No.
// Minimum Rank: D

async function handleDefenseFocus(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Defense Focus** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Define bonus values
  const HP_BONUS = { d: 15, c: 15, b: 20, a: 20, s: 25 };
  const SAVE_BONUS = { d: 5, c: 5, b: 10, a: 10, s: 15 };
  const hpBonus = HP_BONUS[mrRank] ?? 15;
  const saveBonus = SAVE_BONUS[mrRank] ?? 5;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Defense Focus')
    .setThumbnail('https://terrarp.com/db/action/defense-focus.png');

  let description = `► **Passive.** Gain **+${hpBonus} HP** and **+${saveBonus}** to all Saves (MR⋅${mrRankUp}).\n`;
  description += `\n⚠ **Restriction:** Cannot take Speed Focus.\n`;

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Speed Focus (Alter-Praxis Passive) — HP and movement bonuses. Cannot take Defense Focus.
// Rolls: No. NG1: No. Crit: No.
// Minimum Rank: D

async function handleSpeedFocus(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  const restrictedRanks = ['e'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Speed Focus** is not available below Mastery Rank (D).');
    return sendReply(message, embed, comment);
  }

  // Define bonus values
  const HP_BONUS = { d: 15, c: 15, b: 20, a: 20, s: 25 };
  const MOVE_BONUS = { d: 1, c: 1, b: 1, a: 1, s: 2 };
  const hpBonus = HP_BONUS[mrRank] ?? 15;
  const moveBonus = MOVE_BONUS[mrRank] ?? 1;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Speed Focus')
    .setThumbnail('https://terrarp.com/db/action/speed-focus.png');

  let description = `► **Passive.** Gain **+${hpBonus} HP** and **+${moveBonus} movement** (MR⋅${mrRankUp}).\n`;
  description += `\n⚠ **Restriction:** Cannot take Defense Focus.\n`;

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}



async function handleGuardian(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Trigger: "Amplify"
  const amplifyActive = /\bamplify\b/i.test(commentString);

  // Rank validation for Amplify
  if (amplifyActive) {
    const restrictedRanks = ['e', 'd', 'c', 'b'];
    if (!mrRank || restrictedRanks.includes(mrRank)) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('Invalid Rank')
        .setDescription('This Bonus Action is not available at Mastery Rank (E, D, C, or B).\n');
      return sendReply(message, embed, comment);
    }
  }

  // Define mitigation values based on rank
  const GUARDIAN_VALUES = { c: 15, b: 20, a: 25, s: 30 };
  let mitigationAmount = GUARDIAN_VALUES[mrRank] ?? 0;

  // Embed setup
  const embed = new EmbedBuilder()
    .setColor('#8C6BC2')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setThumbnail('https://terrarp.com/db/action/guardian.png');

  let description = '';

  // Handle which action is active
  if (amplifyActive) {
    // Amplify (Bonus Action)
    mitigationAmount *= 2; // Double the mitigation
    embed.setTitle('**(Alter) Guardian**');
    description += `► **Bonus Action: Amplify.** Distribute **${mitigationAmount} mitigation** (MR⋅${mrRankUp}) between and up to 3 targets in multiples of 5s.\n`;
    description += `\n◦ Effect: Mitigation amount has been doubled.`;
    description += `\n◦ Limitation: Each character may have no more than *60 mitigation* from all effects.\n`;

  } else {
    // Guardian (Free Action)
    embed.setTitle('**(Alter) Guardian**');
    description += `► **Free Action.** Distribute **${mitigationAmount} damage mitigation** (MR⋅${mrRankUp}) between and up to 3 targets in multiples of 5s.\n`;
    description += `\n◦ Limitation: Each character may have no more than *60 mitigation* from all effects.\n`;
  }

  if (comment) {
    description += `${comment}`;
  }

  // Add a link to the original message command
  description += ` · *[Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}


async function handleAggress(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D)
  if (!mrRank) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery rank input.');
    return sendReply(message, embed, comment);
  }

  // Priority roll (1d100)
  const priorityRoll = roll(1, 100);

  // Embed setup
  const embed = new EmbedBuilder()
    .setColor('#8C6BC2')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('**(Alter) Aggress**')
    .setThumbnail('https://terrarp.com/db/action/aggress.png');

  let description = `\`1d100 (${priorityRoll})\`\n\n`;
  description += `► **Free Action.** Taunt an enemy. Aggress takes higher priority than regular Taunt. If two Aggress is used on the same target, roll a 1d100, the higher result takes priority.\n`;

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}


async function handleSavior(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Trigger: "Share"
  const shareAuraActive = /\bshare\b/i.test(commentString);

  // Rank validation for Share
  if (shareAuraActive) {
    if (!mrRank || mrRank === 'e') {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('Invalid Rank')
        .setDescription('This Bonus Action is not available at Mastery Rank (E).\n');
      return sendReply(message, embed, comment);
    }
  }

  // Define save bonus values based on rank
  const SAVIOR_VALUES = { d: 15, b: 20, s: 25 };
  let saveAmount = SAVIOR_VALUES[mrRank] ?? 0;

  // Embed setup
  const embed = new EmbedBuilder()
    .setColor('#6845a2')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setThumbnail('https://terrarp.com/db/action/savior.png');

  let description = '';

  // Handle which action is active
  if (shareAuraActive) {
    // Share (Bonus Action)
    const allies = mrRank === 's' ? '2 allies' : '1 ally';
    embed.setTitle('**(Alter) Savior**');
    description += `► **Bonus Action: Share.** Gain a **+${saveAmount} bonus** (MR⋅${mrRankUp}) to any save roll until the next damage phase, and share the same amount with ***${allies}*** within range.\n`;
  } else {
    // Savior (Passive)
    embed.setTitle('**(Alter) Savior**');
    description += `► ***Passive.*** Gain a **+${saveAmount} bonus** (MR⋅${mrRankUp}) to any save roll until the next damage phase.\n`;
  }

  description += `\n◦ Limitation: Each character may only have 1 instance of Savior Aura.\n`;

  if (comment) {
    description += `${comment}`;
  }

  // Add a link to the original message command
  description += ` · *[Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}


async function handleAcrimony(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D)
  if (!mrRank) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery rank input.');
    return sendReply(message, embed, comment);
  }

  // Trigger: "Meliorate"
  const meliorateActive = /\bmeliorate\b/i.test(commentString);

  // Define values by rank
  const DAMAGE_VALUES = { d: 15, c: 15, b: 25, a: 25, s: 35 };
  const HEAL_VALUES = { d: 10, c: 10, b: 15, a: 15, s: 20 };
  const MELIORATE_VALUES = { d: 15, c: 15, b: 25, a: 25, s: 35 };

  const damageAmount = DAMAGE_VALUES[mrRank] ?? 15;
  const healAmount = HEAL_VALUES[mrRank] ?? 10;
  const meliorateAmount = MELIORATE_VALUES[mrRank] ?? 15;

  // Embed setup
  const embed = new EmbedBuilder()
    .setColor('#8C6BC2')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setThumbnail('https://terrarp.com/db/action/acrimony.png');

  let description = '';

  // Handle which action is active
  if (meliorateActive) {
    // Meliorate (Bonus Action)
    embed.setTitle('**(Alter) Acrimony**');
    description += `► **Bonus Action: Meliorate.** When your Acrimony target dies this cycle, gain **${meliorateAmount} HP** (MR⋅${mrRankUp}).\n`;
  } else {
    // Acrimony (Free Action)
    embed.setTitle('**(Alter) Acrimony**');
    description += `► **Free Action.** While Vulnerable, deal an instance of **${damageAmount} damage** (MR⋅${mrRankUp}) to an enemy you are adjacent to or share a space with and regain **${healAmount} HP** (MR⋅${mrRankUp}). You cannot gain the Protected State.\n`;
  }

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}


async function handleOverdrive(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation: Action not available at MR=E
  if (mrRank === 'e') {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('This Passive is not available at Mastery Rank (E).\n');
    return sendReply(message, embed, comment);
  }

  // Define max HP gain values based on rank
  const MAX_HP_VALUES = { d: 25, c: 30, b: 35, a: 40, s: 50 };
  const maxHpForRank = MAX_HP_VALUES[mrRank] ?? 0;

  // Check for trigger and validate format
  const triggerAttempt = /\bod-damage/i.test(commentString);
  const damageMatch = commentString.match(/\bod-damage\s*\((\d+)\)/i);

  // Error if trigger is used without a number
  if (triggerAttempt && !damageMatch) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Command Format')
      .setDescription('Please provide a numerical value for the damage dealt inside the parentheses.\n\n**Example:** `OD-damage (150)`\n');
    return sendReply(message, embed, comment);
  }

  let hpGain = '{X}';
  let calculationString = '(Y/12)';

  // Calculate HP gain if the trigger and value are present
  if (damageMatch && damageMatch[1]) {
    const damageInput = parseInt(damageMatch[1], 10);
    const divisor = mrRank === 's' ? 10 : 12; // At MR=S, the divisor is 10

    calculationString = `${damageInput}/${divisor}`;

    // Calculate HP gain and cap it based on rank
    const calculatedHp = Math.floor(damageInput / divisor);
    const finalHpGain = Math.min(calculatedHp, maxHpForRank);

    hpGain = `${finalHpGain}`;
  }

  // Embed setup
  const embed = new EmbedBuilder()
    .setColor('#6845a2')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('**(Alter) Overdrive**')
    .setThumbnail('https://terrarp.com/db/action/overdrive.png');

  let description = `► ***Passive.*** Gain **${hpGain} HP** (${calculationString}, Max ${maxHpForRank}) (MR⋅${mrRankUp}) when you are adjacent to or on the same space as the enemy you attacked this cycle.\n`;

  if (comment) {
    description += `${comment}`;
  }

  // Add a link to the original message command
  description += ` · *[Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}


async function handleRage(message, args, comment) {
  const mrData = getRankData(args[1], 'mastery');
  if (!mrData) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery rank input.');
    return sendReply(message, embed, comment);
  }

  const displayName = message.member?.displayName ?? message.author.username;

  // MR rank
  const mrRankRaw = (mrData.rank ?? String(args[1] ?? '')).toString();
  const mrRank = mrRankRaw.toLowerCase();
  const mrRankUp = mrRankRaw.toUpperCase();

  // Triggers
  const frenzyActive = typeof comment === 'string' && /\bfrenzy\b/i.test(comment);

  // Parse: Taken-damage (Y)
  // Accepts integers/floats; clamps below at 0; errors if missing/invalid.
  let takenY = NaN;
  if (typeof comment === 'string') {
    const m = /taken[-\s]*damage\s*\(\s*([-+]?\d*\.?\d+)\s*\)/i.exec(comment);
    if (m) takenY = Number(m[1]);
  }
  if (!Number.isFinite(takenY)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Missing or Invalid Value')
      .setDescription(
        'Please include **Taken-damage (Y)** in your comment with a numeric value.\n' +
        'Examples: `Taken-damage (37)`, `Taken damage (112)`'
      );
    return sendReply(message, embed, comment);
  }

  // Caps by MR rank (available at D, C, B, A, S unless Frenzy removes the cap)
  const CAPS = { d: 25, c: 50, b: 75, a: 100, s: 125 };
  const hasCapForRank = Object.prototype.hasOwnProperty.call(CAPS, mrRank);
  if (!frenzyActive && !hasCapForRank) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Unavailable MR Rank')
      .setDescription('Rage is only available from D-rank+.')
    return sendReply(message, embed, comment);
  }

  // Compute X
  const base = Math.max(0, Math.floor(takenY)); // clamp <0, floor to int
  const cap = CAPS[mrRank]; // undefined for non-C/A/S, which is fine under Frenzy
  let X = 0;
  let calcLine = '';

  if (frenzyActive) {
    X = base * 2;
    calcLine = `• Calc: X = ${base} × 2 = **${X}** (Frenzy: no cap this cycle)`;
  } else {
    X = Math.min(base, cap);
    calcLine = `• Calc: X = min(${base}, cap ${cap}) = **${X}**`;
  }

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#6845a2')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(frenzyActive ? '(Alter) Frenzied Rage' : '(Alter) Rage')
    .setThumbnail('https://terrarp.com/db/action/rage.png');

  // Description text
  let description = '';
  if (frenzyActive) {
    description += `► **Bonus Action: Frenzied Rage.** Deal **${X} damage** to an enemy you share a space with or are adjacent to based on your taken damage (rage damage has been doubled and has no cap this cycle, MR⋅${mrRankUp})\n`;
  } else {
    description += `► **Free Action.** Deal **${X} damage** to an enemy you share a space with or are adjacent to based on your taken damage (max ${cap} - MR⋅${mrRankUp})\n`;
  }

  // Echo original comment if provided (keeps parity with your other handlers)
  if (comment) description += `${comment}`;

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}


async function handleGift(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum B rank)
  const restrictedRanks = ['e', 'd', 'c'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Gift** is not available below Mastery Rank (B).');
    return sendReply(message, embed, comment);
  }

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Gift')
    .setThumbnail('https://terrarp.com/db/action/gift.png');

  let description = `► **Passive.** When you Release your charge, roll another set and take the higher set.\n`;

  // S rank upgrade
  if (mrRank === 's') {
    description += `\n◦ **S Upgrade:** You may reroll your Release dice set a third time and keep the highest set, but take **20 damage**.\n`;
  }

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}


async function handleFollowUp(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum C rank)
  const restrictedRanks = ['e', 'd'];
  if (!mrRank || restrictedRanks.includes(mrRank)) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('**Follow-up** is not available below Mastery Rank (C).');
    return sendReply(message, embed, comment);
  }

  // Parse Target from comment
  const targetMatch = /\btarget\s*\(([^)]+)\)/i.exec(commentString);
  const targetName = targetMatch && targetMatch[1] ? targetMatch[1].trim() : 'an ally';

  // Define modifier values based on rank
  const SPECIAL_MODIFIER = { d: 20, c: 25, b: 30, a: 35, s: 40 };
  const NORMAL_MODIFIER = { d: 0, c: 15, b: 15, a: 20, s: 25 };

  const specialMod = SPECIAL_MODIFIER[mrRank] ?? 0;
  const normalMod = NORMAL_MODIFIER[mrRank] ?? 0;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#8b5cf6')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Follow-up')
    .setThumbnail('https://terrarp.com/db/action/follow-up.png');

  let description = `► **Free Action.** You or **${targetName}** may use a **${specialMod}** (MR⋅${mrRankUp}) damage modifier when **${targetName}** performs a special attack action within range. If one follow-up partner crits, this value scales with the crit. Normal attacks may trigger combo at a reduced amount **${normalMod}** (MR⋅${mrRankUp}).\n`;

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}


async function handleLocomote(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D)
  if (!mrRank) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery rank input.');
    return sendReply(message, embed, comment);
  }

  // Parse Target from comment
  const targetMatch = /\btarget\s*\(([^)]+)\)/i.exec(commentString);
  const targetName = targetMatch && targetMatch[1] ? targetMatch[1].trim() : 'a target';

  // Trigger: Switch
  const switchActive = /\bswitch\b/i.test(commentString);

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#10b981')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setThumbnail('https://terrarp.com/db/action/locomote.png');

  let description = '';

  if (switchActive) {
    // Switch mode (Bonus Action)
    embed.setTitle('Locomote (Switch)');
    description += `► **Bonus Action: Switch.** Change the Locomote target to **${targetName}**.\n`;
  } else {
    // Normal mode (Free Action)
    embed.setTitle('Locomote');
    description += `► **Free Action.** At the start of the thread, pick **${targetName}** within range, that target gets a **+1 movement** until you switch the target.\n`;

    // B rank upgrade
    if (mrRank === 'b' || mrRank === 'a' || mrRank === 's') {
      description += `\n◦ **B Upgrade:** If you and the Locomote target start on the same space at the start of a cycle, both get the **+1 movement**.\n`;
    }
  }

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

module.exports = {
  handleDefile,
  handleVitiate,
  handleMomentum,
  handleRover,
  handleAcceleration,
  handleExceed,
  handleEngage,
  handleEmpower,
  handleMark,
  handleHyperInsight,
  handleHyperInstinct,
  handleRegenerate,
  handleInfuse,
  handleAdapt,
  handleEvolve,
  handleCoordinate,
  handleAid,
  handleCharge,
  handleProfane,
  handleRegalia,
  handleAnatomy,
  handleBestowed,
  handleCombatFocus,
  handleUtilityFocus,
  handleDefenseFocus,
  handleSpeedFocus,
  handleGuardian,
  handleAggress,
  handleSavior,
  handleAcrimony,
  handleOverdrive,
  handleRage,
  handleGift,
  handleFollowUp,
  handleLocomote
};