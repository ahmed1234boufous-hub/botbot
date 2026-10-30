const { 
    Client, 
    GatewayIntentBits, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');
const Datastore = require('nedb-promises');
require('dotenv').config();

// --- DATABASE SETUP ---
const db = Datastore.create({ filename: 'settings.db', autoload: true });
const levelsDb = Datastore.create({ filename: 'levels.db', autoload: true });

// --- DEFAULT EMBED CONFIGURATIONS ---
const defaultSettings = {
    ban: { title: '🔨 Member Banned', color: '#ff0000', thumbnail: '', image: '', description: 'User **{user}** has been banned.\n**Reason:** {reason}' },
    kick: { title: '👢 Member Kicked', color: '#ffa500', thumbnail: '', image: '', description: 'User **{user}** has been kicked.\n**Reason:** {reason}' },
    mute: { title: '🔇 Member Muted', color: '#ffcc00', thumbnail: '', image: '', description: 'User **{user}** has been muted.\n**Reason:** {reason}' },
    unmute: { title: '🔊 Member Unmuted', color: '#00ff00', thumbnail: '', image: '', description: 'User **{user}** has been unmuted.' },
    warn: { title: '⚠️ Member Warned', color: '#ffff00', thumbnail: '', image: '', description: 'User **{user}** has received a warning.\n**Reason:** {reason}' },
    welcome: { 
        title: '👋 Welcome to the Server!', 
        color: '#5865F2', 
        thumbnail: '', 
        image: '',
        description: 'Hey {user}, welcome to **{server}**! We are thrilled to have you here. You are member #{memberCount}.', 
        channelId: '' 
    },
    levelup: {
        title: '🎉 Level Up!',
        color: '#f1c40f',
        thumbnail: '',
        image: '',
        description: 'Congratulations {user}! You just advanced to **Level {level}**!'
    }
};

async function getConfig(key) {
    let setting = await db.findOne({ command: key });
    return setting || defaultSettings[key];
}

// Helper to open the customization modal
function createEmbedModal(key, config) {
    const modal = new ModalBuilder()
        .setCustomId(`modal_${key}`)
        .setTitle(`Customize: ${key.toUpperCase()}`);

    const titleInput = new TextInputBuilder()
        .setCustomId('embed_title')
        .setLabel('Embed Title')
        .setStyle(TextInputStyle.Short)
        .setValue(config.title || '')
        .setRequired(true);

    const colorInput = new TextInputBuilder()
        .setCustomId('embed_color')
        .setLabel('Color (Hex, e.g. #5865F2)')
        .setStyle(TextInputStyle.Short)
        .setValue(config.color || '#5865F2')
        .setRequired(true);

    const thumbInput = new TextInputBuilder()
        .setCustomId('embed_thumbnail')
        .setLabel('Thumbnail URL (Optional)')
        .setStyle(TextInputStyle.Short)
        .setValue(config.thumbnail || '')
        .setRequired(false);

    const imageInput = new TextInputBuilder()
        .setCustomId('embed_image')
        .setLabel('Image / GIF / Video URL (Optional)')
        .setStyle(TextInputStyle.Short)
        .setValue(config.image || '')
        .setRequired(false);

    const descInput = new TextInputBuilder()
        .setCustomId('embed_desc')
        .setLabel('Description Content')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(config.description || '')
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(colorInput),
        new ActionRowBuilder().addComponents(thumbInput),
        new ActionRowBuilder().addComponents(imageInput),
        new ActionRowBuilder().addComponents(descInput)
    );

    return modal;
}

