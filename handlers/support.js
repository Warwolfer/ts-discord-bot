const { EmbedBuilder } = require('discord.js');
const { roll, getRankData, parseModifiers, sendReply, getPassiveModifiers, getDisplayName, extractRankInfo, validateMinimumRank, parseTriggers, parseNGTrigger, finalizeAndSend } = require('../helpers');
const { EMBED_COLORS } = require('../constants');


async function handleHeal(message, args, comment) {
  const mrData = getRankData(args[1], 'mastery');
  const wrData = getRankData(args[2], 'weapon');

  if (!mrData || !wrData) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.error)
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery and Weapon rank inputs.');
    return sendReply(message, embed, comment);
  }

  const modifiers = parseModifiers(args, 3);
  const rawMods = (modifiers.display ?? '').toString();
  const modsClean = rawMods.replace(/^\s*\+\s*/, '').trim();
  const hasMods = /\d/.test(modifiers.display);

  // Parse triggers
  const triggers = parseTriggers(comment, {
    aoe: /\baoe\b/i,
    versatile: /\b(?:vers[-\s]*aoe|versatile)\b/i,
    simulcast: /\bsimulcast\b/i
  });

  // Precedence: Simulcast > Versatile > AoE
  const appliedMode = triggers.simulcast ? 'Simulcast' : (triggers.versatile ? 'Versatile' : (triggers.aoe ? 'AoE' : null));

  // Parse NG trigger
  const ng = parseNGTrigger(comment);
  const ngBonus = ng.bonus;
  const ngNote = ng.note;

  // --- Exploding dice: 2d20, explode on rank-based threshold (chaining) ---
  // Thresholds by rank: 19 (D), 18 (B), 17 (S)
  const mrRank = mrData.rank.toLowerCase();
  const EXPLODE_THRESHOLDS = { e: 20, d: 19, c: 19, b: 18, a: 18, s: 17 };
  const EXPLODE_ON = EXPLODE_THRESHOLDS[mrRank] ?? 18;
  const BASE_DICE = 2;
  const MAX_DICE_SAFETY = 200;

  const dice = [];
  let pending = BASE_DICE;

  while (pending > 0 && dice.length < MAX_DICE_SAFETY) {
    const r = roll(1, 20);
    dice.push(r);
    if (r >= EXPLODE_ON) pending++; // explosion grants +1 extra die (chaining)
    pending--;
  }

  const numExplosions = dice.filter(v => v >= EXPLODE_ON).length;
  const diceSum = dice.reduce((a, b) => a + b, 0);

  // Totals
  const total =
    diceSum +
    (mrData.value || 0) +
    (wrData.value || 0) +
    (modifiers.total || 0) +
    ngBonus;

  // Split healing: Simulcast ÷2, Versatile ÷2, AoE ÷3, or no split
  const perAlly = triggers.simulcast ? Math.floor(total / 2) : (triggers.versatile ? Math.floor(total / 2) : (triggers.aoe ? Math.floor(total / 3) : total));

  // Calculation string
  const annotatedDice = dice.map(v => (v >= EXPLODE_ON ? `${v}⋅EX` : `${v}`)).join(', ');
  const explosionExtras = Math.max(0, dice.length - BASE_DICE);

  const parts = [
    `${BASE_DICE}d20${explosionExtras > 0 ? `+${explosionExtras}` : ''} (${annotatedDice})`,
    `${mrData.value} (MR⋅${mrData.rank})`,
    `${wrData.value} (WR⋅${wrData.rank})`,
  ];
  if (hasMods && modsClean.length > 0) parts.push(`${modsClean} (mods)`);
  if (ngBonus > 0) parts.push(`${ngBonus} (NG⋅1)`);

  let calculation = parts.join(' + ');
  if (triggers.simulcast) calculation += ' ÷ 2';
  else if (triggers.versatile) calculation += ' ÷ 2';
  else if (triggers.aoe) calculation += ' ÷ 3';

  // Detect passive ability tags
  const passiveTags = getPassiveModifiers('support', comment);
  const passiveDisplay = passiveTags.length > 0 ? `${passiveTags.join(', ')}\n` : '';

  // Embed
  const displayName = getDisplayName(message);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.support)
    .setAuthor({ name: `${displayName}'s Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Heal')
    .setThumbnail('https://terrarp.com/db/action/heal.png');

  let description =
    `\`${calculation}\`\n` +
    passiveDisplay +
    `\n` +
    (triggers.simulcast
      ? `**+${perAlly} HP to 1 of the 2 targets** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`
      : (triggers.versatile
        ? `**+${perAlly} HP to 2 allies** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`
        : (triggers.aoe
          ? `**+${perAlly} HP to 3 allies** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`
          : `**+${perAlly} HP to 1 ally** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`))) +
    (ngNote ? `${ngNote}\n` : '') +
    `\n► Free Action: Healing Cleanse. Whenever you heal, cleanse 1 curable condition after healing from an ally within range.\n`;

  return finalizeAndSend(message, embed, description, comment);
}


async function handlePowerHeal(message, args, comment) {
  const mrData = getRankData(args[1], 'mastery');
  const wrData = getRankData(args[2], 'weapon');

  if (!mrData || !wrData) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.error)
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery and Weapon rank inputs.');
    return sendReply(message, embed, comment);
  }

  const modifiers = parseModifiers(args, 3);
  const rawMods = (modifiers.display ?? '').toString();
  const modsClean = rawMods.replace(/^\s*\+\s*/, '').trim();
  const hasMods = /\d/.test(modifiers.display);

  // Parse triggers
  const triggers = parseTriggers(comment, {
    aoe: /\baoe\b/i,
    versatile: /\b(?:vers[-\s]*aoe|versatile)\b/i,
    simulcast: /\bsimulcast\b/i
  });

  // Precedence: Simulcast > Versatile > AoE
  const appliedMode = triggers.simulcast ? 'Simulcast' : (triggers.versatile ? 'Versatile' : (triggers.aoe ? 'AoE' : null));

  // Parse NG trigger
  const ng = parseNGTrigger(comment);
  const ngBonus = ng.bonus;
  const ngNote = ng.note;

  // --- Exploding dice: 4d20, explode on rank-based threshold (chaining) ---
  // Thresholds by rank: 18 (D), 17 (B), 16 (S)
  const mrRankRaw = (mrData.rank ?? String(args[1] ?? '')).toString();
  const mrRank = mrRankRaw.toLowerCase();
  const mrRankUp = mrRankRaw.toUpperCase();
  const EXPLODE_THRESHOLDS = { e: 20, d: 18, c: 18, b: 17, a: 17, s: 16 };
  const EXPLODE_ON = EXPLODE_THRESHOLDS[mrRank] ?? 16;
  const BASE_DICE = 4;
  const MAX_DICE_SAFETY = 200;

  const dice = [];
  let pending = BASE_DICE;

  while (pending > 0 && dice.length < MAX_DICE_SAFETY) {
    const r = roll(1, 20);
    dice.push(r);
    if (r >= EXPLODE_ON) pending++; // explosion grants +1 extra die
    pending--;
  }

  const numExplosions = dice.filter(v => v >= EXPLODE_ON).length;
  const diceSum = dice.reduce((a, b) => a + b, 0);

  // Totals
  const total =
    diceSum +
    (mrData.value || 0) +
    (wrData.value || 0) +
    (modifiers.total || 0) +
    ngBonus;

  // Split healing: Simulcast ÷2, Versatile ÷2, AoE ÷3, or no split
  const perAlly = triggers.simulcast ? Math.floor(total / 2) : (triggers.versatile ? Math.floor(total / 2) : (triggers.aoe ? Math.floor(total / 3) : total));

  // MR rank -> cleanse charges X
  const CLEANSE_X = { d: 2, c: 2, b: 3, a: 3, s: 4 };
  const cleanseX = CLEANSE_X[mrRank] ?? 0;

  // Calculation string
  const annotatedDice = dice
    .map(v => (v >= EXPLODE_ON ? `${v}⋅EX` : `${v}`))
    .join(', ');
  const explosionExtras = Math.max(0, dice.length - BASE_DICE);

  const parts = [
    `${BASE_DICE}d20${explosionExtras > 0 ? `+${explosionExtras}` : ''} (${annotatedDice})`,
    `${mrData.value} (MR⋅${mrData.rank})`,
    `${wrData.value} (WR⋅${wrData.rank})`,
  ];
  if (hasMods && modsClean.length > 0) parts.push(`${modsClean} (mods)`);
  if (ngBonus > 0) parts.push(`${ngBonus} (NG⋅1)`);

  let calculation = parts.join(' + ');
  if (triggers.simulcast) calculation += ' ÷ 2';
  else if (triggers.versatile) calculation += ' ÷ 2';
  else if (triggers.aoe) calculation += ' ÷ 3';

  // Detect passive ability tags
  const passiveTags = getPassiveModifiers('support', comment);
  const passiveDisplay = passiveTags.length > 0 ? `${passiveTags.join(', ')}\n` : '';

  // Embed
  const displayName = getDisplayName(message);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.supportSpecial)
    .setAuthor({ name: `${displayName}'s Special Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Power Heal')
    .setThumbnail('https://terrarp.com/db/action/pheal.png');

  let description =
    `\`${calculation}\`\n` +
    passiveDisplay +
    `\n` +
    (triggers.simulcast
      ? `**+${perAlly} HP to 1 of the 2 targets** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`
      : (triggers.versatile
        ? `**+${perAlly} HP to 2 allies** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`
        : (triggers.aoe
          ? `**+${perAlly} HP to 3 allies** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`
          : `**+${perAlly} HP to 1 ally** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`))) +
    `\n► Explosions occur on 16+ rolls (25% chance per die).\n` +
    `► You are vulnerable.\n` +
    `► Free Action: Power Healing Cleanse. After healing, cleanse **${cleanseX}** (${mrRankUp}-rank) curable conditions from between and up to 3 allies within range. Manually add **5** per unused cleanse charge to your heal amount.\n` +
    (ngNote ? `${ngNote}\n` : '');

  return finalizeAndSend(message, embed, description, comment);
}


async function handleBuff(message, args, comment) {
  const mrData = getRankData(args[1], 'mastery');
  const wrData = getRankData(args[2], 'weapon');

  if (!mrData || !wrData) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.error)
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery and Weapon rank inputs.');
    return sendReply(message, embed, comment);
  }

  const modifiers = parseModifiers(args, 3);
  const rawMods = (modifiers.display ?? '').toString();
  const modsClean = rawMods.replace(/^\s*\+\s*/, '').trim();
  const hasMods = /\d/.test(modifiers.display);

  // Parse triggers
  const triggers = parseTriggers(comment, {
    aoe: /\baoe\b/i,
    versatile: /\b(?:vers[-\s]*aoe|versatile)\b/i,
    simulcast: /\bsimulcast\b/i
  });

  // Precedence: Simulcast > Versatile > AoE
  const appliedMode = triggers.simulcast ? 'Simulcast' : (triggers.versatile ? 'Versatile' : (triggers.aoe ? 'AoE' : null));

  // Parse NG trigger
  const ng = parseNGTrigger(comment);
  const ngBonus = ng.bonus;
  const ngNote = ng.note;

  // MR rank for per-charge bonus
  const mrRankRaw = (mrData.rank ?? String(args[1] ?? '')).toString();
  const mrRank = mrRankRaw.toLowerCase();

  // Per-charge bonus (added to each charge for single-target): 5 (D), 10 (S)
  const PER_CHARGE_BONUS = { d: 5, c: 5, b: 8, a: 8, s: 10 };
  const perChargeBonus = PER_CHARGE_BONUS[mrRank] ?? 0;

  // --- Roll: 1d100 (with test overrides) ---
  let r = roll(1, 100);
  let testNote = '';
  if (typeof comment === 'string') {
    // Named tests
    const named = comment.match(/\btest:(crit|100|fail|1)\b/i);
    if (named) {
      const k = named[1].toLowerCase();
      if (k === 'crit' || k === '100') { r = 100; testNote += '\n► [TEST] Forced roll: 100'; }
      else if (k === 'fail' || k === '1') { r = 1; testNote += '\n► [TEST] Forced roll: 1'; }
    }
    // Direct numeric
    const direct = comment.match(/\b(?:r|d100)\s*=\s*(\d{1,3})\b/i);
    if (direct) {
      r = Math.max(1, Math.min(100, parseInt(direct[1], 10)));
      testNote += `► [TEST] Forced roll via r/d100=: ${r}\n`;
    }
  }

  // Crits: only nat100 ×2; nat1 event on 1
  let multiplier = 1.0;
  let triggeredLine = '';
  if (r === 100) {
    multiplier = 2;
    triggeredLine = `► Crit (100). Multiplier ×2.\n`;
  } else if (r === 1) {
    triggeredLine = `► Crit Fail (1). Nat1 event.\n`;
  }

  // Totals: multiply first, then divide into 3 charges
  const totalBeforeMult =
    r +
    (mrData.value || 0) +
    (wrData.value || 0) +
    (modifiers.total || 0) +
    ngBonus;

  const multipliedTotal = Math.round(totalBeforeMult * multiplier);

  // Targeting / distribution: Simulcast and Versatile divide by 2, AoE divides by 3, otherwise divide by 3 for charges
  let perTarget;
  let displayBlock = '';

  if (appliedMode === 'Simulcast') {
    perTarget = Math.floor(multipliedTotal / 2);
    displayBlock = `**+${perTarget} damage buff to 1 of the 2 targets**\n`;
  } else if (appliedMode === 'Versatile') {
    perTarget = Math.floor(multipliedTotal / 2);
    displayBlock = `**+${perTarget} damage buff to 2 targets**\n`;
  } else if (appliedMode === 'AoE') {
    const perCharge = Math.floor(multipliedTotal / 3);
    displayBlock = `**+${perCharge} damage buff to 3 targets**\n`;
    perTarget = perCharge; // For calculation display consistency
  } else {
    // Single-target: apply per-charge bonus
    const perCharge = Math.floor(multipliedTotal / 3) + perChargeBonus;
    displayBlock = `**+${perCharge} damage buff to 1 target (3 charges)**\n`;
    perTarget = perCharge; // For calculation display consistency
  }

  // Calculation string: show × multiplier only if >1, then show appropriate divisor
  const parts = [
    `1d100 (${r})`,
    `${mrData.value} (MR⋅${mrData.rank})`,
    `${wrData.value} (WR⋅${wrData.rank})`,
  ];
  if (ngBonus > 0) parts.push(`${ngBonus} (NG⋅1)`);
  if (hasMods && modsClean.length > 0) parts.push(`${modsClean} (mods)`);

  let calcTail = '';
  if (multiplier !== 1) calcTail += ` × ${multiplier}`;

  // Show correct divisor based on mode
  if (appliedMode === 'Simulcast' || appliedMode === 'Versatile') {
    calcTail += ' ÷ 2';
  } else {
    calcTail += ' ÷ 3';
  }

  const calculation = parts.join(' + ') + calcTail;

  // Detect passive ability tags
  const passiveTags = getPassiveModifiers('support', comment);
  const passiveDisplay = passiveTags.length > 0 ? `${passiveTags.join(', ')}\n` : '';

  // Embed
  const displayName = getDisplayName(message);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.support)
    .setAuthor({ name: `${displayName}'s Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Buff')
    .setThumbnail('https://terrarp.com/db/action/buff.png');

  let description =
    `\`${calculation}\`\n` +
    passiveDisplay +
    `\n` +
    displayBlock +
    triggeredLine +
    (ngNote ? `${ngNote}\n` : '') +
    testNote;

  return finalizeAndSend(message, embed, description, comment);
}


async function handlePowerBuff(message, args, comment) {
  const mrData = getRankData(args[1], 'mastery');
  const wrData = getRankData(args[2], 'weapon');

  if (!mrData || !wrData) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.error)
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery and Weapon rank inputs.');
    return sendReply(message, embed, comment);
  }

  const modifiers = parseModifiers(args, 3);
  const rawMods = (modifiers.display ?? '').toString();
  const modsClean = rawMods.replace(/^\s*\+\s*/, '').trim();
  const hasMods = /\d/.test(modifiers.display);

  // Parse triggers
  const triggers = parseTriggers(comment, {
    aoe: /\baoe\b/i,
    versatile: /\b(?:vers[-\s]*aoe|versatile)\b/i,
    simulcast: /\bsimulcast\b/i
  });

  // Precedence: Simulcast > Versatile > AoE
  const appliedMode = triggers.simulcast ? 'Simulcast' : (triggers.versatile ? 'Versatile' : (triggers.aoe ? 'AoE' : null));

  // Parse NG trigger
  const ng = parseNGTrigger(comment);
  const ngBonus = ng.bonus;
  const ngNote = ng.note;

  // MR rank for per-charge bonus
  const mrRankRaw = (mrData.rank ?? String(args[1] ?? '')).toString();
  const mrRank = mrRankRaw.toLowerCase();

  // Per-charge bonus (added to each charge for single-target): 5 (D), 10 (B), 15 (S)
  const PER_CHARGE_BONUS = { d: 5, c: 8, b: 10, a: 12, s: 15 };
  const perChargeBonus = PER_CHARGE_BONUS[mrRank] ?? 0;

  // --- Rolls: 2d100 (with test overrides) ---
  let r1 = roll(1, 100);
  let r2 = roll(1, 100);
  let testNote = '';

  if (typeof comment === 'string') {
    // Named scenarios
    const named = comment.match(/\btest[:=]?\s*(star\s*breaker|world\s*ender|schrodinger|crit|100|fail|1)\b/i);
    if (named) {
      const key = named[1].toLowerCase().replace(/\s+/g, '');
      switch (key) {
        case 'starbreaker': r1 = 100; r2 = 100; testNote += '\n► [TEST] Forced: STAR BREAKER (100,100)'; break;
        case 'worldender': r1 = 1; r2 = 1; testNote += '\n► [TEST] Forced: WORLD ENDER (1,1)'; break;
        case 'schrodinger': r1 = 100; r2 = 1; testNote += '\n► [TEST] Forced: Schrodinger (100,1)'; break;
        case 'crit':
        case '100':         r1 = 100; r2 = 42; testNote += '\n► [TEST] Forced: Crit (100,x)'; break;
        case 'fail':
        case '1':           r1 = 1;   r2 = 42; testNote += '\n► [TEST] Forced: Crit Fail (1,x)'; break;
      }
    }
    // Direct "r=100,86"
    const both = comment.match(/\br\s*=\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
    if (both) {
      r1 = Math.max(1, Math.min(100, parseInt(both[1], 10)));
      r2 = Math.max(1, Math.min(100, parseInt(both[2], 10)));
      testNote += `► [TEST] Forced rolls: ${r1}, ${r2}\n`;
    } else {
      // Or "r1=.." and/or "r2=.."
      const m1 = comment.match(/\br1\s*=\s*(\d{1,3})\b/i);
      const m2 = comment.match(/\br2\s*=\s*(\d{1,3})\b/i);
      if (m1) { r1 = Math.max(1, Math.min(100, parseInt(m1[1], 10))); testNote += `► [TEST] Forced r1: ${r1}\n`; }
      if (m2) { r2 = Math.max(1, Math.min(100, parseInt(m2[1], 10))); testNote += `► [TEST] Forced r2: ${r2}\n`; }
    }
  }

  // --- Crit logic for 2d100 set ---
  const countHundreds = (r1 === 100) + (r2 === 100);
  const countOnes     = (r1 === 1) + (r2 === 1);

  let multiplier = 1.0;
  let resultTag = '';
  let triggeredLine = '';

  if (countHundreds >= 2) {
    multiplier = 7;
    resultTag = '(STAR BREAKER)';
    triggeredLine = `► Star Breaker (100 & 100+): Multiplier ×7.\n`;
  } else if (countOnes >= 2 && countHundreds === 0) {
    resultTag = '(WORLD ENDER)';
    triggeredLine = `► World Ender (1 & 1+): Chance for Nat1+ event.\n`;
  } else if (countHundreds >= 1 && countOnes >= 1) {
    multiplier = 2;
    resultTag = '(schrodinger crit!)';
    triggeredLine = `► Schrodinger Crit (100 & 1): Multiplier ×2 and chance for Nat1 event.\n`;
  } else if (countHundreds >= 1) {
    multiplier = 2;
    resultTag = '(crit!)';
    triggeredLine = `► Crit (100): Multiplier ×2.\n`;
  } else if (countOnes >= 1) {
    resultTag = '(crit fail...)';
    triggeredLine = `► Crit Fail (1): Chance for Nat1 event.\n`;
  }

  // Totals: multiply first, then divide into 3 charges
  const totalBeforeMult =
    (r1 + r2) +
    (mrData.value || 0) +
    (wrData.value || 0) +
    (modifiers.total || 0) +
    ngBonus;

  const multipliedTotal = Math.round(totalBeforeMult * multiplier);

  // Targeting / distribution: Simulcast and Versatile divide by 2, AoE divides by 3, otherwise divide by 3 for charges
  let perTarget;
  let displayBlock = '';

  if (appliedMode === 'Simulcast') {
    perTarget = Math.floor(multipliedTotal / 2);
    displayBlock = `**+${perTarget} damage buff to 1 of the 2 targets**\n`;
  } else if (appliedMode === 'Versatile') {
    perTarget = Math.floor(multipliedTotal / 2);
    displayBlock = `**+${perTarget} damage buff to 2 targets**\n`;
  } else if (appliedMode === 'AoE') {
    const perCharge = Math.floor(multipliedTotal / 3);
    displayBlock = `**+${perCharge} damage buff to 3 targets**\n`;
    perTarget = perCharge; // For calculation display consistency
  } else {
    // Single-target: apply per-charge bonus
    const perCharge = Math.floor(multipliedTotal / 3) + perChargeBonus;
    displayBlock = `**+${perCharge} damage buff to 1 target (3 charges)**\n`;
    perTarget = perCharge; // For calculation display consistency
  }

  // Calculation string: show ×multiplier only if >1, then show appropriate divisor
  const parts = [
    `2d100 (${r1}, ${r2})`,
    `${mrData.value} (MR⋅${mrData.rank})`,
    `${wrData.value} (WR⋅${wrData.rank})`,
  ];
  if (ngBonus > 0) parts.push(`${ngBonus} (NG⋅1)`);
  if (hasMods && modsClean.length > 0) parts.push(`${modsClean} (mods)`);

  let calcTail = '';
  if (multiplier !== 1) calcTail += ` × ${multiplier}`;

  // Show correct divisor based on mode
  if (appliedMode === 'Simulcast' || appliedMode === 'Versatile') {
    calcTail += ' ÷ 2';
  } else {
    calcTail += ' ÷ 3';
  }

  const calculation = parts.join(' + ') + calcTail;

  // Detect passive ability tags
  const passiveTags = getPassiveModifiers('support', comment);
  const passiveDisplay = passiveTags.length > 0 ? `${passiveTags.join(', ')}\n` : '';

  // Embed
  const displayName = getDisplayName(message);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.supportSpecial)
    .setAuthor({ name: `${displayName}'s Special Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(`Power Buff ${resultTag ? resultTag : ''}`.trim())
    .setThumbnail('https://terrarp.com/db/action/pbuff.png');

  let description =
    `\`${calculation}\`\n` +
    passiveDisplay +
    `\n` +
    displayBlock +
    triggeredLine +
    (ngNote ? `${ngNote}\n` : '') +
    testNote;

  return finalizeAndSend(message, embed, description, comment);
}


async function handleImbue(message, args, comment) {
  const displayName = getDisplayName(message);

  // --- Parse triggers from comment ---
  const text = typeof comment === 'string' ? comment : '';

  // Target (NAME)  (captures content within parentheses; trims spaces)
  let targetName = null;
  const tMatch = text.match(/\bTarget\s*\(([^)]+)\)/i);
  if (tMatch) {
    targetName = tMatch[1].trim();
  }

  // Break (TYPE)  (Construct|Dark|Elemental|Physical|Order), case-insensitive
  let breakType = null;
  const bMatch = text.match(/\bBreak\s*\((Construct|Dark|Elemental|Physical|Order)\)/i);
  if (bMatch) {
    const key = bMatch[1].toLowerCase();
    const MAP = { construct: 'Construct', dark: 'Dark', elemental: 'Elemental', physical: 'Physical', order: 'Order' };
    breakType = MAP[key] || null;
  }

  // Embed
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.support)
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Imbue')
    .setThumbnail('https://terrarp.com/db/action/sba.png');

    let description = ''; // Initialize an empty description string

    if (targetName && breakType) {
      // If parsing is successful, use the success message
      description = `► **Free Action.** Imbued **${targetName}**'s attacks with **${breakType}** break-damage.\n◦ Inform your imbued ally when you switch to another ally.\n`;
    } else {
      // Otherwise, use the fallback message
      description = `► **Free Action.** If you heal or buff this cycle, you may imbue an ally with any of your support mastery's break-type, which lasts indefinitely, one ally at a time.\n`;
    }

  return finalizeAndSend(message, embed, description, comment);
}


