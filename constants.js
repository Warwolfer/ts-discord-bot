// constants.js
// Central location for all configuration and game rule constants

require('dotenv').config();

// --- Configuration ---
// Load these from your .env file for security and ease of management.
const PREFIX = process.env.PREFIX || '?';
const STAFF_CATEGORY_ID = process.env.STAFF_CATEGORY_ID;
const BOT_CATEGORY_ID = process.env.BOT_CATEGORY_ID;
const STORY_CATEGORY_ID = process.env.STORY_CATEGORY_ID;
const TEST_CHANNEL_ID = process.env.TEST_CHANNEL_ID;
const REPLY_DELETE_TIMEOUT = 5000; // 5 seconds

// --- Game Rule Constants ---
// Central location for all rank-based stats. Makes updating rules easy.
const RANK_DATA = {
    'e': { value: 0, counterCheck: 40, counterDMG: 30, burstMod: 0, critRange: 80, bonus102030: 0, bonus152025: 0, bonus51015: 0, bonus101520: 0, bonus203040: 0, bonus51525: 0, bonus204060: 0, bonus123: 0, surgeHaste: 0, surgeInspire: 0, swHP: 10 },
    'd': { value: 10, counterCheck: 35, counterDMG: 30, burstMod: 1, critRange: 80, bonus102030: 10, bonus152025: 15, bonus51015: 5, bonus101520: 10, bonus203040: 20, bonus51525: 5, bonus204060: 20, bonus123: 1, surgeHaste: 2, surgeInspire: 6, swHP: 20 },
    'c': { value: 15, counterCheck: 30, counterDMG: 40, burstMod: 2, critRange: 80, bonus102030: 10, bonus152025: 15, bonus51015: 5, bonus101520: 10, bonus203040: 20, bonus51525: 5, bonus204060: 20, bonus123: 1, surgeHaste: 4, surgeInspire: 12, swHP: 30 },
    'b': { value: 25, counterCheck: 30, counterDMG: 40, burstMod: 3, critRange: 80, bonus102030: 20, bonus152025: 20, bonus51015: 10, bonus101520: 15, bonus203040: 30, bonus51525: 15, bonus204060: 40, bonus123: 2, surgeHaste: 6, surgeInspire: 18, swHP: 40 },
    'a': { value: 30, counterCheck: 25, counterDMG: 50, burstMod: 4, critRange: 80, bonus102030: 20, bonus152025: 20, bonus51015: 10, bonus101520: 15, bonus203040: 30, bonus51525: 15, bonus204060: 40, bonus123: 2, surgeHaste: 8, surgeInspire: 24, swHP: 50 },
    's': { value: 40, counterCheck: 20, counterDMG: 50,  burstMod: 5, critRange: 80, bonus102030: 30, bonus152025: 25, bonus51015: 15, bonus101520: 20, bonus203040: 40, bonus51525: 25, bonus204060: 60, bonus123: 3, surgeHaste: 10, surgeInspire: 30, swHP: 60 },
};

const WEAPON_RANK_DATA = {
    'e': { value: 0, burstMod: 0 },
    'd': { value: 10, burstMod: 1 },
    'c': { value: 15, burstMod: 2 },
    'b': { value: 25, burstMod: 3 },
    'a': { value: 30, burstMod: 4 },
    's': { value: 40, burstMod: 5 },
};

// --- Action Type Lookup Arrays ---
// Used to determine which actions can benefit from specific tags/abilities

// Attack actions that can use Lethal + Combat Focus tags
const attackActions = [
    'attack', 'rush', 'burst', 'sneak', 'critical', 'sharp', 'reckless',
    'smite', 'torment', 'areaeffect', 'duelist', 'sharpshooter', 'range',
    'counter', 'ultracounter', 'cover', 'taunt', 'stable', 'ultraprotect'
];

// Support actions that can use Blessed + Combat Focus tags
const supportActions = [
    'heal', 'powerheal', 'buff', 'powerbuff', 'imbue', 'versatile',
    'revive', 'cleanse', 'haste', 'inspire', 'guardian', 'aggress',
    'acrimony', 'savior'
];

// --- Exports ---
module.exports = {
    PREFIX,
    STAFF_CATEGORY_ID,
    BOT_CATEGORY_ID,
    STORY_CATEGORY_ID,
    TEST_CHANNEL_ID,
    REPLY_DELETE_TIMEOUT,
    RANK_DATA,
    WEAPON_RANK_DATA,
    attackActions,
    supportActions
};
