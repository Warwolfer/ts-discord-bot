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
| Retention | In memory, 72 hour expiry; a bot restart clears it |
| Command word may change | No. `args[0]` is locked |
| Dice count may change | Removing dice is refused; adding dice is allowed and recorded |
| Advantage/disadvantage may change | No. `args[1]`'s adv/dis mode is locked. User ruling: replaying `adv`<->`dis` keeps the same dice count so no other refusal catches it, but the player would be choosing the better of two numbers already on screen, which is exactly the fishing this feature must prevent. |
| Any other non-numeric argument may change | No, on a roll that recorded dice. Locking adv/dis fixed one instance of a whole class: a rank change replays the *same* dice but moves the success threshold (`SNEAK_THRESHOLDS`, `COUNTER_THRESHOLDS`), the multiplier tier (`CRIT_MULT_BY_RANK`), the trigger bonus (`SNIPE_TRIG_X`), or the per-target dice count (`defile`). `lockedArgs(args)` — every arg that is not `/^-?\d+$/`, lowercased — must be unchanged. Only numeric modifiers stay editable, which is what this feature is for. |
| Comment mode triggers may change | **Yes.** `aoe`, `versatile`, `simulcast`, `melee`, `risky`, `snipe`, `vilify`, `release`, `ultra` stay editable. User ruling, asked directly: forgetting to type `aoe` is exactly the mistake this feature exists to fix, so locking them would gut the feature. **This is an accepted gap, not a backstopped one.** Some triggers do change the dice count and are caught — `?r defile c` -> `# vilify` goes 2d20 to 1d20 and is refused on leftovers. But `aoe`/`versatile`/`simulcast` do NOT: `BASE_DICE` is a literal in `handleHeal` (2) and `handlePowerHeal` (4), and `handleBuff` rolls one d100, so they only pick a divisor and a target count. `# aoe` showing "+20 HP to 3 allies" can be revised to "+60 HP to 1 ally" on the same dice. Accepted because locking it would gut the feature; both messages stay linked and visible. |
| Save DC may change | No, on a roll that recorded dice. The DC is read out of the comment (`/\bDC\s*\(\s*(\d+)\s*\)/i` in `handleSave`, `handleExpertise`, `handleMastery`), and the comment must stay editable for tags and flavour, so only that one token is locked: `DC (60)` -> `DC (50)` flips a visible Save Failure into a Save Success. |
| Original rolled no dice | No special case any more. An empty tape means every die is fresh, through the same path. The locked-arg and locked-DC refusals are still skipped there |
| `[TEST]` comment overrides during replay | Never run. Guarded by `!isReplaying()` in every handler that has one |
| Channel eligibility re-checked | Yes. `checkPermissions` runs on both the button click and the modal submit |
| Modal input style | `TextInputStyle.Short`. A command is one line, and `parseCommandString` splits on a literal space, so a newline from a Paragraph input surfaces as "Invalid Rank" with no hint why |
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
- `cursor.take(min, max)` — next recorded value, or `null` when the bucket
  is exhausted, meaning the revision is adding a die the original never rolled
- `countDice(tape)` — how many dice the tape holds, used to report added dice
- `cursor.hasLeftovers()` — true when any bucket still holds unconsumed
  values after the run
- `isEmpty(tape)` — true when no dice were recorded at all

There is no `NeedsFreshDice`. Running out of tape is ordinary now: adding
dice is allowed, so `take` returns `null` and `roll()` rolls a fresh one.
Removing dice is still refused, by `hasLeftovers()`.

#### `revise/store.js`

In-memory `Map` keyed by the bot reply message id.

Record shape:

```js
{
  commandText: "attack a s 10 # Lethal",  // raw, exactly as the modal shows
  rootId: "789...",                       // the chain this record belongs to.
                                           // The dice tape lives in the chain
                                           // map under this id, NOT here — see
                                           // "Chain-scoped tapes" below.
  userId: "123...",                       // original roller
  channelId: "456...",
  rootUrl: "https://discord.com/...",     // the FIRST roll in the chain
  revisionCount: 0,
  createdAt: 1757...
}
```

