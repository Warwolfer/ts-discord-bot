// helpers.js - Helper functions for the Sphera RPG Discord bot

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
} = require('./commands/constants');
const { parseCommandString } = require('./commands/parseCommand');
const tape = require('./revise/tape');
const store = require('./revise/store');
const { buildRollButtons } = require('./revise/components');

const path = require('path');
const fs = require('fs');

const EMPTY_CONTEXT = { comment: '', userId: '', commandText: '', rootUrl: null, revisionCount: 0 };

let currentContext = { ...EMPTY_CONTEXT };
let preprocessorCache = { mtime: 0, fn: null };
let ruleState = new Map();
let currentTape = null;      // recording target; null means not recording
let replayCursor = null;     // set only while a revision is replaying

// --- Helper Functions ---

function setRollContext(ctx) {
    currentContext = {
        comment: (ctx && ctx.comment) || '',
        userId: (ctx && ctx.userId) || '',
        commandText: (ctx && ctx.commandText) || '',
        rootUrl: (ctx && ctx.rootUrl) || null,
        revisionCount: (ctx && ctx.revisionCount) || 0
    };
    ruleState = new Map();
    currentTape = tape.createTape();
    replayCursor = null;   // callers that want replay call startReplay AFTER this
}

function clearRollContext() {
    currentContext = { ...EMPTY_CONTEXT };
    ruleState = new Map();
    currentTape = null;
    replayCursor = null;
}

/** Puts roll() into replay mode for a revision. Call after setRollContext. */
function startReplay(recordedTape) {
    replayCursor = tape.startReplay(recordedTape);
    return replayCursor;
}

function getRollContext() {
    return currentContext;
}

function getCurrentTape() {
    return currentTape;
}

function checkPreprocessor(min, max) {
    try {
        const filePath = path.join(__dirname, 'preprocessor', 'index.js');
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs !== preprocessorCache.mtime) {
            try { delete require.cache[require.resolve('./preprocessor')]; } catch (_) {}
            preprocessorCache.fn = require('./preprocessor');
            preprocessorCache.mtime = stat.mtimeMs;
        }
        const fn = preprocessorCache.fn;
        const callable = (typeof fn === 'function') ? fn
            : (fn && typeof fn.preprocess === 'function') ? fn.preprocess
            : null;
        if (!callable) return null;
        const result = callable(min, max, currentContext, ruleState);
        return Number.isFinite(result) ? result : null;
    } catch (_) {
        preprocessorCache = { mtime: 0, fn: null };
        return null;
    }
}

/** Rolls a single die, recording the result so the roll can be revised later. */
function roll(min, max) {
    // Replay wins outright. Whatever the preprocessor produced originally is
    // already baked into the tape, so it must not run a second time.
    if (replayCursor) return replayCursor.take(min, max);

    let value = checkPreprocessor(min, max);
    if (value === null) {
        value = Math.floor(Math.random() * (max - min + 1)) + min;
    }

    if (currentTape) tape.record(currentTape, min, max, value);
    return value;
}

/**
 * Parses a full prefixed message: strips the prefix and the "r"/"roll" token,
 * then splits the rest into args and a comment.
 * @returns {{args: string[], comment: string, commandText: string}}
 *   commandText is the bare command, e.g. "attack a s 10 # Lethal".
 *   It is what the revise modal shows and what parseCommandString consumes.
 */
