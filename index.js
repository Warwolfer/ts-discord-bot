const { Client, Collection, GatewayIntentBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ModalBuilder, TextInputBuilder, ButtonStyle, TextInputStyle, MessageFlags } = require('discord.js');
const fs = require('node:fs');
const http = require('node:http');
require('dotenv').config();

// --- Environment Variable Setup ---
// Destructure variables from .env for clarity and to catch missing ones early.
const { DISCORD_TOKEN, PREFIX, XF_KEY } = process.env;

if (!DISCORD_TOKEN || !PREFIX || !XF_KEY) {
    console.error("CRITICAL ERROR: A required environment variable (DISCORD_TOKEN, PREFIX, or XF_KEY) is missing. Please check your .env file.");
    process.exit(1); // Exit the process if critical configuration is missing.
}

// --- Bot Configuration Constants ---
// Placing IDs in arrays makes them much easier to manage than a long if-statement.
const ALLOWED_CHANNEL_IDS = [
    "986116131397963846", // Example: lfg-posts
    "986111816910389298", // Example: bot-spam
    "354439652515643392", // Example: another-bot-channel
    "986116196699082773", // Example: general-bot-commands
    "810331850429562912", // The channel mentioned in your original error message
];

const ALLOWED_CATEGORY_IDS = [
    "993010475350622268", // Example: Roleplay Channels
    "986109926843764776", // Example: OOC Channels
    "810332475208892436", // Example: Bot Category
];

// --- Client Instantiation ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // CRITICAL: This intent is required for the bot to read message content.
    ]
});

// --- Command Loading ---
client.commands = new Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command.name) {
        client.commands.set(command.name, command);
        console.log(`[Command Loader] Loaded: ${command.name}`);
    }
}

// --- Helper Functions ---
/**
 * Checks if a command can be used in the given message's channel.
 * @param {import('discord.js').Message} message - The message object.
 * @returns {boolean} - True if the command is allowed, false otherwise.
 */
function canUseCommandInChannel(message) {
    const { channel } = message;
    if (ALLOWED_CHANNEL_IDS.includes(channel.id)) return true;
    if (ALLOWED_CATEGORY_IDS.includes(channel.parentId)) return true;
    if (channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread) return true;
    return false;
}

// --- Client Event Handlers ---

client.once('ready', () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
});

client.on('guildMemberAdd', member => {
    try {
        const unverifiedRoleId = '986786294367682610';
        member.roles.add(unverifiedRoleId);
        console.log(`[Guild Join] Assigned 'Unverified' role to ${member.user.tag}.`);
    } catch (error) {
        console.error(`Failed to assign role to new member ${member.user.tag}:`, error);
    }
});

/**
 * This is the main handler for message-based commands like `r.js`.
 * It's designed to be clean, efficient, and compatible with the modular command structure.
 */
client.on('messageCreate', message => {
    // 1. Initial Filtering: Ignore messages from bots, DMs, or those without the correct prefix.
    if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) {
        return;
    }

    // 2. Permission Check: Use the helper function to see if commands are allowed here.
    if (!canUseCommandInChannel(message)) {
        // Silently ignoring is often better than replying, to prevent spam.
        return;
    }

    // 3. Argument Parsing
    // Using a regex for split handles multiple spaces gracefully (e.g., "?r  attack").
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // Ignore messages that are only the prefix (e.g., "?")
    if (!commandName) return;

    // 4. Command Lookup
    const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

    if (!command) {
        // Don't log here unless you want to see every failed command attempt
        return;
    }

    // 5. Command Execution
    try {
        console.log(`[DEBUG] Executing command: "${command.name}" for user ${message.author.tag} with args: [${args.join(', ')}]`);
        
        // <<< FIX HERE
        // Pass both `message` and `args` to the command file.
        // Commands that don't need `args` will simply ignore it without error.
        command.execute(message, args);

    } catch (error) {
        console.error("Error during command execution:", error);
        message.reply('There was an error trying to execute that command! Please contact a server admin.').catch(console.error);
    }
});

