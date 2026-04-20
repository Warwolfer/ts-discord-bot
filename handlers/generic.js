const { EmbedBuilder } = require('discord.js');
const { roll, parseModifiers, sendReply, parseArguments, getDisplayName, finalizeAndSend } = require('../helpers');
const { EMBED_COLORS } = require('../constants');

async function handleGenericRoll(message, args, comment) {
    // The dice notation (e.g., "1d100", "2d20kh1", "4d6kl1") is the first argument.
    const diceNotation = args[0].toLowerCase();

    // --- Input Validation ---
    // Supports XdY, XdYkhN (keep highest N), XdYklN (keep lowest N)
    const match = diceNotation.match(/^(\d+)d(\d+)(?:(kh|kl)(\d+))?$/);
    if (!match) {
        const embed = new EmbedBuilder().setColor(EMBED_COLORS.error).setTitle('Invalid Format').setDescription('Please use the `XdY` format (e.g., `1d100`, `2d6`, `2d20kh1`, `4d6kl1`).');
        return sendReply(message, embed, comment);
    }

    const numDice = parseInt(match[1]);
    const dieFace = parseInt(match[2]);
    const keepType = match[3];
    const keepCount = match[4] ? parseInt(match[4]) : numDice;

    if (numDice <= 0 || dieFace <= 0 || numDice > 100 || dieFace > 1000) {
        const embed = new EmbedBuilder().setColor(EMBED_COLORS.error).setTitle('Invalid Dice').setDescription('Number of dice and faces must be positive numbers. Please keep rolls reasonable (max 100 dice, 1000 faces).');
        return sendReply(message, embed, comment);
    }

    if (keepType && (keepCount <= 0 || keepCount > numDice)) {
        const embed = new EmbedBuilder().setColor(EMBED_COLORS.error).setTitle('Invalid Keep Count').setDescription(`Keep count must be between 1 and ${numDice}.`);
        return sendReply(message, embed, comment);
    }

    // --- Rolling Logic ---
    const rollResults = [];
    for (let i = 0; i < numDice; i++) {
        rollResults.push(roll(1, dieFace));
    }

    // --- Keep Highest/Lowest: pick indices to include in the total ---
    let keptIndices;
    if (keepType) {
        const sorted = rollResults
            .map((v, i) => ({ v, i }))
            .sort((a, b) => keepType === 'kh' ? b.v - a.v : a.v - b.v)
            .slice(0, keepCount)
            .map(x => x.i);
        keptIndices = new Set(sorted);
    } else {
        keptIndices = new Set(rollResults.map((_, i) => i));
    }

    let rollTotal = 0;
    rollResults.forEach((v, i) => { if (keptIndices.has(i)) rollTotal += v; });

    // --- Modifier Logic ---
    // Modifiers start after the dice notation (at index 1)
    const modifiers = parseModifiers(args, 1);
    const finalTotal = rollTotal + modifiers.total;

    // --- Display Logic ---
    // Dropped dice are prefixed with ~ (e.g., "17, ~5") since markdown doesn't render inside code blocks.
    const displayRolls = keepType
        ? rollResults.map((v, i) => keptIndices.has(i) ? `${v}` : `~${v}`).join(', ')
        : rollResults.join(' + ');
    const calculation = `${diceNotation} (${displayRolls})${modifiers.display}`;

    const displayName = getDisplayName(message);
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.generic)
        .setAuthor({ name: `${displayName}'s Roll`, iconURL: message.author.displayAvatarURL() })
        .setTitle(`Dice Roll`)
        .setThumbnail('https://terrarp.com/db/action/roll.png');

    const description = `\`${calculation}\`\n**Total: ${finalTotal}**\n`;

    return finalizeAndSend(message, embed, description, comment);
}

/////////////////Bot Version
async function handleVersion(message, args, comment) {
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.utility)
        .setTitle('Bot Version')
        .setDescription('**Current Version: 3.12.0** - Sphera 3.12 Update');
    sendReply(message, embed, comment);
}

module.exports = {
    handleGenericRoll,
    handleVersion
};
