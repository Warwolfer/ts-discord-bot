// revise/index.js
// Discord glue for the Revise Command button and its modal.

const {
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
    EmbedBuilder,
    resolveColor
} = require('discord.js');

const store = require('./store');
const tape = require('./tape');
const { CaptureAdapter } = require('./captureAdapter');
const { parseCommandString } = require('../commands/parseCommand');
const { resolveHandler } = require('../commands/commandHandlers');
const {
    setRollContext,
    clearRollContext,
    startReplay,
    getCurrentTape,
    checkPermissions
} = require('../helpers');
const { EMBED_COLORS } = require('../commands/constants');

const MODAL_PREFIX = 'revise_modal:';
const MAX_INPUT_LENGTH = 4000;   // Discord's text input value limit

// Only the "fewer dice" direction is refused now, so the message says so.
// It also fires on an ordinary-looking edit: once any revision in a chain adds
// dice, the ORIGINAL message's button still prefills the original command,
// which uses fewer dice than the chain now holds. Nothing about that command
// changed, so the message has to explain the chain rather than blame the edit.
const DICE_MISMATCH =
    'This uses fewer dice than the roll now has, and dropping a die that is already on screen is not allowed. ' +
    'If this chain has had dice added, revise the most recent version instead. Otherwise make a fresh roll.';

// EMBED_COLORS.error is the string 'Red'. A built embed stores the resolved
// number, so compare numbers. 15548997 is discord.js's 'Red'; the offense red
// #d84848 resolves to 14173768, so there is no false match. The fallback covers
// discord.js builds that do not re-export resolveColor at the top level.
const ERROR_COLOR = typeof resolveColor === 'function'
    ? resolveColor(EMBED_COLORS.error)
    : 15548997;

