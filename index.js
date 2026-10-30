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
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    ChannelType
} = require('discord.js');
const Datastore = require('nedb-promises');
require('dotenv').config();

const TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

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
    leveling: {
        title: '🎉 Level Up!',
        color: '#00ffcc',
        thumbnail: '',
        image: '',
        description: 'GG {user}! You just advanced to **Level {level}**!'
    }
};

async function getConfig(key) {
    let setting = await db.findOne({ command: key });
    return setting || defaultSettings[key];
}

function createEmbedModal(key, config) {
    const modal = new ModalBuilder()
        .setCustomId(`modal_${key}`)
        .setTitle(`Customize: ${key.toUpperCase()}`);

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('embed_title').setLabel('Embed Title').setStyle(TextInputStyle.Short).setValue(config.title || '').setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('embed_color').setLabel('Color (Hex)').setStyle(TextInputStyle.Short).setValue(config.color || '#5865F2').setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('embed_thumbnail').setLabel('Thumbnail URL').setStyle(TextInputStyle.Short).setValue(config.thumbnail || '').setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('embed_image').setLabel('Image URL').setStyle(TextInputStyle.Short).setValue(config.image || '').setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('embed_desc').setLabel('Description').setStyle(TextInputStyle.Paragraph).setValue(config.description || '').setRequired(true)
        )
    );

    return modal;
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const commands = [
    new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Embed dashboard')
        .addSubcommand(sub => sub.setName('dashboard').setDescription('Open customization dashboard'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder()
        .setName('welcome')
        .setDescription('Welcome management')
        .addChannelOption(opt => opt.setName('channel').setDescription('Greeting channel').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addStringOption(opt => opt.setName('action').setDescription('Action').setRequired(false).addChoices({ name: 'Customize Embed', value: 'customize' }, { name: 'Test Welcome', value: 'test' }))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a member')
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member')
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute a member')
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
        .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in mins').setRequired(false))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Unmute a member')
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a member')
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Check rank')
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(false))
].map(c => c.toJSON());

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        if (GUILD_ID) {
            await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
            console.log('Commands registered to guild successfully.');
        } else {
            await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
            console.log('Commands registered globally.');
        }
    } catch (e) {
        console.error(e);
    }
});

