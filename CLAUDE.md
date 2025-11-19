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
└── handlers/
    ├── generic.js          # Generic rolls and version (~50 lines)
    ├── basic.js            # Basic & utility actions (~75 lines)
    ├── offense.js          # Offensive actions (~1,230 lines)
    ├── defense.js          # Defense actions (~500 lines)
    ├── support.js          # Healing/buff actions (~910 lines)
    └── alter.js            # Passive/alter abilities (~2,150 lines)
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
   - Alter-Adaptability: `handleAdapt`, `handleEvolve`, `handleCoordinate`, `handleAid`, `handleCharge`
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
- `aid` - Passive HP grant to Coordinate targets (Assist mode available)
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