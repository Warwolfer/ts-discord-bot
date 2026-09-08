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
│   ├── store.js            # In-memory revisable-roll store (72h TTL)
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
- **Added dice are recorded and written back to BOTH records**, the new one and
  the root the button reads. `currentTape` records every die a run uses,
  replayed or fresh, so the stored tape is exactly what the run used. Without
  the root write-back, every click of that one button would roll the added dice
  fresh again — an unlimited reroll of exactly the dice the player chose to
  add. The tape only ever grows, since removing is refused.
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
- Revisions chain. When the seed had dice, every revision replays the same
  original tape, so the dice never drift, and the "Revised from" link always
  points at the first roll.
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

### Available Roll Commands

**Generic Rolling:**
- `XdY` - Generic dice roll (e.g., `?r 2d6`, `?r 1d100`)

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