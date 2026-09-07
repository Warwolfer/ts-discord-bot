// revise/captureAdapter.js
// A message-shaped object that collects the reply payload instead of sending
// it. A revision runs the handler against this first, so a check that fails
// partway through leaves nothing in the channel.
// No imports: this file must stay loadable without node_modules.

class CaptureAdapter {
    constructor({ author, member, channel }) {
        this.author = author;
        this.member = member;
        this.channel = channel;

        // sendReply checks this flag and skips both the send and the store.
        this.capturesOnly = true;
        this.captured = null;
    }

    async reply(payload) {
        this.captured = payload;
        return payload;
    }

    // Nothing was sent, so there is nothing to clean up.
    async delete() { /* no-op */ }
}

module.exports = { CaptureAdapter };