// Your interaction handler is already very good, so it remains largely the same.
client.on('interactionCreate', async interaction => {
    console.log(`[DEBUG] Interaction received: type=${interaction.type}, customId=${interaction.customId}, isButton=${interaction.isButton()}`);
    // This top-level filter is efficient.
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;

    // --- MODAL SUBMIT LOGIC ---
    if (interaction.isModalSubmit()) {
        if (interaction.customId === "lfgpost") {
            try {
                const threadlink = interaction.fields.getTextInputValue('threadlink');
                const howmany = interaction.fields.getTextInputValue('howmany');
                const op = interaction.user.id;
                const threaddesc = interaction.fields.getTextInputValue('threaddesc');
                const postchannelId = '986116131397963846';

                const formatted = new EmbedBuilder()
                    .setTitle('LFG Post')
                    .setColor('#5865F2')
                    .setDescription(`${threaddesc}\n\n[Link to Thread/Character](${threadlink})`)
                    .addFields(
                        { name: 'Submitted by/Contact', value: `<@${op}>`, inline: true },
                        { name: 'Looking for', value: `${howmany} more`, inline: true }
                    )
                    .setTimestamp();

                await interaction.reply({ content: 'Your LFG post has been submitted successfully!', flags: MessageFlags.Ephemeral });

                const channel = interaction.guild.channels.cache.get(postchannelId);
                if (channel) {
                    const sentMessage = await channel.send({ embeds: [formatted] });
                    await sentMessage.pin().catch(e => console.error("Failed to pin LFG message:", e));
                }
            } catch (e) {
                console.error("LFG Modal submission error:", e);
                await interaction.reply({ content: 'An error occurred while submitting your post. Please try again.', flags: MessageFlags.Ephemeral }).catch(()=>{});
            }
        }
        return; // End execution
    }

    // --- BUTTON INTERACTION LOGIC ---
    if (interaction.customId === 'copy_result') {
        try {
            const embed = interaction.message.embeds[0];
            if (!embed) {
                return interaction.reply({ content: 'No result found.', flags: MessageFlags.Ephemeral });
            }
            let lines = [];
            if (embed.title) lines.push(`[b]${embed.title}[/b]`);
            if (embed.description) {
                let desc = embed.description;
                // Convert inline code `...` to [icode]...[/icode]
                desc = desc.replace(/`([^`]+)`/g, '[icode]$1[/icode]');
                // Convert bold **...** to [b]...[/b]
                desc = desc.replace(/\*\*([^*]+)\*\*/g, '[b]$1[/b]');
                // Convert markdown links [text](url) to [url='url']text[/url]
                desc = desc.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[url='$2']$1[/url]");
                // Convert italic *...* to [i]...[/i]
                desc = desc.replace(/\*([^*]+)\*/g, '[i]$1[/i]');
                // Convert blockquote lines (> ...) to [quote]...[/quote]
                desc = desc.replace(/\n> (.+)$/gm, '\n[quote]$1[/quote]');
                // Collapse double newlines
                desc = desc.replace(/\n\n+/g, '\n');
                lines.push(desc.trim());
            }
            const bbcode = lines.join('\n');
            // Wrap in code block so Discord doesn't re-format the BBCode
            return interaction.reply({ content: `\`\`\`\n${bbcode}\n\`\`\``, flags: MessageFlags.Ephemeral });
        } catch (e) {
            console.error('[copy_result] Error:', e);
            return interaction.reply({ content: 'Failed to copy result.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }

    if (interaction.customId === 'lfgsubmit') {
        const mymodal = new ModalBuilder().setCustomId('lfgpost').setTitle('Submit your posting');
        const number = new TextInputBuilder().setCustomId('howmany').setLabel('How many more people? (e.g., 1, 2, 4+)').setStyle(TextInputStyle.Short);
        const link = new TextInputBuilder().setCustomId('threadlink').setLabel('Link to your thread or character').setStyle(TextInputStyle.Paragraph);
        const desc = new TextInputBuilder().setCustomId('threaddesc').setLabel('Description & Expectations').setStyle(TextInputStyle.Paragraph);
        mymodal.addComponents(new ActionRowBuilder().addComponents(number), new ActionRowBuilder().addComponents(link), new ActionRowBuilder().addComponents(desc));
        await interaction.showModal(mymodal);
    }

    if (interaction.customId === 'verify') {
        try {
            const response = await fetch(`https://terrarp.com/api/terrasphere-charactermanager/?id=${interaction.member.displayName}`, {
                method: 'GET',
                headers: { 'Xf-Api-Key': XF_KEY }
            });
            const info = await response.json();

            if (info.username && interaction.member.displayName.toLowerCase() === info.username.toLowerCase() && !info.is_sub_account) {
                const success = new EmbedBuilder().setTitle('Verification Success!').setColor('#4afc55').setThumbnail('https://sekai-res.dnaroma.eu/file/sekai-en-assets/stamp/stamp0001_rip/stamp0001/stamp0001.png').setDescription(`You have been granted the **Member** role and can now access the rest of the server.`).addFields({ name: 'What now?', value: `Hello new sprout! Welcome to Terrasphere!\n\nYour next step is to make your first character! Feel free to post in the <#986113414390747178> or <#986143936521322506> channels if you need assistance.\n\nHere are some helpful links to get started: :arrow_down:` });
                const links = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Forum').setStyle(ButtonStyle.Link).setURL('https://terrarp.com/'), new ButtonBuilder().setLabel('Wiki').setStyle(ButtonStyle.Link).setURL('https://terrarp.com/wiki/Main_Page'), new ButtonBuilder().setLabel('Startup Guide').setStyle(ButtonStyle.Link).setURL('https://terrarp.com/wiki/Startup_Guide'));
                
                await interaction.member.roles.add('986114391709745242'); // Member
                await interaction.member.roles.remove('986786294367682610'); // Unverified
                await interaction.member.send({ embeds: [success], components: [links] });
                await interaction.reply({ content: 'Verification successful! Please check your DMs.', flags: MessageFlags.Ephemeral });

            } else {
                const fail = new EmbedBuilder().setTitle('Verification Failed').setColor('#ff6258').setThumbnail('https://sekai-res.dnaroma.eu/file/sekai-en-assets/stamp/stamp0235_rip/stamp0235/stamp0235.png').setDescription(`No OOC account found that matches **${interaction.member.displayName}**. Please either create an OOC account matching your Discord nickname, or change your nickname to match your account.`);
                await interaction.reply({ embeds: [fail], flags: MessageFlags.Ephemeral });
            }
        } catch (e) {
            console.log("Verification API error:", e);
            await interaction.reply({ content: 'An error occurred during verification. The API might be down. Please try again later.', flags: MessageFlags.Ephemeral });
        }
    }
    
    // Helper function for toggling roles
    const toggleRole = async (roleId, roleName) => {
        if (interaction.member.roles.cache.has(roleId)) {
            await interaction.member.roles.remove(roleId);
            await interaction.reply({ content: `Your **${roleName}** role has been removed.`, flags: MessageFlags.Ephemeral });
        } else {
            await interaction.member.roles.add(roleId);
            await interaction.reply({ content: `You now have the **${roleName}** role!`, flags: MessageFlags.Ephemeral });
        }
    };

    const roleToggles = {
        'lfg': ['986266145235566643', 'Open for RP'],
        'rookie': ['986266394117165076', 'New to TS'],
        'lion': ['986269964132560977', 'Lion Arms'],
        'mit': ['986270041148383253', 'MIT'],
        'explorer': ['986270131988603000', 'Explorers League'],
        'adventurer': ['986270210241736736', 'Adventurers Guild'],
    };

    if (roleToggles[interaction.customId]) {
        await toggleRole(...roleToggles[interaction.customId]);
    }
});


// --- Login and Uptime Server ---
client.login(DISCORD_TOKEN);

// This is a common method to keep bots online on platforms like Replit or Glitch.
const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot is alive!");
});

server.listen(3000, () => {
    console.log("Uptime server is listening on port 3000.");
});