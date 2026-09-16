# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Discord.js v14 bot for the Sphera RPG tabletop game. The bot provides dice rolling commands and game mechanics calculations through Discord messages. The bot uses a modular architecture with the main coordinator (`r.js`) routing commands to specialized handler modules for 70+ different RPG commands.

## Architecture

### Core Structure

The bot uses a modular architecture with separated concerns:

```
ts-discord-bot/
├── r.js                    # Main coordinator (142 lines)
├── constants.js            # Game constants and lookup arrays (~120 lines)
├── helpers.js              # Utility functions (~150 lines)
├── handlers/
│   ├── generic.js          # Generic rolls and version (~50 lines)
│   ├── basic.js            # Basic & utility actions (~75 lines)
│   ├── offense.js          # Offensive actions (~1,230 lines)
│   ├── defense.js          # Defense actions (~500 lines)
│   ├── support.js          # Healing/buff actions (~910 lines)
│   └── alter.js            # Passive/alter abilities (~2,150 lines)
├── revise/
│   ├── index.js            # Revise button + modal glue
│   ├── tape.js             # Dice tape: record and replay
│   ├── store.js            # Revisable-roll records + per-chain dice tapes (72h)
│   ├── components.js       # Copy Result + Revise Command button row
│   └── captureAdapter.js   # Collects a reply payload without sending
└── commands/
    ├── commandHandlers.js  # Command name to handler map + resolveHandler
    ├── parseCommand.js     # parseCommandString, dependency free
    └── runRoll.js          # Shared roll entry point
```

**Module Responsibilities:**

1. **constants.js** - Game rule constants and action lookups
   - `RANK_DATA`: Mastery rank stats (E through S) with bonuses, modifiers, and thresholds
   - `WEAPON_RANK_DATA`: Weapon rank stats (E through S)
   - `attackActions`: Array of all attack action commands (for passive tag detection)
   - `supportActions`: Array of all support action commands (for passive tag detection)
   - Environment variables: PREFIX, channel/category IDs
   - These constants are the single source of truth for game balance

2. **helpers.js** - Utility functions
   - `roll(min, max)`: Random number generation
   - `parseArguments(content)`: Extracts command args and comments from messages
   - `parseModifiers(args, startIndex)`: Parses numerical modifiers
   - `getRankData(rankArg, rankType)`: Retrieves rank statistics
   - `checkPermissions(message)`: Validates channel access
   - `sendReply(message, embed, comment)`: Sends formatted embeds and deletes user commands after 5 seconds
   - `getPassiveModifiers(actionType, commentString)`: Detects passive ability tags in comments (display only)

3. **handlers/generic.js** - Generic roll and version
   - `handleGenericRoll`: Handles XdY dice notation (e.g., `2d6`, `1d100`)
   - `handleVersion`: Displays bot version

4. **handlers/basic.js** - 3 basic and utility action handlers
   - Basic actions: `handleAttack`, `handleRush`
   - Utility: `handleRange`

5. **handlers/offense.js** - 11 offensive action handlers
   - Attack variants: `handleBurst`, `handleSneak`, `handleCritical`
   - Combat styles: `handleSharp`, `handleReckless`
   - Specialist attacks: `handleAreaEffect`, `handleDuelist`, `handleSharpshooter`
   - Reactive: `handleStable`
   - Passive bonuses: `handleLethal`, `handleSwift`

6. **handlers/defense.js** - 8 defensive action handlers
   - Protection: `handleProtect`, `handleUltraProtect`, `handleCover`, `handleSturdy`
   - Reactive: `handleCounter`, `handleUltraCounter`, `handleTaunt`
   - Offensive-defense: `handleTorment`

7. **handlers/support.js** - 12 support/healing/buff handlers
   - Healing: `handleHeal`, `handlePowerHeal`, `handleRevive`, `handleCleanse`
   - Buffs: `handleBuff`, `handlePowerBuff`, `handleImbue`, `handleVersatile`
   - Support actions: `handleHaste`, `handleInspire`, `handleSmite`
   - Passive bonuses: `handleBlessed`

