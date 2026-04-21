# Discord Slash Commands — Plan 1 (Infrastructure + Pilots)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Discord slash command support as a dual-mode alternative to `?r` prefix commands. Plan 1 delivers the infrastructure + 5 pilot commands (`/rush`, `/r`, `/attack`, `/heal`, `/save`).

**Architecture:** An `InteractionAdapter` wraps `ChatInputCommandInteraction` to quack like `Message`, letting existing handlers run unchanged. Slash command definitions live in `commands/slash/`, loaded in parallel to the existing prefix loader. Guild-scoped registration via standalone `deploy-commands.js`.

**Tech Stack:** Node.js, Discord.js v14, dotenv, existing modular handler architecture.

**Reference spec:** `docs/superpowers/specs/2026-04-21-discord-slash-commands-design.md`

**Testing approach:** This repo has no automated test suite — verification is manual via the Discord client in a test channel. Each implementation task is paired with an explicit manual verification step with expected output.

**Not to be committed:** The spec file and this plan file are artifacts of the brainstorming session; the user instructed no commits during planning. Implementation tasks below contain commit steps for future execution.

---

## Phase A: Roll Link Migration (must precede slash work)

The existing `finalizeAndSend` helper interpolates `message.url` into every embed. Slash commands have no user message and the adapter deliberately doesn't expose `.url`. Moving Roll Link to the Copy Result button is both the prerequisite for slash commands and a fix for the latent bug where prefix Roll Links point to the user's message that gets deleted after 5 seconds.

### Task 1: Remove Roll Link from `finalizeAndSend`

**Files:**
- Modify: `helpers.js`

- [ ] **Step 1: Open `helpers.js` and locate `finalizeAndSend`**

Current code (around lines 200-212):
```js
async function finalizeAndSend(message, embed, description, comment) {
    // Add comment if exists
    if (comment) {
        description += `${comment}`;
    }

    // Add roll link
    description += ` · *[Roll Link](${message.url})*`;

    // Set description and send (don't pass comment to sendReply since we already added it)
    embed.setDescription(description);
    return sendReply(message, embed);
}
```

- [ ] **Step 2: Delete the Roll Link lines**

Replace with:
```js
async function finalizeAndSend(message, embed, description, comment) {
    // Add comment if exists
    if (comment) {
        description += `${comment}`;
    }

    // Set description and send (don't pass comment to sendReply since we already added it)
    embed.setDescription(description);
    return sendReply(message, embed);
}
```

(Deleted: the two lines `// Add roll link` and `description += \` · *[Roll Link](${message.url})*\`;`)

- [ ] **Step 3: Manual verification — prefix attack**

Start the bot (or `pm2 reload` if deployed). In the test channel run:
```
?r attack a s 10
```

Expected: Attack embed appears. Description no longer contains `· *[Roll Link](...)*` at the end. The rest of the embed (title, roll breakdown, total, comment) is unchanged.

- [ ] **Step 4: Commit**

```bash
git add helpers.js
git commit -m "remove Roll Link from finalizeAndSend; migrating to Copy Result button"
```

---

### Task 2: Remove Roll Link from `handleSave`, `handleExpertise`, `handleMastery`

These three handlers inline their own `setDescription(... + Roll Link)` instead of using `finalizeAndSend`. Must strip the same way.

**Files:**
- Modify: `handlers/basic.js`

- [ ] **Step 1: Locate the three inline Roll Link lines**

In `handlers/basic.js` search for `[Roll Link]`. You will find three occurrences (one each in `handleSave`, `handleExpertise`, `handleMastery`), each of the form:

```js
embed.setDescription((embed.data.description || '') + ` · *[Roll Link](${message.url})*`);
```

- [ ] **Step 2: Delete all three lines**

Remove each of those three lines entirely. The preceding `if (comment) { ... setDescription(currentDescription + comment); }` block stays; the `return sendReply(message, embed);` that follows stays.

Example — `handleSave` before:
```js
  if (comment) {
    const currentDescription = embed.data.description || '';
    embed.setDescription(currentDescription + comment);
  }

  embed.setDescription((embed.data.description || '') + ` · *[Roll Link](${message.url})*`);

  return sendReply(message, embed);
}
```

After:
```js
  if (comment) {
    const currentDescription = embed.data.description || '';
    embed.setDescription(currentDescription + comment);
  }

  return sendReply(message, embed);
}
```

Apply the same deletion in `handleExpertise` and `handleMastery`.

- [ ] **Step 3: Manual verification — prefix save, expertise, mastery**