Exports `put`, `get` (returns `null` when missing or expired), and `sweep`.
Expiry is 72 hours. A size cap with oldest-first eviction bounds memory.
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
    if (replayCursor) {
        let value = replayCursor.take(min, max);
        // null means the original never rolled this die and the revision is
        // adding one. Roll it fresh, but still skip the preprocessor.
        if (value === null) value = Math.floor(Math.random() * (max - min + 1)) + min;
        if (currentTape) tape.record(currentTape, min, max, value);
        return value;
    }
    let value = checkPreprocessor(min, max);
    if (value === null) value = Math.floor(Math.random() * (max - min + 1)) + min;
    if (currentTape) tape.record(currentTape, min, max, value);
    return value;
}
```

`currentTape` records every die a run uses, replayed or fresh, so the stored
tape is always exactly what that run used.

`setRollContext()` also accepts `commandText`, `rootUrl`, and
`revisionCount`, and calls `tape.startRecording()`.

`isReplaying()` is exported alongside the other roll-context accessors and is
simply `replayCursor !== null`. Handlers use it to switch off their `[TEST]`
comment overrides during a replay.

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
  channel not roll-eligible -> ephemeral "Rolls cannot be revised in this channel."
  show modal, one Short field prefilled with record.commandText

submit "attack a s 10 5 # Lethal Combat Focus"
  same record / owner / channel checks again
  parseCommandString(newText) -> { args, comment }
  parseCommandString(record.commandText) -> { oldArgs, oldComment }
  rootId      = record.rootId || messageId
  chainTape   = store.getTape(rootId)
  chainTape === null -> ephemeral "This roll can no longer be revised."
  originalHadDice = !tape.isEmpty(chainTape)
  args[0] !== oldArgs[0]      -> ephemeral "The action must stay the same (`attack`)."
  advantageMode differs       -> ephemeral "Advantage/disadvantage must stay the same."
  originalHadDice && lockedArgs(args) differs
                              -> ephemeral "Only numeric modifiers and the comment can change..."
  originalHadDice && declaredDC(comment) !== declaredDC(oldComment)
                              -> ephemeral "The DC cannot change..."

  cursor = tape.startReplay(chainTape)
  run handler against a CaptureAdapter (collects the payload, sends nothing)

    cursor.hasLeftovers()   -> same refusal
      (hasLeftovers is vacuous on an empty tape, not skipped)
    captured embed colour is EMBED_COLORS.error
                            -> ephemeral, show the error text, post nothing

  n = record.revisionCount + 1
  decorate: title + " (revised)"  when n === 1
            title + " (revised " + n + "x)"  when n >= 2
            description + "\n\nRevised from [original roll](record.rootUrl)"
  interaction.deferUpdate()
  channel.send(payload)
    throws                  -> followUp ephemeral "Could not post the revised roll here."
                               (reply is impossible: the defer already acknowledged)
  store.putTape(rootId, producedTape)        // the CHAIN's tape, one place
  store.put(newMsg.id, { commandText: newText, rootId,
                         userId, channelId, rootUrl,
                         revisionCount: record.revisionCount + 1 })
  !originalHadDice        -> store.put(messageId, { ...record,
                                                    rootId,
                                                    createdAt: record.createdAt })
                             so the ROOT button replays instead of rerolling
```

`rootUrl` is copied forward unchanged, so the tenth revision still links to
the very first roll.

The tape is NOT copied forward per record. It lives on the chain, keyed by
`rootId`, and a revision writes the grown tape back there — see
"Chain-scoped dice tapes" at the end of this document for why, and for the
three separate leaks that a per-record tape produced before the model was
changed.

```js
store.putTape(rootId, producedTape || {});
```