8. **handlers/alter.js** - 35 passive ability/alter action handlers
   - Alter-Omen: `handleDefile`, `handleVitiate`
   - Alter-Dexterity: `handleMomentum`, `handleRover`, `handleAcceleration`
   - Alter-Instinct: `handleExceed`, `handleEngage`, `handleEmpower`, `handleMark`
   - Alter-Insight: `handleHyperInsight`, `handleHyperInstinct`, `handleRegenerate`, `handleInfuse`
   - Alter-Adaptability: `handleAdapt`, `handleEvolve`, `handleCoordinate`, `handleAssist`, `handleCharge`
   - Alter-Aura: `handleGuardian`, `handleAggress`, `handleSavior`
   - Alter-Battle Spirits: `handleAcrimony`, `handleOverdrive`, `handleRage`
   - Alter-Weapon Arts: `handleGift`, `handleFollowUp`
   - Alter-Summon: `handleLocomote`
   - Alter-Corrupt: `handleProfane`
   - Alter-Evoke: `handleRegalia`
   - Alter-Metamorph: `handleAnatomy`
   - Alter-Mend: `handleBestowed`
   - Alter-Praxis: `handleCombatFocus`, `handleUtilityFocus`, `handleDefenseFocus`, `handleSpeedFocus`

9. **r.js** - Main coordinator module
   - Imports all handler modules
   - Builds command lookup table mapping aliases to handlers
   - Exports Discord.js command structure with `execute(message)` function
   - Routes commands to appropriate handlers
   - Provides help system and error handling

### Custom Action Codec

`commands/custom-action-codec.js` reads the codes the build sheet produces for a
DM's custom action (a name, dice everyone takes, a save or check, and a chart of
degrees). It is **a byte-identical copy of `ts-builder/shared/custom-action-codec.js`**
in a separate git repo, so nothing enforces that but a test: `commands/custom-action-fixtures.json`
is the same file as `ts-builder/test/fixtures/custom-actions.json`, and both
suites pin the same encoded strings. Edit one copy and you must copy it across.

It has no dependencies — `CompressionStream` with a `zlib` fallback, and a
hand-rolled base64url — which matters because this repo has no `package.json`
and no `node_modules`, and `node --test` must keep working.

The handler-facing surface is `decodeAction(code)`, `matchDegree(g, total)`,
`rangeLabel(g, index)` and `diceIn(text)`: decode the payload, find the band the
total landed in, name it for the embed, and roll whatever dice the DM wrote into
that band's text.

### Command Pattern

All commands follow this structure:
```
?r <command> <args> # optional comment
```

Examples:
- `?r attack a s 10 # attacking with advantage`
- `?r 2d6 5 # generic roll with modifier`
- `?r heal c 15 # healing with C rank`
- `?r attack a s 25 # Lethal Combat Focus` - Using passive ability tags

### Critical Attack's crit ladder

`handleCritical` resolves in this order: double 100 (×7), a 100 with a 1
(Schrödinger, ×3), a lone 100 (×3), **an 85+ with a 1 (Schrödinger, the rank
multiplier)**, double 1 (World Ender), a lone 1 (crit fail), then a plain 85+
(the rank multiplier).

The fourth branch was added after a review: a natural 1 used to cancel an 85+
on the other die, which made a crit-range die pay the baseline ×1.2. The rule
is that a die reaching the crit range crits; the 1 only adds its own Nat1
event. Reckless has always worked this way for a 100 beside a 1, so the two
now agree. `ts-builder/shared/plan-result.js` states the odds as `1 - 0.84²`
= 29.4%, which is only true while this holds — change one and change both.

### Passive Ability Tag System

