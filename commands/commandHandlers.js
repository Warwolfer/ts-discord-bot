// commands/commandHandlers.js
// The command name to handler lookup, extracted from r.js so both the prefix
// router and the revise flow resolve commands the same way.

const basicHandlers = require('./handlers/basic');
const offenseHandlers = require('./handlers/offense');
const defenseHandlers = require('./handlers/defense');
const supportHandlers = require('./handlers/support');
const alterHandlers = require('./handlers/alter');
const genericHandlers = require('./handlers/generic');

const commandHandlers = {
    // Basic handlers
    'attack': basicHandlers.handleAttack,
    'atk': basicHandlers.handleAttack,
    'rush': basicHandlers.handleRush,
    'range': basicHandlers.handleRange,
    'save': basicHandlers.handleSave,
    'expertise': basicHandlers.handleExpertise,
    'mastery': basicHandlers.handleMastery,
    'surge': basicHandlers.handleSurge,
    'immortal': basicHandlers.handleImmortal,
    'twice': basicHandlers.handleTwice,

    // Offense handlers
    'stable': offenseHandlers.handleStable,
    'burst': offenseHandlers.handleBurst,
    'sneak': offenseHandlers.handleSneak,
    'critical': offenseHandlers.handleCritical,
    'sharp': offenseHandlers.handleSharp,
    'reckless': offenseHandlers.handleReckless,
    'areaeffect': offenseHandlers.handleAreaEffect,
    'duelist': offenseHandlers.handleDuelist,
    'sharpshooter': offenseHandlers.handleSharpshooter,
    'lethal': offenseHandlers.handleLethal,
    'swift': offenseHandlers.handleSwift,

    // Defense handlers
    'protect': defenseHandlers.handleProtect,
    'counter': defenseHandlers.handleCounter,
    'ultracounter': defenseHandlers.handleUltraCounter,
    'ultraprotect': defenseHandlers.handleUltraProtect,
    'torment': defenseHandlers.handleTorment,
    'cover': defenseHandlers.handleCover,
    'taunt': defenseHandlers.handleTaunt,
    'sturdy': defenseHandlers.handleSturdy,

    // Support handlers
    'heal': supportHandlers.handleHeal,
    'powerheal': supportHandlers.handlePowerHeal,
    'buff': supportHandlers.handleBuff,
    'powerbuff': supportHandlers.handlePowerBuff,
    'imbue': supportHandlers.handleImbue,
    'versatile': supportHandlers.handleVersatile,
    'revive': supportHandlers.handleRevive,
    'cleanse': supportHandlers.handleCleanse,
    'haste': supportHandlers.handleHaste,
    'inspire': supportHandlers.handleInspire,
    'smite': supportHandlers.handleSmite,
    'blessed': supportHandlers.handleBlessed,

    // Alter handlers (moved from support)
    'guardian': alterHandlers.handleGuardian,
    'aggress': alterHandlers.handleAggress,
    'savior': alterHandlers.handleSavior,
    'acrimony': alterHandlers.handleAcrimony,
    'overdrive': alterHandlers.handleOverdrive,
    'rage': alterHandlers.handleRage,
    'gift': alterHandlers.handleGift,
    'followup': alterHandlers.handleFollowUp,
    'locomote': alterHandlers.handleLocomote,

    // Alter/Passive handlers
    'defile': alterHandlers.handleDefile,
    'vitiate': alterHandlers.handleVitiate,
    'momentum': alterHandlers.handleMomentum,
    'rover': alterHandlers.handleRover,
    'acceleration': alterHandlers.handleAcceleration,
    'exceed': alterHandlers.handleExceed,
    'engage': alterHandlers.handleEngage,
    'empower': alterHandlers.handleEmpower,
    'mark': alterHandlers.handleMark,
    'hyperinsight': alterHandlers.handleHyperInsight,
    'hyperinstinct': alterHandlers.handleHyperInstinct,
    'regenerate': alterHandlers.handleRegenerate,
    'infuse': alterHandlers.handleInfuse,
    'adapt': alterHandlers.handleAdapt,
    'evolve': alterHandlers.handleEvolve,
    'coordinate': alterHandlers.handleCoordinate,
    'assist': alterHandlers.handleAssist,
    'charge': alterHandlers.handleCharge,
    'profane': alterHandlers.handleProfane,
    'regalia': alterHandlers.handleRegalia,
    'anatomy': alterHandlers.handleAnatomy,
    'bestowed': alterHandlers.handleBestowed,
    'combatfocus': alterHandlers.handleCombatFocus,
    'utilityfocus': alterHandlers.handleUtilityFocus,
    'defensefocus': alterHandlers.handleDefenseFocus,
    'speedfocus': alterHandlers.handleSpeedFocus,

    // Generic handlers
    'version': genericHandlers.handleVersion
};


/**
 * Resolves a command name to a handler.
 * Falls back to the generic XdY roller, matching the prefix router.
 * @returns {Function|null}
 */
function resolveHandler(commandName) {
    const name = String(commandName || '').toLowerCase();
    if (commandHandlers[name]) return commandHandlers[name];
    if (name.includes('d')) return genericHandlers.handleGenericRoll;
    return null;
}

module.exports = { commandHandlers, resolveHandler };
