# Revise Command — Design

Date: 2026-09-07
Status: Approved, ready for implementation plan

## Problem

Players sometimes forget or mistype their modifiers, comments, or passive
tags. The dice are already rolled by then. For commands with layered
math (`critical` with its multiplier table, `sneak`, `areaeffect`) working
out the corrected number by hand is slow and error prone.

We want a way to fix the *inputs* of a roll and get the math recalculated,
while the *dice* stay exactly as they were rolled. Preserving the dice is
the point: it must be impossible to use this feature to fish for a better
roll.

## Solution summary

Add a **Revise Command** button next to the existing **Copy Result**
button on every roll embed.

1. Every call to `roll(min, max)` is recorded into a "dice tape" grouped by
   die type.
2. The tape is saved alongside the raw command text, keyed by the bot's
   reply message id.
3. Clicking **Revise Command** opens a modal prefilled with the original
   command text.
4. On submit, the handler is re-run with the new arguments while `roll()`
   replays the recorded dice instead of generating new ones.
5. The result is posted as a **new** message that links back to the
   original roll. The original is never modified.

## Decisions

| Question | Decision |
|---|---|
| Input method | One modal text field, prefilled with the whole command |
| Output | New message linking back to the original; original untouched |
| Who may revise | The original roller only |
| Retention | In memory, 24 hour expiry; a bot restart clears it |
| Command word may change | No. `args[0]` is locked |
| Dice count may change | No. Must match exactly, up or down |
| Original rolled no dice | Fresh dice allowed; there is no result to protect |
| Disk persistence | Out of scope |
| Staff override | Out of scope |

## Architecture

### New modules

#### `revise/tape.js`

Pure logic. No discord.js import.

Tape shape, keyed by `"<min>-<max>"`:

```js
{ "1-100": [47], "1-20": [14, 3] }
```

Grouping by die type means a `1d20` can never consume a value recorded for
a `1d100`, which keeps replay correct even if a handler reorders its rolls
between branches.

Exports:

- `startRecording()` — begin a fresh tape for the current roll
- `record(min, max, value)` — append a value to the matching bucket
- `takeTape()` — return the finished tape and stop recording
- `startReplay(tape)` — return a replay cursor object; does not mutate the
  input tape, so the same tape can be replayed any number of times
- `cursor.take(min, max)` — next recorded value, or throw `NeedsFreshDice`
  when the bucket is exhausted
- `cursor.hasLeftovers()` — true when any bucket still holds unconsumed
  values after the run
- `isEmpty(tape)` — true when no dice were recorded at all

`NeedsFreshDice` is an `Error` subclass carrying `min` and `max` so the
refusal message can be specific.

#### `revise/store.js`

In-memory `Map` keyed by the bot reply message id.

Record shape:

```js
{
  commandText: "attack a s 10 # Lethal",  // raw, exactly as the modal shows
  tape: { "1-100": [47] },                // always the ORIGINAL tape
  userId: "123...",                       // original roller
  channelId: "456...",
  rootUrl: "https://discord.com/...",     // the FIRST roll in the chain
  revisionCount: 0,
  createdAt: 1757...
}
```

Exports `put`, `get` (returns `null` when missing or expired), and `sweep`.
Expiry is 24 hours. A size cap with oldest-first eviction bounds memory.
Sweep runs on an interval and lazily on `get`.

#### `revise/index.js`

The discord.js glue.

- `buildRow()` — the action row holding `copy_result` and `revise_command`
- `onButton(interaction)` — look up, authorise, show the modal
- `onModalSubmit(interaction)` — validate, replay, post

#### `commands/runRoll.js`

One wrapper that both entry paths call, so the roll context and the tape
start in exactly one place:

```js
async function runRoll({ message, args, comment, commandText, handler }) {
  setRollContext({ commandText, comment, userId: message.author.id });
  try {
    await handler(message, args, comment);
  } catch (err) {
    // existing error embed behaviour, unchanged
  } finally {
    clearRollContext();
  }
}
```

### Changed files

#### `helpers.js`

`roll()` gains a replay branch ahead of the preprocessor check. During
replay the preprocessor is skipped, because whatever it produced originally
is already baked into the tape:

```js
function roll(min, max) {
    if (activeReplayCursor) return activeReplayCursor.take(min, max);
    let value = checkPreprocessor(min, max);
    if (value === null) value = Math.floor(Math.random() * (max - min + 1)) + min;
    tape.record(min, max, value);
    return value;
}
```

`setRollContext()` also accepts `commandText`, `rootUrl`, and
`revisionCount`, and calls `tape.startRecording()`.

`sendReply()` attaches the Revise button and, after sending, saves the
record keyed by the sent message id. It reads `commandText` from the roll
context, so no return value needs threading through 70 handlers.

When the reply target is a `CaptureAdapter` (a revision in progress)
`sendReply` sends nothing and saves nothing: there is no message id yet.
The revision path in `revise/index.js` owns the `channel.send` and the
matching `store.put`. `sendReply` detects this by asking the adapter, for
example a `capturesOnly === true` flag, rather than by type sniffing.

`parseArguments()` is split. The comment/args splitting moves into a new
`parseCommandString(str)` that takes a bare command string with no prefix
and no leading `r`. `parseArguments` becomes: strip prefix, strip `r`, call
`parseCommandString`. The modal submit path calls `parseCommandString`
directly, so a revision is parsed identically to a first-time roll.

#### `commands/r.js`