async function handleVersatile(message, args, comment) {
  const displayName = getDisplayName(message);

  // Parse triggers
  const triggers = parseTriggers(comment, {
    simulcast: /\bsimulcast\b/i
  });

  // Embed
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.support)
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(triggers.simulcast ? 'Simulcast' : 'Versatile')
    .setThumbnail('https://terrarp.com/db/action/sba.png');

  // Description
  let description = `► **Free Action.** Apply the effects to 2 targets (instead of 3) and apply the last heal/buff amount to one of those targets.\n`;

  if (triggers.simulcast) {
    description += `► **Bonus Action: Simulcast.** Target 2 allies with Heal and Buff (both must be special or non-special). Choose if each target gets either the heal or buff.\n`;
  }

  return finalizeAndSend(message, embed, description, comment);
}


async function handleRevive(message, args, comment) {
  const displayName = getDisplayName(message);
  const commentString = typeof comment === 'string' ? comment : '';

  // Parse triggers
  const triggers = parseTriggers(comment, {
    stabilize: /\bstabilize\b/i
  });
  const stabilizeActive = triggers.stabilize;
  const title = stabilizeActive ? 'Stabilize' : 'Revive';
  const actionVerb = stabilizeActive ? 'Stabilize' : 'Revive';
  const actionPastTense = stabilizeActive ? 'stabilized' : 'revived';

  // Trigger: "Target(TARGETNAME)"
  let targetName = 'TARGETNAME';
  const targetMatch = commentString.match(/\btarget\s*\(([^)]+)\)/i);
  if (targetMatch && targetMatch[1]) {
    targetName = targetMatch[1].trim();
  }

  // Trigger: "MaxHP(TARGETMAXHP)"
  let hpValueText = 'TARGETMAXHP';
  const maxHpMatch = commentString.match(/\bmaxhp\s*\(([^)]+)\)/i);
  if (maxHpMatch && maxHpMatch[1]) {
    const maxHpRaw = maxHpMatch[1].trim();
    const maxHpNum = parseFloat(maxHpRaw);

    if (isNaN(maxHpNum)) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.error)
        .setTitle('Invalid MaxHP Value')
        .setDescription('The value provided for MaxHP must be a number.');
      return sendReply(message, embed, comment);
    }
    // Calculate 50% of MaxHP, rounded down.
    hpValueText = `${Math.floor(maxHpNum * 0.5)}`;
  }

  // Embed
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.support)
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(title)
    .setThumbnail('https://terrarp.com/db/action/sba.png');

  // Description
  let description = `► **Bonus Action.** ${actionVerb} an ally within range.\n`;
  description += `◦ **${targetName}** has been ${actionPastTense}.\n`;
  description += `◦ **${targetName}** regains **${hpValueText} HP**.\n`;

  return finalizeAndSend(message, embed, description, comment);
}


