// custom-action-codec.js
//
// A DM writes a custom action — a name, some dice everyone takes, a save or
// check, and a chart of what each result costs — and hands it out as one
// pasteable code. This module is that code's grammar: the rules for what a
// valid action is, the pure helpers for reading its chart, and (see the async
// half below) the wire format itself.
//
// TWO COPIES, ONE FILE. ts-builder/shared/ and ts-discord-bot/commands/ each
// hold a byte-identical copy, because the two are separate git repos. The same
// JSON fixture is pinned by a test in both, so a copy that drifts fails a test
// instead of failing a roll in a live thread.
//
// Shape of an action:
//   { v: 1,
//     n: "Enraged Tide Splitter",              // name
//     d: "…",                                  // short description, optional
//     p: [["Base damage", "20d20"]],           // dice before the check, optional
//     k: ["fortitude"],                        // allowed rolls, optional
//     g: [[40, "Take 20d20"], [null, "Take 2d20"]] }   // degrees of success
//
// `d` and `k` are optional because the roll payload the sheet sends to the bot
// drops them (see stripForRoll): the bot needs the chart, not the prose, and
// the player's pick travels as its own command argument.
//
// A degree is [upperBound, text], bounds strictly rising, the last bound null
// meaning "and above". A total matches the first entry it does not exceed, so
// bands can neither gap nor overlap — there is no way to write a broken chart.
(function (root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (typeof window !== "undefined") window.CustomActionCodec = api;
})(this, function () {
    "use strict";

    const VERSION = 1;
    const KINDS = ["fortitude", "reflex", "will", "mastery", "expertise"];

    // Limits. These are what keeps a pasted code from becoming a denial of
    // service: a chart is read by a human, so none of them is a real ceiling.
    const MAX_NAME = 60;
    const MAX_DESC = 300;
    const MAX_LABEL = 30;
    const MAX_PRE_ROWS = 5;
    const MAX_DEGREES = 20;
    const MAX_TEXT = 200;
    const MAX_BOUND = 9999;
    const MAX_DICE_COUNT = 100;
    const MAX_DICE_SIDES = 1000;
    const MAX_CYCLES = 50;
    const MAX_CYCLE_ACTIONS = 100;

    const ACTION_KEYS = ["v", "n", "d", "p", "k", "g"];
    const SCREEN_KEYS = ["v", "id", "name", "cycles", "createdAt", "updatedAt"];

    // Thrown by the async half. A distinct class so a caller can tell "this
    // code is not valid" from a genuine bug in its own code.
    class CodecError extends Error {
        constructor(message) {
            super(message);
            this.name = "CodecError";
        }
    }

    function isObject(value) {
        return !!value && typeof value === "object" && !Array.isArray(value);
    }

    function isInt(value) {
        return typeof value === "number" && isFinite(value) && Math.floor(value) === value;
    }

    function trimmed(value) {
        return typeof value === "string" ? value.trim() : "";
    }

    // "20d20" and nothing else: no sign, no modifier, no spaces. A DM who wants
    // "20d20 + 10" writes the 10 into the degree text, where a human reads it.
    const DICE_ONLY = /^(\d+)d(\d+)$/i;

    function diceProblem(text) {
        const match = DICE_ONLY.exec(typeof text === "string" ? text : "");
        if (!match) return 'Dice must look like "20d20".';
        const count = parseInt(match[1], 10);
        const sides = parseInt(match[2], 10);
        if (count < 1 || count > MAX_DICE_COUNT) {
            return `Dice count must be 1 to ${MAX_DICE_COUNT}.`;
        }
        if (sides < 2 || sides > MAX_DICE_SIDES) {
            return `Dice sides must be 2 to ${MAX_DICE_SIDES}.`;
        }
        return null;
    }

    function validateDegrees(g) {
        if (!Array.isArray(g) || g.length === 0) return "An action needs at least one degree.";
        if (g.length > MAX_DEGREES) return `An action may have at most ${MAX_DEGREES} degrees.`;

        let previous = null;
        for (let i = 0; i < g.length; i++) {
            const row = g[i];
            if (!Array.isArray(row) || row.length !== 2) {
                return `Degree ${i + 1} should be a bound and a text.`;
            }
            const bound = row[0];
            const text = row[1];
            const last = i === g.length - 1;

            if (last) {
                if (bound !== null) return "The last degree's bound must be blank: it means \"and above\".";
            } else {
                if (bound === null) return "Only the last degree may have a blank bound.";
                if (!isInt(bound) || bound < 0 || bound > MAX_BOUND) {
                    return `Degree ${i + 1}'s bound must be a whole number from 0 to ${MAX_BOUND}.`;
                }
                if (previous !== null && bound <= previous) {
                    return "Degree bounds must rise, each one higher than the one before.";
                }
                previous = bound;
            }

            if (typeof text !== "string" || trimmed(text).length === 0) {
                return `Degree ${i + 1} needs some text.`;
            }
            if (text.length > MAX_TEXT) {
                return `Degree ${i + 1}'s text is longer than ${MAX_TEXT} characters.`;
            }
        }
        return null;
    }

    /**
     * @returns {null|string} null when the action is usable, else one sentence
     *   saying what is wrong — written for a DM to read in a modal, not for a log.
     */
    function validateAction(obj) {
        if (!isObject(obj)) return "That is not a custom action.";

        const keys = Object.keys(obj);
        for (let i = 0; i < keys.length; i++) {
            if (ACTION_KEYS.indexOf(keys[i]) === -1) {
                return `An action has no field called "${keys[i]}".`;
            }
        }

        if (obj.v !== VERSION) return `That code is version ${obj.v}; this one reads version ${VERSION}.`;

        const name = trimmed(obj.n);
        if (typeof obj.n !== "string" || name.length === 0) return "An action needs a name.";
        if (obj.n.length > MAX_NAME) return `The name is longer than ${MAX_NAME} characters.`;

        if (obj.d !== undefined) {
            if (typeof obj.d !== "string") return "The description must be text.";
            if (obj.d.length > MAX_DESC) return `The description is longer than ${MAX_DESC} characters.`;
        }

        if (obj.p !== undefined) {
            if (!Array.isArray(obj.p)) return "The dice rows must be a list.";
            if (obj.p.length > MAX_PRE_ROWS) return `At most five dice rows, not ${obj.p.length}.`;
            for (let i = 0; i < obj.p.length; i++) {
                const row = obj.p[i];
                if (!Array.isArray(row) || row.length !== 2) {
                    return `Dice row ${i + 1} should be a label and a dice string.`;
                }
                if (typeof row[0] !== "string" || row[0].length > MAX_LABEL) {
                    return `Dice row ${i + 1}'s label is longer than ${MAX_LABEL} characters.`;
                }
                const problem = diceProblem(row[1]);
                if (problem) return `Dice row ${i + 1}: ${problem}`;
            }
        }

        if (obj.k !== undefined) {
            if (!Array.isArray(obj.k) || obj.k.length === 0) {
                return "Pick at least one roll type.";
            }
            if (obj.k.length > KINDS.length) return "There are only five roll types.";
            const seen = {};
            for (let i = 0; i < obj.k.length; i++) {
                const kind = obj.k[i];
                if (KINDS.indexOf(kind) === -1) return `"${kind}" is not a roll type.`;
                if (seen[kind]) return `"${kind}" is listed twice.`;
                seen[kind] = true;
            }
        }

        return validateDegrees(obj.g);
    }

    function validateScreen(obj) {
        if (!isObject(obj)) return "That is not a DM screen.";

        const keys = Object.keys(obj);
        for (let i = 0; i < keys.length; i++) {
            if (SCREEN_KEYS.indexOf(keys[i]) === -1) {
                return `A screen has no field called "${keys[i]}".`;
            }
        }

        if (obj.v !== VERSION) return `That code is version ${obj.v}; this one reads version ${VERSION}.`;
        if (typeof obj.name !== "string" || trimmed(obj.name).length === 0) {
            return "The screen needs a name.";
        }
        if (obj.name.length > MAX_NAME) return `The screen name is longer than ${MAX_NAME} characters.`;

        if (!Array.isArray(obj.cycles) || obj.cycles.length === 0) {
            return "The screen needs at least one cycle.";
        }
        if (obj.cycles.length > MAX_CYCLES) return `At most ${MAX_CYCLES} cycles.`;

        for (let c = 0; c < obj.cycles.length; c++) {
            const cycle = obj.cycles[c];
            if (!isObject(cycle)) return `Cycle ${c + 1} is not a cycle.`;
            if (typeof cycle.name !== "string" || trimmed(cycle.name).length === 0) {
                return `Cycle ${c + 1} needs a name.`;
            }
            if (!Array.isArray(cycle.actions)) return `Cycle ${c + 1} has no action list.`;
            if (cycle.actions.length > MAX_CYCLE_ACTIONS) {
                return `Cycle ${c + 1} has more than ${MAX_CYCLE_ACTIONS} actions.`;
            }
            for (let a = 0; a < cycle.actions.length; a++) {
                const entry = cycle.actions[a];
                if (!isObject(entry)) return `Cycle ${c + 1}, action ${a + 1} is not an action.`;
                const problem = validateAction(entry.action);
                if (problem) return problem;
            }
        }

        return null;
    }

    /**
     * The half of an action the bot needs: the chart and the dice, not the
     * prose or the list of rolls the DM allowed. The player's pick travels as
     * its own command argument, so `k` would only make the code longer.
     * `p` is dropped entirely when empty rather than sent as `[]`.
     */
    function stripForRoll(action) {
        const out = { v: action.v, n: action.n };
        if (Array.isArray(action.p) && action.p.length) out.p = action.p;
        out.g = action.g;
        return out;
    }

    /** Index of the degree a total lands in. */
    function matchDegree(g, total) {
        for (let i = 0; i < g.length; i++) {
            if (g[i][0] === null || total <= g[i][0]) return i;
        }
        return g.length - 1;
    }

    /**
     * The band a degree covers, worked out from its neighbours rather than
     * stored — so a DM editing one bound can never leave a stale label behind.
     */
    function rangeLabel(g, index) {
        if (g.length === 1) return "(any)";
        if (index === 0) return `(${g[0][0]} or under)`;
        const low = g[index - 1][0] + 1;
        if (g[index][0] === null) return `(${low}+)`;
        return `(${low}-${g[index][0]})`;
    }

    // Every NdM in a degree's text, so the bot can roll the outcome the DM
    // wrote. The word boundaries matter: "20d20damage" and "x20d20" are prose,
    // not dice, and rolling them would surprise everyone at the table.
    const DICE_IN_TEXT = /\b(\d+)d(\d+)\b/gi;

    function diceIn(text) {
        if (typeof text !== "string") return [];
        const out = [];
        let match;
        DICE_IN_TEXT.lastIndex = 0;
        while ((match = DICE_IN_TEXT.exec(text)) !== null) {
            const count = parseInt(match[1], 10);
            const sides = parseInt(match[2], 10);
            if (count < 1 || count > MAX_DICE_COUNT) continue;
            if (sides < 2 || sides > MAX_DICE_SIDES) continue;
            out.push({ count: count, sides: sides, raw: match[0] });
        }
        return out;
    }

    // --- the wire format -----------------------------------------------------
    //
    //   code = PREFIX + base64url( deflate-raw( utf8( JSON ) ) )
    //
    // The prefix is the format version and says what the payload is, so an
    // action code pasted into the screen importer is refused by name instead of
    // failing somewhere deeper. base64url's alphabet is [A-Za-z0-9_-], so a code
    // contains no space and no '#' and survives as one Discord argument.
    //
    // Compression goes through CompressionStream, which Node 22 and every
    // current browser have, so both copies of this file run the same path. zlib
    // is kept only as a fallback for a Node older than 18; its output was
    // measured byte-identical to CompressionStream's for these payloads.

    const ACTION_PREFIX = "1";
    const LIST_PREFIX = "L1";
    const SCREEN_PREFIX = "S1";
    const MAX_BYTES = 4000;

    const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const B64_INDEX = (function () {
        const map = {};
        for (let i = 0; i < B64.length; i++) map[B64[i]] = i;
        return map;
    })();

    // Hand-rolled rather than Buffer or btoa: the two environments must produce
    // the same string, and no padding is emitted, so a code has no '='.
    function bytesToBase64url(bytes) {
        let out = "";
        for (let i = 0; i < bytes.length; i += 3) {
            const b0 = bytes[i];
            const b1 = bytes[i + 1];
            const b2 = bytes[i + 2];
            out += B64[b0 >> 2];
            out += B64[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
            if (b1 === undefined) break;
            out += B64[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
            if (b2 === undefined) break;
            out += B64[b2 & 63];
        }
        return out;
    }

    function base64urlToBytes(text) {
        const out = [];
        let buffer = 0;
        let bits = 0;
        for (let i = 0; i < text.length; i++) {
            const value = B64_INDEX[text[i]];
            if (value === undefined) {
                throw new CodecError("That code has characters that do not belong in it.");
            }
            // bits never exceeds 13 before this shift, so no overflow.
            buffer = (buffer << 6) | value;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out.push((buffer >> bits) & 255);
            }
        }
        return new Uint8Array(out);
    }

    // Drains a stream, refusing to buffer more than `cap` bytes. The cap is what
    // stops a small code from inflating into a large allocation.
    async function readAll(stream, cap) {
        const reader = stream.getReader();
        const chunks = [];
        let total = 0;
        for (;;) {
            const step = await reader.read();
            if (step.done) break;
            total += step.value.length;
            if (cap && total > cap) {
                reader.cancel().catch(function () {});
                throw new CodecError("That code holds more than a chart should.");
            }
            chunks.push(step.value);
        }
        const out = new Uint8Array(total);
        let at = 0;
        for (let i = 0; i < chunks.length; i++) {
            out.set(chunks[i], at);
            at += chunks[i].length;
        }
        return out;
    }

    function nodeZlib() {
        try {
            return typeof require === "function" ? require("zlib") : null;
        } catch (e) {
            return null;
        }
    }

    async function deflate(bytes) {
        if (typeof CompressionStream === "function") {
            const cs = new CompressionStream("deflate-raw");
            const writer = cs.writable.getWriter();
            // Errors from a broken transform surface through the readable side,
            // which readAll already reports as a CodecError; without this catch
            // the writable side's own rejection goes unhandled alongside it.
            writer.write(bytes).catch(function () {});
            writer.close().catch(function () {});
            return readAll(cs.readable, null);
        }
        const zlib = nodeZlib();
        if (zlib) return new Uint8Array(zlib.deflateRawSync(Buffer.from(bytes), { level: 9 }));
        throw new CodecError("This browser cannot make custom action codes. Please update it.");
    }

    async function inflate(bytes) {
        if (typeof DecompressionStream === "function") {
            const ds = new DecompressionStream("deflate-raw");
            const writer = ds.writable.getWriter();
            // Same as deflate(): a malformed payload errors the transform, and
            // this stray promise must not be left to reject unobserved.
            writer.write(bytes).catch(function () {});
            writer.close().catch(function () {});
            return readAll(ds.readable, MAX_BYTES);
        }
        const zlib = nodeZlib();
        if (zlib) {
            return new Uint8Array(zlib.inflateRawSync(Buffer.from(bytes), { maxOutputLength: MAX_BYTES }));
        }
        throw new CodecError("This browser cannot read custom action codes. Please update it.");
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    /** Encodes without validating. Exported for tests that need a tampered code. */
    async function encodeUnchecked(prefix, value) {
        const bytes = encoder.encode(JSON.stringify(value));
        if (bytes.length > MAX_BYTES) {
            throw new CodecError("That is too long to turn into a code.");
        }
        return prefix + bytesToBase64url(await deflate(bytes));
    }

    // Names the payload a code claims to be, so a mis-pasted code is refused
    // with the place it belongs rather than a parse error.
    const PREFIX_NAMES = {};
    PREFIX_NAMES[ACTION_PREFIX] = "a custom action";
    PREFIX_NAMES[LIST_PREFIX] = "a list of custom actions";
    PREFIX_NAMES[SCREEN_PREFIX] = "a DM Screen";

    function kindOf(code) {
        const text = String(code == null ? "" : code).trim();
        if (text.slice(0, SCREEN_PREFIX.length) === SCREEN_PREFIX) return SCREEN_PREFIX;
        if (text.slice(0, LIST_PREFIX.length) === LIST_PREFIX) return LIST_PREFIX;
        if (text.slice(0, ACTION_PREFIX.length) === ACTION_PREFIX) return ACTION_PREFIX;
        return null;
    }

    async function decodeUnchecked(prefix, code) {
        const text = String(code == null ? "" : code).trim();
        const found = kindOf(text);
        if (found === null) {
            throw new CodecError("That does not look like a code.");
        }
        if (found !== prefix) {
            throw new CodecError(`That is ${PREFIX_NAMES[found]} code, not ${PREFIX_NAMES[prefix]} code.`);
        }
        const body = text.slice(prefix.length);
        if (body.length === 0) throw new CodecError("That code is empty.");

        let json;
        try {
            json = decoder.decode(await inflate(base64urlToBytes(body)));
        } catch (e) {
            if (e instanceof CodecError) throw e;
            throw new CodecError("That code is damaged; ask for it again.");
        }

        try {
            return JSON.parse(json);
        } catch (e) {
            throw new CodecError("That code is damaged; ask for it again.");
        }
    }

    function refuse(problem) {
        if (problem) throw new CodecError(problem);
    }

    async function encodeAction(action) {
        refuse(validateAction(action));
        return encodeUnchecked(ACTION_PREFIX, action);
    }

    async function decodeAction(code) {
        const value = await decodeUnchecked(ACTION_PREFIX, code);
        refuse(validateAction(value));
        return value;
    }

    async function encodeList(actions) {
        if (!Array.isArray(actions) || actions.length === 0) {
            throw new CodecError("There is nothing to export.");
        }
        for (let i = 0; i < actions.length; i++) refuse(validateAction(actions[i]));
        return encodeUnchecked(LIST_PREFIX, actions);
    }

    async function decodeList(code) {
        const value = await decodeUnchecked(LIST_PREFIX, code);
        if (!Array.isArray(value)) throw new CodecError("That code is damaged; ask for it again.");
        for (let i = 0; i < value.length; i++) refuse(validateAction(value[i]));
        return value;
    }

    async function encodeScreen(screen) {
        refuse(validateScreen(screen));
        return encodeUnchecked(SCREEN_PREFIX, screen);
    }

    async function decodeScreen(code) {
        const value = await decodeUnchecked(SCREEN_PREFIX, code);
        refuse(validateScreen(value));
        return value;
    }

    async function decodeAny(code) {
        const prefix = kindOf(code);
        if (prefix === SCREEN_PREFIX) return { kind: "screen", value: await decodeScreen(code) };
        if (prefix === LIST_PREFIX) return { kind: "list", value: await decodeList(code) };
        if (prefix === ACTION_PREFIX) return { kind: "action", value: await decodeAction(code) };
        throw new CodecError("That does not look like a code.");
    }

    return {
        VERSION: VERSION,
        KINDS: KINDS,
        CodecError: CodecError,
        validateAction: validateAction,
        validateScreen: validateScreen,
        stripForRoll: stripForRoll,
        matchDegree: matchDegree,
        rangeLabel: rangeLabel,
        diceIn: diceIn,

        ACTION_PREFIX: ACTION_PREFIX,
        LIST_PREFIX: LIST_PREFIX,
        SCREEN_PREFIX: SCREEN_PREFIX,
        MAX_BYTES: MAX_BYTES,
        encodeAction: encodeAction,
        decodeAction: decodeAction,
        encodeList: encodeList,
        decodeList: decodeList,
        encodeScreen: encodeScreen,
        decodeScreen: decodeScreen,
        decodeAny: decodeAny,
        encodeUnchecked: encodeUnchecked,
    };
});
