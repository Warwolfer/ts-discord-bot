// adapters/interactionAdapter.js
// Wraps a ChatInputCommandInteraction so it can be passed to handlers
// that expect a discord.js Message. Only the surface actually read by
// handlers and helpers is exposed.

class InteractionAdapter {
    constructor(interaction) {
        this.author = interaction.user;
        this.member = interaction.member;
        this.channel = interaction.channel;
        this._interaction = interaction;
    }

    async reply(payload) {
        return this._interaction.reply(payload);
    }

    // No user message to delete for slash invocations.
    async delete() { /* no-op */ }
}

module.exports = { InteractionAdapter };