async function buildEmbed(key, vars) {
    const config = await getConfig(key);
    let desc = config.description;
    for (const [k, v] of Object.entries(vars)) {
        desc = desc.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
    const embed = new EmbedBuilder().setTitle(config.title).setColor(config.color).setDescription(desc).setTimestamp();
    if (config.thumbnail) embed.setThumbnail(config.thumbnail);
    if (config.image) embed.setImage(config.image);
    return embed;
}

client.on('guildMemberAdd', async member => {
    const config = await getConfig('welcome');
    if (!config.channelId) return;
    const channel = member.guild.channels.cache.get(config.channelId);
    if (!channel) return;
    const embed = await buildEmbed('welcome', { user: `<@${member.id}>`, server: member.guild.name, memberCount: member.guild.memberCount });
    await channel.send({ content: `<@${member.id}>`, embeds: [embed] }).catch(() => {});
});

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isModalSubmit()) {
            const key = interaction.customId.replace('modal_', '');
            const title = interaction.fields.getTextInputValue('embed_title');
            const color = interaction.fields.getTextInputValue('embed_color');
            const thumbnail = interaction.fields.getTextInputValue('embed_thumbnail');
            const image = interaction.fields.getTextInputValue('embed_image');
            const description = interaction.fields.getTextInputValue('embed_desc');

            const current = await getConfig(key);
            await db.update({ command: key }, { command: key, channelId: current.channelId || '', title, color, thumbnail, image, description }, { upsert: true });
            return interaction.reply({ content: `✅ Updated **${key}**!`, ephemeral: true });
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'dashboard_select') {
            const key = interaction.values[0].replace('edit_', '');
            return interaction.showModal(createEmbedModal(key, await getConfig(key)));
        }

        if (interaction.isButton() && interaction.customId === 'open_welcome_modal') {
            return interaction.showModal(createEmbedModal('welcome', await getConfig('welcome')));
        }

        if (!interaction.isChatInputCommand()) return;
        await interaction.deferReply({ ephemeral: true });

        const { commandName, options } = interaction;

        if (commandName === 'embed' && options.getSubcommand() === 'dashboard') {
            const embed = new EmbedBuilder().setTitle('Dashboard').setColor('#5865F2').setDescription('Select module to customize:');
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('dashboard_select').setPlaceholder('Choose...').addOptions(
                    { label: 'Welcome', value: 'edit_welcome' },
                    { label: 'Ban', value: 'edit_ban' },
                    { label: 'Kick', value: 'edit_kick' },
                    { label: 'Mute', value: 'edit_mute' },
                    { label: 'Unmute', value: 'edit_unmute' },
                    { label: 'Warn', value: 'edit_warn' }
                )
            );
            return interaction.editReply({ embeds: [embed], components: [row] });
        }

        if (commandName === 'welcome') {
            const channel = options.getChannel('channel');
            const action = options.getString('action');
            if (channel) {
                let config = await getConfig('welcome');
                config.channelId = channel.id;
                await db.update({ command: 'welcome' }, { command: 'welcome', ...config }, { upsert: true });
                return interaction.editReply({ content: `Channel set to <#${channel.id}>` });
            }
            if (action === 'customize') {
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_welcome_modal').setLabel('Open Customizer').setStyle(ButtonStyle.Primary));
                return interaction.editReply({ content: 'Click below:', components: [row] });
            }
            if (action === 'test') {
                const embed = await buildEmbed('welcome', { user: `<@${interaction.user.id}>`, server: interaction.guild.name, memberCount: interaction.guild.memberCount });
                return interaction.editReply({ embeds: [embed] });
            }
        }

        if (commandName === 'ban') {
            const member = options.getMember('user');
            const reason = options.getString('reason') || 'No reason';
            await member.ban({ reason });
            return interaction.editReply({ embeds: [await buildEmbed('ban', { user: member.user.tag, reason })] });
        }

        if (commandName === 'kick') {
            const member = options.getMember('user');
            const reason = options.getString('reason') || 'No reason';
            await member.kick(reason);
            return interaction.editReply({ embeds: [await buildEmbed('kick', { user: member.user.tag, reason })] });
        }

        if (commandName === 'mute') {
            const member = options.getMember('user');
            const duration = options.getInteger('duration') || 60;
            const reason = options.getString('reason') || 'No reason';
            await member.timeout(duration * 60 * 1000, reason);
            return interaction.editReply({ embeds: [await buildEmbed('mute', { user: member.user.tag, reason })] });
        }

        if (commandName === 'unmute') {
            const member = options.getMember('user');
            await member.timeout(null);
            return interaction.editReply({ embeds: [await buildEmbed('unmute', { user: member.user.tag })] });
        }

        if (commandName === 'warn') {
            const member = options.getMember('user');
            const reason = options.getString('reason');
            return interaction.editReply({ embeds: [await buildEmbed('warn', { user: member.user.tag, reason })] });
        }

        if (commandName === 'rank') {
            const target = options.getUser('user') || interaction.user;
            const data = await levelsDb.findOne({ userId: target.id, guildId: interaction.guild.id }) || { xp: 0, level: 1 };
            const rank = new EmbedBuilder().setTitle(`Rank: ${target.tag}`).addFields({ name: 'Level', value: `${data.level}` }, { name: 'XP', value: `${data.xp}` });
            return interaction.editReply({ embeds: [rank] });
        }

    } catch (e) {
        console.error(e);
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: 'Error processing command.', ephemeral: true }).catch(() => {});
        }
    }
});

client.login(TOKEN);