Restart bot. In test channel:
```
?r save adv 5 # Fortitude
?r expertise a 10 # Arcane
?r mastery b 5 # Hunter
```

Expected: All three embeds render without a trailing `· *[Roll Link](...)*`. The Fortitude / Expertise Check - Arcane / Mastery Check - Hunter titles and totals render correctly.

- [ ] **Step 4: Commit**

```bash
git add handlers/basic.js
git commit -m "remove inline Roll Link from handleSave/handleExpertise/handleMastery"
```

---

### Task 3: Append Roll Link to Copy Result button output

**Files:**
- Modify: `index.js`

- [ ] **Step 1: Locate the `copy_result` button handler**

In `index.js`, find the block starting with `if (interaction.customId === 'copy_result') {`. The logic builds a `lines` array and wraps it in a code block.

- [ ] **Step 2: Insert Roll Link line before the final return**

Find the line:
```js
const bbcode = lines.join('\n');
```

Immediately before it, add:
```js
if (interaction.message?.url) {
    lines.push(`\n[url='${interaction.message.url}']Roll Link[/url]`);
}
```

The block becomes:
```js
if (interaction.message?.url) {
    lines.push(`\n[url='${interaction.message.url}']Roll Link[/url]`);
}
const bbcode = lines.join('\n');
// Wrap in code block so Discord doesn't re-format the BBCode
return interaction.reply({ content: `\`\`\`\n${bbcode}\n\`\`\``, flags: MessageFlags.Ephemeral });
```

- [ ] **Step 3: Manual verification — Copy Result after prefix roll**

Restart bot. In test channel run:
```
?r attack a s 10 # test
```

Click the **Copy Result** button. Expected ephemeral reply: a BBCode-formatted block that ends with `[url='https://discord.com/channels/.../.../...']Roll Link[/url]`. The URL points to the bot's reply message (confirm by opening it in another client — it resolves to the embed message).

- [ ] **Step 4: Commit**

```bash
git add index.js
git commit -m "append Roll Link to Copy Result BBCode output"
```

---

## Phase B: Slash Command Infrastructure

### Task 4: Create `InteractionAdapter`

**Files:**
- Create: `adapters/interactionAdapter.js`

- [ ] **Step 1: Create the `adapters/` directory**

```bash
mkdir -p adapters
```

- [ ] **Step 2: Create `adapters/interactionAdapter.js`**

```js
// adapters/interactionAdapter.js
// Wraps a ChatInputCommandInteraction so it can be passed to handlers
// that expect a discord.js Message. Only the surface actually read by
// handlers and helpers is exposed.

class InteractionAdapter {
    constructor(interaction) {
        this.author = interaction.user;
        this.member = interaction.member;
        this.channel = interaction.channel;
        this._interaction = interaction;
    }

    async reply(payload) {
        return this._interaction.reply(payload);
    }

    // No user message to delete for slash invocations.
    async delete() { /* no-op */ }
}

module.exports = { InteractionAdapter };
```

- [ ] **Step 3: Sanity check require**

```bash
node -e "const { InteractionAdapter } = require('./adapters/interactionAdapter'); console.log(typeof InteractionAdapter);"
```

Expected output: `function`

- [ ] **Step 4: Commit**

```bash
git add adapters/interactionAdapter.js
git commit -m "add InteractionAdapter to bridge slash interactions to Message-shaped handlers"
```

---

### Task 5: Create shared `_choices.js`

**Files:**
- Create: `commands/slash/_choices.js`

- [ ] **Step 1: Create `commands/slash/` directory**

```bash
mkdir -p commands/slash
```

- [ ] **Step 2: Create `commands/slash/_choices.js`**

```js
// commands/slash/_choices.js
// Shared choice arrays for slash commands.

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

- [ ] **Step 3: Sanity check**

```bash
node -e "const { RANK_CHOICES } = require('./commands/slash/_choices'); console.log(RANK_CHOICES.length);"
```

Expected output: `6`

- [ ] **Step 4: Commit**

```bash
git add commands/slash/_choices.js
git commit -m "add shared RANK_CHOICES for slash command definitions"
```

---

### Task 6: Create `/rush` (simplest pilot)

**Files:**
- Create: `commands/slash/rush.js`

- [ ] **Step 1: Create `commands/slash/rush.js`**

