// r.js (Refactored for Discord.js v14)

const { EmbedBuilder } = require('discord.js');
require('dotenv').config();

// --- Configuration ---
// Load these from your .env file for security and ease of management.
const PREFIX = process.env.PREFIX || '?';
const STAFF_CATEGORY_ID = process.env.STAFF_CATEGORY_ID;
const BOT_CATEGORY_ID = process.env.BOT_CATEGORY_ID;
const STORY_CATEGORY_ID = process.env.STORY_CATEGORY_ID;
const TEST_CHANNEL_ID = process.env.TEST_CHANNEL_ID;
const REPLY_DELETE_TIMEOUT = 5000; // Increased to 5 seconds

// --- Game Rule Constants ---
// Central location for all rank-based stats. Makes updating rules easy.
const RANK_DATA = {
    'e': { value: 0, counterCheck: 40, counterDMG: 30, burstMod: 0, critRange: 80, bonus102030: 0, bonus152025: 0, bonus51015: 0, bonus101520: 0, bonus203040: 0, bonus51525: 0, bonus204060: 0, bonus123: 0, surgeHaste: 0, surgeInspire: 0, swHP: 10 },
    'd': { value: 5, counterCheck: 35, counterDMG: 30, burstMod: 1, critRange: 80, bonus102030: 10, bonus152025: 15, bonus51015: 5, bonus101520: 10, bonus203040: 20, bonus51525: 5, bonus204060: 20, bonus123: 1, surgeHaste: 2, surgeInspire: 6, swHP: 20 },
    'c': { value: 10, counterCheck: 30, counterDMG: 40, burstMod: 2, critRange: 80, bonus102030: 10, bonus152025: 15, bonus51015: 5, bonus101520: 10, bonus203040: 20, bonus51525: 5, bonus204060: 20, bonus123: 1, surgeHaste: 4, surgeInspire: 12, swHP: 30 },
    'b': { value: 15, counterCheck: 30, counterDMG: 40, burstMod: 3, critRange: 80, bonus102030: 20, bonus152025: 20, bonus51015: 10, bonus101520: 15, bonus203040: 30, bonus51525: 15, bonus204060: 40, bonus123: 2, surgeHaste: 6, surgeInspire: 18, swHP: 40 },
    'a': { value: 20, counterCheck: 25, counterDMG: 50, burstMod: 4, critRange: 80, bonus102030: 20, bonus152025: 20, bonus51015: 10, bonus101520: 15, bonus203040: 30, bonus51525: 15, bonus204060: 40, bonus123: 2, surgeHaste: 8, surgeInspire: 24, swHP: 50 },
    's': { value: 25, counterCheck: 20, counterDMG: 50,  burstMod: 5, critRange: 80, bonus102030: 30, bonus152025: 25, bonus51015: 15, bonus101520: 20, bonus203040: 40, bonus51525: 25, bonus204060: 60, bonus123: 3, surgeHaste: 10, surgeInspire: 30, swHP: 60 },
};

const WEAPON_RANK_DATA = {
    'e': { value: 0, burstMod: 0 },
    'd': { value: 5, burstMod: 1 },
    'c': { value: 10, burstMod: 2 },
    'b': { value: 15, burstMod: 3 },
    'a': { value: 20, burstMod: 4 },
    's': { value: 25, burstMod: 5 },
};

// --- Helper Functions ---