Attack and support actions can detect passive ability tags in comments for display purposes. The tags are **display-only** and do not calculate bonuses automatically - users must manually add bonus values as modifiers.

**Supported Tags:**
- `Lethal` - Attack actions only
- `Blessed` - Support actions only
- `Combat Focus` - Both attack and support actions (must include space)
- `NG1` - Attack and support actions (+5 modifier, already implemented in handlers)

**Tag Detection:**
The `getPassiveModifiers(actionType, commentString)` helper function detects tags in comments:
- Checks comment string for tag keywords using case-insensitive regex
- Returns array of display strings (e.g., `["Using Lethal", "Using Combat Focus"]`)
- Tags appear in embed description field
- No automatic bonus calculation - bonuses are added manually by users

**Usage Examples:**
```
?r attack a s 25 # Lethal                    // Displays "Using Lethal"
?r heal b 20 # Blessed                        // Displays "Using Blessed"
?r attack s s 30 # Lethal Combat Focus        // Displays both tags
?r buff a 15 # Combat Focus                   // Displays "Using Combat Focus"
```

**Implementation Notes:**
- Tag detection is case-insensitive
- "Combat Focus" requires space between words (not "CombatFocus")
- Tags can be combined in same comment
- Users calculate and add bonuses manually (e.g., if Lethal C gives +10, add 10 to modifiers)
- NG1 tag is already implemented with automatic +5 bonus in attack/support handlers

**Implementation Checklist - Attack Actions:**

ALL attack actions MUST call `getPassiveModifiers('attack', comment)` to detect "Lethal" and "Combat Focus" tags.

Verified implementations (✓ = implemented):
- ✓ `handleAttack` (handlers/basic.js) - Basic attack with passive tag detection
- ✓ `handleStable` (handlers/offense.js) - Stable attack with passive tag detection
- ✓ `handleBurst` (handlers/offense.js) - Burst attack with passive tag detection
- ✓ `handleSneak` (handlers/offense.js) - Sneak attack with passive tag detection
- ✓ `handleCritical` (handlers/offense.js) - Critical attack with passive tag detection
- ✓ `handleSharp` (handlers/offense.js) - Sharp attack with passive tag detection
- ✓ `handleReckless` (handlers/offense.js) - Reckless attack with passive tag detection
- ✓ `handleCounter` (handlers/defense.js) - Counter attack with passive tag detection
- ✓ `handleUltraCounter` (handlers/defense.js) - Ultra counter with passive tag detection

