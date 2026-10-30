const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  PermissionFlagsBits 
} = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const PREFIX = '?';

// --- CENTRAL CONFIGURATION STORE ---
const botConfig = {
  commands: {
    ban: { enabled: true, name: 'ban', public: true, sendDm: true, title: 'User Banned', description: 'You have been banned from {guild}. Reason: {reason}', thumbnail: '', image: '', buttonStyle: 'separate' },
    unban: { enabled: true, name: 'unban', public: true, sendDm: true, title: 'User Unbanned', description: 'Your ban from {guild} has been lifted.', thumbnail: '', image: '', buttonStyle: 'separate' },
    mute: { enabled: true, name: 'mute', public: true, sendDm: true, title: 'User Muted', description: 'You have been muted in {guild} for {duration}. Reason: {reason}', thumbnail: '', image: '', buttonStyle: 'separate' },
    unmute: { enabled: true, name: 'unmute', public: true, sendDm: true, title: 'User Unmuted', description: 'Your mute in {guild} has been lifted.', thumbnail: '', image: '', buttonStyle: 'separate' }
  }
};

// --- UTILS: Parse Time (e.g., 30s, 15m, 2h, 1d) ---
function parseDuration(durationStr) {
  if (!durationStr) return null;
  const regex = /^(\d+)([smhd])$/i;
  const match = durationStr.match(regex);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

// Helper to build action rows
function buildCommandButtons(cmdKey) {
  const cfg = botConfig.commands[cmdKey];
  if (cfg.buttonStyle === 'slide') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`slide_prev_${cmdKey}`).setLabel('◀ Prev Slide').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`slide_next_${cmdKey}`).setLabel('Next Slide ▶').setStyle(ButtonStyle.Secondary)
      )
    ];
  } else {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`action_approve_${cmdKey}`).setLabel('Log Action').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`action_dismiss_${cmdKey}`).setLabel('Dismiss').setStyle(ButtonStyle.Danger)
      )
    ];
  }
}

// --- REGISTER SLASH COMMANDS ---
const slashCommands = [
  new SlashCommandBuilder().setName('embed-dashboard').setDescription('Edit embeds, text, images, thumbnails, and button styles for all commands.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('moderation-dashboard').setDescription('Enable, disable, rename, and configure visibility/DMs for commands.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a member.').addUserOption(opt => opt.setName('target').setDescription('User to ban').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false)),
  new SlashCommandBuilder().setName('unban').setDescription('Unban a user by ID.').addStringOption(opt => opt.setName('userid').setDescription('User ID').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Timeout a member.').addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true)).addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 30s, 10m, 2h, 1d)').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false)),
  new SlashCommandBuilder().setName('unmute').setDescription('Remove timeout from a member.').addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true))
].map(c => c.toJSON());

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  
  try {
    if (process.env.GUILD_ID) {
      console.log(`Refreshing guild-specific commands for Guild ID: ${process.env.GUILD_ID}...`);
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
        { body: slashCommands },
      );
      console.log('✅ Successfully registered commands to your guild!');
    } else {
      console.log('Refreshing global commands...');
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: slashCommands },
      );
      console.log('✅ Successfully registered global application commands.');
    }
  } catch (err) {
    console.error('❌ Failed to register slash commands:', err);
  }
});