// --- DISCORD CLIENT SETUP ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- REGISTER SLASH COMMANDS ---
const commands = [
    new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Embed dashboard and customization commands')
        .addSubcommand(sub => 
            sub.setName('dashboard')
               .setDescription('Open the interactive embed customization dashboard')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder()
        .setName('welcome')
        .setDescription('Configure, customize, or test the welcome message system')
        .addSubcommand(sub =>
            sub.setName('channel')
               .setDescription('Set the channel where welcome messages will be sent')
               .addChannelOption(option => option.setName('target').setDescription('The welcome channel').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('customize')
               .setDescription('Open the pop-up editor to customize the welcome embed, thumbnail, and image')
        )
        .addSubcommand(sub =>
            sub.setName('test')
               .setDescription('Test the current welcome message embed')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('level')
        .setDescription('Check your current level and XP')
        .addUserOption(option => option.setName('user').setDescription('Check another user\'s level').setRequired(false)),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a member from the server')
        .addUserOption(option => option.setName('user').setDescription('The user to ban').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for the ban').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member from the server')
        .addUserOption(option => option.setName('user').setDescription('The user to kick').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for the kick').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Timeout/mute a member')
        .addUserOption(option => option.setName('user').setDescription('The user to mute').setRequired(true))
        .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes (default 60)').setRequired(false))
        .addStringOption(option => option.setName('reason').setDescription('Reason for the mute').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove timeout from a member')
        .addUserOption(option => option.setName('user').setDescription('The user to unmute').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Issue a warning embed to a member')
        .addUserOption(option => option.setName('user').setDescription('The user to warn').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for warning').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`[Discord] Logged in as ${client.user.tag}!`);

    client.user.setPresence({
        activities: [{ name: 'Over your server 🛡️', type: 3 }],
        status: 'online',
    });

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

async function buildEmbed(key, variables) {
    const config = await getConfig(key);
    let desc = config.description;
    
    for (const [valKey, val] of Object.entries(variables)) {
        desc = desc.replace(new RegExp(`\\{${valKey}\\}`, 'g'), val);
    }

    const embed = new EmbedBuilder()
        .setTitle(config.title)
        .setColor(config.color)
        .setDescription(desc)
        .setTimestamp();

    if (config.thumbnail && config.thumbnail.startsWith('http')) embed.setThumbnail(config.thumbnail);
    if (config.image && config.image.startsWith('http')) embed.setImage(config.image);

    return embed;
}

client.on('guildMemberAdd', async (member) => {
    const config = await getConfig('welcome');
    if (!config.channelId) return;

    const channel = member.guild.channels.cache.get(config.channelId);
    if (!channel) return;

    const embed = await buildEmbed('welcome', {
        user: `<@${member.id}>`,
        server: member.guild.name,
        memberCount: member.guild.memberCount
    });

    await channel.send({ content: `<@${member.id}>`, embeds: [embed] });
});

const xpCooldowns = new Map();

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const userId = message.author.id;
    const guildId = message.guild.id;
    const cooldownKey = `${guildId}-${userId}`;

    const now = Date.now();
    if (xpCooldowns.has(cooldownKey) && now < xpCooldowns.get(cooldownKey)) return;
    xpCooldowns.set(cooldownKey, now + 60000);

    const xpToAdd = Math.floor(Math.random() * 11) + 15;
    let userLevelData = await levelsDb.findOne({ userId, guildId });

    if (!userLevelData) {
        userLevelData = { userId, guildId, xp: 0, level: 0 };
    }

    userLevelData.xp += xpToAdd;
    const neededXp = (userLevelData.level + 1) * 100;

    if (userLevelData.xp >= neededXp) {
        userLevelData.level += 1;
        userLevelData.xp -= neededXp;

        const embed = await buildEmbed('levelup', {
            user: `<@${userId}>`,
            level: userLevelData.level
        });

        await message.channel.send({ content: `<@${userId}>`, embeds: [embed] });
    }

    await levelsDb.update({ userId, guildId }, userLevelData, { upsert: true });
});

client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName, options } = interaction;

            if (commandName === 'embed') {
                const sub = options.getSubcommand();
                if (sub === 'dashboard') {
                    const embed = new EmbedBuilder()
                        .setTitle('🛡️ Bot Embed Customization Dashboard')
                        .setColor('#5865F2')
                        .setDescription('Select any command or module from the dropdown menu below to fully customize its title, color, thumbnail, image, and description.')
                        .setTimestamp();

                    const row = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('dashboard_select')
                            .setPlaceholder('Choose a command/module to customize...')
                            .addOptions([
                                { label: 'Welcome Module', value: 'edit_welcome', description: 'Customize greeting embed, thumbnail, and image' },
                                { label: 'Level Up Module', value: 'edit_levelup', description: 'Customize level up notification embed' },
                                { label: 'Ban Command', value: 'edit_ban', description: 'Customize the ban embed' },
                                { label: 'Kick Command', value: 'edit_kick', description: 'Customize the kick embed' },
                                { label: 'Mute Command', value: 'edit_mute', description: 'Customize the mute embed' },
                                { label: 'Unmute Command', value: 'edit_unmute', description: 'Customize the unmute embed' },
                                { label: 'Warn Command', value: 'edit_warn', description: 'Customize the warn embed' },
                            ])
                    );

                    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
                }
            }
            else if (commandName === 'welcome') {
                const sub = options.getSubcommand();
                if (sub === 'channel') {
                    const channel = options.getChannel('target');
                    let config = await getConfig('welcome');
                    config.channelId = channel.id;
                    
                    await db.update({ command: 'welcome' }, { command: 'welcome', ...config }, { upsert: true });
                    await interaction.reply({ content: `✅ Welcome channel successfully set to <#${channel.id}>!`, ephemeral: true });
                } 
                else if (sub === 'customize') {
                    const config = await getConfig('welcome');
                    const modal = createEmbedModal('welcome', config);
                    await interaction.showModal(modal);
                }
                else if (sub === 'test') {
                    const embed = await buildEmbed('welcome', {
                        user: `<@${interaction.user.id}>`,
                        server: interaction.guild.name,
                        memberCount: interaction.guild.memberCount
                    });
                    await interaction.reply({ content: '🧪 **Welcome Embed Preview:**', embeds: [embed], ephemeral: true });
                }
            }
            else if (commandName === 'level') {
                const targetUser = options.getUser('user') || interaction.user;
                const guildId = interaction.guild.id;

                const userLevelData = await levelsDb.findOne({ userId: targetUser.id, guildId });
                const currentLevel = userLevelData ? userLevelData.level : 0;
                const currentXp = userLevelData ? userLevelData.xp : 0;
                const neededXp = (currentLevel + 1) * 100;

                const embed = new EmbedBuilder()
                    .setTitle(`📊 Level Card — ${targetUser.username}`)
                    .setColor('#5865F2')
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: '⭐ Level', value: `${currentLevel}`, inline: true },
                        { name: '✨ XP Progress', value: `${currentXp} / ${neededXp} XP`, inline: true }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            }
            else if (commandName === 'ban') {
                const member = options.getMember('user');
                const reason = options.getString('reason') || 'No reason provided';
                if (!member.bannable) return interaction.reply({ content: "❌ I cannot ban this user.", ephemeral: true });

                await member.ban({ reason });
                const embed = await buildEmbed('ban', { user: member.user.tag, reason });
                await interaction.reply({ embeds: [embed] });
            }
            else if (commandName === 'kick') {
                const member = options.getMember('user');
                const reason = options.getString('reason') || 'No reason provided';
                if (!member.kickable) return interaction.reply({ content: "❌ I cannot kick this user.", ephemeral: true });

                await member.kick(reason);
                const embed = await buildEmbed('kick', { user: member.user.tag, reason });
                await interaction.reply({ embeds: [embed] });
            }
            else if (commandName === 'mute') {
                const member = options.getMember('user');
                const duration = options.getInteger('duration') || 60;
                const reason = options.getString('reason') || 'No reason provided';

                await member.timeout(duration * 60 * 1000, reason);
                const embed = await buildEmbed('mute', { user: member.user.tag, reason });
                await interaction.reply({ embeds: [embed] });
            }
            else if (commandName === 'unmute') {
                const member = options.getMember('user');
                await member.timeout(null);
                const embed = await buildEmbed('unmute', { user: member.user.tag });
                await interaction.reply({ embeds: [embed] });
            }
            else if (commandName === 'warn') {
                const member = options.getMember('user');
                const reason = options.getString('reason');
                const embed = await buildEmbed('warn', { user: member.user.tag, reason });
                await interaction.reply({ embeds: [embed] });
            }
        }
        else if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'dashboard_select') {
                const key = interaction.values[0].replace('edit_', '');
                const config = await getConfig(key);
                const modal = createEmbedModal(key, config);
                await interaction.showModal(modal);
            }
        }
        else if (interaction.isModalSubmit()) {
            const key = interaction.customId.replace('modal_', '');
            const title = interaction.fields.getTextInputValue('embed_title');
            const color = interaction.fields.getTextInputValue('embed_color');
            const thumbnail = interaction.fields.getTextInputValue('embed_thumbnail');
            const image = interaction.fields.getTextInputValue('embed_image');
            const description = interaction.fields.getTextInputValue('embed_desc');

            let currentConfig = await getConfig(key);

            await db.update(
                { command: key },
                { 
                    command: key, 
                    channelId: currentConfig.channelId || '', 
                    title, 
                    color, 
                    thumbnail, 
                    image, 
                    description 
                },
                { upsert: true }
            );

            await interaction.reply({ 
                content: `✅ Successfully updated the configuration and embed for **${key}**!`, 
                ephemeral: true 
            });
        }
    } catch (err) {
        console.error(err);
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: "❌ An error occurred processing this action.", ephemeral: true }).catch(() => {});
        } else {
            await interaction.reply({ content: "❌ An error occurred processing this action.", ephemeral: true }).catch(() => {});
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
