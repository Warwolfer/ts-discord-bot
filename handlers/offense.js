// offense.js - Offensive action handlers for the Sphera RPG Discord bot

const { EmbedBuilder } = require('discord.js');
const {
    roll,
    getRankData,
    parseModifiers,
    sendReply,
    getPassiveModifiers,
    getDisplayName,
    parseNGTrigger,
    finalizeAndSend,
    validateMinimumRank,
    parseTriggers
} = require('../helpers');
const { RANK_DATA, EMBED_COLORS } = require('../constants');

// --- OFFENSIVE HANDLERS ---

// Offense Action MA Attack


async function handleStable(message, args, comment) {
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

  // --- Exploding dice: 7d20, each 17+ rolls an extra d20 (chaining) ---
  const EXPLODE_ON = 17;
  const BASE_DICE = 7;
  const MAX_DICE_SAFETY = 200; // hard cap to avoid infinite loops

  const dice = [];
  let pending = BASE_DICE;

  while (pending > 0 && dice.length < MAX_DICE_SAFETY) {
    const r = roll(1, 20); // assumes your `roll(n, sides)` helper returns a single integer for n=1
    dice.push(r);
    if (r >= EXPLODE_ON) pending++; // explosion grants +1 extra die
    pending--;
  }

  const numExplosions = dice.filter(v => v >= EXPLODE_ON).length;
  const diceSum = dice.reduce((a, b) => a + b, 0);

  // Mods print logic
  const rawMods = (modifiers.display ?? '').toString();
  const modsClean = rawMods.replace(/^\s*\+\s*/, '').trim();
  const hasMods = /\d/.test(modifiers.display);

  // --- NG trigger from comment (future-proofed) ---
  const ng = parseNGTrigger(comment);
  const ngBonus = ng.bonus;
  const ngNote = ng.note;

  // Totals
  const total =
    diceSum +
    (mrData.value || 0) +
    (wrData.value || 0) +
    (modifiers.total || 0) +
    ngBonus;

  // Calculation string parts
  const annotatedDice = dice
    .map(v => (v >= EXPLODE_ON ? `${v}⋅EX` : `${v}`))
    .join(', ');

  const parts = [
    `${BASE_DICE}d20${dice.length > BASE_DICE ? `+${dice.length - BASE_DICE}` : ''} (${annotatedDice})`,
    `${mrData.value} (MR⋅${mrData.rank})`,
    `${wrData.value} (WR⋅${wrData.rank})`,
  ];

  if (hasMods && modsClean.length > 0) {
    parts.push(`${modsClean} (mods)`);
  }
  if (ngBonus > 0) {
    parts.push(`${ngBonus} (NG⋅1)`); // shows "+ 5 (NG1)"
  }

  const calculation = parts.join(' + ');

  // Detect passive ability tags
  const passiveTags = getPassiveModifiers('attack', comment);
  const passiveDisplay = passiveTags.length > 0 ? `${passiveTags.join(', ')}\n` : '';

  // Embed
  const displayName = getDisplayName(message);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.offense)
    .setAuthor({ name: `${displayName}'s Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Stable Attack')
    .setThumbnail('https://terrarp.com/db/action/stable.png');

  let description =
    `\`${calculation}\`\n${passiveDisplay}\n` +
    `**${total} total** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n` +
    (ngNote ? `${ngNote}\n` : '');

  return finalizeAndSend(message, embed, description, comment);
}

// Action: Burst Attack — 12d20 + MR-bonus d20 + WR + mods, d20 explodes on 16+


async function handleBurst(message, args, comment) {
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

  // --- Config ---
  const EXPLODE_ON = 16;   // 25% chance (16–20)
  const BASE_DICE_STATIC = 12;
  const MAX_DICE_SAFETY = 200;

  // MR rank -> bonus base dice
  // Examples: MR=B => 12d20 -> 13d20, MR=S => 12d20 -> 14d20
  const mrRank = (mrData.rank ?? String(args[1] ?? '')).toLowerCase();
  const MR_BONUS_DICE = { e: 0, d: 0, c: 0, b: 1, a: 1, s: 2 };
  const mrBonusDice = MR_BONUS_DICE[mrRank] ?? 0;

  const baseDice = BASE_DICE_STATIC + mrBonusDice;

  // --- Exploding dice roll ---
  const dice = [];
  let pending = baseDice;

  while (pending > 0 && dice.length < MAX_DICE_SAFETY) {
    const r = roll(1, 20);
    dice.push(r);
    if (r >= EXPLODE_ON) pending++; // explosion grants +1 extra die (chaining)
    pending--;
  }

  const numExplosions = dice.filter(v => v >= EXPLODE_ON).length;
  const diceSum = dice.reduce((a, b) => a + b, 0);

  // Mods print logic
  const rawMods = (modifiers.display ?? '').toString();
  const modsClean = rawMods.replace(/^\s*\+\s*/, '').trim();
  const hasMods = /\d/.test(modifiers.display);

  // --- NG trigger from comment (future-proofed; only NG1 enabled) ---
  const ng = parseNGTrigger(comment);
  const ngBonus = ng.bonus;
  const ngNote = ng.note;

  // Totals
  const total =
    diceSum +
    (mrData.value || 0) +
    (wrData.value || 0) +
    (modifiers.total || 0) +
    ngBonus;

  // Calculation string
  const annotatedDice = dice
    .map(v => (v >= EXPLODE_ON ? `${v}⋅EX` : `${v}`))
    .join(', ');

  const explosionExtras = Math.max(0, dice.length - baseDice);

  const parts = [
    `${baseDice}d20${explosionExtras > 0 ? `+${explosionExtras}` : ''} (${annotatedDice})`,
    `${mrData.value} (MR⋅${mrData.rank})`,
    `${wrData.value} (WR⋅${wrData.rank})`,
  ];

  if (hasMods && modsClean.length > 0) {
    parts.push(`${modsClean} (mods)`);
  }
  if (ngBonus > 0) {
    parts.push(`${ngBonus} (NG⋅1)`);
  }

  const calculation = parts.join(' + ');

  // Detect passive ability tags
  const passiveTags = getPassiveModifiers('attack', comment);
  const passiveDisplay = passiveTags.length > 0 ? `${passiveTags.join(', ')}\n` : '';

  // Embed
  const displayName = getDisplayName(message);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.offense)
    .setAuthor({ name: `${displayName}'s Special Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Burst Attack')
    .setThumbnail('https://terrarp.com/db/action/burst.png');

  let description =
    `\`${calculation}\`\n${passiveDisplay}\n` +
    `**${total} total** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n` +
    `\n► Status. You are vulnerable.\n` +
    (ngNote ? `${ngNote}\n` : '');

  return finalizeAndSend(message, embed, description, comment);
}

// Action: Sneak Attack — 1d100 + Sneak bonus + MR + WR + mods


async function handleSneak(message, args, comment) {
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

  // Roll + success check with rank-based thresholds: 35 (D), 30 (B), 25 (S)
  const r = roll(1, 100);
  const mrRankLower = mrData.rank.toLowerCase();
  const SNEAK_THRESHOLDS = { e: 40, d: 35, c: 30, b: 30, a: 25, s: 25 };
  const threshold = SNEAK_THRESHOLDS[mrRankLower] ?? 30;
  const success = r >= threshold;

  // Success bonus by MR rank on success; otherwise +10
  const mrRank = (mrData.rank ?? String(args[1] ?? '')).toLowerCase();
  const SNEAK_BONUS = { d: 25, c: 25, b: 30, a: 35, s: 40 };
  const successBonus = success ? (SNEAK_BONUS[mrRank] ?? 10) : 10;

  // Mods print logic
  const rawMods = (modifiers.display ?? '').toString();
  const modsClean = rawMods.replace(/^\s*\+\s*/, '').trim();
  const hasMods = /\d/.test(modifiers.display);

  // --- NG trigger from comment (future-proofed; only NG1 enabled) ---
  const ng = parseNGTrigger(comment);
  const ngBonus = ng.bonus;
  const ngNote = ng.note;

  // Total
  const total =
    r +
    successBonus +
    (mrData.value || 0) +
    (wrData.value || 0) +
    (modifiers.total || 0) +
    ngBonus;

  // Calculation string
  const parts = [
    `1d100 (${r})`,
    `${successBonus} (sneak)`,
    `${mrData.value} (MR⋅${mrData.rank})`,
    `${wrData.value} (WR⋅${wrData.rank})`,
  ];
  if (hasMods && modsClean.length > 0) {
    parts.push(`${modsClean} (mods)`);
  }
  if (ngBonus > 0) {
    parts.push(`${ngBonus} (NG1)`); // shows "+ 5 (NG1)"
  }
  const calculation = parts.join(' + ');

  // Detect passive ability tags
  const passiveTags = getPassiveModifiers('attack', comment);
  const passiveDisplay = passiveTags.length > 0 ? `${passiveTags.join(', ')}\n` : '';

  // Embed
  const displayName = getDisplayName(message);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.offense)
    .setAuthor({ name: `${displayName}'s Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Sneak Attack')
    .setThumbnail('https://terrarp.com/db/action/sneak.png');

  let description =
    `\`${calculation}\`\n${passiveDisplay}\n` +
    `**${total} total** (${success ? 'sneak successful!' : 'sneak failed...'})\n\n` +
    `► Succeeed on ${threshold}+ to add ${successBonus} sneak damage (${mrData.rank}-ranked mastery), otherwise, add 10.\n` +
    (ngNote ? `${ngNote}\n` : '');

  return finalizeAndSend(message, embed, description, comment);
}

// Action: Critical Attack — 2d100 + MR + WR + mods, then multiply


async function handleCritical(message, args, comment) {
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

  // Rolls (with optional test overrides via comment)
  let r1 = roll(1, 100);
  let r2 = roll(1, 100);
  let testNote = '';

  if (typeof comment === 'string') {
    // Direct override: r=100,86  (spaces allowed)
    const direct = comment.match(/\br\s*=\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
    if (direct) {
      r1 = Math.max(1, Math.min(100, parseInt(direct[1], 10)));
      r2 = Math.max(1, Math.min(100, parseInt(direct[2], 10)));
      testNote = '► [TESTING] Forced rolls\n';
    } else {
      // Named scenarios
      const t = comment.match(/\btest:(starbreaker|schrodinger|perfect|crit85|ender|fail)\b/i);
      if (t) {
        switch (t[1].toLowerCase()) {
          case 'starbreaker': r1 = 100; r2 = 100; break; // WORLD BREAKER
          case 'schrodinger': r1 = 100; r2 = 1;   break; // 100 + 1
          case 'perfect':     r1 = 100; r2 = 42;  break; // any 100
          case 'crit85':      r1 = 86;  r2 = 12;  break; // any 85+
          case 'ender':       r1 = 1;   r2 = 1;   break; // WORLD ENDER
          case 'fail':        r1 = 1;   r2 = 42;  break; // single 1
        }
        testNote = `► [TEST] Forced scenario: ${t[1]}\n`;
      }
    }
  }

  // Crit logic + multipliers
  const mrRank = (mrData.rank ?? String(args[1] ?? '')).toLowerCase();
  const CRIT_MULT_BY_RANK = { d: 1.5, c: 1.6, b: 1.7, a: 1.8, s: 2 };
  const BASE_MULT = 1.2;

  const is100_100 = (r1 === 100 && r2 === 100);
  const is1_1     = (r1 === 1 && r2 === 1);
  const any100    = (r1 === 100 || r2 === 100);
  const any1      = (r1 === 1 || r2 === 1);
  const schrodinger = (any100 && any1 && !is100_100 && !is1_1);  // one 100 + one 1
  const perfectCrit = (any100 && !is100_100 && !schrodinger);    // a 100 without the above
  const crit85      = (r1 >= 85 || r2 >= 85);                    // generic 85+ (overridden by cases above)

  let multiplier = BASE_MULT;
  let resultTag = '';     // e.g., (crit!), (perfect crit!), (WORLD BREAKER), (WORLD ENDER), (critical fail!)
  let triggeredLine = ''; // single descriptive line

  if (is100_100) {
    multiplier = 7;
    resultTag = '(STAR BREAKER)';
    triggeredLine = `► **STAR BREAKER (100, 100).** Multiplier **×7** .`;
  } else if (schrodinger) {
    multiplier = 3;
    resultTag = '(schrodinger crit!)';
    triggeredLine = `► **Schrodinger Crit (100,1).** Perfect crit multiplier ×3 and nat1 event.`;
  } else if (perfectCrit) {
    multiplier = 3;
    resultTag = '(perfect crit!)';
    triggeredLine = `► **Perfect Crit (100).** Multiplier ×3.`;
  } else if (is1_1) {
    resultTag = '(WORLD ENDER)';
    triggeredLine = `► **WORLD ENDER (1,1).** Nat1+ event.`;
  } else if (any1) {
    // exactly one die is 1 (since 1,1 handled above)
    resultTag = '(crit fail...)';
    triggeredLine = `► Crit Fail (1): Chance for Nat1 event.`;
  } else if (crit85) {
    multiplier = CRIT_MULT_BY_RANK[mrRank] ?? BASE_MULT;
    resultTag = '(crit!)';
    triggeredLine = `► **Crit (85+)** Multiplier ×${multiplier} (${mrData.rank.toUpperCase()}-ranked mastery).`;
  }

  // --- NG trigger from comment (only NG1 enabled) ---
  const ng = parseNGTrigger(comment);
  const ngBonus = ng.bonus;
  const ngNote = ng.note;

  // Mods print logic
  const rawMods = (modifiers.display ?? '').toString();
  const modsClean = rawMods.replace(/^\s*\+\s*/, '').trim();
  const hasMods = /\d/.test(modifiers.display);

  // Base sum (before multiplier)
  const baseSum =
    r1 + r2 +
    (mrData.value || 0) +
    (wrData.value || 0) +
    (modifiers.total || 0) +
    ngBonus;

  // Final total (apply multiplier)
  const finalTotal = Math.round(baseSum * multiplier);

  // Calculation string
  const parts = [
    `2d100 (${r1}, ${r2})`,
    `${mrData.value} (MR⋅${mrData.rank})`,
    `${wrData.value} (WR⋅${wrData.rank})`,
  ];
  if (hasMods && modsClean.length > 0) parts.push(`${modsClean} (mods)`);
  if (ngBonus > 0) parts.push(`${ngBonus} (NG1)`);
  const calculation = parts.join(' + ');
  const calcWithMult = `${calculation}` + ` ×${multiplier}`;

  // Detect passive ability tags
  const passiveTags = getPassiveModifiers('attack', comment);
  const passiveDisplay = passiveTags.length > 0 ? `${passiveTags.join(', ')}\n` : '';

  // Embed
  const displayName = getDisplayName(message);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.offenseSpecial)
    .setAuthor({ name: `${displayName}'s Special Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Critical Attack')
    .setThumbnail('https://terrarp.com/db/action/critical.png');

  let description =
    `\`${calcWithMult}\`\n${passiveDisplay}\n` +
    `**${finalTotal} total**${resultTag ? ` ${resultTag}` : ''}\n` +
    (triggeredLine ? `\n${triggeredLine}\n` : '') +
    (testNote ? testNote : '') +           // test note
    (ngNote ? `${ngNote}\n` : '');

  return finalizeAndSend(message, embed, description, comment);
}

// Action: Sharp Attack — 2d100 (keep highest). "Risky" converts mods → extra d100s (can crit). NG1 supported.
// TEST TRIGGERS (via comment): "test:crit", "test:crit fail", "test:star breaker", "test:world ender", "test:schrodinger crit"
// Also accepts without "test:" (e.g., "crit fail") — but prefer "test:..." to avoid accidental matches.
// Crits for this action: ONLY Nat100-based sets (no 85+ crit).
// Multipliers/events: Crit (≥1×100) ×2, Schrodinger (≥1×100 & ≥1×1) ×2 + Nat1 event,
// Star Breaker (≥2×100) ×7, World Ender (≥2×1 & no 100) event, Crit Fail (≥1×1 & no 100 & not World Ender) event.


async function handleSharp(message, args, comment) {
  const mrData = getRankData(args[1], 'mastery');
  const wrData = getRankData(args[2], 'weapon');

  if (!mrData || !wrData) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.error)
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery and Weapon rank inputs.');
    return sendReply(message, embed, comment);
  }

  // Parse modifiers
  const modifiers = parseModifiers(args, 3);
  const rawMods = (modifiers.display ?? '').toString();
  const modsClean = rawMods.replace(/^\s*\+\s*/, '').trim();
  const hasMods = /\d/.test(modifiers.display);
  const modsTotal = Number(modifiers.total || 0);

  // Comment triggers
  const triggers = parseTriggers(comment, {
    risky: /\brisky\b/i
  });
  const riskyActive = triggers.risky;

  // NG trigger (only NG1 enabled)
  const ng = parseNGTrigger(comment);
  const ngBonus = ng.bonus;
  const ngNote = ng.note;

  // --- TEST SCENARIOS ---
  let testScenario = null;
  if (typeof comment === 'string') {
    const t = comment.match(/\b(?:test[:=]\s*)?(star\s*breaker|world\s*ender|schrodinger\s*crit|crit\s*fail|crit)\b/i);
    if (t) {
      const k = t[1].toLowerCase().replace(/\s+/g, '');
      if (k === 'starbreaker') testScenario = 'starbreaker';
      else if (k === 'worldender') testScenario = 'worldender';
      else if (k === 'schrodingercrit' || k === 'schrodinger') testScenario = 'schrodinger';
      else if (k === 'critfail') testScenario = 'critfail';
      else if (k === 'crit') testScenario = 'crit';
    }
  }

  // Base rolls (may be overridden by tests)
  let r1 = roll(1, 100);
  let r2 = roll(1, 100);

  // Risky dice (from mods or forced by tests)
  let riskyRolls = [];
  let riskyFromMods = false;
  let forcedRisky = false;
  let remainder = 0;
  let testNote = '';

  // Apply test overrides
  if (testScenario) {
    switch (testScenario) {
      case 'crit':
        r1 = 100; r2 = 42;
        testNote = '► [TEST] Forced scenario: crit\n';
        break;
      case 'critfail':
        r1 = 42; r2 = 13;
        forcedRisky = true;
        riskyRolls = [1];
        testNote = '► [TEST] Forced scenario: crit fail\n';
        break;
      case 'starbreaker':
        r1 = 100; r2 = 42;
        forcedRisky = true;
        riskyRolls = [100];
        testNote = '► [TEST] Forced scenario: star breaker\n';
        break;
      case 'worldender':
        r1 = 1; r2 = 1;
        forcedRisky = true;
        riskyRolls = [1];
        testNote = '► [TEST] Forced scenario: world ender\n';
        break;
      case 'schrodinger':
        r1 = 100; r2 = 42;
        forcedRisky = true;
        riskyRolls = [1];
        testNote = '► [TEST] Forced scenario: schrodinger crit\n';
        break;
    }
  }

  // If not forcedRisky, compute Risky from mods (if active)
  if (!forcedRisky && riskyActive) {
    const riskyCount = Math.floor(Math.max(0, modsTotal) / 40);
    for (let i = 0; i < riskyCount; i++) riskyRolls.push(roll(1, 100));
    riskyFromMods = riskyCount > 0;
    remainder = modsTotal - (riskyRolls.length * 40);
  } else if (forcedRisky) {
    remainder = modsTotal;
  }

  // Determine kept/dropped for base 2d100
  const kept = Math.max(r1, r2);
  const dropped = Math.min(r1, r2);

  // Crit evaluation pool: kept base die + all Risky dice (dropped die never counts)
  const critPool = [kept, ...riskyRolls];
  const countHundreds = critPool.filter(v => v === 100).length;
  const countOnes = critPool.filter(v => v === 1).length;

  let multiplier = 1.0;
  let resultTag = '';
  let triggeredLine = '';

  if (countHundreds >= 2) {
    multiplier = 7;
    resultTag = '(STAR BREAKER)';
    triggeredLine = `► Star Breaker (200): Multiplier ×7.`;
  } else if (countOnes >= 2 && countHundreds === 0) {
    resultTag = '(WORLD ENDER)';
    triggeredLine = `► World Ender (1 & 1+): Chance for Nat1+ event.`;
  } else if (countHundreds >= 1 && countOnes >= 1) {
    multiplier = 2;
    resultTag = '(schrodinger crit!)';
    triggeredLine = `► Schrodinger Crit (100 & 1): Multiplier ×2 and chance for Nat1 event.`;
  } else if (countHundreds >= 1) {
    multiplier = 2;
    resultTag = '(crit!)';
    triggeredLine = `► Crit (100): Multiplier ×2.`;
  } else if (countOnes >= 1) {
    resultTag = '(crit fail...)';
    triggeredLine = `► Crit Fail (1): Chance for Nat1 event.`;
  }

  // Totals
  const riskySum = riskyRolls.reduce((a, b) => a + b, 0);
  const riskyTally = riskyRolls.length
  ? ` (${riskySum})`
  : '';
  const totalBeforeMult =
    kept +
    riskySum +
    (mrData.value || 0) +
    (wrData.value || 0) +
    (forcedRisky || riskyActive ? remainder : (modifiers.total || 0)) +
    ngBonus;

  const finalTotal = Math.round(totalBeforeMult * multiplier);

  // ----- NEW: converted mods amount for display -----
  const convertedMods = (!forcedRisky && riskyActive) ? (riskyRolls.length * 40) : 0;

  // Display strings
  const parts = [
    `2d100kh1 (${dropped}, ${kept}⋅KP)`
  ];
  if (riskyRolls.length > 0) parts.push(`${riskyRolls.length}d100 (${riskyRolls.join(', ')})`);
  parts.push(`${mrData.value} (MR⋅${mrData.rank})`, `${wrData.value} (WR⋅${wrData.rank})`);

  if (forcedRisky || riskyActive) {
    if (remainder !== 0) parts.push(`${remainder} (mods⋅R)`);
  } else if (hasMods && modsClean.length > 0) {
    parts.push(`${modsClean} (mods)`);
  }
  if (ngBonus > 0) parts.push(`${ngBonus} (NG⋅1)`);

  const calculation = parts.join(' + ');
  const calcWithMult = `${calculation} ×${multiplier}`;

  // Detect passive ability tags
  const passiveTags = getPassiveModifiers('attack', comment);
  const passiveDisplay = passiveTags.length > 0 ? `${passiveTags.join(', ')}\n` : '';

  // Embed
  const displayName = getDisplayName(message);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.offense)
    .setAuthor({ name: `${displayName}'s Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Sharp Attack')
    .setThumbnail('https://terrarp.com/db/action/sharp.png');

  let description =
    `\n\`${calcWithMult}\`\n${passiveDisplay}\n` +
    `**${finalTotal} total**${resultTag ? ` ${resultTag}` : ''}\n` +
    (triggeredLine ? `${triggeredLine}\n` : '') +
    (forcedRisky
      ? `► Risky (TEST) activated: generated ${riskyRolls.length} test d100; remainder ${remainder}.\n`
      : (riskyActive
          ? `► Risky activated: converted ${convertedMods} into ${riskyRolls.length}d100 ${riskyTally}, remainder: +${remainder}.\n`
          : '')) +
    (ngNote ? `${ngNote}\n` : '') +
    (testScenario ? testNote : '');

  return finalizeAndSend(message, embed, description, comment);
}

// Action: Reckless Attack — MR E/D/C: 1d200 + 1d100; MR B/A: 1d200 + 1d100 + 1d100; MR S: 1d200 + 1d100 + 2d100kh1 (dropped die does NOT crit).
// TYPE: Special Action
// TEST TRIGGERS (via comment): "test:crit", "test:crit fail", "test:star breaker", "test:world ender", "test:schrodinger crit"
// NEW d200 OVERRIDE (via comment): "test:d200=200", "d200=200", "r200=200", or with space/colon "test d200 1", "d200: 150" (clamped to 1–200).
// Crits for this action: ONLY Nat100-based sets (no 85+ crit).
// Multipliers/events (pre-defined): Crit (≥1×100) ×2, Schrodinger (≥1×100 & ≥1×1) ×2 + Nat1 event,
// Star Breaker (≥2×100) ×7, World Ender (≥2×1 & no 100) event, Crit Fail (≥1×1 & no 100 & not World Ender) event.
// Special d200 rules: d200=200 → STAR BREAKER; d200=100 counts as a "100" for crits; d200=1 counts as a "1" for crit fails.


async function handleReckless(message, args, comment) {
  const mrData = getRankData(args[1], 'mastery');
  const wrData = getRankData(args[2], 'weapon');

  if (!mrData || !wrData) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.error)
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery and Weapon rank inputs.');
    return sendReply(message, embed, comment);
  }

  // Parse MR rank
  const mrRankRaw = (mrData.rank ?? String(args[1] ?? '')).toUpperCase();
  const mrRank = mrRankRaw.toLowerCase();
  const isS = mrRank === 's';

  // Parse modifiers
  const modifiers = parseModifiers(args, 3);
  const rawMods = (modifiers.display ?? '').toString();
  const modsClean = rawMods.replace(/^\s*\+\s*/, '').trim();
  const hasMods = /\d/.test(modifiers.display);
  const modsTotal = Number(modifiers.total || 0);

  // Comment triggers
  const triggers = parseTriggers(comment, {
    risky: /\brisky\b/i
  });
  const riskyActive = triggers.risky;

  // NG trigger (only NG1 enabled)
  const ng = parseNGTrigger(comment);
  const ngBonus = ng.bonus;
  const ngNote = ng.note;

  // Determine base number of plain d100s by MR:
  // E/D/C → 1d100; B/A → 2d100; S → 1d100 + an extra 2d100kh1 pair (the dropped die never participates in crit).
  const baseD100s = (mrRank === 'b' || mrRank === 'a') ? 2 : 1;

  // --- TEST SCENARIOS ---
  let testScenario = null;
  if (typeof comment === 'string') {
    const t = comment.match(/\b(?:test[:=]\s*)?(star\s*breaker|world\s*ender|schrodinger\s*crit|crit\s*fail|crit)\b/i);
    if (t) {
      const k = t[1].toLowerCase().replace(/\s+/g, '');
      if (k === 'starbreaker') testScenario = 'starbreaker';
      else if (k === 'worldender') testScenario = 'worldender';
      else if (k === 'schrodingercrit' || k === 'schrodinger') testScenario = 'schrodinger';
      else if (k === 'critfail') testScenario = 'critfail';
      else if (k === 'crit') testScenario = 'crit';
    }
  }

  // Base rolls (may be overridden by tests)
  let r200 = roll(1, 200);
  const baseHundreds = [];
  for (let i = 0; i < baseD100s; i++) baseHundreds.push(roll(1, 100));

  // MR=S special pair: 2d100kh1 (dropped does not count for crit)
  let sPairDropped = null;
  let sPairKept = null;
  if (isS) {
    const s1 = roll(1, 100);
    const s2 = roll(1, 100);
    sPairKept = Math.max(s1, s2);
    sPairDropped = Math.min(s1, s2);
  }

  // Risky dice (from mods or forced by tests)
  let riskyRolls = [];
  let forcedRisky = false;
  let remainder = 0;
  let testNote = '';

  // Apply test overrides
  if (testScenario) {
    switch (testScenario) {
      case 'crit':
        // ensure a 100 somewhere in crit pool (use a base d100)
        baseHundreds[0] = 100;
        r200 = 73;
        testNote += '► [TEST] Forced scenario: crit\n';
        break;
      case 'critfail':
        // at least one 1 and no 100; avoid world ender
        baseHundreds[0] = 1;
        if (baseHundreds.length > 1) baseHundreds[1] = 17;
        r200 = 42; // not 1/100/200
        testNote += '► [TEST] Forced scenario: crit fail\n';
        break;
      case 'starbreaker':
        // d200=200 triggers STAR BREAKER by rule
        r200 = 200;
        if (baseHundreds.length > 1) baseHundreds[1] = 42;
        testNote += '► [TEST] Forced scenario: star breaker (d200=200)\n';
        break;
      case 'worldender':
        // ≥2 ones, no 100s
        r200 = 1;
        baseHundreds[0] = 1;
        if (baseHundreds.length > 1) baseHundreds[1] = 13;
        else { forcedRisky = true; riskyRolls = [1]; }
        testNote += '► [TEST] Forced scenario: world ender\n';
        break;
      case 'schrodinger':
        // at least one 100 and one 1 (mixed)
        baseHundreds[0] = 100;
        if (baseHundreds.length > 1) baseHundreds[1] = 1;
        else { forcedRisky = true; riskyRolls = [1]; }
        r200 = 37;
        testNote += '► [TEST] Forced scenario: schrodinger crit\n';
        break;
    }
  }

  // NEW: explicit d200 override (after scenario so this takes precedence)
  if (typeof comment === 'string') {
    const m200 = comment.match(/\b(?:test[:=]\s*)?(?:d200|r200)\s*(?:[:=]|\s)\s*(\d{1,3})\b/i);
    if (m200) {
      const v = Math.max(1, Math.min(200, parseInt(m200[1], 10)));
      r200 = v;
      testNote += `► [TEST] Forced d200=${v}\n`;
    }
  }

  // If not forcedRisky, compute Risky from mods (if active)
  if (!forcedRisky && riskyActive) {
    const riskyCount = Math.floor(Math.max(0, modsTotal) / 40);
    for (let i = 0; i < riskyCount; i++) riskyRolls.push(roll(1, 100));
    remainder = modsTotal - (riskyRolls.length * 40);
  } else if (forcedRisky) {
    remainder = modsTotal;
  }

  // --- Crit evaluation pool ---
  // Pool includes: all base d100s, sPairKept (if MR=S), all Risky d100s.
  const critPool = [...baseHundreds, ...riskyRolls];
  if (isS && sPairKept !== null) critPool.push(sPairKept);

  // Special d200 contributions
  let d200Note = '';
  let immediateStarBreaker = false;
  if (r200 === 200) {
    immediateStarBreaker = true;
    d200Note = '► d200=200 triggers STAR BREAKER.\n';
  } else if (r200 === 100) {
    critPool.push(100);
    d200Note = '► d200=100 counted as a 100 for crit checks.\n';
  } else if (r200 === 1) {
    critPool.push(1);
    d200Note = '► d200=1 counted as a 1 for crit checks.\n';
  }

  const countHundreds = critPool.filter(v => v === 100).length;
  const countOnes = critPool.filter(v => v === 1).length;

  // --- Crit resolution ---
  let multiplier = 1.0;
  let resultTag = '';
  let triggeredLine = '';

  if (immediateStarBreaker) {
    multiplier = 7;
    resultTag = '(STAR BREAKER)';
    triggeredLine = `► Star Breaker (200): Multiplier ×7.`;
  } else if (countHundreds >= 2) {
    multiplier = 7;
    resultTag = '(STAR BREAKER)';
    triggeredLine = `► Star Breaker (100 & 100+): Multiplier ×7.`;
  } else if (countOnes >= 2 && countHundreds === 0) {
    resultTag = '(WORLD ENDER)';
    triggeredLine = `► World Ender (1 & 1+): Chance for Nat1+ event.`;
  } else if (countHundreds >= 1 && countOnes >= 1) {
    multiplier = 2;
    resultTag = '(schrodinger crit!)';
    triggeredLine = `► Schrodinger Crit (100 & 1): Multiplier ×2 and chance for Nat1 event.`;
  } else if (countHundreds >= 1) {
    multiplier = 2;
    resultTag = '(crit!)';
    triggeredLine = `► Crit (100): Multiplier ×2.`;
  } else if (countOnes >= 1) {
    resultTag = '(crit fail...)';
    triggeredLine = `► Crit Fail (1): Chance for Nat1 event.`;
  }

  // --- Totals ---
  const riskySum = riskyRolls.reduce((a, b) => a + b, 0);
  const riskyTally = riskyRolls.length
  ? ` (${riskySum})`
  : '';
  const d100Sum = baseHundreds.reduce((a, b) => a + b, 0);
  const sPairKeptVal = (isS && sPairKept !== null) ? sPairKept : 0;

  const totalBeforeMult =
    r200 +
    d100Sum +
    sPairKeptVal +
    riskySum +
    (mrData.value || 0) +
    (wrData.value || 0) +
    (riskyActive ? remainder : (modifiers.total || 0)) +
    ngBonus;

  const finalTotal = Math.round(totalBeforeMult * multiplier);

  // For display: converted mods amount
  const convertedMods = (riskyActive) ? (riskyRolls.length * 40) : 0;

  // --- Calculation string ---
  const parts = [
    `1d200 (${r200})`
  ];
  // For S rank: show 2d100kh1 before 1d100
  if (isS && sPairKept !== null && sPairDropped !== null) {
    parts.push(`2d100kh1 (${sPairDropped}, ${sPairKept}⋅KP)`);
  }
  for (let i = 0; i < baseHundreds.length; i++) {
    parts.push(`1d100 (${baseHundreds[i]})`);
  }
  if (riskyRolls.length > 0) parts.push(`${riskyRolls.length}d100 (${riskyRolls.join(', ')})`);
  parts.push(`${mrData.value} (MR⋅${mrData.rank})`, `${wrData.value} (WR⋅${wrData.rank})`);
  if (riskyActive) {
    if (remainder !== 0) parts.push(`${remainder} (mods⋅R)`);
  } else if (hasMods && modsClean.length > 0) {
    parts.push(`${modsClean} (mods)`);
  }
  if (ngBonus > 0) parts.push(`${ngBonus} (NG⋅1)`);

  const calculation = parts.join(' + ');
  const calcWithMult = `${calculation} ×${multiplier}`;

  // Detect passive ability tags
  const passiveTags = getPassiveModifiers('attack', comment);
  const passiveDisplay = passiveTags.length > 0 ? `${passiveTags.join(', ')}\n` : '';

  // --- Embed render ---
  const displayName = getDisplayName(message);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.offenseSpecial)
    .setAuthor({ name: `${displayName}'s Special Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Reckless Attack')
    .setThumbnail('https://terrarp.com/db/action/reckless.png');

  let description =
    `\n\`${calcWithMult}\`\n${passiveDisplay}\n` +
    `**${finalTotal} total**${resultTag ? ` ${resultTag}` : ''}\n` +
    (triggeredLine ? `${triggeredLine}\n` : '') +
    (`► You are vulnerable.\n`) +
    (riskyActive
      ? `► Risky activated: converted ${convertedMods} into ${riskyRolls.length}d100 ${riskyTally}, remainder: +${remainder}.\n`
      : '') +
    (ngNote ? `${ngNote}\n` : '') +
    (testScenario || /(?:d200|r200)/i.test(comment || '') ? testNote : '');

  return finalizeAndSend(message, embed, description, comment);
}

// Sub-Action: Area Effect — Passive spread; optional "Splash Damage" bonus mode.
// Rolls: None. NG1: No.
// Comment Trigger: "Splash Damage" -> Title becomes "Area Effect (Splash Damage)" and grants an instance of X damage to all enemies adjacent to target.
// X by MR rank: D=15, B=20, S=25. (Other ranks: no Splash instance granted.)


async function handleAreaEffect(message, args, comment) {
  const mrData = getRankData(args[1], 'mastery');
  if (!mrData) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.error)
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery rank input.');
    return sendReply(message, embed, comment);
  }

  const displayName = getDisplayName(message);

  // Trigger: Splash Damage
  const triggers = parseTriggers(comment, {
    splash: /\bsplash\s*damage\b/i
  });
  const splashActive = triggers.splash;

  // MR rank + Splash instance values
  const mrRankRaw = (mrData.rank ?? String(args[1] ?? '')).toString();
  const mrRank = mrRankRaw.toLowerCase();
  const mrRankUp = mrRankRaw.toUpperCase();

  const SPLASH_DMG = { d: 15, c: 15, b: 20, a: 20, s: 25 };
  const splashValue = SPLASH_DMG[mrRank] ?? 0;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#5f6587')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(splashActive ? 'Area Effect (Splash Damage)' : 'Area Effect')
    .setThumbnail('https://terrarp.com/db/action/oba.png');

  // Description
  let description = '';

  if (splashActive) {
    description += `**Bonus Action.** Deal an instance of **${splashValue}** (${mrRankUp}-rank) damage to all enemies adjacent to your attack target. Take only the highest retaliation damage if there are any.\n`;
    description += `\n► ***Passive.*** Your attack's damage may be distributed in any amount to any enemies on or adjacent to the target. Take only the highest retaliation damage if any.\n`;
  } else {
    description += `► ***Passive.*** Your attack's damage may be distributed in any amount to any enemies on or adjacent to the target. Take only the highest retaliation damage if any.\n`;
  }

  return finalizeAndSend(message, embed, description, comment);
}

// Sub-Action: Duelist — Passive single-target instance; optional "Challenge" bonus mode.
// Rolls: None. NG1: No.
// Comment Trigger: "Challenge" -> Title becomes "Duelist (Challenge)" and grants a damage buff equal to X (rank-based).
// X by MR rank: D=15, C=15, B=20, A=20, S=25. (Other ranks: unavailable)


async function handleDuelist(message, args, comment) {
  const mrData = getRankData(args[1], 'mastery');
  if (!mrData) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.error)
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery rank input.');
    return sendReply(message, embed, comment);
  }

  const displayName = getDisplayName(message);

  // Trigger: Challenge
  const triggers = parseTriggers(comment, {
    challenge: /\bchallenge\b/i
  });
  const challengeActive = triggers.challenge;

  // MR rank + Duelist instance values
  const mrRankRaw = (mrData.rank ?? String(args[1] ?? '')).toString();
  const mrRank = mrRankRaw.toLowerCase();
  const mrRankUp = mrRankRaw.toUpperCase();

  const DUEL_DMG = { d: 15, c: 15, b: 20, a: 20, s: 25 };
  const duelValue = DUEL_DMG[mrRank] ?? 0;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#5f6587')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(challengeActive ? 'Duelist (Challenge)' : 'Duelist')
    .setThumbnail('https://terrarp.com/db/action/oba.png');

  // Description
  let description = '';

  if (challengeActive) {
    description += `**Bonus Action.** Your passive damage is doubled and must be used as an attack buff against your passive target.\n`;
    description += `\n► Challenge activated: gain **${duelValue * 2}** (${mrRankUp}-rank) as a damage buff if you attack an enemy on their space or adjacent to their space.\n`;
  } else {
    description += `► ***Passive.*** If you attack an enemy on their space or adjacent to their space, deal an instance of **${duelValue}** (${mrRankUp}-rank) damage to them.\n`;
  }

  return finalizeAndSend(message, embed, description, comment);
}

