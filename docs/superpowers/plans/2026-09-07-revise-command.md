# Revise Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the original roller fix the modifiers, comment, and passive tags on an already-posted roll and get the math recalculated, while the dice stay exactly as they were rolled.

**Architecture:** Every `roll(min, max)` result is recorded into a "dice tape" grouped by die type. The tape plus the raw command text is saved in memory, keyed by the bot's reply message id. A **Revise Command** button opens a modal prefilled with that command text. On submit, the same handler is re-run against a capture adapter while `roll()` replays the recorded dice, and the result is posted as a new message linking back to the original.

**Tech Stack:** Node 22 (CommonJS), discord.js v14, `node:test` + `node:assert` for unit tests. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-07-revise-command-design.md`

## Global Constraints

- **No new dependencies.** This repo has no `package.json` and no `node_modules`. Everything must run on Node 22 built-ins plus the already-present `discord.js` v14 and `dotenv`.
- **CommonJS only.** `require` / `module.exports`. No ESM, no TypeScript.
- **Test command:** `node --test revise commands`
- **Only dependency-free modules get unit tests.** `helpers.js` and anything importing `discord.js` or `dotenv` cannot be loaded in this checkout, so logic that must be tested belongs in a dependency-free module. This is why `parseCommandString` moves to its own file in Task 3.
- **Dice count must match exactly.** A revision that needs more or fewer dice than the original is refused. The only exception is an original that rolled zero dice.
- **`args[0]` is locked.** A revision may not change the action word.
- **All refusals are ephemeral.** Nothing is posted to the channel when a revision is refused.
- **The original message is never modified.** Revisions are new messages.
- **Package manager is pnpm** if any install ever becomes necessary. Never npm, never yarn.
- **Commit messages:** no attribution or co-author trailers.

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `revise/tape.js` | Pure dice-tape data module: record, replay cursor, emptiness check. No imports. |
| `revise/tape.test.js` | Unit tests for the above. |
| `revise/store.js` | In-memory record store keyed by message id. TTL and size cap. No imports. |
| `revise/store.test.js` | Unit tests for the above. |
| `revise/captureAdapter.js` | Message-shaped object that collects a reply payload instead of sending it. No imports. |
| `revise/captureAdapter.test.js` | Unit tests for the above. |
| `revise/components.js` | Builds the `[Copy Result] [Revise Command]` action row. Imports discord.js only. |
| `revise/index.js` | Discord glue: `onButton`, `onModalSubmit`. |
| `commands/parseCommand.js` | `parseCommandString(str)`, dependency-free so it can be unit tested. |
| `commands/parseCommand.test.js` | Unit tests for the above. |
| `commands/commandHandlers.js` | The command name to handler map, extracted from `r.js`, plus `resolveHandler`. |
| `commands/runRoll.js` | Shared wrapper: set roll context, run handler, handle errors, clear context. |

**Modify**

| File | Change |
|---|---|
| `helpers.js` | `roll()` records and replays. Roll context carries `commandText`, `rootUrl`, `revisionCount`. `parseArguments` delegates to `parseCommandString` and returns `commandText`. `sendReply` attaches the buttons and saves the record. |
| `adapters/interactionAdapter.js` | `reply()` must return the real `Message` via `fetchReply()`, not the `InteractionResponse`. |
| `commands/r.js` | Use `commandHandlers.js` and `runRoll`. |
| `commands/slash/attack.js`, `heal.js`, `r.js`, `rush.js`, `save.js` | Route through `runRoll` with a reconstructed `commandText`. |
| `index.js` | Route the `revise_command` button and the `revise_modal:` modal. |
| `CLAUDE.md` | Document the new `revise/` modules and `runRoll`. |

**Why no circular imports:** `helpers.js` imports `revise/components.js`, `revise/store.js`, `revise/tape.js`, and `commands/parseCommand.js`. None of those import `helpers.js`. `revise/index.js` imports `helpers.js`, but nothing imports `revise/index.js` except the top-level `index.js`.

---

### Task 1: Dice tape module

**Files:**
- Create: `revise/tape.js`
- Test: `revise/tape.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `NeedsFreshDice` — an `Error` subclass with `.min` and `.max` number properties and `.name === 'NeedsFreshDice'`
  - `createTape() -> object` — a fresh empty tape
  - `record(tape, min, max, value) -> void`
  - `isEmpty(tape) -> boolean`
  - `startReplay(tape) -> { take(min, max): number, hasLeftovers(): boolean }`

A tape is a plain object keyed by `"<min>-<max>"` holding arrays of numbers, for example `{ "1-100": [47], "1-20": [14, 3] }`. Grouping by die type means a `1d20` can never consume a value recorded for a `1d100`.

`startReplay` must deep-copy the arrays. The stored tape is replayed on every revision, so mutating it would let the dice drift.

- [ ] **Step 1: Write the failing test**

Create `revise/tape.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const tape = require('./tape');

test('records and replays values in order', () => {
    const t = tape.createTape();
    tape.record(t, 1, 100, 47);
    tape.record(t, 1, 100, 88);

    const cursor = tape.startReplay(t);
    assert.strictEqual(cursor.take(1, 100), 47);
    assert.strictEqual(cursor.take(1, 100), 88);
});

test('die types have separate queues', () => {
    const t = tape.createTape();
    tape.record(t, 1, 100, 47);
    tape.record(t, 1, 20, 14);

    const cursor = tape.startReplay(t);
    assert.strictEqual(cursor.take(1, 20), 14, 'a d20 must not consume the d100 value');
    assert.strictEqual(cursor.take(1, 100), 47);
});

test('taking from an exhausted queue throws NeedsFreshDice with the bounds', () => {
    const t = tape.createTape();
    tape.record(t, 1, 100, 47);

    const cursor = tape.startReplay(t);
    cursor.take(1, 100);
    assert.throws(
        () => cursor.take(1, 100),
        (err) => err.name === 'NeedsFreshDice' && err.min === 1 && err.max === 100
    );
});

test('taking a die type that was never recorded throws NeedsFreshDice', () => {
    const t = tape.createTape();
    tape.record(t, 1, 100, 47);

    const cursor = tape.startReplay(t);
    assert.throws(() => cursor.take(1, 20), (err) => err.name === 'NeedsFreshDice');
});

test('hasLeftovers is true when the replay used fewer dice than recorded', () => {
    const t = tape.createTape();
    tape.record(t, 1, 20, 14);
    tape.record(t, 1, 20, 3);

    const cursor = tape.startReplay(t);
    cursor.take(1, 20);
    assert.strictEqual(cursor.hasLeftovers(), true);
    cursor.take(1, 20);
    assert.strictEqual(cursor.hasLeftovers(), false);
});

test('startReplay does not mutate the stored tape', () => {
    const t = tape.createTape();
    tape.record(t, 1, 100, 47);

    tape.startReplay(t).take(1, 100);

    const second = tape.startReplay(t);
    assert.strictEqual(second.take(1, 100), 47, 'the same tape must replay identically twice');
});

test('isEmpty distinguishes no dice from some dice', () => {
    assert.strictEqual(tape.isEmpty(tape.createTape()), true);
    assert.strictEqual(tape.isEmpty(null), true);
    assert.strictEqual(tape.isEmpty(undefined), true);

    const t = tape.createTape();
    tape.record(t, 1, 6, 4);
    assert.strictEqual(tape.isEmpty(t), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test revise`