```js
// commands/slash/rush.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const basicHandlers = require('../../handlers/basic');
const { InteractionAdapter } = require('../../adapters/interactionAdapter');
const { checkPermissions } = require('../../helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rush')
        .setDescription('Bonus Action: Rush — gain 2 extra movements this cycle'),

    async execute(interaction) {
        const adapter = new InteractionAdapter(interaction);
        if (!checkPermissions(adapter)) {
            return interaction.reply({
                content: 'This command is not allowed in this channel.',
                flags: MessageFlags.Ephemeral
            });
        }
        await basicHandlers.handleRush(adapter, ['rush'], '');
    }
};
```

- [ ] **Step 2: Sanity check require**

```bash
node -e "const r = require('./commands/slash/rush'); console.log(r.data.name, typeof r.execute);"
```

Expected output: `rush function`

- [ ] **Step 3: Commit**

```bash
git add commands/slash/rush.js
git commit -m "add /rush slash command (pilot)"
```

---

### Task 7: Add slash command loader to `index.js`

**Files:**
- Modify: `index.js`

- [ ] **Step 1: Locate the existing prefix loader**

In `index.js`, find the block:
```js
client.commands = new Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command.name) {
        client.commands.set(command.name, command);
        console.log(`[Command Loader] Loaded: ${command.name}`);
    }
}
```

- [ ] **Step 2: Add the slash loader immediately after**

After the existing prefix loader block, add:
```js
// --- Slash Command Loading ---
client.slashCommands = new Collection();
const slashDir = './commands/slash';
if (fs.existsSync(slashDir)) {
    for (const file of fs.readdirSync(slashDir)) {
        if (!file.endsWith('.js') || file.startsWith('_')) continue;
        const cmd = require(`${slashDir}/${file}`);
        client.slashCommands.set(cmd.data.name, cmd);
        console.log(`[Slash Loader] Loaded: /${cmd.data.name}`);
    }
}
```

- [ ] **Step 3: Manual verification — restart bot**

Restart the bot. Look for log output:
```
[Slash Loader] Loaded: /rush
```

Confirm the bot starts without errors. Slash commands will not be invokable yet (router not wired).

- [ ] **Step 4: Commit**

```bash
git add index.js
git commit -m "add slash command file loader"
```

---

### Task 8: Add interaction router branch to `index.js`

**Files:**
- Modify: `index.js`

- [ ] **Step 1: Locate the existing `interactionCreate` handler**

Find the line `client.on('interactionCreate', async interaction => {` and the filter that follows:
```js
if (!interaction.isButton() && !interaction.isModalSubmit()) return;
```

- [ ] **Step 2: Insert slash command branch BEFORE the filter**

Replace that filter section with:
```js
client.on('interactionCreate', async interaction => {
    console.log(`[DEBUG] Interaction received: type=${interaction.type}, customId=${interaction.customId}, isButton=${interaction.isButton()}`);

    // --- Slash Command Routing ---
    if (interaction.isChatInputCommand()) {
        const cmd = client.slashCommands.get(interaction.commandName);
        if (!cmd) return;
        try {
            await cmd.execute(interaction);
        } catch (err) {
            console.error(`Slash command /${interaction.commandName} error:`, err);
            const errMsg = { content: 'An error occurred while executing this command.', flags: MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errMsg).catch(() => {});
            } else {
                await interaction.reply(errMsg).catch(() => {});
            }
        }
        return;
    }

    // This top-level filter is efficient.
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;
```

(Keep everything after this filter unchanged — the existing button/modal logic stays.)

- [ ] **Step 3: Manual verification — restart bot**

Restart bot. Look for log output confirming both loaders ran:
```
[Command Loader] Loaded: r
[Slash Loader] Loaded: /rush
Ready! Logged in as ...
```

Slash commands still aren't visible in Discord yet (not deployed).

- [ ] **Step 4: Commit**

```bash
git add index.js
git commit -m "route isChatInputCommand interactions to loaded slash commands"
```

---

### Task 9: Create `deploy-commands.js`

**Files:**
- Create: `deploy-commands.js`

**Prerequisite:** `.env` must contain `CLIENT_ID` (Discord bot Application ID) and `GUILD_ID` (target server ID) alongside the existing `DISCORD_TOKEN`.

- [ ] **Step 1: Create `deploy-commands.js` at repo root**

```js
// deploy-commands.js
// Standalone admin script. Run whenever slash command schemas change:
//   node deploy-commands.js
// Bot process does NOT need to run this.

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
    try {
        const data = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );
        console.log(`Registered ${data.length} slash commands to guild ${GUILD_ID}.`);
    } catch (err) {
        console.error('Deploy failed:', err);
        process.exit(1);
    }
})();
```