async function handleCleanse(message, args, comment) {
  const displayName = getDisplayName(message);

  // Extract rank info
  const mr = extractRankInfo(args, 1, 'mastery');

  // Validate minimum rank (D)
  if (!validateMinimumRank(message, mr.rank, 'D', 'Cleanse', comment)) {
    return;
  }

  // Parse triggers
  const triggers = parseTriggers(comment, {
    cleanse: /\bcleanse\b/i
  });
  const cleanseActive = triggers.cleanse;
  const title = cleanseActive ? 'Cleanse' : 'Cure';

  // Embed
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.support)
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(title)
    .setThumbnail('https://terrarp.com/db/action/sba.png');

  // Description
  let description = '► ***Passive: Cure.*** If you are afflicted with a curable condition, you may remove **1 stack** from yourself each cycle *before* it takes effect.\n';

  if (cleanseActive) {
    const CLEANSE_VALUES = { d: 2, c: 2, b: 4, a: 4, s: 6 };
    const cleanseAmount = CLEANSE_VALUES[mr.rank] ?? 0; // Default to 0 if rank is not in the list

    description += `\n► **Bonus Action: Cleanse.** Remove **${cleanseAmount} stacks** (MR⋅${mr.rankUpper}) of curable conditions between and up to 3 targets.\n`;
  }

  return finalizeAndSend(message, embed, description, comment);
}


