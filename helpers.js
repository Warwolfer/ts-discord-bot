// helpers.js - Helper functions for the Sphera RPG Discord bot

const { EmbedBuilder } = require('discord.js');
require('dotenv').config();
const {
    PREFIX,
    STAFF_CATEGORY_ID,
    BOT_CATEGORY_ID,
    STORY_CATEGORY_ID,
    TEST_CHANNEL_ID,
    REPLY_DELETE_TIMEOUT,
    RANK_DATA,
    WEAPON_RANK_DATA
} = require('./constants');

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

/**
 * Detects passive ability tags in comment and returns display strings
 * Does NOT calculate bonuses - users add bonuses manually as modifiers
 * @param {string} actionType - 'attack' or 'support'
 * @param {string} commentString - Comment to parse
 * @returns {string[]} - Array of tag descriptions to display
 */
function getPassiveModifiers(actionType, commentString) {
    if (!commentString) return [];

    const tags = [];

    // Check for Combat Focus (both attack and support, space-sensitive)
    if (/\bcombat\s+focus\b/i.test(commentString)) {
        tags.push('Using Combat Focus');
    }

    // Check for Lethal (attack only)
    if (actionType === 'attack' && /\blethal\b/i.test(commentString)) {
        tags.push('Using Lethal');
    }

    // Check for Blessed (support only)
    if (actionType === 'support' && /\bblessed\b/i.test(commentString)) {
        tags.push('Using Blessed');
    }

    return tags;
}

/**
 * Extracts display name from message author
 * Centralizes the display name extraction pattern used throughout handlers
 * @param {import('discord.js').Message} message - The message object
 * @returns {string} - The display name
 */
function getDisplayName(message) {
    return message.member?.displayName ?? message.author.username;
}

/**
 * Parses NG trigger from comment string
 * Only NG1 is currently enabled, returning +5 bonus
 * Higher NG levels return a disabled notice
 * @param {string} comment - Comment string to parse
 * @returns {{bonus: number, note: string}} - NG bonus and note
 */
function parseNGTrigger(comment) {
    if (typeof comment !== 'string') {
        return { bonus: 0, note: '' };
    }

    const match = comment.match(/\bng(\d+)\b/i);
    if (!match) {
        return { bonus: 0, note: '' };
    }

    const level = parseInt(match[1], 10);
    if (level === 1) {
        return { bonus: 5, note: '' };
    }
    return { bonus: 0, note: `► NG⋅${level} is currently disabled.` };
}

/**
 * Finalizes embed description with comment and roll link, then sends
 * This centralizes the common pattern of adding comment, roll link, setting description, and sending
 * @param {import('discord.js').Message} message - The message object
 * @param {import('discord.js').EmbedBuilder} embed - The embed to send
 * @param {string} description - The description text (without comment/roll link)
 * @param {string} comment - The user's comment (already formatted)
 * @returns {Promise<void>}
 */
async function finalizeAndSend(message, embed, description, comment) {
    // Add comment if exists
    if (comment) {
        description += `${comment}`;
    }

    // Add roll link
    description += ` · *[Roll Link](${message.url})*`;

    // Set description and send (don't pass comment to sendReply since we already added it)
    embed.setDescription(description);
    return sendReply(message, embed);
}

module.exports = {
    roll,
    parseArguments,
    parseModifiers,
    getRankData,
    checkPermissions,
    sendReply,
    getPassiveModifiers,
    getDisplayName,
    parseNGTrigger,
    finalizeAndSend
};