Expected: FAIL, `Cannot find module './tape'`

- [ ] **Step 3: Write the implementation**

Create `revise/tape.js`:

```js
// revise/tape.js
// Pure dice-tape data module. Records every die a roll produced so the
// same numbers can be replayed when a command is revised. No imports:
// this file must stay loadable without node_modules so it can be tested.

class NeedsFreshDice extends Error {
    constructor(min, max) {
        super(`No recorded die left for ${min}-${max}`);
        this.name = 'NeedsFreshDice';
        this.min = min;
        this.max = max;
    }
}

/** Bucket key for a die type. A 1d20 and a 1d100 never share a queue. */
function bucketKey(min, max) {
    return `${min}-${max}`;
}

/** A fresh, empty tape. */
function createTape() {
    return {};
}

/** Appends a rolled value to the matching bucket. */
function record(tape, min, max, value) {
    if (!tape) return;
    const key = bucketKey(min, max);
    if (!tape[key]) tape[key] = [];
    tape[key].push(value);
}

/** True when the tape holds no dice at all. */
function isEmpty(tape) {
    if (!tape) return true;
    return Object.values(tape).every(queue => queue.length === 0);
}

/**
 * Returns a cursor that hands back the recorded values in order.
 * The queues are copied, so the stored tape is never consumed and can be
 * replayed any number of times.
 */
function startReplay(tape) {
    const remaining = {};
    for (const [key, queue] of Object.entries(tape || {})) {
        remaining[key] = queue.slice();
    }

    return {
        take(min, max) {
            const queue = remaining[bucketKey(min, max)];
            if (!queue || queue.length === 0) throw new NeedsFreshDice(min, max);
            return queue.shift();
        },
        hasLeftovers() {
            return Object.values(remaining).some(queue => queue.length > 0);
        }
    };
}

module.exports = { NeedsFreshDice, createTape, record, isEmpty, startReplay };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test revise`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add revise/tape.js revise/tape.test.js
git commit -m "Add dice tape module for roll replay"
```

---

### Task 2: Revise record store

**Files:**
- Create: `revise/store.js`
- Test: `revise/store.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `put(messageId, record) -> void` — stamps `createdAt` when the record has none
  - `get(messageId, now = Date.now()) -> record | null` — `null` when missing or expired
  - `sweep(now = Date.now()) -> void`
  - `_reset() -> void` — tests only
  - `TTL_MS` (number, 24 hours), `MAX_RECORDS` (number, 5000)

Record shape written by callers:

```js
{
  commandText: 'attack a s 10 # Lethal',
  tape: { '1-100': [47] },
  userId: '123',
  channelId: '456',
  rootUrl: 'https://discord.com/channels/...',
  revisionCount: 0,
  createdAt: 1757000000000
}
```

The background sweep timer must be `unref()`ed, otherwise `node --test` never exits.

- [ ] **Step 1: Write the failing test**

Create `revise/store.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const store = require('./store');

function makeRecord(overrides = {}) {
    return {
        commandText: 'attack a s 10',
        tape: { '1-100': [47] },
        userId: 'user-1',
        channelId: 'chan-1',
        rootUrl: 'https://discord.com/channels/1/2/3',
        revisionCount: 0,
        ...overrides
    };
}

test('put then get returns the record', () => {
    store._reset();
    store.put('msg-1', makeRecord());

    const found = store.get('msg-1');
    assert.strictEqual(found.commandText, 'attack a s 10');
    assert.strictEqual(found.userId, 'user-1');
});

test('get returns null for an unknown id', () => {
    store._reset();
    assert.strictEqual(store.get('nope'), null);
});

test('put stamps createdAt when the record has none', () => {
    store._reset();
    store.put('msg-1', makeRecord());
    assert.strictEqual(typeof store.get('msg-1').createdAt, 'number');
});

test('get past the TTL returns null and drops the record', () => {
    store._reset();
    const now = Date.now();
    store.put('msg-1', makeRecord({ createdAt: now }));

    assert.notStrictEqual(store.get('msg-1', now + store.TTL_MS - 1000), null);
    assert.strictEqual(store.get('msg-1', now + store.TTL_MS + 1000), null);
    assert.strictEqual(store.get('msg-1', now), null, 'the expired record is deleted, not just hidden');
});

test('sweep drops expired records and keeps fresh ones', () => {
    store._reset();
    const now = Date.now();
    store.put('old', makeRecord({ createdAt: now - store.TTL_MS - 1 }));
    store.put('new', makeRecord({ createdAt: now }));

    store.sweep(now);

    assert.strictEqual(store.get('old', now), null);
    assert.notStrictEqual(store.get('new', now), null);
});

test('exceeding the size cap evicts the oldest record first', () => {
    store._reset();
    for (let i = 0; i < store.MAX_RECORDS + 2; i++) {
        store.put(`msg-${i}`, makeRecord());
    }

    assert.strictEqual(store.get('msg-0'), null, 'oldest evicted');
    assert.strictEqual(store.get('msg-1'), null, 'second oldest evicted');
    assert.notStrictEqual(store.get(`msg-${store.MAX_RECORDS + 1}`), null, 'newest kept');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test revise`