Replace the direct handler invocation with a `runRoll` call. Pass
`commandText` as the content with the prefix and the `r` token stripped,
which is exactly what the modal will display.

#### `commands/slash/*.js` (attack, heal, r, rush, save)

Route through `runRoll` as well. These currently never call
`setRollContext`, so the preprocessor sees an empty comment on every slash
roll. Routing them through `runRoll` fixes that as a side effect.
`commandText` is reconstructed from the options, for example
`attack a s 10 # Lethal`.

#### `index.js`

Two new routes in `interactionCreate`:

- button `revise_command` -> `revise.onButton`
- modal `revise_modal` -> `revise.onModalSubmit`

## Flows

### Normal roll

```
?r attack a s 10 # Lethal
  runRoll: context = { commandText: "attack a s 10 # Lethal", userId }
           tape.startRecording()
  handleAttack: roll(1,100) -> 47, recorded as "1-100": [47]
  sendReply: send embed + [Copy Result] [Revise Command]
             store.put(sent.id, { commandText, tape, userId,
                                  rootUrl: sent.url, revisionCount: 0 })
```

### Revision

```
click [Revise Command]
  record = store.get(interaction.message.id)
  record missing            -> ephemeral "This roll can no longer be revised."
  record.userId !== clicker -> ephemeral "This is not your roll."
  show modal, one paragraph field prefilled with record.commandText

submit "attack a s 10 5 # Lethal Combat Focus"
  parseCommandString(newText) -> { args, comment }
  args[0] !== oldArgs[0]      -> ephemeral "The action must stay the same (`attack`)."

  cursor = tape.startReplay(record.tape)
  run handler against a CaptureAdapter (collects the payload, sends nothing)

    NeedsFreshDice thrown   -> ephemeral "This change needs a different number
                                          of dice than the original roll."
    cursor.hasLeftovers()   -> same refusal
      (both checks skipped when tape.isEmpty(record.tape))
    captured embed colour is EMBED_COLORS.error
                            -> ephemeral, show the error text, post nothing

  n = record.revisionCount + 1
  decorate: title + " (revised)"  when n === 1
            title + " (revised " + n + "x)"  when n >= 2
            description + "\n\nRevised from [original roll](record.rootUrl)"
  interaction.deferUpdate()
  channel.send(payload)
  store.put(newMsg.id, { ...record,
                         commandText: newText,
                         revisionCount: record.revisionCount + 1 })
```

`rootUrl` is copied forward unchanged, so the tenth revision still links to
the very first roll. `tape` is copied forward unchanged, so the dice never
drift no matter how many times a roll is revised.

### CaptureAdapter

Mirrors `adapters/interactionAdapter.js`. Its `reply(payload)` stores the
payload on the adapter and sends nothing; its `delete()` is a no-op. This
makes every refusal atomic: a check that fails partway through the handler
leaves nothing in the channel.

It exposes `author` (the original roller, so `message.author.id` and
`displayAvatarURL()` still resolve inside handlers), `member`, and
`channel`, matching what handlers actually read.

## Refusal messages

| Condition | Message |
|---|---|
| Record missing or expired | This roll can no longer be revised. |
| Clicker is not the roller | This is not your roll. |
| `args[0]` changed | The action must stay the same (`attack`). Make a fresh roll instead. |
| Dice count differs | This change needs a different number of dice than the original roll. Make a fresh roll instead. |
| Revision yields an error embed | (the handler's own error text) |

All are ephemeral. None post to the channel.

## Edge cases

- **No dice rolled.** Some alter passives and every validation-error embed
  record an empty tape. Both the exhaustion check and the leftovers check
  are skipped for an empty tape, so fresh dice are allowed. This makes
  Revise the natural fix for a typed rank: `?r attack a z 10` returns
  "Invalid Rank", and revising it to `a s` produces a real roll.
- **Concurrent revisions.** `startReplay` returns a per-revision cursor and
  never mutates the stored tape, so two people revising at the same moment
  cannot interfere.
- **Modal 3 second limit.** The replay is pure computation. Acknowledge the
  modal before the `channel.send`.
- **Generic rolls.** `args[0]` is the dice notation itself, so the command
  word lock already refuses `2d6` -> `3d6` and `2d6` -> `2d8` with no extra
  code.
- **Bot restart.** The store empties. Clicking Revise on an older roll
  gives the "can no longer be revised" message. Accepted.
- **Lower rank on a per-target command.** Refused, because the dice count
  would change. This also closes the `defile` case, where a lower total is
  the better outcome.

## Testing

No `package.json` and no `node_modules` in this repo, so no framework is
added. Node 22 supplies `node --test`.

`revise/tape.test.js`
- record then replay returns the same values in the same order
- a `1d20` take does not consume a `1d100` value
- taking from an exhausted bucket throws `NeedsFreshDice` with the bounds
- `hasLeftovers` is true when the replay used fewer dice than recorded
- `startReplay` does not mutate the stored tape, so the same tape replays
  identically twice

`revise/store.test.js`
- put then get returns the record
- get past the 24h expiry returns `null`
- exceeding the size cap evicts the oldest record

Run: `node --test revise/`

The Discord glue is verified manually in the test channel:
button visible, ownership refusal, expiry refusal, command-word refusal,
dice-count refusal, a successful mod change, a successful comment/tag
change, a two-step revision chain, and revising a failed roll.

## Out of scope

- Persisting the store to disk
- A staff or GM override
- Undoing or deleting a revision; the chain is append-only
- Editing the original message in place
