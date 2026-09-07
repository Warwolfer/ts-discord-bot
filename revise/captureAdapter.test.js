const test = require('node:test');
const assert = require('node:assert');
const { CaptureAdapter } = require('./captureAdapter');

const fakeAuthor = { id: 'u1', username: 'kenny', displayAvatarURL: () => 'http://x/a.png' };
const fakeMember = { displayName: 'Kenny' };
const fakeChannel = { send: () => { throw new Error('must not send'); } };

test('exposes the message surface handlers read', () => {
    const adapter = new CaptureAdapter({ author: fakeAuthor, member: fakeMember, channel: fakeChannel });
    assert.strictEqual(adapter.author.id, 'u1');
    assert.strictEqual(adapter.author.username, 'kenny');
    assert.strictEqual(typeof adapter.author.displayAvatarURL, 'function');
    assert.strictEqual(adapter.member.displayName, 'Kenny');
    assert.strictEqual(adapter.channel, fakeChannel);
});

test('is flagged so sendReply knows not to send or store', () => {
    const adapter = new CaptureAdapter({ author: fakeAuthor, member: fakeMember, channel: fakeChannel });
    assert.strictEqual(adapter.capturesOnly, true);
});

test('reply stores the payload instead of sending it', async () => {
    const adapter = new CaptureAdapter({ author: fakeAuthor, member: fakeMember, channel: fakeChannel });
    assert.strictEqual(adapter.captured, null);

    const payload = { embeds: ['e'], components: ['c'] };
    const returned = await adapter.reply(payload);

    assert.deepStrictEqual(adapter.captured, payload);
    assert.deepStrictEqual(returned, payload);
});

test('the last reply wins when a handler replies twice', async () => {
    const adapter = new CaptureAdapter({ author: fakeAuthor, member: fakeMember, channel: fakeChannel });
    await adapter.reply({ embeds: ['first'] });
    await adapter.reply({ embeds: ['second'] });
    assert.deepStrictEqual(adapter.captured, { embeds: ['second'] });
});

test('delete is a harmless no-op', async () => {
    const adapter = new CaptureAdapter({ author: fakeAuthor, member: fakeMember, channel: fakeChannel });
    await adapter.delete();
});
