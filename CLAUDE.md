# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Discord.js v14 bot for the Sphera RPG tabletop game. The bot provides dice rolling commands and game mechanics calculations through Discord messages. The entire bot logic is contained in a single command module (`r.js`) that handles ~40 different RPG commands.

## Architecture

### Core Structure

The bot is organized as a single Discord.js command module with these main sections:

1. **Configuration** (lines 6-13): Environment-based settings loaded from `.env`
   - `PREFIX`: Command prefix (default: `?`)
   - Channel/category IDs for permission checking (STAFF_CATEGORY_ID, BOT_CATEGORY_ID, STORY_CATEGORY_ID, TEST_CHANNEL_ID)

2. **Game Rule Constants** (lines 15-33):
   - `RANK_DATA`: Mastery rank stats (E through S) with bonuses, modifiers, and thresholds
   - `WEAPON_RANK_DATA`: Weapon rank stats (E through S)
   - These constants are the single source of truth for game balance

3. **Helper Functions** (lines 35-136):
   - `roll(min, max)`: Random number generation
   - `parseArguments(content)`: Extracts command args and comments from messages
   - `parseModifiers(args, startIndex)`: Parses numerical modifiers
   - `getRankData(rankArg, rankType)`: Retrieves rank statistics
   - `checkPermissions(message)`: Validates channel access
   - `sendReply(message, embed, comment)`: Sends formatted embeds and deletes user commands after 5 seconds

4. **Command Handlers** (lines 138-3252): 40+ async functions implementing game mechanics
   - Combat: `handleAttack`, `handleRush`, `handleCounter`, `handleBurst`, `handleCritical`, etc.
   - Defense: `handleProtect`, `handleCover`, `handleTaunt`, `handleStable`
   - Support: `handleHeal`, `handleBuff`, `handleHaste`, `handleInspire`, `handleRevive`
   - Special: `handleGenericRoll` (handles XdY dice notation)

5. **Command Lookup Table** (lines 3254-3298): Maps command aliases to handler functions

6. **Main Export** (lines 3300-3343): Discord.js command module structure
   - Command routing logic
   - Help system
   - Error handling

### Command Pattern

All commands follow this structure:
```
?r <command> <args> # optional comment
```

Examples:
- `?r attack a s 10 # attacking with advantage`
- `?r 2d6 5 # generic roll with modifier`
- `?r heal c 15 # healing with C rank`

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
- `cure` - Cure status effects

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

1. **Single File Architecture**: All logic in one file for simplicity, but at 3300+ lines this may benefit from modularization
2. **Embed-Based Responses**: All output uses Discord embeds for consistent formatting
3. **Auto-Delete**: User commands are deleted after 5 seconds to reduce channel clutter
4. **Rank System**: Uses letter grades (E, D, C, B, A, S) for mastery and weapon ranks
5. **Comment Support**: Users can add `# comments` to any roll for context

### Common Patterns

**Adding a New Command:**
1. Create handler function: `async function handleNewCommand(message, args, comment)`
2. Parse arguments and validate input
3. Calculate results using helper functions and rank data
4. Build EmbedBuilder with color-coded results
5. Call `sendReply(message, embed, comment)`
6. Add mapping to `commandHandlers` object

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