const { EmbedBuilder } = require('discord.js');
const { roll, parseModifiers, sendReply, parseArguments } = require('../helpers');

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

/////////////////Bot Version
async function handleVersion(message, args, comment) {
    const embed = new EmbedBuilder()
        .setColor('#99AAB5')
        .setTitle('Bot Version')
        .setDescription('**Current Version: 3.12.0** - Sphera 3.12 Update');
    sendReply(message, embed, comment);
}

module.exports = {
    handleGenericRoll,
    handleVersion
};
