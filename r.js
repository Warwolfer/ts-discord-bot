// r.js (Refactored for Discord.js v14) - Main Coordinator
const { EmbedBuilder } = require('discord.js');
const { checkPermissions, parseArguments, sendReply } = require('./helpers');
const { PREFIX } = require('./constants');

// Import all handler modules
const basicHandlers = require('./handlers/basic');
const offenseHandlers = require('./handlers/offense');
const defenseHandlers = require('./handlers/defense');
const supportHandlers = require('./handlers/support');
const alterHandlers = require('./handlers/alter');
const genericHandlers = require('./handlers/generic');

// Build command handlers lookup table
const commandHandlers = {
    // Basic handlers
    'attack': basicHandlers.handleAttack,
    'atk': basicHandlers.handleAttack,
    'rush': basicHandlers.handleRush,
    'range': basicHandlers.handleRange,

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
    'aid': alterHandlers.handleAid,
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

// Main export
module.exports = {
    name: 'r',
    aliases: ['roll'],
    description: 'Roll dice for Sphera RPG.',
    async execute(message) {
        if (!checkPermissions(message)) return;

        const { args, comment } = parseArguments(message.content);

        if (args.length === 0) {
            const helpEmbed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setTitle('Sphera Roll Commands')
                .addFields(
                    { name: 'Basic Action', value: `\`${PREFIX}r attack MR WR [mods] # comment\`` },
                    { name: 'Generic Roll', value: `\`${PREFIX}r XdY [mods] # comment\`` }
                );
            return sendReply(message, helpEmbed, '');
        }

        const commandName = args[0].toLowerCase();
        const handler = commandHandlers[commandName];

        if (handler) {
            try {
                await handler(message, args, comment);
            } catch (error) {
                console.error(`Error executing ${commandName}:`, error);
                const errorEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setTitle('Error')
                    .setDescription('An error occurred while executing this command.');
                sendReply(message, errorEmbed, comment);
            }
        } else if (commandName.includes('d')) {
            await genericHandlers.handleGenericRoll(message, args, comment);
        } else {
            const unknownEmbed = new EmbedBuilder()
                .setColor('Red')
                .setTitle('Unknown Command')
                .setDescription(`The command \`${commandName}\` was not found. Use \`${PREFIX}r\` for help.`);
            sendReply(message, unknownEmbed, comment);
        }
    }
};
