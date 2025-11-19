const { EmbedBuilder } = require('discord.js');
const { roll, getRankData, parseModifiers, sendReply } = require('../helpers');

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

module.exports = {
    handleProtect
};