`putTape` keeps the chain's original `createdAt`, so growing the tape must not
and does not extend the 72h TTL. Every record in the chain — the root, the
message just posted, and any sibling minted by an earlier modifier-only
revision — reads that one tape, so the next click replays it and every later
refusal (locked args, locked DC, fewer dice) applies as normal.

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
| Channel is not roll-eligible | Rolls cannot be revised in this channel. |
| `args[0]` changed | The action must stay the same (`attack`). Make a fresh roll instead. |
| `args[1]`'s advantage/disadvantage mode changed | Advantage/disadvantage must stay the same. Make a fresh roll instead. |
| A non-numeric argument changed, seed had dice | Only numeric modifiers and the comment can change on a roll that already rolled dice. Ranks and flags are locked. Make a fresh roll instead. |
| The comment's `DC (n)` changed, seed had dice | The DC cannot change on a roll that already rolled dice. Make a fresh roll instead. |
| Dice count differs | This change needs a different number of dice than the original roll. Make a fresh roll instead. |
| Revision yields an error embed | (the handler's own error text) |
| `channel.send` fails after the defer | Could not post the revised roll here. The channel may be locked or gone. |

All are ephemeral. None post to the channel.

The last one is a `followUp`, not a `reply`: `deferUpdate()` has already
acknowledged the interaction by then, so the `interactionCreate` wrapper in
`index.js` (guarded by `!replied && !deferred`) cannot answer for us and the
user would otherwise see the modal close and nothing else. The same `try`
covers an uncached `interaction.channel`, where `channel.send` is a
`TypeError` on that identical silent path.

The permission check is the same `checkPermissions(message)` that `commands/r.js`
and every slash command call before rolling. It reads only `.channel`, which an
interaction exposes, so the interaction is passed unchanged. Without it, two real
holes stayed open: clicking a component needs no SEND_MESSAGES, so a player
locked out of a read-only story channel could still have the bot post roll embeds
there for the rest of the 72h window; and a channel renamed off "rolls" or moved
out of the story category stopped accepting `?r` while Revise kept working.

## Edge cases

- **No dice rolled.** Some alter passives and every validation-error embed
  record an empty tape. Both the exhaustion check and the leftovers check
  are skipped for an empty tape, so fresh dice are allowed **once**. This
  makes Revise the natural fix for a typed rank: `?r attack a z 10` returns
  "Invalid Rank", and revising it to `a s` produces a real roll. The
  locked-args and locked-DC refusals are also skipped on an empty seed —
  there is no visible result to protect, and correcting the rank is the
  point. Both the new record *and the root record* are then seeded with the
  dice that revision rolled, so a second click on the same original message
  replays them instead of rolling again.
- **`[TEST]` comment overrides.** Five handlers (`critical`, `sharp`,
  `reckless`, `buff`, `powerbuff`) let a comment force roll values for
  manual testing. Every override block sits *after* the `roll()` calls, so
  a replay draws from the tape normally and the overrides merely clobber the
  local variables: the dice count is bit-identical, no refusal fires, and
  the embed keeps its normal action colour so `isErrorEmbed` does not catch
  it either. `?r sharp a s 10` revised to `# test:star breaker` would force
  `100, 42` with a forced risky `[100]`, a ×7 multiplier. Each block is now
  guarded with `!isReplaying()` (new accessor in `helpers.js`, true while a
  replay cursor is set).
- **`[TEST]` prefix was optional.** Independently of Revise, several of
  those patterns accepted the bare keyword: `/\b(?:test[:=]\s*)?(…|crit)\b/i`
  matched the comment "going for a crit" and forced a 100 on a live roll.
  Every override pattern now requires the `test:` prefix
  (`\btest[:=]\s*`), including the bare value-forcing forms, which became
  `test:r=100`, `test:r1=100`, `test:r2=50`, `test:d100=100`,
  `test:d200=200`, `test:r200=150`.
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
- **Lower rank on a per-target command.** Refused twice over: the rank is a
  non-numeric argument and so is locked outright, and the dice count would
  change anyway. This closes the `defile` case, where a lower total is the
  better outcome.

## Testing

No `package.json` and no `node_modules` in this repo, so no framework is
added. Node 22 supplies `node --test`.

`revise/tape.test.js`
- record then replay returns the same values in the same order
- a `1d20` take does not consume a `1d100` value
- taking from an exhausted bucket returns `null`, so the caller rolls fresh
- `hasLeftovers` is true when the replay used fewer dice than recorded
- `startReplay` does not mutate the stored tape, so the same tape replays
  identically twice

`revise/store.test.js`
- put then get returns the record
- get past the 72h expiry returns `null`
- exceeding the size cap evicts the oldest record

Run: `node --test` (bare — a directory argument crashes on Node 22.14 Windows)

`lockedArgs`, `declaredDC` and `advantageMode` live in `revise/index.js`,
which imports discord.js, so they cannot be unit tested in this repo. Moving
them into a dependency-free module to make them testable is a larger
refactor than the fix waves have carried so far; it is the obvious next step
if these predicates grow. Until then they are verified by running the same
regexes and comparisons standalone against real command strings.

The Discord glue is verified manually in the test channel:
button visible, ownership refusal, expiry refusal, channel-permission
refusal, command-word refusal, locked-arg (rank) refusal, locked-DC refusal,
dice-count refusal, a successful mod change, a successful comment/tag
change, a successful mode-trigger change (`# aoe`), a two-step revision
chain, revising a failed roll, and revising that same failed roll a second
time (which must replay, not reroll).

## Out of scope

- Persisting the store to disk
- A staff or GM override
- Undoing or deleting a revision; the chain is append-only
- Editing the original message in place


## Chain-scoped dice tapes

**The tape belongs to a revision chain, not to a message.** `revise/store.js`
holds two maps: records keyed by message id (carrying `commandText`, `rootId`,
`userId`, `channelId`, `rootUrl`, `revisionCount`), and dice tapes keyed by the
chain's **root message id**. A first roll is its own root.

This was reached the hard way. A per-message tape leaked three separate times,
each fixed locally and each time leaving another copy to leak from:

1. An empty-tape seed could be revised repeatedly, rolling fresh dice each time.
   Fixed by storing the revision's own tape on the new record.
2. The ROOT record still held the empty tape, so clicking the original message's
   button kept rolling fresh. Fixed by writing back to the root as well.
3. **A modifier-only revision clones the tape into a sibling record.** `10` ->
   `11` -> `12` mints siblings that each hold the pre-add tape. Buy a risky die
   from each and you get an independent roll of the same die per sibling.
   Measured against the real modules: six siblings, six distinct values, best
   99 against the honest 40. On `charge # release (N)` it is pure upside.

Leaks 1 and 2 were symptoms; the cause is that a revision **forks** the record
graph rather than extending a line, so any per-record tape has copies. One tape
per chain has no copies. `putTape` keeps the chain's original `createdAt`, so
growing the tape does not buy another TTL.

**A record whose chain tape is missing is treated as expired**, not as "rolled
no dice". The other reading would hand out fresh dice for a roll whose original
dice are still on screen.

### Refusal wording

`DICE_MISMATCH` covers only the "fewer dice" direction now. It also fires on an
edit that changed nothing: once a chain has added dice, the original message's
button still prefills the original command, which uses fewer dice than the
chain holds. The message therefore explains the chain instead of blaming the
edit, and points the player at the most recent version.