/** Rolls a single die. */
function roll(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Parses arguments, removing comments and the primary command itself. */
function parseArguments(content) {
    const mobileFix = content.replace(/\u00A0/g, ' ');
    const contentWithoutPrefix = mobileFix.slice(PREFIX.length).trim();

    let argsString = contentWithoutPrefix;
    let comment = "";
    const commentIndex = contentWithoutPrefix.indexOf('#');
    if (commentIndex !== -1) {
        comment = `\n> *${contentWithoutPrefix.substring(commentIndex + 1).trim()}*`;
        argsString = contentWithoutPrefix.substring(0, commentIndex).trim();
    }

    const args = argsString.split(' ').filter(arg => arg !== '');
    args.shift(); // THE FIX: Removes 'r' or 'roll', leaving only the sub-command and its args.
    return { args, comment };
}

/** Parses numerical modifiers from arguments array. */
function parseModifiers(args, startIndex) {
    const mods = [];
    let total = 0;
    for (let i = startIndex; i < args.length; i++) {
        const num = parseInt(args[i]);
        if (!isNaN(num)) {
            mods.push(num);
            total += num;
        }
    }
    const display = mods.length > 0 ? ` + ${mods.join(" + ")}` : "";
    return { mods, total, display };
}

/** Retrieves rank data object, now including the rank letter itself. */
function getRankData(rankArg, rankType = 'mastery') {
    if (!rankArg) return null;
    const rank = rankArg.toLowerCase();
    const sourceData = rankType === 'mastery' ? RANK_DATA : WEAPON_RANK_DATA;
    const data = sourceData[rank]; // Get the data object from our constants

    // If the rank letter is invalid (e.g., 'z'), data will be undefined.
    if (!data) return null;

    // Return a new object containing all original data AND the uppercase rank letter.
    return { ...data, rank: rank.toUpperCase() };
}

/** Checks if the user can use the command in the channel. */
function checkPermissions(message) {
    const { channel } = message;
    const staff = STAFF_CATEGORY_ID && channel.parentId === STAFF_CATEGORY_ID;
    const bot = BOT_CATEGORY_ID && channel.parentId === BOT_CATEGORY_ID;
    const test = TEST_CHANNEL_ID && channel.id === TEST_CHANNEL_ID;
    const thread = channel.isThread();

    if (staff || bot || test || thread) return true;

    if (STORY_CATEGORY_ID && channel.parentId === STORY_CATEGORY_ID) {
        return channel.name.toLowerCase().includes("rolls");
    }
    return false;
}

/**
 * Sends a formatted reply and DELETES ONLY THE USER'S ORIGINAL COMMAND after a delay.
 * The bot's reply will remain in the channel.
 * @param {import('discord.js').Message} message - The original message object from discord.js.
 * @param {import('discord.js').EmbedBuilder} embed - The embed to be sent.
 * @param {string} comment - The user's comment to append to the description.
 */
async function sendReply(message, embed, comment) {
    try {
        // Add the user's comment to the embed, if it exists.
        if (comment) {
            const currentDescription = embed.data.description || "";
            embed.setDescription(currentDescription + comment);
        }

        // Send the reply. The bot's message will be permanent.
        await message.reply({ embeds: [embed] });

        // After replying, set a timer to delete ONLY the user's original command message.
        setTimeout(() => {
            message.delete().catch(() => {
                // This catch block prevents a crash if the message is already gone
                // (e.g., deleted by a moderator). We can leave it empty.
            });
        }, REPLY_DELETE_TIMEOUT); // Using the timeout constant from the top of the file

    } catch (err) {
        // This handles errors related to sending the reply itself.
        console.error("Failed to send reply or schedule deletion:", err);
        message.channel.send("Sorry, I encountered an error trying to reply.").catch();
    }
}

// --- Command Handlers ---

async function handleGenericRoll(message, args, comment) {
    // The dice notation (e.g., "1d100", "2d4") is the first argument.
    const diceNotation = args[0].toLowerCase();

    // --- Input Validation ---
    if (!diceNotation.includes('d') || diceNotation.startsWith('d') || diceNotation.endsWith('d')) {
        const embed = new EmbedBuilder().setColor('Red').setTitle('Invalid Format').setDescription('Please use the `XdY` format (e.g., `1d100`, `2d6`).');
        return sendReply(message, embed, comment);
    }

    const parts = diceNotation.split('d');
    const numDice = parseInt(parts[0]);
    const dieFace = parseInt(parts[1]);

    // Check if parsing worked and if numbers are reasonable
    if (isNaN(numDice) || isNaN(dieFace) || numDice <= 0 || dieFace <= 0 || numDice > 100 || dieFace > 1000) {
        const embed = new EmbedBuilder().setColor('Red').setTitle('Invalid Dice').setDescription('Number of dice and faces must be positive numbers. Please keep rolls reasonable (max 100 dice, 1000 faces).');
        return sendReply(message, embed, comment);
    }

    // --- Rolling Logic ---
    const rollResults = [];
    let rollTotal = 0;
    for (let i = 0; i < numDice; i++) {
        const result = roll(1, dieFace); // Using our existing helper function
        rollResults.push(result);
        rollTotal += result;
    }

    // --- Modifier Logic ---
    // Modifiers start after the dice notation (at index 1)
    const modifiers = parseModifiers(args, 1);
    const finalTotal = rollTotal + modifiers.total;

    // --- Display Logic ---
    const calculation = `${diceNotation} (${rollResults.join(' + ')})${modifiers.display}`;

    const embed = new EmbedBuilder()
        .setColor('#99AAB5') // A neutral color for generic rolls
        .setAuthor({ name: `${message.member.displayName}'s Roll`, iconURL: message.author.displayAvatarURL() })
        .setTitle(`Dice Roll`)
        .setThumbnail('https://terrarp.com/db/action/roll.png')
        .addFields(
            { name: '', value: `\`${calculation}\`` },
            { name: '', value: `**Total: ${finalTotal}**` }
        );

    if (comment) {
        embed.addFields({ name: '', value: comment });
    }

    // Use an empty string because the comment is already in the embed
    sendReply(message, embed, '');
}

// General Action MA Attack
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

// General Action BA Rush
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

// Defense Action SA Ultra Protect
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

// Defense Action MA Counter
async function handleCounter(message, args, comment) {
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

    const calculation = `1d100 (${roll1}) + ${mrData.value} (MR⋅${mrData.rank}) + ${wrData.value} (WR⋅${wrData.rank})${modifiers.display}`;

    const embed = new EmbedBuilder()
        .setColor('#d78747')
        .setAuthor({ name: `${message.author.displayName}'s Roll`, iconURL: message.author.displayAvatarURL() })
        .setTitle(`Counter ${critString}`)
        .setThumbnail('https://terrarp.com/db/action/counter.png')
        .addFields(
            { name: '', value: `***Action.*** Make an attack and distribute **${mitigation}** mitigation between and up to 3 targets in multiples of 5s.` },
            { name: '', value: `\`${calculation}\`` },
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
    const roll1 = roll(1, 100);

    // Success check uses the MR rank's counterCheck
    const success = roll1 >= mrData.counterCheck;

    // On success, use the MR rank's counterDMG; on failure, 0
    const counterDmg = success ? mrData.counterDMG : 0;

    // Melee toggle via comment
    const meleeActive = typeof comment === 'string' && /\bmelee\b/i.test(comment);
    const meleeBonus = meleeActive ? 30 : 0;

    // Check if we should show mods
    const hasMods = /\d/.test(modifiers.display);

    // Base total
    const baseTotal = roll1 + counterDmg + mrData.value + wrData.value + modifiers.total + meleeBonus;

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

    const calculation = parts.join(' + ');

    // Messages
    const counterComment = success
        ? `► Successful counter! ${mrData.counterDMG} damage added. Vulnerability negated.`
        : `► Skill issue. 0 damage added. You are vulnerable.`;

    const meleeNote = meleeActive
        ? `► Melee triggered. 30 damage added.`
        : `► Melee not triggered. If you are adjacent to or are on the target's space, manually add 30 damage.`;

    const displayName = message.member?.displayName ?? message.author.username;

    const embed = new EmbedBuilder()
        .setColor('#E67E22')
        .setAuthor({ name: `${displayName}'s Special Action`, iconURL: message.author.displayAvatarURL() })
        .setTitle(`Ultra Counter ${critString}`)
        .setThumbnail('https://terrarp.com/db/action/ucounter.png')
        let description = `\`${calculation}\`\n\n**${total} damage**\n\n${counterComment}\n${meleeNote}`;
        if (comment){
          description += `\n${comment}`;
          }

        embed.setDescription(description);

    return sendReply(message, embed);
}

// Action: Torment (Free), Ultra Torment (Bonus), Radial Torment (Bonus)
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
    const ultraActive  = typeof comment === 'string' && /\bultra\s*torment\b/i.test(comment);
    const radialActive = typeof comment === 'string' && /\bradial\s*torment\b/i.test(comment);

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

    embed.setDescription(description);
    return sendReply(message, embed);
}

// Action: Cover (Bonus) — Partial or Full
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

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Action: Taunt (Free)
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

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Action: Stable Attack — 7d20 + MR + WR + mods, d20 explodes on 17+
async function handleStable(message, args, comment) {
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
  // Accepts ng<number>, e.g., ng1; only ng1 is enabled; others are disabled.
  let ngBonus = 0;
  let ngNote = '';
  if (typeof comment === 'string') {
    const m = comment.match(/\bng(\d+)\b/i);
    if (m) {
      const level = parseInt(m[1], 10);
      //if (level >= 1) { ngBonus = level * 5; } // enable higher NG levels
      if (level === 1) {
        ngBonus = level * 5; // NG1 = 1*5 = 5
      } else {
        ngNote = `► NG⋅${level} is currently disabled.`;
      }
    }
  }

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

  // Embed
  const displayName = message.member?.displayName ?? message.author.username;
  const embed = new EmbedBuilder()
    .setColor('#d84848')
    .setAuthor({ name: `${displayName}'s Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Stable Attack')
    .setThumbnail('https://terrarp.com/db/action/stable.png');

  let description =
    `\`${calculation}\`\n\n` +
    `**${total} total** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n` +
    (ngNote ? `${ngNote}\n` : '');

  if (comment) description += `${comment}`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Action: Burst Attack — 12d20 + MR-bonus d20 + WR + mods, d20 explodes on 16+
async function handleBurst(message, args, comment) {
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
  let ngBonus = 0;
  let ngNote = '';
  if (typeof comment === 'string') {
    const m = comment.match(/\bng(\d+)\b/i);
    if (m) {
      const level = parseInt(m[1], 10);
      if (level === 1) {
        ngBonus = level * 5; // NG1 = 5
      } else {
        ngNote = `► NG⋅${level} is currently unavailable.`;
      }
    }
  }

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

  // Embed
  const displayName = message.member?.displayName ?? message.author.username;
  const embed = new EmbedBuilder()
    .setColor('#d84848')
    .setAuthor({ name: `${displayName}'s Special Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Burst Attack')
    .setThumbnail('https://terrarp.com/db/action/burst.png');

  let description =
    `\`${calculation}\`\n\n` +
    `**${total} total** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n` +
    `\n► Status. You are vulnerable.\n` +
    (ngNote ? `${ngNote}\n` : '');

  if (comment) description += `${comment}`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Action: Sneak Attack — 1d100 + Sneak bonus + MR + WR + mods
async function handleSneak(message, args, comment) {
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

  // Roll + success check uses MR's sneakCheck (fallback to 30 if missing)
  const r = roll(1, 100);
  const threshold = Number.isFinite(mrData.sneakCheck) ? mrData.sneakCheck : 30;
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
  let ngBonus = 0;
  let ngNote = '';
  if (typeof comment === 'string') {
    const m = comment.match(/\bng(\d+)\b/i);
    if (m) {
      const level = parseInt(m[1], 10);
      if (level === 1) {
        ngBonus = level * 5; // NG1 = 5
      } else {
        ngNote = `► NG${level} is currently disabled.`;
      }
    }
  }

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

  // Embed
  const displayName = message.member?.displayName ?? message.author.username;
  const embed = new EmbedBuilder()
    .setColor('#d84848')
    .setAuthor({ name: `${displayName}'s Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Sneak Attack')
    .setThumbnail('https://terrarp.com/db/action/sneak.png');

  let description =
    `\`${calculation}\`\n\n` +
    `**${total} total** (${success ? 'sneak successful!' : 'sneak failed...'})\n\n` +
    `► Succeeed on ${threshold}+ to add ${successBonus} sneak damage (${mrData.rank}-ranked mastery), otherwise, add 10.\n` +
    (ngNote ? `${ngNote}\n` : '');

  if (comment) description += `${comment}`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Action: Critical Attack — 2d100 + MR + WR + mods, then multiply
async function handleCritical(message, args, comment) {
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
  let ngBonus = 0;
  let ngNote = '';
  if (typeof comment === 'string') {
    const m = comment.match(/\bng(\d+)\b/i);
    if (m) {
      const level = parseInt(m[1], 10);
      if (level === 1) {
        ngBonus = level * 5; // NG1 = 5
      } else {
        ngNote = `► NG${level} is currently disabled.`;
      }
    }
  }

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

  // Embed
  const displayName = message.member?.displayName ?? message.author.username;
  const embed = new EmbedBuilder()
    .setColor('#c72828')
    .setAuthor({ name: `${displayName}'s Special Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Critical Attack')
    .setThumbnail('https://terrarp.com/db/action/critical.png');

  let description =
    `\`${calcWithMult}\`\n\n` +
    `**${finalTotal} total**${resultTag ? ` ${resultTag}` : ''}\n` +
    (triggeredLine ? `\n${triggeredLine}\n` : '') +
    (testNote ? testNote : '') +           // test note
    (ngNote ? `${ngNote}\n` : '');

  if (comment) description += `${comment}`;

  embed.setDescription(description);
  return sendReply(message, embed);
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
      .setColor('Red')
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
  const riskyActive = typeof comment === 'string' && /\brisky\b/i.test(comment);

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

  // Embed
  const displayName = message.member?.displayName ?? message.author.username;
  const embed = new EmbedBuilder()
    .setColor('#d84848')
    .setAuthor({ name: `${displayName}'s Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Sharp Attack')
    .setThumbnail('https://terrarp.com/db/action/sharp.png');

  let description =
    `\n\`${calcWithMult}\`\n\n` +
    `**${finalTotal} total**${resultTag ? ` ${resultTag}` : ''}\n` +
    (triggeredLine ? `${triggeredLine}\n` : '') +
    (forcedRisky
      ? `► Risky (TEST) activated: generated ${riskyRolls.length} test d100; remainder ${remainder}.\n`
      : (riskyActive
          ? `► Risky activated: converted ${convertedMods} into ${riskyRolls.length}d100 ${riskyTally}, remainder: +${remainder}.\n`
          : '')) +
    (ngNote ? `${ngNote}\n` : '') +
    (testScenario ? testNote : '');

  if (comment) description += `${comment}`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Action: Reckless Attack — MR E/D/C: 1d200 + 1d100; MR B/A: 1d200 + 1d100 + 1d100; MR S: 1d200 + 1d100 + 2d100kh1 (dropped die does NOT crit).
// TYPE: Special Action
// TEST TRIGGERS (via comment): "test:crit", "test:crit fail", "test:star breaker", "test:world ender", "test:schrodinger crit"
// NEW d200 OVERRIDE (via comment): "test:d200=200", "d200=200", "r200=200", or with space/colon "test d200 1", "d200: 150" (clamped to 1–200).
// Crits for this action: ONLY Nat100-based sets (no 85+ crit).
// Multipliers/events (pre-defined): Crit (≥1×100) ×2, Schrodinger (≥1×100 & ≥1×1) ×2 + Nat1 event,
// Star Breaker (≥2×100) ×7, World Ender (≥2×1 & no 100) event, Crit Fail (≥1×1 & no 100 & not World Ender) event.
// Special d200 rules: d200=200 → STAR BREAKER; d200=100 counts as a “100” for crits; d200=1 counts as a “1” for crit fails.
async function handleReckless(message, args, comment) {
  const mrData = getRankData(args[1], 'mastery');
  const wrData = getRankData(args[2], 'weapon');

  if (!mrData || !wrData) {
    const embed = new EmbedBuilder()
      .setColor('Red')
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
  const riskyActive = typeof comment === 'string' && /\brisky\b/i.test(comment);

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
  for (let i = 0; i < baseHundreds.length; i++) {
    parts.push(`1d100 (${baseHundreds[i]})`);
  }
  if (isS && sPairKept !== null && sPairDropped !== null) {
    parts.push(`2d100kh1 (${sPairDropped}, ${sPairKept}⋅KP)`);
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

  // --- Embed render ---
  const displayName = message.member?.displayName ?? message.author.username;
  const embed = new EmbedBuilder()
    .setColor('#c72828')
    .setAuthor({ name: `${displayName}'s Special Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Reckless Attack')
    .setThumbnail('https://terrarp.com/db/action/reckless.png');

  let description =
    `\n\`${calcWithMult}\`\n\n` +
    `**${finalTotal} total**${resultTag ? ` ${resultTag}` : ''}\n` +
    (triggeredLine ? `${triggeredLine}\n` : '') +
    (`► You are vulnerable.\n`) +
    (riskyActive
      ? `► Risky activated: converted ${convertedMods} into ${riskyRolls.length}d100 ${riskyTally}, remainder: +${remainder}.\n`
      : '') +
    (ngNote ? `${ngNote}\n` : '') +
    (testScenario || /(?:d200|r200)/i.test(comment || '') ? testNote : '');

  if (comment) description += `${comment}`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Area Effect — Passive spread; optional "Splash Damage" bonus mode.
// Rolls: None. NG1: No.
// Comment Trigger: "Splash Damage" -> Title becomes "Area Effect (Splash Damage)" and grants an instance of X damage to all enemies adjacent to target.
// X by MR rank: D=15, B=20, S=25. (Other ranks: no Splash instance granted.)
async function handleAreaEffect(message, args, comment) {
  const mrData = getRankData(args[1], 'mastery');
  if (!mrData) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery rank input.');
    return sendReply(message, embed, comment);
  }

  const displayName = message.member?.displayName ?? message.author.username;

  // Trigger: Splash Damage
  const splashActive = typeof comment === 'string' && /\bsplash\s*damage\b/i.test(comment);

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

  if (comment) description += `${comment}`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Duelist — Passive single-target instance; optional "Challenge" bonus mode.
// Rolls: None. NG1: No.
// Comment Trigger: "Challenge" -> Title becomes "Duelist (Challenge)" and grants a damage buff equal to X (rank-based).
// X by MR rank: D=15, C=15, B=20, A=20, S=25. (Other ranks: unavailable)
async function handleDuelist(message, args, comment) {
  const mrData = getRankData(args[1], 'mastery');
  if (!mrData) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery rank input.');
    return sendReply(message, embed, comment);
  }

  const displayName = message.member?.displayName ?? message.author.username;

  // Trigger: Challenge
  const challengeActive = typeof comment === 'string' && /\bchallenge\b/i.test(comment);

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
    description += `\n► Challenge activated: gain **${duelValue}** (${mrRankUp}-rank) as a damage buff if you attack an enemy on their space or adjacent to their space.\n`;
  } else {
    description += `► ***Passive.*** If you attack an enemy on their space or adjacent to their space, deal an instance of **${duelValue}** (${mrRankUp}-rank) damage to them.\n`;
  }

  if (comment) description += `${comment}`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Sharpshooter — Passive ranged buff; optional "Snipe" bonus mode with a 2/3 success chance.
// Rolls: 1d3 when "Snipe" is active. NG1: No.
// Comment Trigger: "Snipe" -> Title becomes "Sharpshooter (Snipe)" and rolls 1d3 to set the buff value this turn.
// Base X by MR rank:      D=5,  C=5,  B=10, A=10, S=15
// Snipe TRIGGERED X:      D=15, C=15, B=30, A=30, S=50
// Snipe NOT-TRIGGERED X:  D=10, C=10, B=15, A=15, S=20
async function handleSharpshooter(message, args, comment) {
  const mrData = getRankData(args[1], 'mastery');
  if (!mrData) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery rank input.');
    return sendReply(message, embed, comment);
  }

  const displayName = message.member?.displayName ?? message.author.username;

  // Trigger: Snipe
  const snipeActive = typeof comment === 'string' && /\bsnipe\b/i.test(comment);

  // MR rank + values
  const mrRankRaw = (mrData.rank ?? String(args[1] ?? '')).toString();
  const mrRank = mrRankRaw.toLowerCase();
  const mrRankUp = mrRankRaw.toUpperCase();

  const BASE_X        = { d: 5,  c: 5,  b: 10, a: 10, s: 15 };
  const SNIPE_TRIG_X  = { d: 15, c: 15, b: 30, a: 30, s: 50 };
  const SNIPE_FAIL_X  = { d: 10, c: 10, b: 15, a: 15, s: 20 };

  const baseBuff = BASE_X[mrRank] ?? 0;

  // Snipe roll (only if active)
  let snipeRoll = null;
  let snipeTriggered = false;
  let snipeBuff = 0;

  if (snipeActive) {
    snipeRoll = roll(1, 3);            // 1..3
    snipeTriggered = (snipeRoll === 2 || snipeRoll === 3); // 2/3 chance
    snipeBuff = (snipeTriggered ? SNIPE_TRIG_X[mrRank] : SNIPE_FAIL_X[mrRank]) ?? 0;
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

  if (comment) description += `${comment}`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Range — Passive +1 range; optional "Extend" bonus mode.
// Rolls: None. NG1: No.
// Comment Trigger: "Extend" -> Title becomes "Range (Extend)" and grants +2 range for this cycle (instead of +1).
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

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Action: Heal — 2d20 + MR + WR + mods; d20 explodes on 18+ (chaining). NG1 supported.
// Color: #4e9be2 | Thumbnail: heal.png
// Comment Trigger: "AoE" -> divide total healing by 3 and change text to "+X HP to 3 allies"; show "÷ 3" at end of calc string.
// Description note (always show): ► Free Action: Healing Cleanse. Whenever you heal, cleanse 1 curable condition after healing from an ally within range.
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

  // Precedence: Versatile overrides AoE
  const appliedMode = versatileActive ? 'Versatile' : (aoeActive ? 'AoE' : null);

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

  // --- Exploding dice: 2d20, explode on 18+ (chaining) ---
  const EXPLODE_ON = 18;
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

  // Split healing: Versatile ÷2, AoE ÷3, or no split
  const perAlly = versatileActive ? Math.floor(total / 2) : (aoeActive ? Math.floor(total / 3) : total);

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
  if (versatileActive) calculation += ' ÷ 2';
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
    (versatileActive
      ? `**+${perAlly} HP to 2 allies** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`
      : (aoeActive
        ? `**+${perAlly} HP to 3 allies** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`
        : `**+${perAlly} HP to 1 ally** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`)) +
    (ngNote ? `${ngNote}\n` : '') +
    `\n► Free Action: Healing Cleanse. Whenever you heal, cleanse 1 curable condition after healing from an ally within range.\n`;

  if (comment) description += `${comment}`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Special Action: Power Heal — 4d20 + MR + WR + mods; d20 explodes on 16+ (chaining). NG1 supported.
// Color: #3460d0 | Thumbnail: pheal.png
// Comment Trigger: "AoE" -> divide total healing by 3 and change text to "+X HP to 3 allies"; show "÷ 3" at end of calc string.
// Descriptions:
// ► You are vulnerable.
// ► Free Action: Power Healing Cleanse. After healing, cleanse X curable condition(s) from an ally within range. Manually add 5 per unused cleanse charge to your heal amount.
// X by MR rank: D=2, C=2, B=3, A=3, S=4
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

  // Precedence: Versatile overrides AoE
  const appliedMode = versatileActive ? 'Versatile' : (aoeActive ? 'AoE' : null);

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

  // --- Exploding dice: 4d20, each 16+ rolls an extra d20 (chaining) ---
  const EXPLODE_ON = 16;
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

  // Split healing: Versatile ÷2, AoE ÷3, or no split
  const perAlly = versatileActive ? Math.floor(total / 2) : (aoeActive ? Math.floor(total / 3) : total);

  // MR rank -> cleanse charges X
  const mrRankRaw = (mrData.rank ?? String(args[1] ?? '')).toString();
  const mrRank = mrRankRaw.toLowerCase();
  const mrRankUp = mrRankRaw.toUpperCase();
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
  if (versatileActive) calculation += ' ÷ 2';
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
    (versatileActive
      ? `**+${perAlly} HP to 2 allies** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`
      : (aoeActive
        ? `**+${perAlly} HP to 3 allies** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`
        : `**+${perAlly} HP to 1 ally** (${numExplosions} explosion${numExplosions === 1 ? '' : 's!'})\n`)) +
    `\n► You are vulnerable.\n` +
    `► Free Action: Power Healing Cleanse. After healing, cleanse **${cleanseX}** (${mrRankUp}-rank) curable conditions from between and up to 3 allies within range. Manually add **5** per unused cleanse charge to your heal amount.\n` +
    (ngNote ? `${ngNote}\n` : '');

  if (comment) description += `${comment}`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Action: Buff — 1d100 + MR + WR + mods + (buff bonus). NG1 supported.
// Color: #4e9be2 | Thumbnail: buff.png
// Buff bonus by MR rank: D/C=+10, B/A=+15, S=+20  (printed as "(buff bonus)" in calc)
// Crits: (100) → ×2; (1) → crit fail (Nat1 event, no multiplier).
// Comment Triggers:
//   "AoE"        → distribute as 3 equal charges across 3 targets
//   "Vers-AoE" or "Versatile" → same 3 total charges to 2 targets (2+1). If both are present, Versatile wins.
// NOTE: All buffing is applied over 3 charges, even when targeting a single ally.
// Extras:
//   Test triggers (in comment): "test:crit" or "test:100" → force r=100; "test:fail" or "test:1" → force r=1;
//   Also supports "r=100", "d100=1", etc.
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

  // Precedence: Versatile overrides AoE
  const appliedMode = versatileActive ? 'Versatile' : (aoeActive ? 'AoE' : null);

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

  // Single-target flat bonus by MR (applies ONLY when not AoE/Versatile)
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
  const perCharge = Math.floor(multipliedTotal / 3); // ALWAYS divide by 3 (3-charge system)

  // Targeting / distribution text
  let descriptionLines = [];
  let displayBlock = '';

  if (appliedMode === 'Versatile') {
    const twoCharges = perCharge * 2;
    const oneCharge = perCharge;
    displayBlock =
      `**+${twoCharges} damage buff to 1 target**\n` +
      `**+${oneCharge} damage buff to 1 target**\n` +
      `\n► Versatile activated. Grant 3 charges to 2 targets (2+1) instead of 3 targets (1 each).\n`;
  } else if (appliedMode === 'AoE') {
    displayBlock = `**+${perCharge} damage buff to 3 targets**\n`;
  } else {
    displayBlock = `**+${perCharge} damage buff to 1 target (3 charges)**\n\n► Single-target bonus activated. ${singleTargetBonusTotal} added (${wrData.rank}-rank).\n`;
  }

  // MODIFICATION START
  // Calculation string: show × multiplier only if >1, then always show ÷ 3
  const parts = [
    `1d100 (${r})`,
    `${mrData.value} (MR⋅${mrData.rank})`,
    `${wrData.value} (WR⋅${wrData.rank})`,
  ];
  if (buffBonus > 0) parts.push(`${buffBonus} (buff mod)`);
  if (singleTargetBonusTotal > 0) parts.push(`${singleTargetBonusTotal} (ST bonus)`);
  if (ngBonus > 0) parts.push(`${ngBonus} (NG⋅1)`);
  if (hasMods && modsClean.length > 0) parts.push(`${modsClean} (mods)`);
  // MODIFICATION END

  let calcTail = '';
  if (multiplier !== 1) calcTail += ` × ${multiplier}`;
  calcTail += ' ÷ 3';

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

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Special Action: Power Buff — 2d100 + MR + WR + mods + (buff bonus). NG1 supported.
// Color: #3460d0 | Thumbnail: pbuff.png
// Buff bonus by MR rank: D/C=+10, B/A=+15, S=+20  (printed as "(buff bonus)" in calc)
// Crits (2d100 set): STAR BREAKER, WORLD ENDER, schrodinger crit!, crit!, crit fail...
// Comment Triggers:
//   "AoE"        → distribute as 3 equal charges across 3 targets
//   "Vers-AoE" or "Versatile" → same 3 total charges to 2 targets (2+1). If both are present, Versatile wins.
// NOTE: All buffing is applied over 3 charges, even when targeting a single ally.
// Extras (tests in comment):
//   "test:starbreaker" → r1=100,r2=100
//   "test:world ender" → r1=1,r2=1
//   "test:schrodinger" → r1=100,r2=1
//   "test:crit" or "test:100" → r1=100,r2=42
//   "test:fail" or "test:1" → r1=1,r2=42
//   Direct overrides: "r=100,86" or "r1=100 r2=86"
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

  // Precedence: Versatile overrides AoE
  const appliedMode = versatileActive ? 'Versatile' : (aoeActive ? 'AoE' : null);

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

  // Single-target flat bonus by MR (applies ONLY when not AoE/Versatile)
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
  const perCharge = Math.floor(multipliedTotal / 3); // ALWAYS divide by 3 (3-charge system)

  // Targeting / distribution text
  let displayBlock = '';
  if (appliedMode === 'Versatile') {
    const twoCharges = perCharge * 2;
    const oneCharge  = perCharge;
    displayBlock =
      `**+${twoCharges} damage buff to 1 target**\n` +
      `**+${oneCharge} damage buff to 1 target**\n` +
      `\n► Versatile activated. Grant 3 charges to 2 targets (2+1) instead of 3 targets (1 each).\n`;
  } else if (appliedMode === 'AoE') {
    displayBlock = `**+${perCharge} damage buff to 3 targets**\n`;
  } else {
    displayBlock = `**+${perCharge} damage buff to 1 target (3 charges)**\n\n► Single-target bonus activated. ${singleTargetBonusTotal} added (${wrData.rank}-rank).\n`;
  }

  // Calculation string: show ×multiplier only if >1, then always show ÷ 3
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
  calcTail += ' ÷ 3';

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

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Imbue — Bind a break-type to an ally when you heal or buff this cycle.
// Rolls: None. NG1: No. Crit: No.
// Comment Triggers:
//   Target:NAME                 → selects the ally to imbue
//   Break:TYPE                  → selects the break-type (Construct | Dark | Elemental | Physical | Order)
// Display:
//   Base:  ► Free Action. If you heal or buff this cycle, you may imbue an ally with any of your support mastery’s break-type. Lasts indefinitely, one ally at a time.
//   When both Target and Break are present:  ► NAME’s attacks now deal TYPE break damage.
// Sub-Action: Imbue — Bind a break-type to an ally when you heal or buff this cycle.
// Rolls: None. NG1: No. Crit: No.
// Comment Triggers:
//   Target (NAME)                 → selects the ally to imbue
//   Break (TYPE)                  → selects the break-type (Construct | Dark | Elemental | Physical | Order)
// Display:
//   Base:  ► Free Action. If you heal or buff this cycle, you may imbue an ally with any of your support mastery’s break-type. Lasts indefinitely, one ally at a time.
//   When both Target and Break are present:  ► NAME’s attacks now deal TYPE break damage.
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

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Versatile — Change targeting to 2; optional "Simulcast" bonus mode.
// Rolls: None. NG1: No. Crit: No.
// Comment Trigger: "Simulcast" -> Title becomes "Simulcast" and grants the bonus action effect.
// Display:
//   Base:  ► *Free Action.* Apply the effects to 2 targets (instead of 3) and apply the last heal/buff amount to one of those targets.
//   Ultra: ► *Bonus Action.* Roll both actions (both must be special or non-special) using the AoE command and choose if each target gets either the heal or buff.
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
    description += `► **Bonus Action.** Roll both Buff and Heal. Both actions must be Standard or Special and AoE. Choose which of the target gets the *heal* or *buff* charge.\n`;
  }

  if (comment) description += `${comment}`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Smite — Passive
// Rolls: None. NG1: No.
// Comment Trigger: None.
async function handleSmite(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;

  // Embed
  const embed = new EmbedBuilder()
    .setColor('#5f6587')
    .setAuthor({ name: `${displayName}'s Passive`, iconURL: message.author.displayAvatarURL() })
    .setTitle('Smite')
    .setThumbnail('https://terrarp.com/db/action/sba.png');

  // Description
  let description = `► ***Passive.*** Whenever you *Heal* or *Buff* an ally, you may activate *Torment* or *Area Effect* from that ally's space.\n◦ Activate Torment or Area Effect below.\n`;

  if (comment) description += `${comment}`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Revive — Bonus action to revive or stabilize an ally.
// Rolls: None. NG1: No. Crit: No.
// Comment Trigger: "Stabilize" -> Title/text changes to reflect stabilization.
// Comment Trigger: "Target(name)" -> Sets the target's name in the description.
// Comment Trigger: "MaxHP(value)" -> Calculates 50% of the value for the HP regained.
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

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Cure — Passive self-cleanse; optional "Cleanse" bonus mode.
// Rolls: No. NG1: No. Crit: No.
// Comment Trigger: "Cleanse" -> Title becomes "Cleanse" and grants the bonus action.
// Rank requirement: Unavailable for MR=E.
async function handleCure(message, args, comment) {
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

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Haste — Bonus action to grant movement.
// Rolls: No. NG1: No. Crit: No.
// Comment Trigger: None.
// Rank requirement: Unavailable for MR=E.
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

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Inspire — Bonus action to grant a bonus to rolls.
// Rolls: No. NG1: No. Crit: No.
// Comment Trigger: None.
// Rank requirement: Unavailable for MR=E.
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

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Alter Actions Start Here //

// Alter Sub-Action: Guardian — Free action damage mitigation; optional "Amplify Aura" bonus mode.
// Rolls: No. NG1: No. Crit: No.
// Comment Trigger: "Amplify Aura" -> Title changes, action becomes Bonus, mitigation is doubled.
// Amplify Aura Rank Requirement: Only available at MR=A and MR=S.
async function handleGuardian(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Trigger: "Amplify Aura"
  const amplifyActive = /\bamplify\s*aura\b/i.test(commentString);

  // Rank validation for Amplify Aura
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
    // Amplify Aura (Bonus Action)
    mitigationAmount *= 2; // Double the mitigation
    embed.setTitle('**(Alter) Guardian**');
    description += `► **Bonus Action: Amplify Aura.** Distribute **${mitigationAmount} mitigation** (MR⋅${mrRankUp}) between and up to 3 targets in multiples of 5s.\n`;
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

// Alter Sub-Action: Savior — Passive save roll bonus; optional "Share Aura" bonus mode.
// Rolls: No. NG1: No. Crit: No.
// Comment Trigger: "Share Aura" -> Title changes, action becomes Bonus, bonus is shared with allies.
// Share Aura Rank Requirement: Only available at MR=D, MR=B, and MR=S.
async function handleSavior(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // Trigger: "Share Aura"
  const shareAuraActive = /\bshare\s*aura\b/i.test(commentString);

  // Rank validation for Share Aura
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
    // Share Aura (Bonus Action)
    const allies = mrRank === 's' ? '2 allies' : '1 ally';
    embed.setTitle('**(Alter) Savior**');
    description += `► **Bonus Action: Share Aura.** Gain a **+${saveAmount} bonus** (MR⋅${mrRankUp}) to any save roll until the next damage phase, and share the same amount with ***${allies}*** within range.\n`;
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

// Sub-Action: Rage — Passive single-target instance; optional "Frenzy" bonus mode.
// Rolls: None. NG1: No. Crit: No.
// Comment Trigger 1: "Taken-damage (Y)" -> uses Y to compute X (capped by MR rank unless Frenzy)
// Comment Trigger 2: "Frenzy"          -> Title becomes "Rage (Frenzy)", doubles damage and removes cap this cycle
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

  // Caps by MR rank (only available at C, A, S unless Frenzy removes the cap)
  const CAPS = { c: 50, b: 75, a: 100, s: 125 };
  const hasCapForRank = Object.prototype.hasOwnProperty.call(CAPS, mrRank);
  if (!frenzyActive && !hasCapForRank) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Unavailable MR Rank')
      .setDescription('Rage is only available from C-rank+.')
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

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Sub-Action: Exchange — Convert defense into offense/utility for next damage phase.
// Rolls: None. NG1: No. Crit: No.
// Trigger: "Renewal" -> Bonus Action + roll Yd20 with advantage (per-die) and inline dice string.
async function handleExchange(message, args, comment) {
  const mrData = getRankData(args[1], 'mastery');
  if (!mrData) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Invalid Rank')
      .setDescription('Check your Mastery rank input.');
    return sendReply(message, embed, comment);
  }

  const displayName = message.member?.displayName ?? message.author.username;

  // Rank parsing
  const mrRankRaw = (mrData.rank ?? String(args[1] ?? '')).toString();
  const mrRank = mrRankRaw.toLowerCase();
  const mrRankUp = mrRankRaw.toUpperCase();

  // Trigger: Renewal (advantage & becomes Bonus Action)
  const renewalActive = typeof comment === 'string' && /\bdefile\b/i.test(comment);

  // Only available at C/B/S
  const DICE_BY_RANK = { c: 1, b: 2, s: 3 };
  const yDice = DICE_BY_RANK[mrRank];
  if (!yDice) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Unavailable MR Rank')
      .setDescription('**Exchange** is available at **MR=C, MR=B, MR=S** only.\nY = 1d20 (C), 2d20 (B), 3d20 (S).');
    return sendReply(message, embed, comment);
  }

  // MR weight (tweak later if you define values)
  const MR_WEIGHT = { c: 0, b: 0, s: 0 };
  const mrWeight = MR_WEIGHT[mrRank] ?? 0;

  // --- Roll Yd20 (sum) with per-die advantage if Renewal is active ---
  let sumY = 0;
  let rolledDisplayInline = ''; // e.g., "10, ~~3~~, 14, ~~1~~, 20, ~~12~~" or "10, 4"
  if (renewalActive) {
    const parts = [];
    for (let i = 0; i < yDice; i++) {
      const a = roll(1, 20);
      const b = roll(1, 20);
      const chosen = Math.max(a, b);
      const other  = a === chosen ? b : a;
      sumY += chosen;
      // Show chosen first, then strikethrough the non-chosen
      parts.push(`${chosen}`, `~~${other}~~`);
    }
    rolledDisplayInline = parts.join(', ');
  } else {
    const rolls = Array.from({ length: yDice }, () => roll(1, 20));
    sumY = rolls.reduce((a, b) => a + b, 0);
    rolledDisplayInline = rolls.join(', ');
  }

  // X = Yd20 - MR_weight; clamp at 0
  const X = Math.max(0, sumY - mrWeight);

  // Build embed
  const embed = new EmbedBuilder()
    .setColor('#6845a2')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle(renewalActive ? '(Alter) Defiled Exchange' : '(Alter) Exchange')
    .setThumbnail('https://terrarp.com/db/action/exchange.png');

  // Description — inline dice string inside the main sentence
  const actionLead = renewalActive ? '**Bonus Action.**' : '**Free Action.**';
  const diceTerm  = `${yDice}d20${renewalActive ? `kh` + `${yDice}` : ''}`;

  let description = '';
  description += `► ${actionLead} Gain a **-${X} penalty** (${diceTerm} = ${rolledDisplayInline} - MR⋅${mrRankUp}) to all *Save Rolls* until the end of the next damage phase and a **+${X} bonus** to attack, buff, or heal.\n`;

  description += `\n◦ Note: The DM may convert Save reduction to HP-reduction.*`;
  if (renewalActive) {
    description += `\n◦ Defile: Rerolled with advantage.`;
  }

  if (comment) description += `${comment}`;
  description += ` · *[Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed);
}

// Alter Sub-Action: Wager Future — Bank an action or Renege on a banked action.
// Rolls: Renege only (1d2).
// Comment Trigger: "Banking (X)" -> Banks an action. "Renege" -> Executes the bonus action.
// Rank Requirements: Renege unlocks at MR=A. Max banks increase at MR=B.
async function handleWagerFuture(message, args, comment) {
  const displayName = message.member?.displayName ?? message.author.username;
  const commentString = typeof comment === 'string' ? comment : '';

  // Get rank data
  const mrData = getRankData(args[1], 'mastery');
  const mrRank = mrData?.rank?.toLowerCase();
  const mrRankUp = mrData?.rank?.toUpperCase() ?? 'N/A';

  // This regex is robust and handles spaces/text inside the parentheses.
  const bankingMatch = /\bbanking\s*\(\s*([^)]+?)\s*\)/i.exec(commentString);
  const renegeActive = /\brenege\b/i.test(commentString);

  // Embed setup
  const embed = new EmbedBuilder()
    .setColor('#6845a2')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setThumbnail('https://terrarp.com/db/action/wagerfuture.png');

  let description = '';

  // --- Renege path (Bonus Action) ---
  if (renegeActive) {
    // Rank validation for Renege
    if (!mrRank || !['a', 's'].includes(mrRank)) {
      const err = new EmbedBuilder()
        .setColor('Red')
        .setTitle('Invalid Rank')
        .setDescription('The **Renege** Bonus Action is only available at Mastery Rank (A) or higher.');
      return sendReply(message, err, comment);
    }

    embed.setTitle('(Alter) Wager Future - Renege');

    const rollResult = roll(1, 2);
    const hpLoss = rollResult === 1 ? 200 : 100;
    const renegeAttempts = mrRank === 's' ? `2 attempts (MR⋅S)` : `1 attempt (MR⋅A)`;

    description += `► **Bonus Action: Renege.** Roll: 1d2 = **${rollResult}** → Lose **${hpLoss}** current and max HP.\n`;
    description += `◦ Renege: max ${renegeAttempts}\n`;

  // --- Banking path (Free Action) ---
  } else {
    embed.setTitle('(Alter) Wager Future');

    const bankedValue = bankingMatch && bankingMatch[1] ? `**${bankingMatch[1].trim()}**` : '**X**';
    const maxBanks = (mrRank && ['b', 'a', 's'].includes(mrRank)) ? 2 : 1;

    description += `► **Free Action.** ${bankedValue} has been banked for future use.`;
    description += `\n◦ Deadline: If a banked action remains by end-of-thread or cycle 5, roll 1d2 and lose 200 current & max HP on 1, or 100 on 2.`;
    description += `\n◦ Maximum: ${maxBanks} banked action${maxBanks > 1 ? 's' : ''}.`;

    // --- FINAL CHANGE AS REQUESTED ---
    // Always show Renege status, changing the text based on rank.
    let renegeStatus = '';
    if (mrRank === 's') {
      renegeStatus = 'max 2 attempts (MR⋅S)';
    } else if (mrRank === 'a') {
      renegeStatus = 'max 1 attempt (MR⋅A)';
    } else {
      renegeStatus = 'Locked (Requires MR⋅A)';
    }
    description += `\n◦ Renege: ${renegeStatus}\n`;
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
    description += `\n${comment}`;
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
  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed, comment);
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

  // --- Calculate Reflex Bonus (X) ---
  let reflexBonus = 'X'; // Default value if Speed(X) is not provided
  if (speedMatch && speedMatch[1]) {
    const speedValueX = parseInt(speedMatch[1], 10);
    reflexBonus = `**+${speedValueX * 5}**`;
  }

  // --- Embed setup ---
  const embed = new EmbedBuilder()
    .setColor('#6845a2')
    .setAuthor({ name: `${displayName}'s Sub-Action`, iconURL: message.author.displayAvatarURL() })
    .setTitle('(Alter) Acceleration')
    .setThumbnail('https://terrarp.com/db/action/acceleration.png');

  let description = `► **Free Action.** Gain a +2 bonus to Fortitude and Will, and ${reflexBonus} to Reflex Save in the next damage phase.\n`;
  description += ` · *[Roll Link](${message.url})*`;

  embed.setDescription(description);
  return sendReply(message, embed, comment);
}

/////////////////Bot Version
async function handleVersion(message, args, comment) {
    const embed = new EmbedBuilder()
        .setColor('#99AAB5')
        .setTitle('Bot Version')
        .setDescription('**Current Version: 2.0.1**'); // From original code
    sendReply(message, embed, comment);
}

// --- Command Lookup Table ---
const commandHandlers = {
    'attack': handleAttack,
    'atk': handleAttack,
    'rush': handleRush,
    'protect': handleProtect,
    'ultraprotect': handleUltraProtect,
    'counter': handleCounter,
    'ultracounter': handleUltraCounter,
    'torment': handleTorment,
    'cover': handleCover,
    'taunt': handleTaunt,
    'stable' : handleStable,
    'burst' : handleBurst,
    'sneak' : handleSneak,
    'critical' : handleCritical,
    'sharp' : handleSharp,
    'reckless' : handleReckless,
    'areaeffect' : handleAreaEffect,
    'duelist' : handleDuelist,
    'sharpshooter' : handleSharpshooter,
    'range' : handleRange,
    'heal' : handleHeal,
    'powerheal' : handlePowerHeal,
    'buff' : handleBuff,
    'powerbuff' : handlePowerBuff,
    'imbue' : handleImbue,
    'versatile' : handleVersatile,
    'smite' : handleSmite,
    'revive' : handleRevive,
    'cure' : handleCure,
    'haste' : handleHaste,
    'inspire' : handleInspire,
    'guardian' : handleGuardian,
    'savior' : handleSavior,
    'overdrive' : handleOverdrive,
    'rage' : handleRage,
    'exchange' : handleExchange,
    'wagerfuture' : handleWagerFuture,
    'momentum' : handleMomentum,
    'rover' : handleRover,
    'acceleration' : handleAcceleration,
    'version': handleVersion,
    // TODO: Add all other command handlers here following the pattern above.
    // e.g., 'ultracounter': handleUltraCounter, 'save': handleSave, etc.
};

// --- Main Export ---
module.exports = {
    name: 'r',
    aliases: ['roll'],
    description: 'Roll dice for Sphera RPG.',
    async execute(message) {
        if (!checkPermissions(message)) return;

        const { args, comment } = parseArguments(message.content);

        if (args.length === 0) {
            // ... (your help embed logic remains here) ...
            const helpEmbed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setTitle('Sphera Roll Commands')
                .addFields(
                    { name: 'Basic Action', value: `\`${PREFIX}r attack MR WR [mods] # comment\`` },
                    { name: 'Generic Roll', value: `\`${PREFIX}r XdY [mods] # comment\``} // Added example for generic roll
                    // Add more help fields if you like
                );
            return sendReply(message, helpEmbed, '');
        }

        const commandName = args[0].toLowerCase();
        const handler = commandHandlers[commandName];

        if (handler) {
            // This handles known commands like "attack", "recover", etc.
            try {
                await handler(message, args, comment);
            } catch (error) {
                // ... (error handling) ...
            }
        } else if (commandName.includes('d')) {
            // THIS IS THE NEW PART: If it's not a known command, but it has a "d",
            // we assume it's a generic dice roll and call our new handler.
            await handleGenericRoll(message, args, comment);
        } else {
            // This handles any other unknown command.
            const unknownEmbed = new EmbedBuilder().setColor('Red').setTitle('Unknown Command').setDescription(`The command \`${commandName}\` was not found. Use \`${PREFIX}r\` for help.`);
            sendReply(message, unknownEmbed, comment);
        }
    }
};
