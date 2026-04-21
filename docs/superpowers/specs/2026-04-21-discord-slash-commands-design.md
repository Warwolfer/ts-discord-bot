# Discord Slash Commands Design

**Date:** 2026-04-21
**Status:** Approved (design phase)
**Scope:** Plan 1 — infrastructure + 5 pilot commands. Remaining ~65 commands migrated in follow-up plans.

## Goal

Add Discord slash command support to the Sphera RPG bot while keeping the existing `?r` prefix commands working. Slash commands give users autocomplete, typed options, and inline descriptions — improving discoverability without retraining users.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Coexistence | Dual-mode: `?r` prefix and slash both work | No user disruption, handlers stay untouched |
| Entry bridge | Interaction adapter wraps `interaction` to look like `Message` | Minimally invasive; ~10-line adapter; all 70+ handlers work unchanged |
| Options schema | Hybrid: typed options for what handlers already branch on structurally (ranks, adv/dis); free-text `comment` for tags | Preserves full feature parity; maximizes UX wins without bloating scope |
| Response visibility | Public reply (non-ephemeral); no message deletion | Matches current UX; Discord's invocation banner is small |
| Registration | Guild-scoped via standalone `deploy-commands.js` | Instant updates during iteration; single-server bot makes global unnecessary |
| Roll Link location | Moved to Copy Result button output only | Fixes latent bug (prefix Roll Link pointed to deleted message); simpler adapter |

## Architecture

```
Existing (unchanged):                New:

messageCreate event                   interactionCreate event
      ↓                                     ↓
  r.js execute                        slashCommands.get(name).execute(interaction)
      ↓                                     ↓
  commandHandlers lookup              commands/slash/<name>.js
      ↓                                     ↓
                                      InteractionAdapter wraps interaction
                                      + builds args[]/comment from options
      ↓              ←── SAME ──→           ↓
              handlers/*.js (unchanged)
                      ↓
              helpers: sendReply, finalizeAndSend
                      ↓
              message.reply() — adapter routes to interaction.reply()
```

**Key principle:** handlers never know whether they were invoked via prefix or slash. The adapter is the only bridge.

## File Structure

**New files:**

```
ts-discord-bot/
├── deploy-commands.js              Standalone script: registers guild commands with Discord API
├── adapters/
│   └── interactionAdapter.js       InteractionAdapter class
├── commands/
│   └── slash/
│       ├── _loader.js              (internal) fs.readdirSync exporter
│       ├── _choices.js             Shared choice arrays (RANK_CHOICES)
│       ├── r.js                    /r  generic XdY roll
│       ├── attack.js               /attack
│       ├── save.js                 /save
│       ├── heal.js                 /heal
│       └── rush.js                 /rush
```

**Modified files:**

```
├── index.js                        Add slash command loader + interactionCreate router branch
├── helpers.js                      Remove Roll Link from finalizeAndSend description
├── handlers/basic.js               Remove inline Roll Link from handleSave, handleExpertise, handleMastery
```

**Unchanged:**

```
├── commands/r.js                   Prefix-mode entry point
├── handlers/*.js                   All other handlers untouched
├── constants.js                    Rank data, permissions constants
```

## Component Design

### InteractionAdapter (`adapters/interactionAdapter.js`)

Wraps a `ChatInputCommandInteraction` and exposes the exact Message surface handlers + helpers use.

**Surface audit — only these properties/methods are read from `message` in the codebase:**

| Property/method | Source |
|---|---|
| `.author` | `interaction.user` |
| `.author.displayAvatarURL()` | Same API on User |
| `.member` | `interaction.member` |
| `.member?.displayName` | Same API on GuildMember |
| `.channel` | `interaction.channel` |
| `.reply({ embeds, components })` | `interaction.reply({ embeds, components })` |
| `.delete()` | No-op (no user message to delete) |
| `.url` | **Not needed** — Roll Link moves to Copy Result button |

**Implementation:**

```js
class InteractionAdapter {
    constructor(interaction) {
        this.author = interaction.user;
        this.member = interaction.member;
        this.channel = interaction.channel;
        this._interaction = interaction;
    }
    async reply(payload) { return this._interaction.reply(payload); }
    async delete() { /* no-op */ }
}

module.exports = { InteractionAdapter };
```

### Command Definition Pattern

Each `commands/slash/<name>.js` exports `{ data, execute }`. Uses the same function name as the prefix handler it delegates to.

**Template — `/attack`:**