- [ ] **Step 2: Add required `.env` entries**

Ensure `.env` contains (replace with your real values):
```
CLIENT_ID=123456789012345678
GUILD_ID=987654321098765432
```

- [ ] **Step 3: Run the deploy script**

```bash
node deploy-commands.js
```

Expected output:
```
Registered 1 slash commands to guild 987654321098765432.
```

(Exactly 1 because only `/rush` exists so far.)

- [ ] **Step 4: Manual verification — `/rush` in Discord**

In the test channel, type `/`. Autocomplete should show `/rush` with the description "Bonus Action: Rush — gain 2 extra movements this cycle".

Invoke `/rush`. Expected: Rush embed appears with title "(BA) Rush", description "Gain 2 extra movements this cycle." Matches the output of `?r rush` exactly (minus Roll Link which was moved to Copy Result).

- [ ] **Step 5: Manual verification — prefix still works**

In the test channel: `?r rush`. Expected: identical embed. Confirms dual-mode working.

- [ ] **Step 6: Commit**

```bash
git add deploy-commands.js
git commit -m "add deploy-commands.js for guild-scoped slash command registration"
```

---

## Phase C: Remaining Pilot Commands

### Task 10: Create `/r` (generic XdY)

**Files:**
- Create: `commands/slash/r.js`

- [ ] **Step 1: Create `commands/slash/r.js`**

```js
// commands/slash/r.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const genericHandlers = require('../../handlers/generic');
const { InteractionAdapter } = require('../../adapters/interactionAdapter');
const { checkPermissions } = require('../../helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('r')
        .setDescription('Generic dice roll: XdY, XdYkhN (keep highest), XdYklN (keep lowest)')
        .addStringOption(o => o.setName('dice')
            .setDescription('Dice notation: 1d20, 2d6, 2d20kh1, 4d6kl1')
            .setRequired(true))
        .addStringOption(o => o.setName('mods')
            .setDescription('Numeric modifiers, space-separated (e.g. "5 -3 2")'))
        .addStringOption(o => o.setName('comment')
            .setDescription('Flavor text or tags')),

    async execute(interaction) {
        const adapter = new InteractionAdapter(interaction);
        if (!checkPermissions(adapter)) {
            return interaction.reply({
                content: 'This command is not allowed in this channel.',
                flags: MessageFlags.Ephemeral
            });
        }

        const dice = interaction.options.getString('dice');
        const mods = interaction.options.getString('mods');
        const comment = interaction.options.getString('comment');

        // NOTE: handleGenericRoll reads args[0] as the dice notation (not a sub-command name).
        // The prefix path works this way because generic rolls aren't in commandHandlers,
        // so the main router passes the full args with dice at index 0.
        const args = [dice];
        if (mods) args.push(...mods.trim().split(/\s+/));

        const formattedComment = comment ? `\n> *${comment}*` : '';

        await genericHandlers.handleGenericRoll(adapter, args, formattedComment);
    }
};
```

- [ ] **Step 2: Redeploy and verify**

```bash
node deploy-commands.js
```

Expected output: `Registered 2 slash commands to guild ...`

In test channel: `/r dice:2d20kh1 mods:"5 -3" comment:"advantage test"`

Expected embed: title "Dice Roll", calculation `2d20kh1 (<X>, ~<Y>) + 5 + -3`, total correct, comment rendered as blockquote italic.

- [ ] **Step 3: Commit**

```bash
git add commands/slash/r.js
git commit -m "add /r generic slash command with kh/kl support"
```

---

### Task 11: Create `/attack`

**Files:**
- Create: `commands/slash/attack.js`

- [ ] **Step 1: Create `commands/slash/attack.js`**