Expected: FAIL, `Cannot find module './store'`

- [ ] **Step 3: Write the implementation**

Create `revise/store.js`:

```js
// revise/store.js
// In-memory store of revisable rolls, keyed by the bot's reply message id.
// Cleared by a bot restart, which is intentional: see the design doc.
// No imports: this file must stay loadable without node_modules.

const TTL_MS = 24 * 60 * 60 * 1000;   // 24 hours
const MAX_RECORDS = 5000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;   // hourly

// A Map iterates in insertion order, which gives oldest-first eviction free.
const records = new Map();

/** Saves a record. Stamps createdAt when the caller did not supply one. */
function put(messageId, record) {
    records.set(messageId, {
        ...record,
        createdAt: record.createdAt ?? Date.now()
    });

    while (records.size > MAX_RECORDS) {
        const oldest = records.keys().next().value;
        records.delete(oldest);
    }
}

/** Returns the record, or null when it is missing or older than the TTL. */
function get(messageId, now = Date.now()) {
    const record = records.get(messageId);
    if (!record) return null;

    if (now - record.createdAt > TTL_MS) {
        records.delete(messageId);
        return null;
    }
    return record;
}

/** Drops every expired record. */
function sweep(now = Date.now()) {
    for (const [id, record] of records) {
        if (now - record.createdAt > TTL_MS) records.delete(id);
    }
}

/** Test helper. Not used by the bot. */
function _reset() {
    records.clear();
}

const sweepTimer = setInterval(() => sweep(), SWEEP_INTERVAL_MS);
// Without unref the timer keeps the process alive and `node --test` hangs.
if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

module.exports = { put, get, sweep, _reset, TTL_MS, MAX_RECORDS };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test revise`
Expected: PASS, 13 tests total across both files, and the command exits rather than hanging

- [ ] **Step 5: Commit**

```bash
git add revise/store.js revise/store.test.js
git commit -m "Add in-memory store for revisable rolls"
```

---

### Task 3: Extract `parseCommandString`

**Files:**
- Create: `commands/parseCommand.js`
- Test: `commands/parseCommand.test.js`
- Modify: `helpers.js` (the `parseArguments` function, currently at `helpers.js:67-83`, and the `module.exports` block at the end of the file)

**Interfaces:**
- Consumes: nothing.
- Produces: `parseCommandString(commandString) -> { args: string[], comment: string }`

`commandString` is a bare command with **no** prefix and **no** leading `r` token, for example `attack a s 10 # Lethal`. This is exactly the text the revise modal displays, so a revision parses identically to a first-time roll.

`comment` keeps the existing wrapped shape, `\n> *text*`, or `''` when there is no `#`.

`parseArguments` keeps its current behaviour and gains a third return value, `commandText`, which is the content with the prefix and the `r`/`roll` token stripped.

- [ ] **Step 1: Write the failing test**

Create `commands/parseCommand.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { parseCommandString } = require('./parseCommand');

test('splits args on whitespace', () => {
    const { args, comment } = parseCommandString('attack a s 10');
    assert.deepStrictEqual(args, ['attack', 'a', 's', '10']);
    assert.strictEqual(comment, '');
});

test('pulls the comment out and wraps it', () => {
    const { args, comment } = parseCommandString('attack a s 10 # Lethal Combat Focus');
    assert.deepStrictEqual(args, ['attack', 'a', 's', '10']);
    assert.strictEqual(comment, '\n> *Lethal Combat Focus*');
});

test('collapses repeated spaces', () => {
    const { args } = parseCommandString('attack   a  s');
    assert.deepStrictEqual(args, ['attack', 'a', 's']);
});

test('converts non-breaking spaces from mobile', () => {
    const { args } = parseCommandString('attack a s');
    assert.deepStrictEqual(args, ['attack', 'a', 's']);
});

test('handles an empty or missing string', () => {
    assert.deepStrictEqual(parseCommandString('').args, []);
    assert.deepStrictEqual(parseCommandString(undefined).args, []);
    assert.deepStrictEqual(parseCommandString(null).args, []);
});

test('handles a comment with no args', () => {
    const { args, comment } = parseCommandString('# just a note');
    assert.deepStrictEqual(args, []);
    assert.strictEqual(comment, '\n> *just a note*');
});

test('keeps generic dice notation as args[0]', () => {
    const { args } = parseCommandString('2d6 5 # boom');
    assert.deepStrictEqual(args, ['2d6', '5']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test commands`
Expected: FAIL, `Cannot find module './parseCommand'`

- [ ] **Step 3: Write the implementation**

Create `commands/parseCommand.js`:

```js
// commands/parseCommand.js
// Splits a bare command string (no prefix, no leading "r") into args and a
// formatted comment. Lives on its own so the revise flow can reuse it and so
// it stays loadable without node_modules for tests.

/**
 * @param {string} commandString e.g. "attack a s 10 # Lethal"
 * @returns {{args: string[], comment: string}} comment is "" or "\n> *text*"
 */
function parseCommandString(commandString) {
    const mobileFix = String(commandString ?? '').replace(/ /g, ' ');

    let argsString = mobileFix.trim();
    let comment = '';

    const commentIndex = argsString.indexOf('#');
    if (commentIndex !== -1) {
        comment = `\n> *${argsString.substring(commentIndex + 1).trim()}*`;
        argsString = argsString.substring(0, commentIndex).trim();
    }

    const args = argsString.split(' ').filter(arg => arg !== '');
    return { args, comment };
}

module.exports = { parseCommandString };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test commands`
Expected: PASS, 7 tests

- [ ] **Step 5: Rewrite `parseArguments` in `helpers.js` to delegate**

Replace the whole `parseArguments` function (`helpers.js:67-83`, including its doc comment) with:

```js
/**
 * Parses a full prefixed message: strips the prefix and the "r"/"roll" token,
 * then splits the rest into args and a comment.
 * @returns {{args: string[], comment: string, commandText: string}}
 *   commandText is the bare command, e.g. "attack a s 10 # Lethal".
 *   It is what the revise modal shows and what parseCommandString consumes.
 */
function parseArguments(content) {
    const mobileFix = content.replace(/ /g, ' ');
    const contentWithoutPrefix = mobileFix.slice(PREFIX.length).trim();

    // Drop the leading "r" or "roll" token.
    const firstSpace = contentWithoutPrefix.search(/\s/);
    const commandText = firstSpace === -1
        ? ''
        : contentWithoutPrefix.slice(firstSpace + 1).trim();

    const { args, comment } = parseCommandString(commandText);
    return { args, comment, commandText };
}
```