**Implementation Pattern for Attack Actions:**
```javascript
// After calculation string is built
const passiveTags = getPassiveModifiers('attack', comment);
const passiveDisplay = passiveTags.length > 0 ? `${passiveTags.join(', ')}\n` : '';

// In embed description
let description = `\`${calculation}\`\n${passiveDisplay}\n` + /* rest of description */;
```

**IMPORTANT:** When adding new attack actions or modifying existing ones, always verify that `getPassiveModifiers('attack', comment)` is called and the passive tags are displayed in the embed. This ensures users can see which passive abilities are active.

**Implementation Checklist - Support Actions:**

ALL support actions SHOULD call `getPassiveModifiers('support', comment)` to detect "Blessed" and "Combat Focus" tags.

Verified implementations (✓ = implemented):
- ✓ `handleHeal` (handlers/support.js) - Heal action with passive tag detection
- Support actions use the same pattern with `getPassiveModifiers('support', comment)`

### Revise Command System

Every roll embed carries a **Revise Command** button next to **Copy Result**.
It lets the original roller fix modifiers, comments, and tags without
rerolling the dice.

How the dice are preserved: `roll()` in `helpers.js` records every result into
a "dice tape" grouped by die type (`{"1-100": [47], "1-20": [14, 3]}`). The
tape plus the raw command text is saved in `revise/store.js`, keyed by the
bot's reply message id, for 72 hours. Clicking Revise opens a modal prefilled
with that command text. On submit the same handler is re-run against a
`CaptureAdapter` while `roll()` replays the recorded values, and the result is
posted as a new message linking back to the original.

Rules, all enforced in `revise/index.js`:
- Only the original roller may revise.
- The channel must still be roll-eligible. `checkPermissions` runs on both the
  button click and the modal submit, because clicking a component needs no
  SEND_MESSAGES and a channel can be locked, renamed, or moved out of the
  story category after the roll.
- `args[0]` is locked. The action word (and, for generic rolls, the dice
  notation) cannot change.
- **Every non-numeric argument is locked** when the seed rolled dice. Only
  args matching `/^-?\d+$/` may change. A rank replays the same dice but moves
  success thresholds (`SNEAK_THRESHOLDS`, `COUNTER_THRESHOLDS`), multiplier
  tiers (`CRIT_MULT_BY_RANK`), and trigger bonuses (`SNIPE_TRIG_X`), so a rank
  bump on a visible 28 or 86 is a free damage upgrade. Advantage/disadvantage
  has its own earlier, more specific refusal; both checks stay.
- The comment's `DC (n)` token is locked when the seed rolled dice. The rest of
  the comment stays editable, but `DC (60)` -> `DC (50)` would flip a visible
  Save Failure into a Save Success.
  Note the lock is deliberately partial: the same flip stays reachable by
  adding a modifier (`?r save a # DC (60)` rolling 58 -> `?r save a 5` totals
  63 and passes), and by `dc50` inside a generic roll's `args[0]`. The DC is
  the GM's number, so it is locked; a modifier is the player's own claim and
  is visible in the embed, so it is not. Do not read this lock as closing the
  failure-to-success flip in general.
- Comment **mode triggers deliberately stay editable** (`aoe`, `versatile`,
  `simulcast`, `melee`, `risky`, `snipe`, `vilify`, `release`, `ultra`). User
  ruling: forgetting to type `aoe` is exactly the mistake this feature exists
  to fix.
  **This one is a genuine, accepted gap, not a backstopped one.** Some triggers
  do change the dice count and are caught by the dice-count refusal —
  `?r defile c` (2d20) -> `# vilify` (1d20) is refused on leftovers, and
  `# release(3)` -> `# release(2)` likewise. But `aoe`/`versatile`/`simulcast`
  do NOT: `BASE_DICE` is a literal in `handleHeal` (2) and `handlePowerHeal`
  (4), and `handleBuff`/`handlePowerBuff` roll a single d100, so the trigger
  only picks a divisor and a target count. `?r heal a s # aoe` showing
  "+20 HP to 3 allies" can be revised to `?r heal a s` and become
  "+60 HP to 1 ally" on the same two dice; in `handleBuff`, dropping `aoe`
  also adds `PER_CHARGE_BONUS`. Accepted because locking it would block the
  feature's main use case, and both messages stay linked and visible in the
  channel.
- **Removing dice is refused; adding dice is allowed.** Dropping a die is how
  you would discard a result already on screen, so `cursor.hasLeftovers()`
  refuses it. Needing a die the original never rolled is fine — it is cleaner
  than rolling a separate `?r 1d100` by hand — so `cursor.take()` returns
  `null` when a bucket runs dry and `roll()` rolls a fresh one.
  The preprocessor stays skipped for those added dice, or a revision could add
  a trigger phrase and conjure the die it acts on in one edit.
- **Exception: `custom` may drop dice.** Its outcome dice belong to the degree
  the total landed in, and a modifier edit can move the total into a degree
  that rolls fewer. The base and check dice still replay from the tape, so
  nothing on screen changes; only dice from a degree that no longer applies
  are dropped. Decided in `revise/policy.js` (`mayDropDice`), which is the
  only place a per-command revise exception lives.