function parseArguments(content) {
    const mobileFix = content.replace(/\u00A0/g, ' ');
    const contentWithoutPrefix = mobileFix.slice(PREFIX.length).trim();

    // Drop the leading "r" or "roll" token. The boundary is the first
    // whitespace OR '#': a comment glued straight to the token (?r#note)
    // ends the token without a space, and the '#' must survive into
    // commandText so parseCommandString still sees the comment.
    const boundary = contentWithoutPrefix.search(/[\s#]/);
    let commandText;
    if (boundary === -1) {
        commandText = '';
    } else if (contentWithoutPrefix[boundary] === '#') {
        commandText = contentWithoutPrefix.slice(boundary).trim();
    } else {
        commandText = contentWithoutPrefix.slice(boundary + 1).trim();
    }

    const { args, comment } = parseCommandString(commandText);
    return { args, comment, commandText };
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
 * Sends a formatted reply and deletes only the user's original command after
 * a delay. The bot's reply stays in the channel.
 *
 * Also saves a revise record keyed by the sent message id, so the Revise
 * Command button can replay the exact dice later. When the target is a
 * CaptureAdapter (a revision in progress) nothing is sent or stored: there is
 * no message id yet, and revise/index.js owns that step.
 *
 * @param {import('discord.js').Message} message
 * @param {import('discord.js').EmbedBuilder} embed
 * @param {string} comment
 */
async function sendReply(message, embed, comment) {
    try {
        if (comment) {
            const currentDescription = embed.data.description || "";
            embed.setDescription(currentDescription + comment);
        }

        const sent = await message.reply({
            embeds: [embed],
            components: [buildRollButtons()]
        });

        if (message.capturesOnly) return;

        const ctx = getRollContext();
        if (ctx.commandText) {
            store.put(sent.id, {
                commandText: ctx.commandText,
                tape: getCurrentTape() || {},
                userId: ctx.userId,
                channelId: sent.channelId,
                // The first roll seeds rootUrl; revisions carry it forward, so
                // the tenth revision still links to the very first roll.
                rootUrl: ctx.rootUrl || sent.url,
                revisionCount: ctx.revisionCount || 0,
                createdAt: Date.now()
            });
        }

        setTimeout(() => {
            message.delete().catch(() => {
                // Already gone (deleted by a moderator, say). Nothing to do.
            });
        }, REPLY_DELETE_TIMEOUT);

    } catch (err) {
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
    return { bonus: 0, note: `NG⋅${level} is currently disabled.` };
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

    // Set description and send (don't pass comment to sendReply since we already added it)
    embed.setDescription(description);
    return sendReply(message, embed);
}

/**
 * Extracts comprehensive rank information from arguments
 * Consolidates rank data extraction, lowercase/uppercase conversion, and validation
 * @param {string[]} args - Command arguments array
 * @param {number} index - Index of rank argument (default: 1)
 * @param {string} rankType - 'mastery' or 'weapon' (default: 'mastery')
 * @returns {{data: object|null, rank: string|null, rankUpper: string, isValid: boolean}} - Rank info object
 */
function extractRankInfo(args, index = 1, rankType = 'mastery') {
    const data = getRankData(args[index], rankType);

    if (!data) {
        return {
            data: null,
            rank: null,
            rankUpper: 'N/A',
            isValid: false
        };
    }

    return {
        data,
        rank: data.rank.toLowerCase(),
        rankUpper: data.rank.toUpperCase(),
        isValid: true
    };
}

/**
 * Validates that a rank meets a minimum rank requirement
 * Returns true if valid, sends error embed and returns false if invalid
 * @param {import('discord.js').Message} message - The message object
 * @param {string|null} rank - The rank to validate (lowercase, e.g., 'd', 'c')
 * @param {string} minRank - Minimum required rank (case-insensitive, e.g., 'D', 'C')
 * @param {string} actionName - Name of the action for error message
 * @param {string} comment - User's comment for error embed
 * @returns {boolean} - True if valid, false if invalid (and error sent)
 */
function validateMinimumRank(message, rank, minRank, actionName, comment) {
    const { EMBED_COLORS } = require('./commands/constants');
    const rankOrder = ['e', 'd', 'c', 'b', 'a', 's'];
    const minIndex = rankOrder.indexOf(minRank.toLowerCase());
    const rankIndex = rankOrder.indexOf(rank?.toLowerCase());

    // Invalid if rank not found or below minimum
    if (rankIndex === -1 || rankIndex < minIndex) {
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLORS.error)
            .setTitle('Invalid Rank')
            .setDescription(`**${actionName}** is not available below Mastery Rank (${minRank.toUpperCase()}).`);
        sendReply(message, embed, comment);
        return false;
    }

    return true;
}

/**
 * Parses multiple triggers from a comment string
 * Returns an object with boolean flags for each trigger
 * @param {string} comment - Comment string to parse
 * @param {Object.<string, RegExp>} triggerPatterns - Object mapping trigger names to regex patterns
 * @returns {Object.<string, boolean>} - Object with trigger flags
 *
 * @example
 * const triggers = parseTriggers(comment, {
 *     aoe: /\baoe\b/i,
 *     versatile: /\b(?:vers[-\s]*aoe|versatile)\b/i,
 *     simulcast: /\bsimulcast\b/i
 * });
 * // Access as: triggers.aoe, triggers.versatile, triggers.simulcast
 */
function parseTriggers(comment, triggerPatterns) {
    if (typeof comment !== 'string') {
        // Return all triggers as false if comment is not a string
        const results = {};
        for (const name of Object.keys(triggerPatterns)) {
            results[name] = false;
        }
        return results;
    }

    const results = {};
    for (const [name, pattern] of Object.entries(triggerPatterns)) {
        results[name] = pattern.test(comment);
    }
    return results;
}

module.exports = {
    roll,
    parseArguments,
    parseCommandString,
    parseModifiers,
    getRankData,
    checkPermissions,
    sendReply,
    getPassiveModifiers,
    getDisplayName,
    parseNGTrigger,
    finalizeAndSend,
    extractRankInfo,
    validateMinimumRank,
    parseTriggers,
    setRollContext,
    clearRollContext,
    startReplay,
    getRollContext,
    getCurrentTape
};