Add the import near the other requires at the top of `helpers.js`:

```js
const { parseCommandString } = require('./commands/parseCommand');
```

Add `parseCommandString` to the `module.exports` object at the bottom of `helpers.js` so callers have one place to import from.

- [ ] **Step 6: Sanity check the delegation by hand**

There is no test harness for `helpers.js` (it requires `dotenv`, which is not installed here). Verify the logic by reading it against these cases and confirming each matches the old behaviour:

| Input | `args` | `comment` | `commandText` |
|---|---|---|---|
| `?r attack a s 10` | `['attack','a','s','10']` | `''` | `attack a s 10` |
| `?r attack a s 10 # Lethal` | `['attack','a','s','10']` | `\n> *Lethal*` | `attack a s 10 # Lethal` |
| `?r 2d6` | `['2d6']` | `''` | `2d6` |
| `?r` | `[]` | `''` | `''` |
| `?r  attack` | `['attack']` | `''` | `attack` |

The old code built `['r','attack','a','s','10']` then called `args.shift()`. Slicing at the first whitespace produces the same result for every case above, including the bare `?r` case, which yields an empty `args` array both ways.

- [ ] **Step 7: Commit**

```bash
git add commands/parseCommand.js commands/parseCommand.test.js helpers.js
git commit -m "Extract parseCommandString into its own module

parseArguments now delegates to it and also returns commandText, the bare
command with the prefix and r token stripped. The revise flow needs to parse
that same shape."
```

---

### Task 4: Record and replay dice in `roll()`

**Files:**
- Modify: `helpers.js` — the context variables at `helpers.js:19-21`, `setRollContext` at `helpers.js:25-31`, `clearRollContext` at `helpers.js:33-36`, `roll` at `helpers.js:60-64`, and the `module.exports` block

**Interfaces:**
- Consumes: `revise/tape.js` from Task 1 (`createTape`, `record`, `startReplay`)
- Produces, all exported from `helpers.js`:
  - `setRollContext({ comment, userId, commandText, rootUrl, revisionCount })` — also starts a fresh tape and clears any replay cursor
  - `clearRollContext()` — also drops the tape and the cursor
  - `startReplay(tape) -> cursor` — puts `roll()` into replay mode, returns the cursor so the caller can check `hasLeftovers()`
  - `getRollContext() -> context`
  - `getCurrentTape() -> tape | null`

**Ordering rule that matters:** `setRollContext` clears the replay cursor, so a revision must call `setRollContext` **first** and `startReplay` **second**.

- [ ] **Step 1: Add the tape import to `helpers.js`**

Next to the other requires at the top:

```js
const tape = require('./revise/tape');
```

- [ ] **Step 2: Replace the context state variables**

Replace `helpers.js:19-21`:

```js
let currentContext = { comment: '', userId: '' };
let preprocessorCache = { mtime: 0, fn: null };
let ruleState = new Map();
```

with:

```js
const EMPTY_CONTEXT = { comment: '', userId: '', commandText: '', rootUrl: null, revisionCount: 0 };

let currentContext = { ...EMPTY_CONTEXT };
let preprocessorCache = { mtime: 0, fn: null };
let ruleState = new Map();
let currentTape = null;      // recording target; null means not recording
let replayCursor = null;     // set only while a revision is replaying
```

- [ ] **Step 3: Replace `setRollContext` and `clearRollContext`**

Replace `helpers.js:25-36` with:

```js
function setRollContext(ctx) {
    currentContext = {
        comment: (ctx && ctx.comment) || '',
        userId: (ctx && ctx.userId) || '',
        commandText: (ctx && ctx.commandText) || '',
        rootUrl: (ctx && ctx.rootUrl) || null,
        revisionCount: (ctx && ctx.revisionCount) || 0
    };
    ruleState = new Map();
    currentTape = tape.createTape();
    replayCursor = null;   // callers that want replay call startReplay AFTER this
}

function clearRollContext() {
    currentContext = { ...EMPTY_CONTEXT };
    ruleState = new Map();
    currentTape = null;
    replayCursor = null;
}

/** Puts roll() into replay mode for a revision. Call after setRollContext. */
function startReplay(recordedTape) {
    replayCursor = tape.startReplay(recordedTape);
    return replayCursor;
}

function getRollContext() {
    return currentContext;
}

function getCurrentTape() {
    return currentTape;
}
```

- [ ] **Step 4: Replace `roll`**

Replace `helpers.js:60-64` (the doc comment and the function) with:

```js
/** Rolls a single die, recording the result so the roll can be revised later. */
function roll(min, max) {
    // Replay wins outright. Whatever the preprocessor produced originally is
    // already baked into the tape, so it must not run a second time.
    if (replayCursor) return replayCursor.take(min, max);

    let value = checkPreprocessor(min, max);
    if (value === null) {
        value = Math.floor(Math.random() * (max - min + 1)) + min;
    }

    if (currentTape) tape.record(currentTape, min, max, value);
    return value;
}
```

- [ ] **Step 5: Export the new functions**

Add `startReplay`, `getRollContext`, and `getCurrentTape` to the `module.exports` object at the bottom of `helpers.js`, alongside the existing `setRollContext` and `clearRollContext`.

- [ ] **Step 6: Verify nothing broke**

Run: `node --test revise commands`
Expected: PASS, 20 tests. These do not exercise `helpers.js`, but they must still pass, which confirms `revise/tape.js` was not disturbed.

Then check the file parses:

Run: `node --check helpers.js`
Expected: no output, exit 0

- [ ] **Step 7: Commit**

```bash
git add helpers.js
git commit -m "Record every roll into a dice tape and support replay

roll() now records each result into the current tape and, during a revision,
replays recorded values instead of generating new ones. The preprocessor is
skipped in replay mode because its original output is already in the tape."
```

---

### Task 5: Capture adapter