```js
// commands/slash/attack.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const basicHandlers = require('../../handlers/basic');
const { InteractionAdapter } = require('../../adapters/interactionAdapter');
const { checkPermissions } = require('../../helpers');
const { RANK_CHOICES } = require('./_choices');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('attack')
        .setDescription('Standard attack roll (1d100 + MR + WR + mods)')
        .addStringOption(o => o.setName('mr')
            .setDescription('Mastery Rank')
            .setRequired(true)
            .addChoices(...RANK_CHOICES))
        .addStringOption(o => o.setName('wr')
            .setDescription('Weapon Rank')
            .setRequired(true)
            .addChoices(...RANK_CHOICES))
        .addStringOption(o => o.setName('mods')
            .setDescription('Numeric modifiers, space-separated (e.g. "5 -3 2")'))
        .addStringOption(o => o.setName('comment')
            .setDescription('Flavor text + tags (Lethal, NG1, Combat Focus, break type)')),

    async execute(interaction) {
        const adapter = new InteractionAdapter(interaction);
        if (!checkPermissions(adapter)) {
            return interaction.reply({
                content: 'This command is not allowed in this channel.',
                flags: MessageFlags.Ephemeral
            });
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

- [ ] **Step 2: Redeploy and verify**

```bash
node deploy-commands.js
```

Expected: `Registered 3 slash commands to guild ...`

In test channel:
```
/attack mr:A wr:S mods:10 comment:Lethal NG1
```

Expected embed:
- Title: `Attack` (or with break-type suffix if "physical"/"elemental" appeared in comment)
- Calculation line shows `1d100 (X) + <A value> (MR-A) + <S value> (WR-S) + 10 + 5` — the `+ 5` is NG1's auto-bonus
- "Using Lethal, Using Combat Focus" NOT shown for this comment (no "Combat Focus" phrase); "Using Lethal" IS shown
- Total calculated correctly
- Blockquote shows `Lethal NG1` italicized

- [ ] **Step 3: Side-by-side parity check**

Run in order:
```
?r attack a s 10 # Lethal NG1
/attack mr:A wr:S mods:10 comment:Lethal NG1
```

Expected: both embeds are identical except invocation style. Same title, same calculation, same tag displays, same total range.

- [ ] **Step 4: Commit**

```bash
git add commands/slash/attack.js
git commit -m "add /attack slash command"
```

---

### Task 12: Create `/heal`

**Files:**
- Create: `commands/slash/heal.js`

- [ ] **Step 1: Create `commands/slash/heal.js`**

```js
// commands/slash/heal.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const supportHandlers = require('../../handlers/support');
const { InteractionAdapter } = require('../../adapters/interactionAdapter');
const { checkPermissions } = require('../../helpers');
const { RANK_CHOICES } = require('./_choices');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('heal')
        .setDescription('Healing action (MR + WR based)')
        .addStringOption(o => o.setName('mr')
            .setDescription('Mastery Rank')
            .setRequired(true)
            .addChoices(...RANK_CHOICES))
        .addStringOption(o => o.setName('wr')
            .setDescription('Weapon Rank')
            .setRequired(true)
            .addChoices(...RANK_CHOICES))
        .addStringOption(o => o.setName('mods')
            .setDescription('Numeric modifiers, space-separated (e.g. "5 -3 2")'))
        .addStringOption(o => o.setName('comment')
            .setDescription('Flavor text + tags (Blessed, NG1, Combat Focus)')),

    async execute(interaction) {
        const adapter = new InteractionAdapter(interaction);
        if (!checkPermissions(adapter)) {
            return interaction.reply({
                content: 'This command is not allowed in this channel.',
                flags: MessageFlags.Ephemeral
            });
        }

        const mr = interaction.options.getString('mr');
        const wr = interaction.options.getString('wr');
        const mods = interaction.options.getString('mods');
        const comment = interaction.options.getString('comment');

        const args = ['heal', mr, wr];
        if (mods) args.push(...mods.trim().split(/\s+/));

        const formattedComment = comment ? `\n> *${comment}*` : '';

        await supportHandlers.handleHeal(adapter, args, formattedComment);
    }
};
```

- [ ] **Step 2: Redeploy and verify**

```bash
node deploy-commands.js
```

Expected: `Registered 4 slash commands to guild ...`

In test channel:
```
/heal mr:B wr:B comment:Blessed
```

Expected embed:
- Heal-styled embed (support color)
- "Using Blessed" displayed
- Total calculated from MR-B + WR-B + roll

- [ ] **Step 3: Commit**

```bash
git add commands/slash/heal.js
git commit -m "add /heal slash command"
```

---

### Task 13: Create `/save`

**Files:**
- Create: `commands/slash/save.js`

- [ ] **Step 1: Create `commands/slash/save.js`**

```js
// commands/slash/save.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const basicHandlers = require('../../handlers/basic');
const { InteractionAdapter } = require('../../adapters/interactionAdapter');
const { checkPermissions } = require('../../helpers');