- **The dice tape belongs to the revision CHAIN, not to any one message.** It
  lives in `revise/store.js` keyed by the chain's root message id; records carry
  a `rootId` and no tape of their own. `currentTape` records every die a run
  uses, replayed or fresh, and the grown tape is written back to the chain in
  one place.
  This is structural, and it was arrived at the hard way. Storing the tape per
  message leaked three times: an empty seed could be re-revised, then the root
  record could, then — the one that finally forced this design — a
  modifier-only revision would **clone** the shorter tape into a sibling
  record. Mint five siblings with `10` -> `11` -> `12`, then buy a risky die
  from each, and you get five independent rolls of the same die to pick from.
  Measured: six siblings, six distinct values, best 99 against an honest 40.
  One tape per chain leaves no second copy to fork from.
  A record whose chain tape is missing is treated as **expired**, not as
  "rolled no dice" — otherwise it would hand out fresh dice for a roll whose
  originals are still on screen.
- The revised embed says `Revision added N more dice` whenever N > 0. The
  player picks how many to add *after* seeing the base roll, so it has to be
  visible to anyone reading the thread. **This is an informed decision, not a
  blind one:** on `sharp`/`reckless`, `# risky` converts 40 points of flat
  bonus into an extra d100 that joins the crit pool, and the multiplier ladder
  only climbs with more 100s. Buying crit dice once you know the base roll was
  bad is strictly better than deciding blind. Accepted deliberately, with the
  embed note as the control; `release (N)` on `charge` has the same shape.
- Zero-dice originals (a validation error, or a passive with no roll) need no
  special case any more: an empty tape simply means every die is fresh, through
  the same code path. The locked-arg and locked-DC refusals are still skipped
  there, since there is no visible result to protect and fixing a typo'd rank
  is the point.
- Advantage/disadvantage is locked. `args[1]`'s adv/dis mode may not change,
  because the dice count stays the same either way and the player would be
  picking the better of two numbers already on screen.
- Revisions chain. Every revision replays the chain's tape, so dice already on
  screen never change; the tape only ever grows, since removing is refused. The
  "Revised from" link always points at the first roll.
  One consequence worth knowing: once any revision adds dice, the ORIGINAL
  message's button still prefills the ORIGINAL command, which now uses fewer
  dice than the chain holds — so submitting it unchanged is refused. That is
  correct (you cannot drop a published die) but it looks like nothing changed,
  so `DICE_MISMATCH` explains the chain rather than blaming the edit.
- All refusals are ephemeral. Nothing is posted to the channel.
- A revision whose handler produces a validation-error embed (e.g. an invalid
  rank) reports that embed's own error text rather than the generic
  dice-count message, even when the dice count also mismatches.
- A `channel.send` that fails after `deferUpdate()` is reported with
  `followUp`, not `reply`: the defer already acknowledged the interaction, so
  the wrapper in `index.js` (guarded by `!replied && !deferred`) cannot answer
  and the user would see the modal close and nothing else.
- The modal uses `TextInputStyle.Short`. A command is one line, and
  `parseCommandString` splits on a literal space, so a newline from a Paragraph
  input would surface as "Invalid Rank" with no hint why.

The store is memory only. A bot restart clears it, and revising an older roll
then reports "This roll can no longer be revised."

**When adding a new handler:** nothing extra is needed for the button itself.
`sendReply` is the single send point for every handler, including those routed
through `finalizeAndSend`, so the button and the record land automatically.
Two things to keep in mind:
- Any `[TEST]` comment-override block **must** be guarded with
  `!isReplaying()` (from `helpers.js`), and its pattern must require the
  `test:` prefix (`\btest[:=]\s*`). Overrides run after `roll()`, so during a
  replay they leave the dice count untouched and no refusal fires — a
  revision could force a 100 onto dice already on screen. A bare keyword also
  misfires on ordinary comments: `# going for a crit` used to force a 100.
- A new threshold or multiplier keyed on a rank needs no extra protection.
  Ranks are non-numeric args, so the lock above already covers them.