**Files:**
- Create: `revise/captureAdapter.js`
- Test: `revise/captureAdapter.test.js`
- Modify: `adapters/interactionAdapter.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `CaptureAdapter` class
  - `new CaptureAdapter({ author, member, channel })`
  - `.capturesOnly === true` — the flag `sendReply` checks
  - `.captured` — the payload the handler tried to reply with, or `null`
  - `.reply(payload)` — stores and returns the payload, sends nothing
  - `.delete()` — no-op

Handlers read exactly these properties off the message object: `author.username`, `author.displayAvatarURL()`, `author.id`, `member`, `channel.send`, `reply`, `delete`. The adapter covers all of them.

`adapters/interactionAdapter.js` also needs a fix: `interaction.reply()` resolves to an `InteractionResponse`, whose `id` is the interaction id, **not** the message id. `sendReply` will key the revise store by that id, so slash-command rolls would store under the wrong key and the Revise button would always answer "can no longer be revised". `fetchReply()` returns the real `Message`.

- [ ] **Step 1: Write the failing test**

Create `revise/captureAdapter.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test revise`
Expected: FAIL, `Cannot find module './captureAdapter'`

- [ ] **Step 3: Write the implementation**

Create `revise/captureAdapter.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test revise`
Expected: PASS, 18 tests in `revise/`

- [ ] **Step 5: Fix `InteractionAdapter.reply` to return the real message**

Replace the `reply` method in `adapters/interactionAdapter.js` with:

```js
    async reply(payload) {
        await this._interaction.reply(payload);
        // interaction.reply() resolves to an InteractionResponse whose id is the
        // interaction id, not the message id. sendReply keys the revise store by
        // the message id, so fetch the real Message here.
        return this._interaction.fetchReply();
    }
```

- [ ] **Step 6: Verify both files parse**

Run: `node --check revise/captureAdapter.js && node --check adapters/interactionAdapter.js`
Expected: no output, exit 0

- [ ] **Step 7: Commit**

```bash
git add revise/captureAdapter.js revise/captureAdapter.test.js adapters/interactionAdapter.js
git commit -m "Add capture adapter and return the real message from InteractionAdapter

InteractionAdapter.reply returned an InteractionResponse, whose id is the
interaction id rather than the message id. The revise store keys on the
message id, so slash rolls need fetchReply()."
```

---

### Task 6: Buttons and record saving in `sendReply`

**Files:**
- Create: `revise/components.js`
- Modify: `helpers.js` — the `sendReply` function at `helpers.js:130-169` (doc comment included), plus its imports

**Interfaces:**
- Consumes: `revise/store.js` (Task 2), `getRollContext` and `getCurrentTape` (Task 4)
- Produces: `buildRollButtons() -> ActionRowBuilder` from `revise/components.js`

`sendReply` is the single send point for the whole bot. `finalizeAndSend` at `helpers.js:240-252` routes into it too, so changing `sendReply` covers every handler with no per-handler edits.

Two behaviours are added. First, the action row gains a **Revise Command** button. Second, after a successful send, the record is written to the store. When the reply target is a `CaptureAdapter` both the store write and the delete timer are skipped, because a revision has no message id yet and owns its own send.

- [ ] **Step 1: Create the components module**

Create `revise/components.js`:

```js
// revise/components.js
// The action row that rides along with every roll embed.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function buildRollButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('copy_result')
            .setLabel('Copy Result')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('revise_command')
            .setLabel('Revise Command')
            .setStyle(ButtonStyle.Secondary)
    );
}

module.exports = { buildRollButtons };
```

- [ ] **Step 2: Add the imports to `helpers.js`**

Next to the other requires at the top:

```js
const store = require('./revise/store');
const { buildRollButtons } = require('./revise/components');
```

The existing `ActionRowBuilder`, `ButtonBuilder`, and `ButtonStyle` names in the `discord.js` require at `helpers.js:3` become unused once `sendReply` uses `buildRollButtons`. Leave the require line alone; removing names from it risks breaking something else in the file.

- [ ] **Step 3: Replace `sendReply`**

Replace the whole `sendReply` function (`helpers.js:130-169`, doc comment included) with:

```js
/**
 * Sends a formatted reply and deletes only the user's original command after
 * a delay. The bot's reply stays in the channel.
 *
 * Also saves a revise record keyed by the sent message id, so the Revise
 * Command button can replay the exact dice later. When the target is a
 * CaptureAdapter (a revision in progress) nothing is sent or stored: there is
 * no message id yet, and revise/index.js owns that step.
 *
 * @param {import('discord.js').Message} message
 * @param {import('discord.js').EmbedBuilder} embed
 * @param {string} comment
 */
async function sendReply(message, embed, comment) {
    try {
        if (comment) {
            const currentDescription = embed.data.description || "";
            embed.setDescription(currentDescription + comment);
        }

        const sent = await message.reply({
            embeds: [embed],
            components: [buildRollButtons()]
        });

        if (message.capturesOnly) return;

        const ctx = getRollContext();
        if (ctx.commandText) {
            store.put(sent.id, {
                commandText: ctx.commandText,
                tape: getCurrentTape() || {},
                userId: ctx.userId,
                channelId: sent.channelId,
                // The first roll seeds rootUrl; revisions carry it forward, so
                // the tenth revision still links to the very first roll.
                rootUrl: ctx.rootUrl || sent.url,
                revisionCount: ctx.revisionCount || 0,
                createdAt: Date.now()
            });
        }

        setTimeout(() => {
            message.delete().catch(() => {
                // Already gone (deleted by a moderator, say). Nothing to do.
            });
        }, REPLY_DELETE_TIMEOUT);

    } catch (err) {
        console.error("Failed to send reply or schedule deletion:", err);
        message.channel.send("Sorry, I encountered an error trying to reply.").catch();
    }
}
```

- [ ] **Step 4: Verify the files parse**

Run: `node --check revise/components.js && node --check helpers.js`
Expected: no output, exit 0

Run: `node --test revise commands`
Expected: PASS, 25 tests

- [ ] **Step 5: Commit**

```bash
git add revise/components.js helpers.js
git commit -m "Add Revise Command button and save a revise record on every roll