const ROLL_CHOICES = [
    { name: 'Normal', value: 'normal' },
    { name: 'Advantage', value: 'adv' },
    { name: 'Disadvantage', value: 'dis' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('save')
        .setDescription('Saving throw (1d100 + mods)')
        .addStringOption(o => o.setName('roll')
            .setDescription('Roll type (default: Normal)')
            .addChoices(...ROLL_CHOICES))
        .addStringOption(o => o.setName('mods')
            .setDescription('Numeric modifiers, space-separated (e.g. "5 -3 2")'))
        .addStringOption(o => o.setName('comment')
            .setDescription('Save type keyword (fortitude/reflex/will) + NG1')),

    async execute(interaction) {
        const adapter = new InteractionAdapter(interaction);
        if (!checkPermissions(adapter)) {
            return interaction.reply({
                content: 'This command is not allowed in this channel.',
                flags: MessageFlags.Ephemeral
            });
        }

        const roll = interaction.options.getString('roll') ?? 'normal';
        const mods = interaction.options.getString('mods');
        const comment = interaction.options.getString('comment');

        const args = ['save'];
        if (roll === 'adv' || roll === 'dis') args.push(roll);
        if (mods) args.push(...mods.trim().split(/\s+/));

        const formattedComment = comment ? `\n> *${comment}*` : '';

        await basicHandlers.handleSave(adapter, args, formattedComment);
    }
};
```

- [ ] **Step 2: Redeploy and verify**

```bash
node deploy-commands.js
```

Expected: `Registered 5 slash commands to guild ...`

In test channel:
```
/save roll:Advantage mods:5 comment:Fortitude
```

Expected embed:
- Title: `Fortitude Save`
- Calculation starts with `2d100kh1 (X, Y)` showing both rolls
- `+ 5 (mods)` present
- Total correct

Also test `roll:Normal` (or omitted):
```
/save comment:Will
```

Expected: `Will Save` title, `1d100 (X)` (single roll), no mods line.

Also test `roll:Disadvantage`:
```
/save roll:Disadvantage mods:3
```

Expected: `2d100kl1` showing both rolls, kept value is the lower.

- [ ] **Step 3: Commit**

```bash
git add commands/slash/save.js
git commit -m "add /save slash command with advantage/disadvantage option"
```

---

## Phase D: Full Integration Test

### Task 14: Cross-mode parity + permission verification

No code changes — purely verification that the full Plan 1 delivery works end-to-end.

- [ ] **Step 1: Prefix regression battery**

In test channel run each and confirm no crashes, outputs render correctly (titles, calcs, totals), no `Roll Link` in description:
```
?r rush
?r 2d20kh1 5 -3 # test
?r attack a s 10 # Lethal NG1
?r heal b b # Blessed
?r save adv 5 # Fortitude
```

- [ ] **Step 2: Slash battery**

```
/rush
/r dice:2d20kh1 mods:"5 -3" comment:test
/attack mr:A wr:S mods:10 comment:Lethal NG1
/heal mr:B wr:B comment:Blessed
/save roll:Advantage mods:5 comment:Fortitude
```

Expected: every slash command produces output visually identical to its prefix counterpart (aside from Discord's "User used /command" banner that appears above slash responses).

- [ ] **Step 3: Copy Result button on both modes**

Click **Copy Result** on both the prefix `?r attack` embed and the slash `/attack` embed.

Expected: both ephemeral replies contain BBCode ending with `[url='https://discord.com/channels/...']Roll Link[/url]`. The URL in each links back to the bot's reply message (not a deleted user message).

- [ ] **Step 4: Permission rejection**

From a channel that is NOT in `STAFF_CATEGORY_ID`, `BOT_CATEGORY_ID`, `STORY_CATEGORY_ID`, or `TEST_CHANNEL_ID`, and is not a thread:
```
/attack mr:A wr:S
```

Expected: ephemeral reply `"This command is not allowed in this channel."`. The handler should NOT have been called (verify no Attack embed posted anywhere).

Run the prefix equivalent `?r attack a s` in the same disallowed channel. Expected: no response (prefix path silently returns).

- [ ] **Step 5: Mark Plan 1 complete**

If all four prior steps pass, Plan 1 is done. Do not merge into main without a deploy/PR review appropriate to your team workflow.

- [ ] **Step 6: Commit if any fixes were made during testing**

If issues surfaced and required code tweaks during Steps 1-4, commit each fix with a focused message.

---

## Out of Scope (Plan 2+)

- Remaining ~65 commands across `offense`, `defense`, `support`, `alter` handler modules
- Global (cross-guild) command registration
- Typed options for passive tags (Lethal, Blessed) — deferred per design decision
- Automated test suite introduction
- `/help` slash command
- `/version` slash command