```js
const { SlashCommandBuilder } = require('discord.js');
const basicHandlers = require('../../handlers/basic');
const { InteractionAdapter } = require('../../adapters/interactionAdapter');
const { checkPermissions } = require('../../helpers');
const { RANK_CHOICES } = require('./_choices');
const { MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('attack')
        .setDescription('Standard attack roll (1d100 + MR + WR + mods)')
        .addStringOption(o => o.setName('mr').setDescription('Mastery Rank').setRequired(true).addChoices(...RANK_CHOICES))
        .addStringOption(o => o.setName('wr').setDescription('Weapon Rank').setRequired(true).addChoices(...RANK_CHOICES))
        .addStringOption(o => o.setName('mods').setDescription('Numeric modifiers, space-separated (e.g. "5 -3 2")'))
        .addStringOption(o => o.setName('comment').setDescription('Flavor text + tags (Lethal, NG1, Combat Focus, break type, etc.)')),

    async execute(interaction) {
        const adapter = new InteractionAdapter(interaction);
        if (!checkPermissions(adapter)) {
            return interaction.reply({ content: 'This command is not allowed in this channel.', flags: MessageFlags.Ephemeral });
        }

        const mr = interaction.options.getString('mr');
        const wr = interaction.options.getString('wr');
        const mods = interaction.options.getString('mods');
        const comment = interaction.options.getString('comment');

        const args = ['attack', mr, wr];
        if (mods) args.push(...mods.trim().split(/\s+/));

        const formattedComment = comment ? `\n> *${comment}*` : '';

        await basicHandlers.handleAttack(adapter, args, formattedComment);
    }
};
```

**Shared `commands/slash/_choices.js`:**

```js
const RANK_CHOICES = [
    { name: 'E', value: 'e' },
    { name: 'D', value: 'd' },
    { name: 'C', value: 'c' },
    { name: 'B', value: 'b' },
    { name: 'A', value: 'a' },
    { name: 'S', value: 's' }
];
module.exports = { RANK_CHOICES };
```

### Comment Formatting Parity

Prefix parser `parseArguments` wraps comments as `\n> *<text>*`. Slash commands must produce identical input so tag-detection regexes (`/\blethal\b/i`, `/\bng(\d+)\b/i`, break-type matchers, etc.) match identically.

**Rule:** slash `execute` always wraps raw comment in `\n> *${comment}*` before passing to handler. Empty string when no comment provided.

### `deploy-commands.js`

Standalone CLI script. Not imported by the bot process — runs manually after command schema changes.

```js
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.error('Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID in .env');
    process.exit(1);
}

const commands = [];
const slashDir = path.join(__dirname, 'commands', 'slash');
for (const file of fs.readdirSync(slashDir)) {
    if (!file.endsWith('.js') || file.startsWith('_')) continue;
    const cmd = require(path.join(slashDir, file));
    commands.push(cmd.data.toJSON());
}

const rest = new REST().setToken(DISCORD_TOKEN);
(async () => {
    const data = await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands }
    );
    console.log(`Registered ${data.length} slash commands to guild ${GUILD_ID}.`);
})().catch(err => {
    console.error('Deploy failed:', err);
    process.exit(1);
});
```

**Required `.env` additions:**

```
CLIENT_ID=<bot's Application ID from Discord Developer Portal>
GUILD_ID=<target server's ID — right-click server → Copy Server ID>
```

### `index.js` Changes

**Slash command loading (after existing prefix loader):**

```js
client.slashCommands = new Collection();
const slashDir = './commands/slash';
for (const file of fs.readdirSync(slashDir)) {
    if (!file.endsWith('.js') || file.startsWith('_')) continue;
    const cmd = require(`${slashDir}/${file}`);
    client.slashCommands.set(cmd.data.name, cmd);
    console.log(`[Slash Loader] Loaded: /${cmd.data.name}`);
}
```

**Interaction router — new branch at the top of `interactionCreate`:**

```js
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const cmd = client.slashCommands.get(interaction.commandName);
        if (!cmd) return;
        try {
            await cmd.execute(interaction);
        } catch (err) {
            console.error(`Slash command /${interaction.commandName} error:`, err);
            const errMsg = { content: 'An error occurred while executing this command.', flags: MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) await interaction.followUp(errMsg).catch(()=>{});
            else await interaction.reply(errMsg).catch(()=>{});
        }
        return;
    }
    // Existing button/modal handlers remain unchanged below
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;
    // ...
});
```

### Roll Link Migration to Copy Result

**Removals:**

1. `helpers.js` `finalizeAndSend` — delete the line appending `· *[Roll Link](${message.url})*`.
2. `handlers/basic.js` `handleSave`, `handleExpertise`, `handleMastery` — delete the line `embed.setDescription((embed.data.description || '') + \` · *[Roll Link](${message.url})*\`);`

**Addition in `index.js` `copy_result` button handler:**