sendReply is the single send point for all handlers, including the ones that
go through finalizeAndSend, so both changes land everywhere at once."
```

---

### Task 7: Shared `runRoll` wrapper and command handler map

**Files:**
- Create: `commands/commandHandlers.js`
- Create: `commands/runRoll.js`
- Modify: `commands/r.js`
- Modify: `commands/slash/attack.js`, `commands/slash/heal.js`, `commands/slash/r.js`, `commands/slash/rush.js`, `commands/slash/save.js`

**Interfaces:**
- Consumes: `setRollContext` and `clearRollContext` from `helpers.js`
- Produces:
  - `commands/commandHandlers.js`: `commandHandlers` (the name to handler object) and `resolveHandler(commandName) -> handler | null`
  - `commands/runRoll.js`: `runRoll({ message, args, comment, commandText, handler }) -> Promise<void>`

The map moves out of `r.js` so `revise/index.js` can reach it without importing `r.js`, which exports a discord.js command object rather than the map.

`resolveHandler` also owns the generic `XdY` fallback that `r.js` currently inlines, so the revise flow resolves commands exactly the way a first-time roll does.

Routing the slash commands through `runRoll` fixes a real existing bug as a side effect: they never call `setRollContext`, so the preprocessor currently sees an empty comment on every slash roll.

- [ ] **Step 1: Create the handler map module**

The map is roughly 90 lines of `'name': module.handler,` pairs. Move it verbatim rather than retyping it. Both files sit in `commands/`, so the `./handlers/...` require paths need no change.

Generate the file mechanically, then edit in the resolver:

```bash
{
  echo "// commands/commandHandlers.js"
  echo "// The command name to handler lookup, extracted from r.js so both the prefix"
  echo "// router and the revise flow resolve commands the same way."
  echo ""
  sed -n '7,12p' commands/r.js      # the six handler require lines
  echo ""
  sed -n '15,106p' commands/r.js    # the commandHandlers object literal
} > commands/commandHandlers.js
```

Verify the extraction landed correctly before continuing:

```bash
node --check commands/commandHandlers.js && grep -c "Handlers.handle" commands/commandHandlers.js
```

Expected: exit 0, and a count of 77 (one per mapped command). The extraction was verified against the current `r.js` while this plan was written.

Then append the resolver and the export to the bottom of the generated file:

```js

/**
 * Resolves a command name to a handler.
 * Falls back to the generic XdY roller, matching the prefix router.
 * @returns {Function|null}
 */
function resolveHandler(commandName) {
    const name = String(commandName || '').toLowerCase();
    if (commandHandlers[name]) return commandHandlers[name];
    if (name.includes('d')) return genericHandlers.handleGenericRoll;
    return null;
}

module.exports = { commandHandlers, resolveHandler };
```

- [ ] **Step 2: Create the `runRoll` wrapper**

Create `commands/runRoll.js`:

```js
// commands/runRoll.js
// One entry point for running a roll handler. Both the prefix router and the
// slash commands go through here so the roll context and the dice tape start
// in exactly one place.

const { EmbedBuilder } = require('discord.js');
const { setRollContext, clearRollContext, sendReply } = require('../helpers');
const { EMBED_COLORS } = require('./constants');

/**
 * @param {object} opts
 * @param {object} opts.message      Message or an adapter with the same surface
 * @param {string[]} opts.args
 * @param {string} opts.comment      Already formatted, e.g. "\n> *Lethal*"
 * @param {string} opts.commandText  Bare command, e.g. "attack a s 10 # Lethal"
 * @param {Function} opts.handler
 */
async function runRoll({ message, args, comment, commandText, handler }) {
    setRollContext({
        comment,
        userId: message.author.id,
        commandText
    });

    try {
        await handler(message, args, comment);
    } catch (error) {
        console.error(`Error executing ${args[0]}:`, error);
        const errorEmbed = new EmbedBuilder()
            .setColor(EMBED_COLORS.error)
            .setTitle('Error')
            .setDescription('An error occurred while executing this command.');
        await sendReply(message, errorEmbed, comment);
    } finally {
        clearRollContext();
    }
}

module.exports = { runRoll };
```

- [ ] **Step 3: Rewrite the `execute` body in `commands/r.js`**

Delete the six handler `require` lines and the whole `commandHandlers` object literal from `commands/r.js`. Replace the requires at the top with:

```js
const { EmbedBuilder } = require('discord.js');
const { checkPermissions, parseArguments, sendReply } = require('../helpers');
const { PREFIX } = require('./constants');
const { resolveHandler } = require('./commandHandlers');
const { runRoll } = require('./runRoll');
```

Replace the `execute` function with:

```js
    async execute(message) {
        if (!checkPermissions(message)) return;

        const { args, comment, commandText } = parseArguments(message.content);

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
        const handler = resolveHandler(commandName);

        if (!handler) {
            const unknownEmbed = new EmbedBuilder()
                .setColor('Red')
                .setTitle('Unknown Command')
                .setDescription(`The command \`${commandName}\` was not found. Use \`${PREFIX}r\` for help.`);
            return sendReply(message, unknownEmbed, comment);
        }

        await runRoll({ message, args, comment, commandText, handler });
    }
```

Note the help embed and the unknown-command embed are sent outside `runRoll`, so they never write a revise record. Nothing was rolled, and the roll context is empty, so `sendReply` skips the store write on its own.

- [ ] **Step 4: Route `commands/slash/attack.js` through `runRoll`**

Add the import:

```js
const { runRoll } = require('../runRoll');
```

Replace the final line, `await basicHandlers.handleAttack(adapter, args, formattedComment);`, with:

```js
        const commandText = comment
            ? `${args.join(' ')} # ${comment}`
            : args.join(' ');

        await runRoll({
            message: adapter,
            args,
            comment: formattedComment,
            commandText,
            handler: basicHandlers.handleAttack
        });
```

- [ ] **Step 5: Route the other four slash commands the same way**

`commands/slash/heal.js` — import `runRoll` from `'../runRoll'`, then replace `await supportHandlers.handleHeal(adapter, args, formattedComment);` with:

```js
        const commandText = comment
            ? `${args.join(' ')} # ${comment}`
            : args.join(' ');

        await runRoll({
            message: adapter,
            args,
            comment: formattedComment,
            commandText,
            handler: supportHandlers.handleHeal
        });
```

`commands/slash/r.js` — import `runRoll` from `'../runRoll'`, then replace `await genericHandlers.handleGenericRoll(adapter, args, formattedComment);` with:

```js
        const commandText = comment
            ? `${args.join(' ')} # ${comment}`
            : args.join(' ');

        await runRoll({
            message: adapter,
            args,
            comment: formattedComment,
            commandText,
            handler: genericHandlers.handleGenericRoll
        });