// --- CORE COMMAND LOGIC EXECUTOR ---
async function executeCommand(context, commandKey, args, isInteraction) {
  const cfg = botConfig.commands[commandKey];
  if (!cfg.enabled) {
    const msg = 'This command is currently disabled by administrators.';
    return isInteraction ? context.reply({ content: msg, ephemeral: true }) : context.reply(msg);
  }

  const guild = context.guild;
  let targetUser, targetMember, reason, durationStr, durationMs, userId;

  if (isInteraction) {
    if (commandKey === 'ban' || commandKey === 'mute') {
      targetMember = context.options.getMember('target');
      targetUser = targetMember?.user;
      reason = context.options.getString('reason') || 'No reason provided';
    }
    if (commandKey === 'mute') {
      durationStr = context.options.getString('duration');
      durationMs = parseDuration(durationStr);
    }
    if (commandKey === 'unban') userId = context.options.getString('userid');
    if (commandKey === 'unmute') {
      targetMember = context.options.getMember('target');
      targetUser = targetMember?.user;
    }
  } else {
    if (commandKey === 'ban' || commandKey === 'mute' || commandKey === 'unmute') {
      targetMember = context.mentions.members.first() || guild.members.cache.get(args[0]);
      targetUser = targetMember?.user;
      reason = args.slice(commandKey === 'mute' ? 2 : 1).join(' ') || 'No reason provided';
    }
    if (commandKey === 'mute') {
      durationStr = args[1];
      durationMs = parseDuration(durationStr);
    }
    if (commandKey === 'unban') {
      userId = args[0];
    }
  }

  if (commandKey === 'ban') {
    if (!targetMember || !targetMember.bannable) {
      const msg = 'Invalid target or I cannot ban this user.';
      return isInteraction ? context.reply({ content: msg, ephemeral: true }) : context.reply(msg);
    }
    if (cfg.sendDm && targetUser) {
      try {
        const dmEmbed = new EmbedBuilder().setTitle(cfg.title).setDescription(cfg.description.replace('{guild}', guild.name).replace('{reason}', reason)).setColor(0xFF0000);
        if (cfg.thumbnail) dmEmbed.setThumbnail(cfg.thumbnail);
        if (cfg.image) dmEmbed.setImage(cfg.image);
        await targetUser.send({ embeds: [dmEmbed] });
      } catch (e) { console.log('Could not send DM'); }
    }
    await guild.members.ban(targetMember, { reason });
  } 
  
  else if (commandKey === 'unban') {
    if (!userId) {
      const msg = 'Please provide a valid user ID to unban.';
      return isInteraction ? context.reply({ content: msg, ephemeral: true }) : context.reply(msg);
    }
    await guild.members.unban(userId);
  } 
  
  else if (commandKey === 'mute') {
    if (!targetMember || !durationMs) {
      const msg = 'Invalid target or time format! Use formats like `30s`, `15m`, `2h`, or `1d`.';
      return isInteraction ? context.reply({ content: msg, ephemeral: true }) : context.reply(msg);
    }
    if (cfg.sendDm && targetUser) {
      try {
        const dmEmbed = new EmbedBuilder().setTitle(cfg.title).setDescription(cfg.description.replace('{guild}', guild.name).replace('{duration}', durationStr).replace('{reason}', reason)).setColor(0xFFA500);
        if (cfg.thumbnail) dmEmbed.setThumbnail(cfg.thumbnail);
        if (cfg.image) dmEmbed.setImage(cfg.image);
        await targetUser.send({ embeds: [dmEmbed] });
      } catch (e) { console.log('Could not send DM'); }
    }
    await targetMember.timeout(durationMs, reason);
  } 
  
  else if (commandKey === 'unmute') {
    if (!targetMember) {
      const msg = 'Invalid target user.';
      return isInteraction ? context.reply({ content: msg, ephemeral: true }) : context.reply(msg);
    }
    await targetMember.timeout(null);
  }

  const publicEmbed = new EmbedBuilder()
    .setTitle(cfg.title)
    .setDescription(
      cfg.description
        .replace('{guild}', guild.name)
        .replace('{reason}', reason || 'N/A')
        .replace('{duration}', durationStr || 'N/A')
        .replace('{user}', targetUser ? targetUser.tag : (userId || 'N/A'))
    )
    .setColor(0x00AE86);

  if (cfg.thumbnail) publicEmbed.setThumbnail(cfg.thumbnail);
  if (cfg.image) publicEmbed.setImage(cfg.image);

  const components = buildCommandButtons(commandKey);
  await context.reply({ embeds: [publicEmbed], components, ephemeral: !cfg.public });
}

