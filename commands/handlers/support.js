const { EmbedBuilder } = require('discord.js');
const { roll, getRankData, parseModifiers, sendReply, getPassiveModifiers } = require('../helpers');

async function handleHeal(message, args, comment) {
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
  const rawMods = (modifiers.display ?? '').toString();
  const modsClean = rawMods.replace(/^\s*\+\s*/, '').trim();
  const hasMods = /\d/.test(modifiers.display);

  // Triggers
  const aoeActive = typeof comment === 'string' && /\baoe\b/i.test(comment);
  const versatileActive = typeof comment === 'string' && /\b(?:vers[-\s]*aoe|versatile)\b/i.test(comment);
  const simulcastActive = typeof comment === 'string' && /\bsimulcast\b/i.test(comment);

  // Precedence: Simulcast > Versatile > AoE
  const appliedMode = simulcastActive ? 'Simulcast' : (versatileActive ? 'Versatile' : (aoeActive ? 'AoE' : null));

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
  const perAlly = simulcastActive ? Math.floor(total / 2) : (versatileActive ? Math.floor(total / 2) : (aoeActive ? Math.floor(total / 3) : total));

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
  if (simulcastActive) calculation += ' ÷ 2';
  else if (versatileActive) calculation += ' ÷ 2';
  else if (aoeActive) calculation += ' ÷ 3';

  // Embed
  const displayName = message.member?.displayName ?? message.author.username;
  const embed = new EmbedBuilder()
    .setColor('#4e9be2')
    .setAuthor({ name: `${displayName}'s Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Heal')
    .setThumbnail('https://terrarp.com/db/action/heal.png');

  let description =
    `\`${calculation}\`\n\n` +
    (simulcastActive
      ? `**+${perAlly} HP to 1 of the 2 targets** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`
      : (versatileActive
        ? `**+${perAlly} HP to 2 allies** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`
        : (aoeActive
          ? `**+${perAlly} HP to 3 allies** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`
          : `**+${perAlly} HP to 1 ally** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`))) +
    (ngNote ? `${ngNote}\n` : '') +
    `\n► Free Action: Healing Cleanse. Whenever you heal, cleanse 1 curable condition after healing from an ally within range.\n`;

  if (comment) description += `${comment}`;

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

async function handlePowerHeal(message, args, comment) {
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
  const rawMods = (modifiers.display ?? '').toString();
  const modsClean = rawMods.replace(/^\s*\+\s*/, '').trim();
  const hasMods = /\d/.test(modifiers.display);

  // Triggers
  const aoeActive = typeof comment === 'string' && /\baoe\b/i.test(comment);
  const versatileActive = typeof comment === 'string' && /\b(?:vers[-\s]*aoe|versatile)\b/i.test(comment);
  const simulcastActive = typeof comment === 'string' && /\bsimulcast\b/i.test(comment);

  // Precedence: Simulcast > Versatile > AoE
  const appliedMode = simulcastActive ? 'Simulcast' : (versatileActive ? 'Versatile' : (aoeActive ? 'AoE' : null));

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
  const perAlly = simulcastActive ? Math.floor(total / 2) : (versatileActive ? Math.floor(total / 2) : (aoeActive ? Math.floor(total / 3) : total));

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
  if (simulcastActive) calculation += ' ÷ 2';
  else if (versatileActive) calculation += ' ÷ 2';
  else if (aoeActive) calculation += ' ÷ 3';

  // Embed
  const displayName = message.member?.displayName ?? message.author.username;
  const embed = new EmbedBuilder()
    .setColor('#3460d0')
    .setAuthor({ name: `${displayName}'s Special Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Power Heal')
    .setThumbnail('https://terrarp.com/db/action/pheal.png');

  let description =
    `\`${calculation}\`\n\n` +
    (simulcastActive
      ? `**+${perAlly} HP to 1 of the 2 targets** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`
      : (versatileActive
        ? `**+${perAlly} HP to 2 allies** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`
        : (aoeActive
          ? `**+${perAlly} HP to 3 allies** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`
          : `**+${perAlly} HP to 1 ally** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`))) +
    `\n► Explosions occur on 16+ rolls (25% chance per die).\n` +
    `► You are vulnerable.\n` +
    `► Free Action: Power Healing Cleanse. After healing, cleanse **${cleanseX}** (${mrRankUp}-rank) curable conditions from between and up to 3 allies within range. Manually add **5** per unused cleanse charge to your heal amount.\n` +
    (ngNote ? `${ngNote}\n` : '');

  if (comment) description += `${comment}`;

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

async function handleBuff(message, args, comment) {
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
  const rawMods = (modifiers.display ?? '').toString();
  const modsClean = rawMods.replace(/^\s*\+\s*/, '').trim();
  const hasMods = /\d/.test(modifiers.display);

  // Triggers
  const aoeActive       = typeof comment === 'string' && /\baoe\b/i.test(comment);
  const versatileActive = typeof comment === 'string' && /\b(?:vers[-\s]*aoe|versatile)\b/i.test(comment);
  const simulcastActive = typeof comment === 'string' && /\bsimulcast\b/i.test(comment);

  // Precedence: Simulcast > Versatile > AoE
  const appliedMode = simulcastActive ? 'Simulcast' : (versatileActive ? 'Versatile' : (aoeActive ? 'AoE' : null));

  // NG trigger (only NG1 enabled)
  let ngBonus = 0;
  let ngNote = '';
  if (typeof comment === 'string') {
    const m = comment.match(/\bng(\d+)\b/i);
    if (m) {
      const level = parseInt(m[1], 10);
      if (level === 1) ngBonus = 5;
      else ngNote = `► NG⋅${level} is currently disabled.`;
    }
  }

  // MR rank + buff bonus
  const mrRankRaw = (mrData.rank ?? String(args[1] ?? '')).toString();
  const mrRank = mrRankRaw.toLowerCase();
  const BUFF_BONUS = { d: 10, c: 10, b: 15, a: 15, s: 20 };
  const buffBonus = BUFF_BONUS[mrRank] ?? 0;

  // Per-charge bonus (added to each charge): 5 (D), 10 (S)
  const PER_CHARGE_BONUS = { d: 5, c: 5, b: 8, a: 8, s: 10 };
  const perChargeBonus = PER_CHARGE_BONUS[mrRank] ?? 0;

  // Single-target flat bonus by MR (applies ONLY when not AoE/Versatile/Simulcast)
  const SINGLE_TARGET_BONUS = { d: 10, c: 10, b: 15, a: 15, s: 20 };
  const singleTargetBonusTotal = (appliedMode === null) ? (SINGLE_TARGET_BONUS[mrRank] ?? 0) : 0;

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
    buffBonus +
    singleTargetBonusTotal +
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
    displayBlock = `**+${perCharge} damage buff to 1 target (3 charges)**\n\n► Single-target bonus activated. ${singleTargetBonusTotal} added (${wrData.rank}-rank).\n`;
    perTarget = perCharge; // For calculation display consistency
  }

  // Calculation string: show × multiplier only if >1, then show appropriate divisor
  const parts = [
    `1d100 (${r})`,
    `${mrData.value} (MR⋅${mrData.rank})`,
    `${wrData.value} (WR⋅${wrData.rank})`,
  ];
  if (buffBonus > 0) parts.push(`${buffBonus} (buff mod)`);
  if (singleTargetBonusTotal > 0) parts.push(`${singleTargetBonusTotal} (ST bonus)`);
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

  // Embed
  const displayName = message.member?.displayName ?? message.author.username;
  const embed = new EmbedBuilder()
    .setColor('#4e9be2')
    .setAuthor({ name: `${displayName}'s Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Buff')
    .setThumbnail('https://terrarp.com/db/action/buff.png');

  let description =
    `\`${calculation}\`\n\n` +
    displayBlock +
    triggeredLine +
    (ngNote ? `${ngNote}\n` : '') +
    testNote;

  if (comment) description += `${comment}`;

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

async function handlePowerBuff(message, args, comment) {
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
  const rawMods = (modifiers.display ?? '').toString();
  const modsClean = rawMods.replace(/^\s*\+\s*/, '').trim();
  const hasMods = /\d/.test(modifiers.display);

  // Triggers
  const aoeActive       = typeof comment === 'string' && /\baoe\b/i.test(comment);
  const versatileActive = typeof comment === 'string' && /\b(?:vers[-\s]*aoe|versatile)\b/i.test(comment);
  const simulcastActive = typeof comment === 'string' && /\bsimulcast\b/i.test(comment);

  // Precedence: Simulcast > Versatile > AoE
  const appliedMode = simulcastActive ? 'Simulcast' : (versatileActive ? 'Versatile' : (aoeActive ? 'AoE' : null));

  // NG trigger (only NG1 enabled)
  let ngBonus = 0;
  let ngNote = '';
  if (typeof comment === 'string') {
    const m = comment.match(/\bng(\d+)\b/i);
    if (m) {
      const level = parseInt(m[1], 10);
      if (level === 1) ngBonus = 5;
      else ngNote = `► NG⋅${level} is currently disabled.`;
    }
  }

  // MR rank + bonuses
  const mrRankRaw = (mrData.rank ?? String(args[1] ?? '')).toString();
  const mrRank = mrRankRaw.toLowerCase();
  const BUFF_BONUS = { d: 20, c: 20, b: 30, a:30, s: 40 };
  const buffBonus = BUFF_BONUS[mrRank] ?? 0;

  // Per-charge bonus (added to each charge): 5 (D), 10 (B), 15 (S)
  const PER_CHARGE_BONUS = { d: 5, c: 8, b: 10, a: 12, s: 15 };
  const perChargeBonus = PER_CHARGE_BONUS[mrRank] ?? 0;

  // Single-target flat bonus by MR (applies ONLY when not AoE/Versatile/Simulcast)
  const SINGLE_TARGET_BONUS = { d: 20, c: 20, b: 30, a:30, s: 40 };
  const singleTargetBonusTotal = (appliedMode === null) ? (SINGLE_TARGET_BONUS[mrRank] ?? 0) : 0;

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
    buffBonus +
    singleTargetBonusTotal +
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
    displayBlock = `**+${perCharge} damage buff to 1 target (3 charges)**\n\n► Single-target bonus activated. ${singleTargetBonusTotal} added (${wrData.rank}-rank).\n`;
    perTarget = perCharge; // For calculation display consistency
  }

  // Calculation string: show ×multiplier only if >1, then show appropriate divisor
  const parts = [
    `2d100 (${r1}, ${r2})`,
    `${mrData.value} (MR⋅${mrData.rank})`,
    `${wrData.value} (WR⋅${wrData.rank})`,
  ];
  if (buffBonus > 0) parts.push(`${buffBonus} (buff mod)`);
  if (singleTargetBonusTotal > 0) parts.push(`${singleTargetBonusTotal} (ST bonus)`);
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

  // Embed
  const displayName = message.member?.displayName ?? message.author.username;
  const embed = new EmbedBuilder()
    .setColor('#3460d0')
    .setAuthor({ name: `${displayName}'s Special Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(`Power Buff ${resultTag ? resultTag : ''}`.trim())
    .setThumbnail('https://terrarp.com/db/action/pbuff.png');

  let description =
    `\`${calculation}\`\n\n` +
    displayBlock +
    triggeredLine +
    (ngNote ? `${ngNote}\n` : '') +
    testNote;

  if (comment) description += `${comment}`;

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

async function handleImbue(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;

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
    .setColor('#5f6587')
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

  if (comment) description += `${comment}`;

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

async function handleVersatile(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;

  // Trigger: Simulcast
  const ultraActive = typeof comment === 'string' && /\bsimulcast\b/i.test(comment);

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#5f6587')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(ultraActive ? 'Simulcast' : 'Versatile')
    .setThumbnail('https://terrarp.com/db/action/sba.png');

  // Description
  let description = `► **Free Action.** Apply the effects to 2 targets (instead of 3) and apply the last heal/buff amount to one of those targets.\n`;

  if (ultraActive) {
    description += `► **Bonus Action: Simulcast.** Target 2 allies with Heal and Buff (both must be special or non-special). Choose if each target gets either the heal or buff.\n`;
  }

  if (comment) description += `${comment}`;

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

async function handleRevive(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Trigger: "Stabilize"
  const stabilizeActive = /\bstabilize\b/i.test(commentString);
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
        .setColor('Red')
        .setTitle('Invalid MaxHP Value')
        .setDescription('The value provided for MaxHP must be a number.');
      return sendReply(message, embed, comment);
    }
    // Calculate 50% of MaxHP, rounded down.
    hpValueText = `${Math.floor(maxHpNum * 0.5)}`;
  }

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#5f6587')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(title)
    .setThumbnail('https://terrarp.com/db/action/sba.png');

  // Description
  let description = `► **Bonus Action.** ${actionVerb} an ally within range.\n`;
  description += `◦ **${targetName}** has been ${actionPastTense}.\n`;
  description += `◦ **${targetName}** regains **${hpValueText} HP**.\n`;

  if (comment) {
     description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

async function handleCleanse(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data and validate
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();

  if (!mrData || mrRank === 'e') {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('This action is not available at Mastery Rank (E).');
    return sendReply(message, embed, comment);
  }
  const mrRankUp = mrData.rank.toUpperCase();

  // Trigger: "Cleanse"
  const cleanseActive = /\bcleanse\b/i.test(commentString);
  const title = cleanseActive ? 'Cleanse' : 'Cure';

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#5f6587')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(title)
    .setThumbnail('https://terrarp.com/db/action/sba.png');

  // Description
  let description = '► ***Passive: Cure.*** If you are afflicted with a curable condition, you may remove **1 stack** from yourself each cycle *before* it takes effect.\n';

  if (cleanseActive) {
    const CLEANSE_VALUES = { d: 2, c: 2, b: 4, a: 4, s: 6 };
    const cleanseAmount = CLEANSE_VALUES[mrRank] ?? 0; // Default to 0 if rank is not in the list

    description += `\n► **Bonus Action: Cleanse.** Remove **${cleanseAmount} stacks** (MR⋅${mrRankUp}) of curable conditions between and up to 3 targets.\n`;
  }

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

async function handleHaste(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;

  // Get rank data and validate
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();

  if (!mrData || mrRank === 'e') {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('This action is not available at Mastery Rank (E).');
    return sendReply(message, embed, comment);
  }
  const mrRankUp = mrData.rank.toUpperCase();

  // Define movement values based on rank
  const HASTE_VALUES = { d: 2, c: 2, b: 3, a: 3, s: 4 };
  const movementAmount = HASTE_VALUES[mrRank] ?? 0;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#5f6587')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Haste')
    .setThumbnail('https://terrarp.com/db/action/sba.png');

  // Description
  let description = `► **Bonus Action.** Distribute **${movementAmount} movements** (MR⋅${mrRankUp}) between and up to 3 targets.\n`;
  description += `◦ *Duration:* The bonus movements last until the end of the next damage phase.\n◦ *Limitation:* Each target may gain a maximum of *2 movements* from Haste.\n`;

  if (comment) {
    description += `${comment}`;
  }

  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

async function handleInspire(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;

  // Get rank data and validate
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();

  if (!mrData || mrRank === 'e') {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('This action is not available at Mastery Rank (E).');
    return sendReply(message, embed, comment);
  }
  const mrRankUp = mrData.rank.toUpperCase();

  // Define bonus values based on rank
  const INSPIRE_VALUES = { d: 5, c: 5, b: 10, a: 10, s: 15 };
  const bonusAmount = INSPIRE_VALUES[mrRank] ?? 0;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#5f6587')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Inspire')
    .setThumbnail('https://terrarp.com/db/action/sba.png');

  // Description
  let description = `► **Bonus Action.** Distribute **+${bonusAmount} bonus** (MR⋅${mrRankUp}) between and up to 3 targets in multiple of 5s toward a *mastery check* or *save roll*.\n`;
  description += `◦ *Duration:* This bonus lasts until the end of the next damage phase.\n◦ *Limitation:* This bonus does not stack.\n`;

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
