// Discord refuses an embed description over 4096 characters, and the refusal
// arrives as a thrown error from message.reply — after the dice have been
// rolled. helpers.clampDescription is the guard that keeps the reply sendable.

const test = require("node:test");
const assert = require("node:assert");

const { clampDescription } = require("./embedLimits");

const LIMIT = 4096;

// The smallest stand-in for an EmbedBuilder that clampDescription touches.
function fakeEmbed(description) {
    return {
        data: { description: description },
        setDescription(next) { this.data.description = next; return this; },
    };
}

test("a description under the limit is left exactly as it was", () => {
    const text = "x".repeat(LIMIT - 1);
    const embed = fakeEmbed(text);
    clampDescription(embed);
    assert.strictEqual(embed.data.description, text);
});

test("a description exactly at the limit is left alone", () => {
    const text = "x".repeat(LIMIT);
    const embed = fakeEmbed(text);
    clampDescription(embed);
    assert.strictEqual(embed.data.description, text);
});

test("one character over the limit is trimmed to fit", () => {
    const embed = fakeEmbed("x".repeat(LIMIT + 1));
    clampDescription(embed);
    assert.ok(embed.data.description.length <= LIMIT,
        "the result must be sendable, got " + embed.data.description.length);
    assert.ok(embed.data.description.endsWith("(trimmed to fit)"),
        "the trim has to be visible, or the player cannot tell something was cut");
});

test("a wildly oversized description still comes back sendable", () => {
    const embed = fakeEmbed("y".repeat(50000));
    clampDescription(embed);
    assert.ok(embed.data.description.length <= LIMIT);
});

test("the dice are kept and the comment is what gets cut", () => {
    // The dice lines come first and the player's comment is appended last, so
    // trimming from the end is what keeps the useful half.
    const dice = "Base damage: `3d20 (1 + 1 + 1)` = **3**\n";
    const embed = fakeEmbed(dice + "c".repeat(LIMIT));
    clampDescription(embed);
    assert.ok(embed.data.description.startsWith(dice),
        "the roll itself must survive the trim");
});

test("a missing description does not throw", () => {
    const embed = fakeEmbed(undefined);
    assert.doesNotThrow(() => clampDescription(embed));
});