async function handleHaste(message, args, comment) {
  const displayName = getDisplayName(message);

  // Extract rank info
  const mr = extractRankInfo(args, 1, 'mastery');

  // Validate minimum rank (D)
  if (!validateMinimumRank(message, mr.rank, 'D', 'Haste', comment)) {
    return;
  }

  // Define movement values based on rank
  const HASTE_VALUES = { d: 2, c: 2, b: 3, a: 3, s: 4 };
  const movementAmount = HASTE_VALUES[mr.rank] ?? 0;

  // Embed
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.support)
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Haste')
    .setThumbnail('https://terrarp.com/db/action/sba.png');

  // Description
  let description = `► **Bonus Action.** Distribute **${movementAmount} movements** (MR⋅${mr.rankUpper}) between and up to 3 targets.\n`;
  description += `◦ *Duration:* The bonus movements last until the end of the next damage phase.\n◦ *Limitation:* Each target may gain a maximum of *2 movements* from Haste.\n`;

  return finalizeAndSend(message, embed, description, comment);
}


async function handleInspire(message, args, comment) {
  const displayName = getDisplayName(message);

  // Extract rank info
  const mr = extractRankInfo(args, 1, 'mastery');

  // Validate minimum rank (D)
  if (!validateMinimumRank(message, mr.rank, 'D', 'Inspire', comment)) {
    return;
  }

  // Define bonus values based on rank
  const INSPIRE_VALUES = { d: 5, c: 5, b: 10, a: 10, s: 15 };
  const bonusAmount = INSPIRE_VALUES[mr.rank] ?? 0;

  // Embed
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.support)
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Inspire')
    .setThumbnail('https://terrarp.com/db/action/sba.png');

  // Description
  let description = `► **Bonus Action.** Distribute **+${bonusAmount} bonus** (MR⋅${mr.rankUpper}) between and up to 3 targets in multiple of 5s toward a *mastery check* or *save roll*.\n`;
  description += `◦ *Duration:* This bonus lasts until the end of the next damage phase.\n◦ *Limitation:* This bonus does not stack.\n`;

  return finalizeAndSend(message, embed, description, comment);
}