/** Replies with a note only the clicker can see. */
function ephemeral(interaction, content) {
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

/**
 * Normalizes args[1] to an advantage mode. Revisions may not change it: the
 * dice count stays the same, so no other refusal fires, but the player would
 * be picking the better of two numbers already on screen.
 */
function advantageMode(args) {
    const arg = String(args[1] ?? '').toLowerCase();
    if (arg === 'adv' || arg === 'advantage') return 'adv';
    if (arg === 'dis' || arg === 'disadvantage') return 'dis';
    return 'none';
}

/**
 * The non-numeric arguments, lowercased. On a roll that already recorded dice
 * these are locked: a rank or flag change replays the SAME dice but moves the
 * success threshold, multiplier tier, or which die is kept, letting a player
 * improve a result they have already read off the screen. Numeric modifiers
 * stay editable, which is what this feature is actually for.
 */
function lockedArgs(args) {
    return args
        .filter(a => !/^[+-]?\d+$/.test(a))
        .map(a => a.toLowerCase());
}

/** The declared DC, if the comment names one. Locked on a dice-bearing seed. */
function declaredDC(commentString) {
    const m = String(commentString ?? '').match(/\bDC\s*\(\s*(\d+)\s*\)/i);
    return m ? m[1] : null;
}

/** Handles a click on the Revise Command button. */
async function onButton(interaction) {
    const record = store.get(interaction.message.id);

    if (!record) {
        return ephemeral(interaction, 'This roll can no longer be revised.');
    }
    if (record.userId !== interaction.user.id) {
        return ephemeral(interaction, 'This is not your roll.');
    }
    // Clicking a component needs no SEND_MESSAGES, and the roll's channel may
    // have been locked, renamed, or moved out of the story category since the
    // roll. Re-check the same gate `?r` uses so Revise cannot outlive it.
    if (!checkPermissions(interaction)) {
        return ephemeral(interaction, 'Rolls cannot be revised in this channel.');
    }

    // Short, not Paragraph: a command is one line, parseCommandString splits on
    // a literal space, and a stray newline would surface as "Invalid Rank" with
    // no hint why. Short also makes Enter submit, which is what users expect.
    const input = new TextInputBuilder()
        .setCustomId('command')
        .setLabel('Command')
        .setStyle(TextInputStyle.Short)
        .setValue(record.commandText.slice(0, MAX_INPUT_LENGTH))
        .setRequired(true);

    const modal = new ModalBuilder()
        .setCustomId(`${MODAL_PREFIX}${interaction.message.id}`)
        .setTitle('Revise Command')
        .addComponents(new ActionRowBuilder().addComponents(input));

    return interaction.showModal(modal);
}

/** True when the handler produced one of the standard error embeds. */
function isErrorEmbed(embed) {
    return embed.data.color === ERROR_COLOR;
}

/** Handles submission of the revise modal. */
async function onModalSubmit(interaction) {
    const messageId = interaction.customId.slice(MODAL_PREFIX.length);
    const record = store.get(messageId);

    if (!record) {
        return ephemeral(interaction, 'This roll can no longer be revised.');
    }
    if (record.userId !== interaction.user.id) {
        return ephemeral(interaction, 'This is not your roll.');
    }
    // Same gate as onButton: the modal can be submitted a while after the
    // click, and a component click never required SEND_MESSAGES in the first
    // place. See the note there.
    if (!checkPermissions(interaction)) {
        return ephemeral(interaction, 'Rolls cannot be revised in this channel.');
    }

    const newText = interaction.fields.getTextInputValue('command');
    const { args, comment } = parseCommandString(newText);
    const { args: oldArgs, comment: oldComment } = parseCommandString(record.commandText);

    if (args.length === 0) {
        return ephemeral(interaction, 'The command cannot be empty.');
    }

    // The dice belong to the whole revision chain. Reading them from the chain
    // rather than from this record is what stops a sibling — a record made by
    // an earlier modifier-only revision, still holding the shorter tape — from
    // rolling its own version of a die another sibling already published.
    const rootId = record.rootId || messageId;
    const chainTape = store.getTape(rootId);

    // A record without a chain tape is a chain we no longer know about. Treat
    // it as expired rather than as "rolled no dice", or it would hand out
    // fresh dice for a roll whose originals are still on screen.
    if (chainTape === null) {
        return ephemeral(interaction, 'This roll can no longer be revised.');
    }

    // An original that rolled nothing has no result to protect, so fresh dice
    // are allowed. That makes Revise the natural fix for a typed rank.
    const originalHadDice = !tape.isEmpty(chainTape);

    const oldName = (oldArgs[0] || '').toLowerCase();
    const newName = args[0].toLowerCase();
    if (newName !== oldName) {
        return ephemeral(
            interaction,
            `The action must stay the same (\`${oldName}\`). Make a fresh roll instead.`
        );
    }

    if (advantageMode(args) !== advantageMode(oldArgs)) {
        return ephemeral(
            interaction,
            'Advantage/disadvantage must stay the same. Make a fresh roll instead.'
        );
    }

    // Only applies when the seed had dice. A validation-error seed rolled
    // nothing, so there is no visible result to protect, and correcting a
    // typo'd rank there is the feature's whole point.
    if (originalHadDice &&
        JSON.stringify(lockedArgs(args)) !== JSON.stringify(lockedArgs(oldArgs))) {
        return ephemeral(
            interaction,
            'Only numeric modifiers and the comment can change on a roll that already rolled dice. ' +
            'Ranks and flags are locked. Make a fresh roll instead.'
        );
    }

    // The save/expertise/mastery DC is read out of the comment, and the comment
    // has to stay editable for tags and flavour, so lock just this one token.
    if (originalHadDice && declaredDC(comment) !== declaredDC(oldComment)) {
        return ephemeral(
            interaction,
            'The DC cannot change on a roll that already rolled dice. Make a fresh roll instead.'
        );
    }

    const handler = resolveHandler(newName);
    if (!handler) {
        return ephemeral(interaction, `Unknown action \`${newName}\`.`);
    }

    const adapter = new CaptureAdapter({
        author: interaction.user,
        member: interaction.member,
        channel: interaction.channel
    });

    const nextCount = record.revisionCount + 1;

    let cursor = null;
    let producedTape = null;
    try {
        // setRollContext clears the replay cursor, so it must come first.
        setRollContext({
            comment,
            userId: record.userId,
            commandText: newText,
            rootUrl: record.rootUrl,
            revisionCount: nextCount
        });
        // Always replay, even from an empty tape: take() returns null when a
        // die was never recorded, and roll() then rolls it fresh. That folds
        // the old empty-seed special case into the ordinary path.
        cursor = startReplay(chainTape);

        await handler(adapter, args, comment);

        // Capture before the finally clears it. When the seed had no dice this
        // revision rolled fresh ones, and they must be locked in for the NEXT
        // revision, or the chain becomes an unlimited reroll.
        producedTape = getCurrentTape();
    } catch (err) {
        console.error('[revise] Handler threw during replay:', err);
        return ephemeral(interaction, 'Something went wrong while revising this roll.');
    } finally {
        clearRollContext();
    }

    const payload = adapter.captured;
    if (!payload || !payload.embeds || !payload.embeds[0]) {
        return ephemeral(interaction, 'Something went wrong while revising this roll.');
    }

    const embed = EmbedBuilder.from(payload.embeds[0]);

    // Check for a validation-error embed BEFORE the dice-count check. A
    // handler that produced an error embed did no legitimate roll, so there
    // is no dice result to protect either way, and nothing is posted to the
    // channel under either order. But the error embed carries the actual
    // reason (e.g. "Invalid Rank"), which is more useful than the generic
    // dice-mismatch message, so it must win when both would otherwise fire.
    // Do not reorder this back below the leftovers check.
    if (isErrorEmbed(embed)) {
        return ephemeral(interaction, embed.data.description || 'That revision is not valid.');
    }

    // Removing dice is refused: those dice are already on screen, and dropping
    // one is how you would discard a bad result. Adding dice is allowed — it is
    // cleaner than rolling a separate 1d100 by hand — and the added dice are
    // recorded below, so a later revision replays them instead of rerolling.
    if (cursor.hasLeftovers()) {
        return ephemeral(interaction, DICE_MISMATCH);
    }

    const diceAdded = tape.countDice(producedTape) - tape.countDice(chainTape);

    const suffix = nextCount === 1 ? '(revised)' : `(revised ${nextCount}x)`;
    embed.setTitle(`${embed.data.title ?? ''} ${suffix}`.trim());
    // Say so when the revision rolled dice the original never had. The player
    // chose to add them after seeing the base result, so it has to be visible
    // to anyone reading the thread.
    const addedNote = diceAdded > 0 ? `\nRevision added ${diceAdded} more dice` : '';
    embed.setDescription(
        `${embed.data.description ?? ''}\n${addedNote}\nRevised from [original roll](${record.rootUrl})`
    );

    // Close the modal quietly, then post the revision as a new message.
    await interaction.deferUpdate();

    let sent;
    try {
        sent = await interaction.channel.send({
            embeds: [embed],
            components: payload.components
        });
    } catch (err) {
        // deferUpdate already acknowledged the interaction, so the wrapper in
        // index.js cannot reply for us (its guard is !replied && !deferred).
        // followUp is valid after a defer. Also covers an uncached
        // interaction.channel, where the send itself is a TypeError.
        console.error('[revise] Failed to post the revision:', err);
        return interaction.followUp({
            content: 'Could not post the revised roll here. The channel may be locked or gone.',
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }

    // producedTape is exactly the dice this run used: the replayed ones plus
    // any the revision added. It goes to the CHAIN, in one place, so every
    // record in the chain sees the grown tape at once. There is no second copy
    // to fork from, which is the whole point of keying tapes by root id.
    // putTape keeps the chain's original createdAt, so growing it does not buy
    // another full TTL.
    store.putTape(rootId, producedTape || {});

    store.put(sent.id, {
        commandText: newText,
        rootId,
        userId: record.userId,
        channelId: sent.channelId,
        rootUrl: record.rootUrl,
        revisionCount: nextCount,
        createdAt: Date.now()
    });
}

module.exports = { onButton, onModalSubmit, MODAL_PREFIX };