```

`commands/slash/rush.js` — import `runRoll` from `'../runRoll'`, then replace `await basicHandlers.handleRush(adapter, ['rush'], '');` with:

```js
        await runRoll({
            message: adapter,
            args: ['rush'],
            comment: '',
            commandText: 'rush',
            handler: basicHandlers.handleRush
        });
```

`commands/slash/save.js` — import `runRoll` from `'../runRoll'`, then replace `await basicHandlers.handleSave(adapter, args, formattedComment);` with:

```js
        const commandText = comment
            ? `${args.join(' ')} # ${comment}`
            : args.join(' ');

        await runRoll({
            message: adapter,
            args,
            comment: formattedComment,
            commandText,
            handler: basicHandlers.handleSave
        });
```

`commandText` is built from `args`, not from the raw options, so it round-trips through `parseCommandString` to the identical `args` array. For `save`, `args` already contains `adv` or `dis` when chosen, so a revision that drops it changes the dice count and is refused, which is correct.

- [ ] **Step 6: Verify everything parses**

Run:

```bash
node --check commands/commandHandlers.js && \
node --check commands/runRoll.js && \
node --check commands/r.js && \
node --check commands/slash/attack.js && \
node --check commands/slash/heal.js && \
node --check commands/slash/r.js && \
node --check commands/slash/rush.js && \
node --check commands/slash/save.js
```

Expected: no output, exit 0

Run: `node --test revise commands`
Expected: PASS, 25 tests

- [ ] **Step 7: Commit**

```bash
git add commands/commandHandlers.js commands/runRoll.js commands/r.js commands/slash
git commit -m "Route all rolls through a shared runRoll wrapper

Extracts the command handler map out of r.js so the revise flow can resolve
commands the same way. Slash commands now set the roll context too, which also
fixes the preprocessor never seeing the comment on a slash roll."
```

---

### Task 8: Revise button opens the prefilled modal

**Files:**
- Create: `revise/index.js`
- Modify: `index.js` — the button block starting at `index.js:203`, and the modal block at `index.js:167-199`

**Interfaces:**
- Consumes: `revise/store.js` (Task 2)
- Produces: `onButton(interaction) -> Promise` from `revise/index.js`

This task ships a working, clickable button that opens the prefilled modal. Submitting does nothing yet; Task 9 adds that.

The modal `customId` carries the source message id as `revise_modal:<messageId>`, roughly 32 characters, well under Discord's 100-character limit.

- [ ] **Step 1: Create `revise/index.js` with the button half**

Create `revise/index.js`:

```js
// revise/index.js
// Discord glue for the Revise Command button and its modal.