- **Do not read a numeric positional argument.** `lockedArgs` filters the
  numbers out before comparing, so it is position-blind: `?r attack a s 10`
  and `?r attack 10 a s` compare equal. Nothing exploits that today, because
  no numeric string is a valid rank or flag and the reorder just fails
  downstream on `getRankData`. A handler that read, say, a target count or a
  die count from `args[2]` would slip straight through the lock. Read such a
  value from the comment instead, and make sure it drives the dice count so
  the dice-count refusal covers it — that is what `release (N)` does.
- **A multiplier amplifies the freely-editable modifier.** Modifiers stay
  editable by design, so a player who sees a ×7 can then revise a `+100` onto
  it for +700. That is the accepted cost of the feature, not a defect, but
  keep it in mind when setting a new multiplier's ceiling.

Tests: `node --test`

### `/collect` and the Roll Index

`/collect character:<name> thread:<code>` gathers every roll the bot posted
for that character and thread, in the channel it's run in, and DMs it back as
one pasteable block of forum BBCode. The rules live in small modules that
never `require("discord.js")` so they stay testable; `commands/slash/collect.js`
is glue only.

**`revise/bbcode.js` is the one embed→BBCode converter.** Copy Result
(`index.js`'s `copy_result` handler) and `/collect` both call its `toBBCode`,
so a bug fixed once stays fixed everywhere — this converter has already been
fixed twice for bugs a second copy would have kept. **The order of its
replaces is load-bearing:**
- The markdown-link replace (`[text](url)` → `[url='url']text[/url]`) runs
  *before* the bold replace, because bold running first turns
  `**(121-140)**` into `[b](121-140)[/b]`, which the link regex would then eat.
- Backslash-escaped characters — from `commands/customRoll.js`'s
  `escapeMarkdown`, which a DM's free text is run through so Discord renders
  it literally instead of as formatting — are parked behind a sentinel before
  any conversion runs, and restored only at the very end. A restored `[` is
  wrapped in XenForo's `[plain][[/plain]` rather than left bare, because the
  output here **is** BBCode, and any `[` surviving from untrusted text would
  open a real tag on the forum post. The original code un-escaped first and
  handed the plain text to the conversions and the forum's own parser, so
  `[url='http://evil.example']click me[/url]` came out live.
  **`toBBCode` only neutralises text a caller already ran through
  `escapeMarkdown`** — every caller must pass a bot-authored embed built that
  way; the function does not sanitise arbitrary input on its own.

`revise/rollIndex.js` writes `data/roll-index.jsonl` (`data/` is gitignored),
an append-only JSON Lines index so `/collect` can usually answer from a file
read instead of crawling the channel. It's appended to from `sendReply`
(`helpers.js`, for every stored roll) and from `revise/index.js` (for a posted
revision — see below), and pruned to 14 days. **Pruning is started only from
the root `index.js`'s `ready` handler, never at import** — a module that
starts an hourly `setInterval` at require time keeps `node --test` alive
forever. Tags are capped at 20 entries of 100 characters each (`capTags`):
there's no length cap on a roll comment anywhere upstream, so without this a
single entry's tags could grow a line past the point where the `appendFile`
write is still atomic.

**`/collect` defers its reply before doing anything else**
(`interaction.deferReply`), because the channel scan it falls back to (up to
three pages of 100 messages) routinely outlives Discord's three-second
interaction deadline.

**Revisions are indexed too, carrying `supersedes`.** `revise/index.js`
appends an index entry for a posted revision the same way `sendReply` indexes
an original roll, naming the replaced message id in `supersedes`. Without
this, `/collect`'s index fast path would keep handing out the roll a revision
just replaced, forever — only `sendReply`'s sends were ever indexed, so the
corrected roll would never surface. Reading the index, `collectCore.js` first
runs `dedupeByMessageId` (first occurrence per `messageId` wins — repairs an
index doubled by two overlapping scans) and then `dropSuperseded`, which
collects every `supersedes` value into a set and drops any entry whose
`messageId` is in it, collapsing a revision chain down to its newest entry. It
only looks within the entries it's given, so a message superseded by an entry
outside this query's matches is left alone.

**An incomplete channel scan is never written back to the index.**
`scanChannel` in `commands/slash/collect.js` returns `{hits, complete}`;
`complete` is false when a page fetch fails partway through, which makes
`hits` a partial set. `/collect` only appends a completed scan's hits to the
index — writing a partial result would make every later `/collect` for that
character and thread answer from the index and never scan again, silently
truncating the result for the whole 14-day retention window. The reply still
tells the player the result may be incomplete.

### Available Roll Commands

**Generic Rolling:**
- `XdY` - Generic dice roll (e.g., `?r 2d6`, `?r 1d100`)

**Custom Actions (DM charts):**
- `custom <payload> <kind> [adv|dis] <bonus|rank> [mods...]` - Rolls a DM's custom action from the code the build sheet produced: base dice, then a save (`fortitude`, `reflex`, `will`, bonus is a number) or a check (`mastery`, `expertise`, then a rank letter), then the degree the total lands in and the dice written into that degree's text. Pure core in `commands/customRoll.js` and `commands/d100Check.js`; glue in `handlers/basic.js`. A very large chart can encode to a payload longer than Discord's 2000-character message limit, in which case the command cannot be sent at all — the build sheet is where that has to be caught, not here.

**Combat - Offensive:**
- `attack` / `atk` - Standard attack roll
- `rush` - Rush attack
- `burst` - Burst attack
- `sneak` - Sneak attack
- `critical` - Critical hit roll
- `sharp` - Sharp attack
- `reckless` - Reckless attack
- `smite` - Smite attack
- `torment` - Torment attack

**Combat - Defensive:**
- `protect` - Basic protection
- `ultraprotect` - Ultra protection
- `counter` - Counter attack
- `ultracounter` - Ultra counter
- `cover` - Cover ally
- `taunt` - Taunt enemy
- `stable` - Stability check

**Combat - Special:**
- `areaeffect` - Area effect attack
- `duelist` - Duelist ability
- `sharpshooter` - Sharpshooter ability
- `range` - Range attack
- `versatile` - Versatile attack

**Support - Healing:**
- `heal` - Basic healing
- `powerheal` - Power heal
- `revive` - Revive fallen ally
- `cleanse` - Cleanse status effects

**Support - Buffs:**
- `buff` - Basic buff
- `powerbuff` - Power buff
- `imbue` - Imbue ability
- `haste` - Haste buff
- `inspire` - Inspire buff
- `guardian` - Guardian buff
- `savior` - Savior ability

**Special Abilities:**
- `overdrive` - Overdrive mode
- `rage` - Rage ability
- `exchange` - Exchange ability
- `wagerfuture` - Wager Future ability
- `momentum` - Momentum ability
- `rover` - Rover ability
- `acceleration` - Acceleration ability
- `exceed` - Exceed ability (HP cost for bonus)
- `engage` - Engage ability (Redo or Accretion modes)
- `empower` - Empower ability (Extra bonus action)
- `mark` - Mark enemy for damage bonus
- `hyperinsight` - Grant break damage and imbue (Ultra mode available)
- `hyperinstinct` - Gain save roll bonus (Ultra mode available)
- `regenerate` - Passive HP regen (Power Regenerate mode available)
- `infuse` - Free action to heal multiple allies
- `adapt` - Passive HP boost (Prowl/Fend modes available)
- `evolve` - Passive bonus at thread start
- `coordinate` - Free action to grant modifier to targets
- `assist` - Bonus action to grant modifier to Coordinate targets
- `charge` - Passive charge pool system (Charge/Release modes available)

**Utility:**
- `version` - Display bot version

### Slash Commands

Registered by `deploy-commands.js` from `commands/slash/*.js`: `/attack`,
`/heal`, `/r` (generic dice roll), `/rush`, `/save`, and `/collect`
(`character:<name> thread:<code>` — every roll for that character and thread
in this channel, DMed as forum BBCode; see "`/collect` and the Roll Index"
above).

### Permission System

Commands are restricted to specific channels:
- Staff category channels
- Bot category channels
- Test channel
- Story category channels (if channel name includes "rolls")
- Any thread

## Development Notes

### Environment Setup

Required `.env` variables:
```
PREFIX=?
STAFF_CATEGORY_ID=
BOT_CATEGORY_ID=
STORY_CATEGORY_ID=
TEST_CHANNEL_ID=
```

### Dependencies

- `discord.js` v14
- `dotenv`

### Key Design Decisions

1. **Modular Architecture**: Code is split into 9 modules for maintainability:
   - Main coordinator (r.js) routes to specialized handlers
   - Handlers organized by function: generic, basic, offense, defense, support, alter
   - Shared utilities in helpers.js, constants in constants.js
   - Reduced main file from 5,160 lines to 142 lines
2. **Embed-Based Responses**: All output uses Discord embeds for consistent formatting
3. **Auto-Delete**: User commands are deleted after 5 seconds to reduce channel clutter
4. **Rank System**: Uses letter grades (E, D, C, B, A, S) for mastery and weapon ranks
5. **Comment Support**: Users can add `# comments` to any roll for context
6. **Passive Tag Detection**: Universal system detects passive ability tags (Lethal, Blessed, Combat Focus) for display
7. **Display-Only Tags**: Tags show what passive abilities are active without auto-calculating bonuses
8. **Revisable Rolls**: Dice results are recorded and replayed so inputs can be
   corrected after the fact without rerolling

### Common Patterns

**Adding a New Command:**
1. Determine which handler module the command belongs to based on actions.js category field:
   - category: "basic" or "utility" → handlers/basic.js
   - category: "offense" → handlers/offense.js
   - category: "defense" → handlers/defense.js
   - category: "support" → handlers/support.js
   - category: "alter" → handlers/alter.js
2. Create handler function in appropriate handlers/*.js file: `async function handleNewCommand(message, args, comment)`
3. Parse arguments and validate input
   - Do not `await` anything before the handler's dice are rolled. `runRoll` sets the roll context and then calls the handler; an `await` in between lets a concurrent roll swap the tape (see the `currentTape` comment in `helpers.js`). If you need to decode or look something up, do it synchronously — the custom action codec has `decodeActionSync` for exactly this.
4. Calculate results using helper functions and rank data from constants.js
5. Build EmbedBuilder with color-coded results
6. If attack/support action, call `getPassiveModifiers(actionType, comment)` to detect passive tags
7. Call `sendReply(message, embed, comment)`
8. Export handler from module: `module.exports = { handleNewCommand, ... }`
9. Import handler in r.js and add mapping to `commandHandlers` object
10. If attack action, add command to `attackActions` array in constants.js
11. If support action, add command to `supportActions` array in constants.js

**Rank-Based Calculations:**
- Most commands accept mastery rank (MR) and/or weapon rank (WR)
- Use `getRankData(rankArg, 'mastery')` or `getRankData(rankArg, 'weapon')`
- Validate rank data exists before proceeding
- Apply rank bonuses/modifiers to base rolls

**Dice Roll Pattern:**
- Use `roll(1, 100)` for percentile rolls
- Use `roll(min, max)` for damage/other ranges
- Display individual roll results in embed descriptions
- Show modifiers separately for transparency

## Running the Bot

This is a command module, not a standalone bot. It should be:
1. Placed in a Discord.js bot's commands directory
2. Loaded by a command handler that calls `execute(message)` on message events
3. Configured with required environment variables

Note: The repository name suggests TypeScript, but the current implementation is JavaScript (CommonJS). No build step is currently needed.