// Sub-Action: Sharpshooter — Passive ranged buff; optional "Snipe" bonus mode with a 2/3 success chance.
// Rolls: 1d3 when "Snipe" is active. NG1: No.
// Comment Trigger: "Snipe" -> Title becomes "Sharpshooter (Snipe)" and rolls 1d3 to set the buff value this turn.
// Base X by MR rank:      D=5,  C=5,  B=10, A=10, S=15
// Snipe TRIGGERED X:      D=15, C=15, B=30, A=30, S=50
// Snipe NOT-TRIGGERED X:  D=5, C=5, B=10, A=10, S=15


async function handleSharpshooter(message, args, comment) {
  const mrData = getRankData(args[1], 'mastery');
  if (!mrData) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.error)
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery rank input.');
    return sendReply(message, embed, comment);
  }

  const displayName = getDisplayName(message);

  // Trigger: Snipe
  const triggers = parseTriggers(comment, {
    snipe: /\bsnipe\b/i
  });
  const snipeActive = triggers.snipe;

  // MR rank + values
  const mrRankRaw = (mrData.rank ?? String(args[1] ?? '')).toString();
  const mrRank = mrRankRaw.toLowerCase();
  const mrRankUp = mrRankRaw.toUpperCase();

  const BASE_X        = { d: 5,  c: 5,  b: 10, a: 10, s: 15 };
  const SNIPE_TRIG_X  = { d: 15, c: 15, b: 30, a: 30, s: 40 };

  const baseBuff = BASE_X[mrRank] ?? 0;

  // Snipe roll (only if active)
  let snipeRoll = null;
  let snipeTriggered = false;
  let snipeBuff = 0;

  if (snipeActive) {
    snipeRoll = roll(1, 3);            // 1..3
    snipeTriggered = (snipeRoll === 2 || snipeRoll === 3); // 2/3 chance
    snipeBuff = (snipeTriggered ? SNIPE_TRIG_X[mrRank] : BASE_X[mrRank]) ?? 0;
  }

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#5f6587')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(snipeActive ? 'Sharpshooter (Snipe)' : 'Sharpshooter')
    .setThumbnail('https://terrarp.com/db/action/oba2.png');

  // Description
  let description = '';

  if (snipeActive) {
    description += `**Bonus Action.** Maintain focus to empower your ranged attack.\n`;
    if (snipeTriggered) {
      description += `\n► 1d3 (${snipeRoll}). Focus maintained. Snipe triggered.\n`;
    } else {
      description += `\n► 1d3 (${snipeRoll}). Focus lost. Snipe does not trigger.\n`;
    }
    description += `► ***Passive.*** If you attack an enemy while not in their space, gain **${snipeBuff}** (${mrRankUp}-rank) as a damage buff.\n`;
  } else {
    description += `► ***Passive.*** If you attack an enemy while not in their space, gain **${baseBuff}** (${mrRankUp}-rank) as a damage buff.\n`;
  }

  return finalizeAndSend(message, embed, description, comment);
}