At the end of building `lines`, append:

```js
if (interaction.message?.url) {
    lines.push(`[url='${interaction.message.url}']Roll Link[/url]`);
}
```

This sources the link from the bot's own reply message (works identically for prefix and slash invocations, no more broken links from deleted user messages).

## Pilot Command Specifications

### `/rush` (simplest — proves adapter end-to-end)

| | |
|---|---|
| Options | None |
| Args built | `['rush']` |
| Comment | `''` |
| Handler | `basicHandlers.handleRush` |

### `/r` (generic XdY)

| Option | Type | Required | Description |
|---|---|---|---|
| `dice` | string | yes | `1d20`, `2d20kh1`, `4d6kl1` |
| `mods` | string | no | `"5 -3 2"` |
| `comment` | string | no | Flavor text |

Args: `['r', dice, ...modsSplit]`
Handler: `genericHandlers.handleGenericRoll`

### `/attack`

| Option | Type | Required | Description |
|---|---|---|---|
| `mr` | choice | yes | E/D/C/B/A/S |
| `wr` | choice | yes | E/D/C/B/A/S |
| `mods` | string | no | `"5 -3"` |
| `comment` | string | no | Tags: Lethal, NG1, Combat Focus, break type |

Args: `['attack', mr, wr, ...modsSplit]`
Handler: `basicHandlers.handleAttack`

### `/heal`

Same shape as `/attack`. Tags: Blessed, NG1, Combat Focus.
Handler: `supportHandlers.handleHeal`

### `/save`

| Option | Type | Required | Description |
|---|---|---|---|
| `roll` | choice | no | Normal / Advantage / Disadvantage (default Normal) |
| `mods` | string | no | `"5 -3"` |
| `comment` | string | no | Fortitude/Reflex/Will, NG1 |

Args by `roll` value:
- Normal: `['save', ...modsSplit]`
- Advantage: `['save', 'adv', ...modsSplit]`
- Disadvantage: `['save', 'dis', ...modsSplit]`

Handler: `basicHandlers.handleSave`

## Permission Enforcement

Slash commands don't flow through `canUseCommandInChannel` (which is applied only in `messageCreate`). Each slash `execute` calls `checkPermissions(adapter)` first. On failure: ephemeral reply `"This command is not allowed in this channel."` and return without invoking handler.

`checkPermissions` reads `message.channel` → adapter provides `.channel` → works as-is.

## Testing Approach

Manual (bot has no existing test suite):

1. **Deploy smoke test** — `node deploy-commands.js` succeeds, logs `Registered 5 slash commands to guild <id>`.
2. **Prefix regression** — `?r attack a s 5 # Lethal` in test channel. Output identical to main branch.
3. **Per-pilot slash test** in test channel:
   - `/rush` → Rush embed
   - `/r dice:2d20kh1 mods:"5 -3" comment:"test"` → kh works, comment renders
   - `/attack mr:A wr:S mods:"10" comment:"Lethal NG1"` → Lethal tag displayed, NG1 bonus applied (+5)
   - `/heal mr:B wr:B comment:"Blessed"` → Blessed tag displayed
   - `/save roll:Advantage mods:"5" comment:"Fortitude"` → `2d100kh1` shown, title is "Fortitude Save"
4. **Side-by-side parity** — run `?r attack a s 10 # Lethal` and `/attack mr:A wr:S mods:10 comment:"Lethal"`. Capture both embeds. Confirm identical except for invocation style.
5. **Permission rejection** — invoke slash command from disallowed channel. Verify ephemeral rejection, handler not called.
6. **Copy Result button** — click after slash-invoked roll. Verify BBCode output includes Roll Link pointing to bot's reply URL. Click after prefix-invoked roll. Same result (previously would have pointed to deleted user message).

## Out of Scope for Plan 1

- Migrating the remaining ~65 handlers (offense: burst, sneak, critical, etc.; defense: protect, counter, etc.; support: buff, revive, etc.; alter: 35 handlers)
- Global (cross-guild) command registration
- Typed options for passive tags (kept as free-text comment per decision)
- Automated tests (bot has no existing suite; manual testing documented above)
- Migration of the `?r` help embed to a `/help` slash command

## Follow-Up Plans

After Plan 1 is validated end-to-end, follow-up plans will migrate the remaining commands in batches grouped by handler file:

- Plan 2: Remaining `basic` + all `offense` handlers (~14 commands)
- Plan 3: All `defense` handlers (~8 commands)
- Plan 4: Remaining `support` handlers (~11 commands)
- Plan 5: All `alter` handlers (~35 commands)

Each follow-up plan reuses the pattern established in Plan 1 with no further infrastructure changes.
