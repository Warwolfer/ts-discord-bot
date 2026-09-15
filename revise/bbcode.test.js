"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { toBBCode } = require("./bbcode");

test("the title becomes bold", () => {
    assert.match(toBBCode({ title: "Fortitude Save" }), /^\[b\]Fortitude Save\[\/b\]/);
});

test("inline code becomes icode", () => {
    assert.match(toBBCode({ description: "rolled `42`" }), /\[icode\]42\[\/icode\]/);
});

test("bold becomes b, italic becomes i", () => {
    const out = toBBCode({ description: "**Total** and *aside*" });
    assert.match(out, /\[b\]Total\[\/b\]/);
    assert.match(out, /\[i\]aside\[\/i\]/);
});

test("a blockquote line becomes a quote block", () => {
    assert.match(toBBCode({ description: "x\n> *Lune · 2768*" }), /\[quote\]\[i\]Lune · 2768\[\/i\]\[\/quote\]/);
});

test("a markdown link becomes a url tag", () => {
    assert.match(
        toBBCode({ description: "see [the roll](https://x.test/1)" }),
        /\[url='https:\/\/x\.test\/1'\]the roll\[\/url\]/,
    );
});

// The regression the reordering fixed: bold-first turned **(121-140)** into
// [b](121-140)[/b], which the link regex then ate as [url='121-140']b[/url].
test("a bold band label is not eaten by the link rule", () => {
    const out = toBBCode({ description: "**(121-140)** Take 6d20" });
    assert.match(out, /\[b\]\(121-140\)\[\/b\]/);
    assert.doesNotMatch(out, /\[url=/);
});

// The other regression: the custom command escapes markdown in a DM's free
// text so Discord renders it literally. Those backslashes must not survive.
test("escaped markdown is unescaped before conversion", () => {
    const out = toBBCode({ description: "a \\*literal\\* star and a \\[bracket\\]" });
    assert.doesNotMatch(out, /\\/);
    assert.match(out, /a \*literal\* star/);
});

test("the roll link is appended when a url is given", () => {
    const out = toBBCode({ title: "T" }, "https://discord.test/9");
    assert.match(out, /\[url='https:\/\/discord\.test\/9'\]Roll Link\[\/url\]/);
});

test("no url means no roll link", () => {
    assert.doesNotMatch(toBBCode({ title: "T" }), /Roll Link/);
});

test("an empty embed yields an empty string, not a crash", () => {
    assert.strictEqual(toBBCode({}), "");
    assert.strictEqual(toBBCode(null), "");
});

test("runs of blank lines collapse", () => {
    assert.doesNotMatch(toBBCode({ description: "a\n\n\n\nb" }), /\n\n/);
});

// --- the injection cases. A custom action code is untrusted: anyone can
// author one. commands/customRoll.js escapeMarkdown escapes a DM's free text
// so Discord shows it literally, and this converter must not undo that
// protection on the way to the forum.

const escapeMarkdown = (s) => String(s).replace(/[\\*_~`|>\[\]#-]/g, (c) => "\\" + c);

test("an escaped markdown link never becomes a live url tag", () => {
    const out = toBBCode({ description: "a " + escapeMarkdown("[click me](http://evil.example)") });
    assert.doesNotMatch(out, /\[url='http:\/\/evil\.example'\]/);
});

test("escaped BBCode written straight into a degree text cannot open a tag", () => {
    const payload = "[url='http://evil.example']Click for free gold[/url]";
    const out = toBBCode({ description: "a " + escapeMarkdown(payload) });
    // Every bracket from the untrusted half is neutralised.
    assert.doesNotMatch(out, /(^|[^\]])\[url='http:\/\/evil\.example'\]/);
    assert.match(out, /\[plain\]\[\[\/plain\]/);
});

test("escaped bold, italics and code stay literal", () => {
    const out = toBBCode({ description: "a " + escapeMarkdown("**x** *y* `z`") });
    assert.doesNotMatch(out, /\[b\]x\[\/b\]/);
    assert.doesNotMatch(out, /\[i\]y\[\/i\]/);
    assert.doesNotMatch(out, /\[icode\]z\[\/icode\]/);
    assert.match(out, /\*\*x\*\* \*y\* `z`/);
});

test("a forged sentinel in the description cannot survive", () => {
    const out = toBBCode({ description: "a0b" });
    assert.doesNotMatch(out, //);
});

test("bot-authored markup still converts beside untrusted text", () => {
    const out = toBBCode({
        description: "**(1-40)** " + escapeMarkdown("[x](http://evil.test)") + " rolled `7`",
    });
    assert.match(out, /\[b\]\(1-40\)\[\/b\]/);
    assert.match(out, /\[icode\]7\[\/icode\]/);
    assert.doesNotMatch(out, /\[url='http:\/\/evil\.test'\]/);
});
