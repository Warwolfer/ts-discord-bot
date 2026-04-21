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
