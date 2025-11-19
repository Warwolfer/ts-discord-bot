// r.js (Refactored for Discord.js v14) - Main Coordinator
const { EmbedBuilder } = require('discord.js');
const { checkPermissions, parseArguments, sendReply } = require('./helpers');
const { PREFIX } = require('./constants');

// Import all handler modules
const offenseHandlers = require('./handlers/offense');
const defenseHandlers = require('./handlers/defense');
const supportHandlers = require('./handlers/support');
const alterHandlers = require('./handlers/alter');
const genericHandlers = require('./handlers/generic');

// Build command handlers lookup table
const commandHandlers = {
    // Offense handlers
    'attack': offenseHandlers.handleAttack,
    'atk': offenseHandlers.handleAttack,
    'rush': offenseHandlers.handleRush,
    'torment': offenseHandlers.handleTorment,
    'burst': offenseHandlers.handleBurst,
    'sneak': offenseHandlers.handleSneak,
    'critical': offenseHandlers.handleCritical,
    'sharp': offenseHandlers.handleSharp,
    'reckless': offenseHandlers.handleReckless,
    'areaeffect': offenseHandlers.handleAreaEffect,
    'duelist': offenseHandlers.handleDuelist,
    'sharpshooter': offenseHandlers.handleSharpshooter,
    'range': offenseHandlers.handleRange,
    'smite': offenseHandlers.handleSmite,
    'counter': offenseHandlers.handleCounter,
    'ultracounter': offenseHandlers.handleUltraCounter,
    'cover': offenseHandlers.handleCover,
    'taunt': offenseHandlers.handleTaunt,
    'stable': offenseHandlers.handleStable,
    'ultraprotect': offenseHandlers.handleUltraProtect,

    // Defense handlers
    'protect': defenseHandlers.handleProtect,

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
    'guardian': supportHandlers.handleGuardian,
    'aggress': supportHandlers.handleAggress,
    'savior': supportHandlers.handleSavior,
    'acrimony': supportHandlers.handleAcrimony,
    'overdrive': supportHandlers.handleOverdrive,
    'rage': supportHandlers.handleRage,
    'gift': supportHandlers.handleGift,
    'followup': supportHandlers.handleFollowUp,
    'locomote': supportHandlers.handleLocomote,

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
    'lethal': alterHandlers.handleLethal,
    'swift': alterHandlers.handleSwift,
    'sturdy': alterHandlers.handleSturdy,
    'blessed': alterHandlers.handleBlessed,
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