const {
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');

const store = require('./store');

const MODAL_PREFIX = 'revise_modal:';
const MAX_INPUT_LENGTH = 4000;   // Discord's paragraph text input limit

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

module.exports = { onButton, MODAL_PREFIX };
```

- [ ] **Step 2: Route the button in `index.js`**

Add the import at the top of `index.js`, near the other requires:

```js
const revise = require('./revise');
```

Then, inside the button section, immediately **before** the existing `if (interaction.customId === 'copy_result') {` at `index.js:203`, insert:

```js
    if (interaction.customId === 'revise_command') {
        try {
            return await revise.onButton(interaction);
        } catch (e) {
            console.error('[revise_command] Error:', e);
            return interaction.reply({
                content: 'Failed to open the revise form.',
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
    }
```

- [ ] **Step 3: Verify both files parse**

Run: `node --check revise/index.js && node --check index.js`
Expected: no output, exit 0

- [ ] **Step 4: Manual test in the test channel**

Start the bot, then check each row:

| Do this | Expect |
|---|---|
| `?r attack a s 10 # Lethal` | Embed shows both buttons: Copy Result and Revise Command |
| Click Revise Command | Modal opens, single field prefilled with `attack a s 10 # Lethal` |
| Have someone else click Revise Command | Ephemeral "This is not your roll." |
| `/attack mr:a wr:s mods:10` then click Revise Command | Modal opens prefilled with `attack a s 10`. If it says "can no longer be revised", the `fetchReply()` fix from Task 5 did not take effect |
| Restart the bot, then click Revise Command on an older roll | Ephemeral "This roll can no longer be revised." |
| Close the modal without submitting | Nothing happens, no error in the console |

- [ ] **Step 5: Commit**

```bash
git add revise/index.js index.js
git commit -m "Add Revise Command button that opens a prefilled modal"
```

---

### Task 9: Modal submit replays the dice and posts the revision

**Files:**
- Modify: `revise/index.js`
- Modify: `index.js` — the modal-submit block at `index.js:167-199`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `revise/tape.js`, `revise/store.js`, `revise/captureAdapter.js`, `parseCommandString` from `commands/parseCommand.js`, `resolveHandler` from `commands/commandHandlers.js`, and `setRollContext`, `clearRollContext`, `startReplay` from `helpers.js`
- Produces: `onModalSubmit(interaction) -> Promise` from `revise/index.js`

Order of operations that matters: `setRollContext` clears the replay cursor, so it must be called **before** `startReplay`.

Error-embed detection compares the resolved colour against `EMBED_COLORS.error`, which is the string `'Red'`. `resolveColor('Red')` gives `15548997`, distinct from the offense red `#d84848` (`14173768`), so there is no false match.

- [ ] **Step 1: Add the imports to `revise/index.js`**

Extend the `discord.js` require to include `EmbedBuilder` and `resolveColor`, and add the rest:

```js
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

const DICE_MISMATCH =
    'This change needs a different number of dice than the original roll. Make a fresh roll instead.';
const ERROR_COLOR = resolveColor(EMBED_COLORS.error);
```

- [ ] **Step 2: Add `onModalSubmit` to `revise/index.js`**

Append before the `module.exports` line:

```js
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

    // Fewer dice than recorded is refused too: the count must match exactly.
    if (cursor && cursor.hasLeftovers()) {
        return ephemeral(interaction, DICE_MISMATCH);
    }

    const payload = adapter.captured;
    if (!payload || !payload.embeds || !payload.embeds[0]) {
        return ephemeral(interaction, 'Something went wrong while revising this roll.');
    }

    const embed = EmbedBuilder.from(payload.embeds[0]);

    // A revision that fails validation is shown privately, not posted.
    if (isErrorEmbed(embed)) {
        return ephemeral(interaction, embed.data.description || 'That revision is not valid.');
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
```

Update the export line:

```js
module.exports = { onButton, onModalSubmit, MODAL_PREFIX };
```

- [ ] **Step 3: Route the modal in `index.js`**

Inside the `if (interaction.isModalSubmit()) {` block at `index.js:167`, immediately **before** the existing `if (interaction.customId === "lfgpost") {`, insert:

```js
        if (interaction.customId.startsWith('revise_modal:')) {
            try {
                await revise.onModalSubmit(interaction);
            } catch (e) {
                console.error('[revise_modal] Error:', e);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'Failed to revise this roll.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }
            }
            return;
        }
```

The surrounding block already ends with `return;`, so the `lfgpost` branch is unaffected.

- [ ] **Step 4: Verify both files parse**

Run: `node --check revise/index.js && node --check index.js`
Expected: no output, exit 0

Run: `node --test revise commands`
Expected: PASS, 25 tests

- [ ] **Step 5: Manual test in the test channel**

Work through every row. The dice values in the original embed are the thing to watch: they must be identical in the revision.

| Do this | Expect |
|---|---|
| `?r attack a s 10`, revise to `attack a s 10 5` | New message, same d100 value, total is 5 higher, title ends `(revised)`, "Revised from original roll" link works |
| Revise that revision to `attack a s 10 5 3` | Title ends `(revised 2x)`, same d100 value again, link still points at the very first roll |
| `?r attack a s 10`, revise to `attack a s 10 # Lethal` | Same d100 value, "Using Lethal" now appears in the description |
| `?r critical a s 20`, revise to `critical a s 25` | Both d100 values unchanged, multiplier tier unchanged, only the modifier moves |
| `?r reckless a s`, revise to `critical a s` | Ephemeral "The action must stay the same (`reckless`)." Nothing posted |
| `?r counter a s`, revise to `ultracounter a s` | Same refusal |
| `?r 2d6`, revise to `3d6` | Same refusal (the notation is `args[0]`) |
| `?r 2d6`, revise to `2d8` | Same refusal |
| `?r 2d6`, revise to `2d6 5` | Works, same two dice, total 5 higher |
| `?r defile b`, revise to `defile s` | Ephemeral dice-mismatch message. Nothing posted |
| `?r defile s`, revise to `defile b` | Same dice-mismatch refusal (fewer dice is refused too) |
| `?r save adv`, revise to `save` | Same dice-mismatch refusal |
| `?r attack a z 10` (bad rank), revise to `attack a s 10` | A real attack roll is posted, fresh dice, because the original rolled none |
| `?r attack a s 10`, revise to `attack a z 10` | Ephemeral showing the "Invalid Rank" text. Nothing posted |
| Someone else clicks Revise on your roll | Ephemeral "This is not your roll." |
| Two people revise their own rolls at the same moment | Both succeed, neither picks up the other's dice |
| Click Copy Result on a revised message | BBCode includes the "(revised)" title and the original-roll link |

- [ ] **Step 6: Update `CLAUDE.md`**

In the **Core Structure** tree, add the new modules:

```
├── revise/
│   ├── index.js            # Revise button + modal glue
│   ├── tape.js             # Dice tape: record and replay
│   ├── store.js            # In-memory revisable-roll store (24h TTL)
│   ├── components.js       # Copy Result + Revise Command button row
│   └── captureAdapter.js   # Collects a reply payload without sending
└── commands/
    ├── commandHandlers.js  # Command name to handler map + resolveHandler
    ├── parseCommand.js     # parseCommandString, dependency free
    └── runRoll.js          # Shared roll entry point
```

Add a new section after **Passive Ability Tag System**:

```markdown
### Revise Command System

Every roll embed carries a **Revise Command** button next to **Copy Result**.
It lets the original roller fix modifiers, comments, and tags without
rerolling the dice.

How the dice are preserved: `roll()` in `helpers.js` records every result into
a "dice tape" grouped by die type (`{"1-100": [47], "1-20": [14, 3]}`). The
tape plus the raw command text is saved in `revise/store.js`, keyed by the
bot's reply message id, for 24 hours. Clicking Revise opens a modal prefilled
with that command text. On submit the same handler is re-run against a
`CaptureAdapter` while `roll()` replays the recorded values, and the result is
posted as a new message linking back to the original.

Rules, all enforced in `revise/index.js`:
- Only the original roller may revise.
- `args[0]` is locked. The action word (and, for generic rolls, the dice
  notation) cannot change.
- The dice count must match exactly. More or fewer is refused.
- Exception: when the original rolled zero dice (a validation error, or a
  passive with no roll), fresh dice are allowed.
- Revisions chain. Every revision replays the same original tape, so the dice
  never drift, and the "Revised from" link always points at the first roll.
- All refusals are ephemeral. Nothing is posted to the channel.

The store is memory only. A bot restart clears it, and revising an older roll
then reports "This roll can no longer be revised."

**When adding a new handler:** nothing extra is needed. `sendReply` is the
single send point for every handler, including those routed through
`finalizeAndSend`, so the button and the record land automatically.

Tests: `node --test revise commands`
```

Also update the **Key Design Decisions** list with an eighth entry:

```markdown
8. **Revisable Rolls**: Dice results are recorded and replayed so inputs can be
   corrected after the fact without rerolling
```

- [ ] **Step 7: Commit**

```bash
git add revise/index.js index.js CLAUDE.md
git commit -m "Replay recorded dice when a revised command is submitted

The revised roll is posted as a new message linking back to the original. The
action word is locked and the dice count must match exactly, so the feature
cannot be used to fish for a better roll."
```

---

## Verification

After Task 9, confirm the whole feature:

```bash
node --test revise commands
```

Expected: 25 tests passing, process exits cleanly.

```bash
node --check index.js && node --check helpers.js && \
node --check revise/index.js && node --check commands/runRoll.js && \
node --check commands/commandHandlers.js
```

Expected: no output, exit 0.

Then walk the manual matrix in Task 9 Step 5 end to end in the test channel.
