const { EmbedBuilder } = require('discord.js');
const { roll, parseModifiers, sendReply, parseArguments, getDisplayName, finalizeAndSend } = require('../../helpers');
const { EMBED_COLORS } = require('../constants');

const MAX_DICE_SAFETY = 200;

function parseDiceNotation(notation) {
    const headMatch = notation.match(/^(\d+)d(\d+)(.*)$/);
    if (!headMatch) {
        return { error: 'Please use the `XdY` format (e.g., `1d100`, `2d6`, `2d20kh1`, `4d6kl1`, `2d6e6`, `1d100dc50`).' };
    }

    const numDice = parseInt(headMatch[1], 10);
    const dieFace = parseInt(headMatch[2], 10);
    let tail = headMatch[3];

    if (numDice <= 0 || dieFace <= 0 || numDice > 100 || dieFace > 1000) {
        return { error: 'Number of dice and faces must be positive numbers. Please keep rolls reasonable (max 100 dice, 1000 faces).' };
    }

    const result = {
        numDice,
        dieFace,
        keepType: null,
        keepCount: null,
        explodeOn: null,
        dcThreshold: null
    };

    const seen = new Set();
    const tokenRegex = /^(kh|kl|dc|e)(\d+)/;

    while (tail.length > 0) {
        const tokenMatch = tail.match(tokenRegex);
        if (!tokenMatch) {
            return { error: `Unknown suffix near \`${tail}\`. Valid suffixes: \`khN\`, \`klN\`, \`eN\`, \`dcN\`.` };
        }

        const kind = tokenMatch[1];
        const value = parseInt(tokenMatch[2], 10);

        if (seen.has(kind)) {
            return { error: `Duplicate \`${kind}\` suffix.` };
        }
        seen.add(kind);

        if (kind === 'kh' || kind === 'kl') {
            if (value <= 0 || value > numDice) {
                return { error: `Keep count must be between 1 and ${numDice}.` };
            }
            result.keepType = kind;
            result.keepCount = value;
        } else if (kind === 'e') {
            if (value < 2 || value > dieFace) {
                return { error: `Explosion threshold must be between 2 and ${dieFace}.` };
            }
            result.explodeOn = value;
        } else if (kind === 'dc') {
            if (value < 1) {
                return { error: 'DC must be a positive number.' };
            }
            result.dcThreshold = value;
        }

        tail = tail.slice(tokenMatch[0].length);
    }

    return result;
}

function rollWithExplosions(numDice, dieFace, explodeOn) {
    const dice = [];
    let pending = numDice;
    while (pending > 0 && dice.length < MAX_DICE_SAFETY) {
        const r = roll(1, dieFace);
        dice.push(r);
        if (explodeOn !== null && r >= explodeOn) pending++;
        pending--;
    }
    return dice;
}

async function handleGenericRoll(message, args, comment) {
    const notation = args[0].toLowerCase();

    const parsed = parseDiceNotation(notation);
    if (parsed.error) {
        const embed = new EmbedBuilder().setColor(EMBED_COLORS.error).setTitle('Invalid Format').setDescription(parsed.error);
        return sendReply(message, embed, comment);
    }

    const { numDice, dieFace, keepType, keepCount, explodeOn, dcThreshold } = parsed;

    const dice = rollWithExplosions(numDice, dieFace, explodeOn);

    let keptIndices;
    if (keepType) {
        const sorted = dice
            .map((v, i) => ({ v, i }))
            .sort((a, b) => keepType === 'kh' ? b.v - a.v : a.v - b.v)
            .slice(0, keepCount)
            .map(x => x.i);
        keptIndices = new Set(sorted);
    } else {
        keptIndices = new Set(dice.map((_, i) => i));
    }

    let rollTotal = 0;
    dice.forEach((v, i) => { if (keptIndices.has(i)) rollTotal += v; });

    const modifiers = parseModifiers(args, 1);
    const finalTotal = rollTotal + modifiers.total;

    const explosionExtras = Math.max(0, dice.length - numDice);
    const headerNotation = `${notation}${explosionExtras > 0 ? `+${explosionExtras}` : ''}`;

    const annotateDie = (v, i) => {
        const dropped = !keptIndices.has(i);
        const exploded = explodeOn !== null && v >= explodeOn;
        const droppedPrefix = dropped ? '~' : '';
        const explodedSuffix = exploded ? '⋅EX' : '';
        return `${droppedPrefix}${v}${explodedSuffix}`;
    };

    const displayRolls = (keepType || explodeOn !== null)
        ? dice.map(annotateDie).join(', ')
        : dice.join(' + ');

    const calculation = `${headerNotation} (${displayRolls})${modifiers.display}`;

    const dcSuffix = dcThreshold !== null
        ? (finalTotal >= dcThreshold ? ' — **Success**' : ' — **Failure**')
        : '';

    const displayName = getDisplayName(message);
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.generic)
        .setAuthor({ name: `${displayName}'s Roll`, iconURL: message.author.displayAvatarURL() })
        .setTitle(`Dice Roll`)
        .setThumbnail('https://terrarp.com/db/action/roll.png');

    const description = `\`${calculation}\`\n**Total: ${finalTotal}**${dcSuffix}\n`;

    return finalizeAndSend(message, embed, description, comment);
}

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