async function handleSmite(message, args, comment) {
  const displayName = getDisplayName(message);

  // Embed
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.support)
    .setAuthor({ name: `${displayName}'s Passive`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Smite')
    .setThumbnail('https://terrarp.com/db/action/sba.png');

  // Description
  let description = `► ***Passive.*** Whenever you *Heal* or *Buff* an ally, you may activate *Torment* or *Area Effect* from that ally's space.\n◦ Activate Torment or Area Effect below.\n`;

  return finalizeAndSend(message, embed, description, comment);
}

// Sub-Action: Blessed (Support Passive) — Increases heal and buff modifier.
// Rolls: No. NG1: No. Crit: No.
// Minimum Rank: D

async function handleBlessed(message, args, comment) {
  const displayName = getDisplayName(message);

  // Extract rank info
  const mr = extractRankInfo(args, 1, 'mastery');

  // Validate minimum rank (D)
  if (!validateMinimumRank(message, mr.rank, 'D', 'Blessed', comment)) {
    return;
  }

  // Define modifier based on rank (+5 per rank: D=5, C=10, B=15, A=20, S=25)
  const BLESSED_MODIFIER = { d: 5, c: 10, b: 15, a: 20, s: 25 };
  const modifier = BLESSED_MODIFIER[mr.rank] ?? 0;

  // Embed
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.supportPassive)
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Blessed')
    .setThumbnail('https://terrarp.com/db/action/blessed.png');

  const description = `► **Passive.** All heal and buff actions gain **+${modifier}** extra modifier (MR⋅${mr.rankUpper}).\n`;

  return finalizeAndSend(message, embed, description, comment);
}

module.exports = {
  handleHeal,
  handlePowerHeal,
  handleBuff,
  handlePowerBuff,
  handleImbue,
  handleVersatile,
  handleRevive,
  handleCleanse,
  handleHaste,
  handleInspire,
  handleSmite,
  handleBlessed
};