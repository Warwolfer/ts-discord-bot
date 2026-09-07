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
const { setRollContext, clearRollContext, startReplay } = require('../helpers');
const { EMBED_COLORS } = require('../commands/constants');

const MODAL_PREFIX = 'revise_modal:';
const MAX_INPUT_LENGTH = 4000;   // Discord's paragraph text input limit

const DICE_MISMATCH =
    'This change needs a different number of dice than the original roll. Make a fresh roll instead.';

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

/** Handles a click on the Revise Command button. */
async function onButton(interaction) {
    const record = store.get(interaction.message.id);

    if (!record) {
        return ephemeral(interaction, 'This roll can no longer be revised.');
    }
    if (record.userId !== interaction.user.id) {
        return ephemeral(interaction, 'This is not your roll.');
    }

    const input = new TextInputBuilder()
        .setCustomId('command')
        .setLabel('Command')
        .setStyle(TextInputStyle.Paragraph)
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

    const newText = interaction.fields.getTextInputValue('command');
    const { args, comment } = parseCommandString(newText);
    const oldArgs = parseCommandString(record.commandText).args;

    if (args.length === 0) {
        return ephemeral(interaction, 'The command cannot be empty.');
    }

    const oldName = (oldArgs[0] || '').toLowerCase();
    const newName = args[0].toLowerCase();
    if (newName !== oldName) {
        return ephemeral(
            interaction,
            `The action must stay the same (\`${oldName}\`). Make a fresh roll instead.`
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

    // An original that rolled nothing has no result to protect, so fresh dice
    // are allowed. That makes Revise the natural fix for a typed rank.
    const originalHadDice = !tape.isEmpty(record.tape);
    const nextCount = record.revisionCount + 1;

    let cursor = null;
    try {
        // setRollContext clears the replay cursor, so it must come first.
        setRollContext({
            comment,
            userId: record.userId,
            commandText: newText,
            rootUrl: record.rootUrl,
            revisionCount: nextCount
        });
        if (originalHadDice) cursor = startReplay(record.tape);

        await handler(adapter, args, comment);
    } catch (err) {
        if (err instanceof tape.NeedsFreshDice) {
            return ephemeral(interaction, DICE_MISMATCH);
        }
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

    // Fewer dice than recorded is refused too: the count must match exactly.
    if (cursor && cursor.hasLeftovers()) {
        return ephemeral(interaction, DICE_MISMATCH);
    }

    const suffix = nextCount === 1 ? '(revised)' : `(revised ${nextCount}x)`;
    embed.setTitle(`${embed.data.title ?? ''} ${suffix}`.trim());
    embed.setDescription(
        `${embed.data.description ?? ''}\n\nRevised from [original roll](${record.rootUrl})`
    );

    // Close the modal quietly, then post the revision as a new message.
    await interaction.deferUpdate();
    const sent = await interaction.channel.send({
        embeds: [embed],
        components: payload.components
    });

    store.put(sent.id, {
        commandText: newText,
        // The ORIGINAL tape carries forward, so the dice never drift no matter
        // how many times a roll is revised.
        tape: record.tape,
        userId: record.userId,
        channelId: sent.channelId,
        rootUrl: record.rootUrl,
        revisionCount: nextCount,
        createdAt: Date.now()
    });
}

module.exports = { onButton, onModalSubmit, MODAL_PREFIX };
