// commands/slash/collect.js
// /collect character:<name> thread:<code> — every roll this bot posted for
// that character in that thread, in this channel, as one block of forum
// BBCode, delivered by DM.
//
// The index (revise/rollIndex.js) answers instantly when it has the rolls. It
// only knows about rolls made since the bot last started, so a miss falls back
// to reading the channel, and what that finds is written to the index so the
// next call is instant again.
const { SlashCommandBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const { InteractionAdapter } = require('../../adapters/interactionAdapter');
const { checkPermissions } = require('../../helpers');
const rollIndex = require('../../revise/rollIndex');
const { toBBCode } = require('../../revise/bbcode');
const core = require('../collectCore');

const SCAN_PAGES = 3;         // 3 x 100 = the last 300 messages
const SCAN_PAGE_SIZE = 100;

/** Reads the channel backwards and returns the bot's matching roll messages. */
async function scanChannel(channel, botId, character, thread) {
    const hits = [];
    let before;
    for (let page = 0; page < SCAN_PAGES; page++) {
        let batch;
        try {
            batch = await channel.messages.fetch({ limit: SCAN_PAGE_SIZE, before: before });
        } catch (err) {
            console.error('[collect] channel scan failed:', err.message);
            break;
        }
        if (!batch || batch.size === 0) break;

        for (const message of batch.values()) {
            if (message.author?.id !== botId) continue;
            if (message.embeds?.length !== 1) continue;
            const comment = core.commentFromDescription(message.embeds[0].description);
            if (!comment) continue;
            const tags = core.tagsFromComment(comment);
            if (core.entryMatches({ channelId: message.channelId, tags: tags },
                                  message.channelId, character, thread)) {
                hits.push(message);
            }
        }

        // batch is already sorted newest-first; lastKey() is the oldest id in
        // this page, so the next fetch continues strictly further back. Not
        // advancing this would re-fetch the same page forever.
        before = batch.lastKey();
        if (batch.size < SCAN_PAGE_SIZE) break;   // a partial page is the end of the channel
    }
    return hits;
}

/**
 * Builds the delivery payloads once, so the DM attempt and the ephemeral
 * fallback (when DMs are closed) send identical content. Past MAX_CHUNKS
 * chunks that would be too many separate DMs, so it becomes one file
 * instead — in either destination.
 * @returns {Array<{content?: string, files?: import('discord.js').AttachmentBuilder[]}>}
 */
function buildPayloads(chunks, fileName, whole) {
    if (chunks.length > core.MAX_CHUNKS) {
        const file = new AttachmentBuilder(Buffer.from(whole, 'utf8'), { name: fileName });
        return [{ files: [file] }];
    }
    return chunks.map(function (chunk) {
        return { content: '```\n' + chunk + '\n```' };
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('collect')
        .setDescription('DM every roll for one character in one thread, as forum BBCode')
        .addStringOption(o => o.setName('character')
            .setDescription('The character name exactly as it appears in your roll comments')
            .setRequired(true))
        .addStringOption(o => o.setName('thread')
            .setDescription('The thread code, including a cycle suffix if you used one (e.g. 2768C1)')
            .setRequired(true)),

    async execute(interaction) {
        const adapter = new InteractionAdapter(interaction);
        if (!checkPermissions(adapter)) {
            return interaction.reply({
                content: 'This command is not allowed in this channel.',
                flags: MessageFlags.Ephemeral
            });
        }

        // The channel scan below can take several seconds, and Discord drops
        // an interaction that has not been answered within three.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const character = interaction.options.getString('character').trim();
        const thread = interaction.options.getString('thread').trim();
        const channel = interaction.channel;
        const botId = interaction.client.user.id;

        try {
            // 1. The index first.
            const indexed = (await rollIndex.read()).filter(function (entry) {
                return core.entryMatches(entry, channel.id, character, thread);
            });

            let messages = [];
            let missing = 0;

            if (indexed.length) {
                indexed.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
                for (const entry of indexed) {
                    let message;
                    try {
                        message = await channel.messages.fetch(entry.messageId);
                    } catch (err) {
                        missing += 1;   // deleted, or no longer visible
                        continue;
                    }
                    // The index is only ever written from this bot's own
                    // sends (see helpers.js sendReply), but a fetch-by-id
                    // must not simply trust that blindly. toBBCode below
                    // assumes every embed it renders came off a message this
                    // bot posted — it only neutralises text that already
                    // went through customRoll.describe()'s escapeMarkdown —
                    // so re-check the author here rather than relying on the
                    // index being honest.
                    if (message.author?.id !== botId || message.embeds?.length !== 1) {
                        continue;
                    }
                    messages.push(message);
                }
            } else {
                // 2. Nothing indexed — read the channel. The scan returns the
                // message objects themselves, so they are not fetched again.
                const found = await scanChannel(channel, botId, character, thread);
                found.sort(function (a, b) { return a.createdTimestamp - b.createdTimestamp; });
                messages = found;
                // Write them back so the next call skips the scan.
                for (const message of found) {
                    rollIndex.append({
                        messageId: message.id,
                        channelId: message.channelId,
                        guildId: message.guildId || null,
                        userId: message.interaction?.user?.id || null,
                        tags: core.tagsFromComment(core.commentFromDescription(message.embeds[0].description)),
                        createdAt: message.createdTimestamp
                    });
                }
            }

            if (!messages.length) {
                return interaction.editReply({ content: core.noHitsMessage(character, thread) });
            }

            // Every message here is confirmed bot-authored, with exactly one
            // embed (scanChannel filters this on the way in; the index path
            // re-checks it above) — that is the invariant toBBCode relies on.
            const blocks = messages.map(function (message) {
                return toBBCode(message.embeds[0], message.url);
            });
            const whole = blocks.join('\n\n');
            const chunks = core.chunkBlocks(blocks, core.MAX_CHUNK);
            const tail = missing ? ` ${missing} could not be fetched.` : '';
            const payloads = buildPayloads(chunks, core.attachmentName(character, thread), whole);

            try {
                for (const payload of payloads) {
                    await interaction.user.send(payload);
                }
                return interaction.editReply({
                    content: `Sent ${messages.length} rolls to your DMs.${tail}`
                });
            } catch (err) {
                // DMs closed. Same payloads, delivered here instead.
                console.error('[collect] DM failed:', err.message);
                await interaction.editReply({
                    content: `I could not DM you, so here they are instead.${tail}`
                });
                for (const payload of payloads) {
                    await interaction.followUp(Object.assign({ flags: MessageFlags.Ephemeral }, payload));
                }
                return;
            }
        } catch (err) {
            console.error('[collect] failed:', err);
            return interaction.editReply({
                content: 'Something went wrong collecting those rolls.'
            }).catch(function () {});
        }
    }
};