// --- EVENT HANDLERS ---
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'embed-dashboard') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('edit_embed_ban').setLabel('Edit /ban Embed').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('edit_embed_mute').setLabel('Edit /mute Embed').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('toggle_layout_ban').setLabel('Toggle Ban Buttons (Slide/Sep)').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content: '**🎨 Embed Dashboard**\nCustomize command visuals, titles, descriptions, images, thumbnails, and button styles.',
        components: [row],
        ephemeral: false
      });
    }

    else if (commandName === 'moderation-dashboard') {
      const summary = Object.entries(botConfig.commands).map(([key, val]) => 
        `**/${val.name}** | Enabled: \`${val.enabled}\` | Public: \`${val.public}\` | Send DMs: \`${val.sendDm}\``
      ).join('\n');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mod_toggle_ban').setLabel('Toggle Ban').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mod_toggle_mute').setLabel('Toggle Mute').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mod_toggle_dm_ban').setLabel('Toggle Ban DM').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content: `**⚙️ Moderation Dashboard**\n\n${summary}\n\n*Use controls below:*`,
        components: [row],
        ephemeral: false
      });
    }

    else if (['ban', 'unban', 'mute', 'unmute'].includes(commandName)) {
      await executeCommand(interaction, commandName, [], true);
    }
  }

  else if (interaction.isButton()) {
    if (interaction.customId === 'edit_embed_ban' || interaction.customId === 'edit_embed_mute') {
      const cmdKey = interaction.customId.includes('ban') ? 'ban' : 'mute';
      const modal = new ModalBuilder().setCustomId(`modal_edit_${cmdKey}`).setTitle(`Edit /${cmdKey} Embed`);

      const titleInput = new TextInputBuilder().setCustomId('title').setLabel('Title').setStyle(TextInputStyle.Short).setValue(botConfig.commands[cmdKey].title).setRequired(true);
      const descInput = new TextInputBuilder().setCustomId('desc').setLabel('Description / DM template').setStyle(TextInputStyle.Paragraph).setValue(botConfig.commands[cmdKey].description).setRequired(true);
      const thumbInput = new TextInputBuilder().setCustomId('thumb').setLabel('Thumbnail URL (Optional)').setStyle(TextInputStyle.Short).setValue(botConfig.commands[cmdKey].thumbnail || '').setRequired(false);
      const imageInput = new TextInputBuilder().setCustomId('image').setLabel('Image URL (Optional)').setStyle(TextInputStyle.Short).setValue(botConfig.commands[cmdKey].image || '').setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(thumbInput),
        new ActionRowBuilder().addComponents(imageInput)
      );

      await interaction.showModal(modal);
    } 
    
    else if (interaction.customId === 'toggle_layout_ban') {
      botConfig.commands.ban.buttonStyle = botConfig.commands.ban.buttonStyle === 'separate' ? 'slide' : 'separate';
      await interaction.update({ content: `✅ Ban button layout switched to: **${botConfig.commands.ban.buttonStyle}**` });
    }

    else if (interaction.customId.startsWith('mod_toggle_')) {
      const parts = interaction.customId.split('_');
      const actionType = parts[2];
      const targetCmd = parts[3];

      if (actionType === 'toggle') {
        botConfig.commands[targetCmd].enabled = !botConfig.commands[targetCmd].enabled;
        await interaction.update({ content: `Command \`/${targetCmd}\` is now **${botConfig.commands[targetCmd].enabled ? 'Enabled' : 'Disabled'}**.` });
      } else if (actionType === 'dm') {
        botConfig.commands[targetCmd].sendDm = !botConfig.commands[targetCmd].sendDm;
        await interaction.update({ content: `DM notifications for \`/${targetCmd}\` are now **${botConfig.commands[targetCmd].sendDm ? 'Enabled' : 'Disabled'}**.` });
      }
    }
  }

  else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_edit_ban' || interaction.customId === 'modal_edit_mute') {
      const cmdKey = interaction.customId.includes('ban') ? 'ban' : 'mute';
      botConfig.commands[cmdKey].title = interaction.fields.getTextInputValue('title');
      botConfig.commands[cmdKey].description = interaction.fields.getTextInputValue('desc');
      botConfig.commands[cmdKey].thumbnail = interaction.fields.getTextInputValue('thumb');
      botConfig.commands[cmdKey].image = interaction.fields.getTextInputValue('image');

      await interaction.reply({ content: `✅ Successfully updated template for **/${cmdKey}**!`, ephemeral: true });
    }
  }
});

// --- PREFIX COMMAND LISTENER (?command) ---
client.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  if (['ban', 'unban', 'mute', 'unmute'].includes(commandName)) {
    await executeCommand(message, commandName, args, false);
  } else if (commandName === 'embed-dashboard') {
    message.reply('Please use the slash command `/embed-dashboard` to access the graphical modal editor UI.');
  } else if (commandName === 'moderation-dashboard') {
    message.reply('Please use the slash command `/moderation-dashboard` to view and modify settings.');
  }
});

client.login(process.env.TOKEN);