// Sub-Action: Range — Passive +1 range; optional "Extend" bonus mode.
// Rolls: None. NG1: No.
// Comment Trigger: "Extend" -> Title becomes "Range (Extend)" and grants +2 range for this cycle (instead of +1).


async function handleLethal(message, args, comment) {
  const displayName = getDisplayName(message);

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  if (!validateMinimumRank(message, mrRank, 'D', 'Lethal', comment)) {
    return;
  }

  // Define modifier based on rank (+5 per rank: D=5, C=10, B=15, A=20, S=25)
  const LETHAL_MODIFIER = { d: 5, c: 10, b: 15, a: 20, s: 25 };
  const modifier = LETHAL_MODIFIER[mrRank] ?? 0;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#ef4444')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Lethal')
    .setThumbnail('https://terrarp.com/db/action/lethal.png');

  let description = `► **Passive.** All attack actions gain **+${modifier}** extra attack modifier (MR⋅${mrRankUp}).\n`;

  return finalizeAndSend(message, embed, description, comment);
}

// Sub-Action: Swift (Offense Passive) — Grants extra movement.
// Rolls: No. NG1: No. Crit: No.
// Minimum Rank: D
// S Upgrade: +1 movement becomes +2

async function handleSwift(message, args, comment) {
  const displayName = getDisplayName(message);

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Rank validation (minimum D rank)
  if (!validateMinimumRank(message, mrRank, 'D', 'Swift', comment)) {
    return;
  }

  // Determine movement bonus (D-A: +1, S: +2)
  const movement = mrRank === 's' ? 2 : 1;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#ef4444')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Swift')
    .setThumbnail('https://terrarp.com/db/action/swift.png');

  let description = `► **Passive.** Gain **+${movement} extra movement** (MR⋅${mrRankUp}).\n`;

  if (mrRank === 's') {
    description += `\n◦ **S Upgrade:** Movement bonus increased from +1 to +2.\n`;
  }

  return finalizeAndSend(message, embed, description, comment);
}


module.exports = {
    handleStable,
    handleBurst,
    handleSneak,
    handleCritical,
    handleSharp,
    handleReckless,
    handleAreaEffect,
    handleDuelist,
    handleSharpshooter,
    handleLethal,
    handleSwift
};
