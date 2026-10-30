/**
 * ----------------------------------------------------------------------------------
 * PROJECT: Advanced Discord Moderation & Embed Dashboard Bot
 * VERSION: 3.0.0 (Enterprise Architecture Monolith)
 * AUTHOR: Z
 * ----------------------------------------------------------------------------------
 */

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

// ==========================================
// 1. CLIENT INITIALIZATION & INTENTS
// ==========================================
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

// ==========================================
// 2. CENTRAL CONFIGURATION & STATE STORE
// ==========================================
const botConfig = {
  version: '3.0.0',
  environment: process.env.NODE_ENV || 'production',
  commands: {
    ban: {
      enabled: true,
      name: 'ban',
      public: true,
      sendDm: true,
      title: 'User Banned',
      description: 'You have been banned from {guild}. Reason: {reason}',
      thumbnail: '',
      image: '',
      buttonStyle: 'separate'
    },
    unban: {
      enabled: true,
      name: 'unban',
      public: true,
      sendDm: true,
      title: 'User Unbanned',
      description: 'Your ban from {guild} has been lifted.',
      thumbnail: '',
      image: '',
      buttonStyle: 'separate'
    },
    mute: {
      enabled: true,
      name: 'mute',
      public: true,
      sendDm: true,
      title: 'User Muted',
      description: 'You have been muted in {guild} for {duration}. Reason: {reason}',
      thumbnail: '',
      image: '',
      buttonStyle: 'separate'
    },
    unmute: {
      enabled: true,
      name: 'unmute',
      public: true,
      sendDm: true,
      title: 'User Unmuted',
      description: 'Your mute in {guild} has been lifted.',
      thumbnail: '',
      image: '',
      buttonStyle: 'separate'
    }
  }
};

// ==========================================
// 3. ADVANCED UTILITY FUNCTIONS
// ==========================================

/**
 * Parses time strings like '30s', '15m', '2h', '1d' into milliseconds.
 * @param {string} durationStr 
 * @returns {number|null}
 */
function parseDuration(durationStr) {
  if (!durationStr || typeof durationStr !== 'string') return null;
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

/**
 * Validates whether a given string is a proper HTTP/HTTPS URL.
 * @param {string} url 
 * @returns {boolean}
 */
function isValidHttpUrl(url) {
  if (!url) return true; // Optional fields can be empty
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (_) {
    return false;
  }
  return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
}

/**
 * Generates custom action rows depending on configuration button layout style.
 * @param {string} cmdKey 
 * @returns {ActionRowBuilder[]}
 */
function buildCommandButtons(cmdKey) {
  const cfg = botConfig.commands[cmdKey];
  if (!cfg) return [];

  if (cfg.buttonStyle === 'slide') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`slide_prev_${cmdKey}`)
          .setLabel('◀ Prev Slide')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`slide_next_${cmdKey}`)
          .setLabel('Next Slide ▶')
          .setStyle(ButtonStyle.Secondary)
      )
    ];
  } else {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`action_approve_${cmdKey}`)
          .setLabel('Log Action')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`action_dismiss_${cmdKey}`)
          .setLabel('Dismiss')
          .setStyle(ButtonStyle.Danger)
      )
    ];
  }
}

/**
 * Structured logger for debugging execution states.
 * @param {string} level 
 * @param {string} message 
 */
function systemLog(level, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

// ==========================================
// 4. SLASH COMMAND DEFINITIONS (BUILDER)
// ==========================================
const slashCommands = [
  new SlashCommandBuilder()
    .setName('embed-dashboard')
    .setDescription('Edit custom command embeds, text, descriptions, thumbnail URLs, images, and button layouts.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('moderation-dashboard')
    .setDescription('Enable, disable, update status, and configure command visibility and DM notifications.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the current guild with customizable embed notification.')
    .addUserOption(opt => 
      opt.setName('target')
         .setDescription('The user you want to ban')
         .setRequired(true)
    )
    .addStringOption(opt => 
      opt.setName('reason')
         .setDescription('Reason for banning this user')
         .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user using their unique Discord account ID.')
    .addStringOption(opt => 
      opt.setName('userid')
         .setDescription('The 18-digit user ID to unban')
         .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout/mute a member using flexible time parameters (e.g. 30s, 15m, 2h, 1d).')
    .addUserOption(opt => 
      opt.setName('target')
         .setDescription('The member to mute')
         .setRequired(true)
    )
    .addStringOption(opt => 
      opt.setName('duration')
         .setDescription('Duration format: Xs, Xm, Xh, or Xd (e.g. 10m)')
         .setRequired(true)
    )
    .addStringOption(opt => 
      opt.setName('reason')
         .setDescription('Reason for timeout')
         .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove a timeout restriction from a member.')
    .addUserOption(opt => 
      opt.setName('target')
         .setDescription('The member to unmute')
         .setRequired(true)
    )
].map(c => c.toJSON());

// ==========================================
// 5. CLIENT READY & REST DEPLOYMENT HOOK
// ==========================================
client.once('ready', async () => {
  systemLog('info', `Bot successfully authenticated as ${client.user.tag}`);
  systemLog('info', `Active configuration profile loaded. Registered commands count: ${slashCommands.length}`);

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    if (process.env.GUILD_ID) {
      systemLog('info', `Initiating instant guild-level command sync for target Guild ID: ${process.env.GUILD_ID}`);
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
        { body: slashCommands },
      );
      systemLog('info', '✅ Guild commands synchronized successfully and instantly available.');
    } else {
      systemLog('warn', 'GUILD_ID is not defined in .env. Falling back to global synchronization.');
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: slashCommands },
      );
      systemLog('info', '✅ Global application commands registered successfully.');
    }
  } catch (error) {
    systemLog('error', `Critical failure during REST command registration: ${error.message}`);
    console.error(error);
  }
});

// ==========================================
// 6. CORE COMMAND EXECUTION ENGINE
// ==========================================
async function executeCommand(context, commandKey, args, isInteraction) {
  const cfg = botConfig.commands[commandKey];
  
  if (!cfg) {
    systemLog('error', `Attempted to execute unmapped command key: ${commandKey}`);
    return;
  }

  // Check if command is enabled in configuration dashboard
  if (!cfg.enabled) {
    const disabledMsg = '⚠️ This command has been temporarily disabled by server administrators via the moderation dashboard.';
    return isInteraction ? context.reply({ content: disabledMsg, ephemeral: true }) : context.reply(disabledMsg);
  }

  const guild = context.guild;
  if (!guild) {
    const guildErr = 'This command can only be executed within a server channel.';
    return isInteraction ? context.reply({ content: guildErr, ephemeral: true }) : context.reply(guildErr);
  }

  let targetUser = null;
  let targetMember = null;
  let reason = 'No reason provided';
  let durationStr = null;
  let durationMs = null;
  let userId = null;

  // Resolve Arguments based on interaction vs prefix context
  if (isInteraction) {
    if (commandKey === 'ban' || commandKey === 'mute') {
      targetMember = context.options.getMember('target');
      targetUser = targetMember?.user || null;
      reason = context.options.getString('reason') || 'No reason provided';
    }
    if (commandKey === 'mute') {
      durationStr = context.options.getString('duration');
      durationMs = parseDuration(durationStr);
    }
    if (commandKey === 'unban') {
      userId = context.options.getString('userid');
    }
    if (commandKey === 'unmute') {
      targetMember = context.options.getMember('target');
      targetUser = targetMember?.user || null;
    }
  } else {
    // Prefix execution flow (?command)
    if (commandKey === 'ban' || commandKey === 'mute' || commandKey === 'unmute') {
      targetMember = context.mentions.members.first() || guild.members.cache.get(args[0]);
      targetUser = targetMember?.user || null;
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

  // --- EXECUTION LOGIC PER COMMAND TYPE ---
  try {
    if (commandKey === 'ban') {
      if (!targetMember || !targetMember.bannable) {
        const errBan = '❌ Error: Invalid target member or insufficient bot role hierarchy permissions to ban this user.';
        return isInteraction ? context.reply({ content: errBan, ephemeral: true }) : context.reply(errBan);
      }

      if (cfg.sendDm && targetUser) {
        try {
          const dmEmbed = new EmbedBuilder()
            .setTitle(cfg.title)
            .setDescription(cfg.description.replace('{guild}', guild.name).replace('{reason}', reason))
            .setColor(0xFF0000)
            .setTimestamp();
          if (isValidHttpUrl(cfg.thumbnail)) dmEmbed.setThumbnail(cfg.thumbnail);
          if (isValidHttpUrl(cfg.image)) dmEmbed.setImage(cfg.image);
          await targetUser.send({ embeds: [dmEmbed] });
        } catch (dmErr) {
          systemLog('warn', `Could not dispatch ban DM notification to user: ${targetUser.tag}`);
        }
      }
      await guild.members.ban(targetMember, { reason });
    } 
    
    else if (commandKey === 'unban') {
      if (!userId) {
        const errUnban = '❌ Error: You must supply a valid 18-digit user account ID to unban.';
        return isInteraction ? context.reply({ content: errUnban, ephemeral: true }) : context.reply(errUnban);
      }
      await guild.members.unban(userId);
    } 
    
    else if (commandKey === 'mute') {
      if (!targetMember || !durationMs) {
        const errMute = '❌ Error: Invalid member target or incorrect duration format! Use strings like `30s`, `15m`, `2h`, or `1d`.';
        return isInteraction ? context.reply({ content: errMute, ephemeral: true }) : context.reply(errMute);
      }

      if (cfg.sendDm && targetUser) {
        try {
          const dmEmbed = new EmbedBuilder()
            .setTitle(cfg.title)
            .setDescription(
              cfg.description
                .replace('{guild}', guild.name)
                .replace('{duration}', durationStr)
                .replace('{reason}', reason)
            )
            .setColor(0xFFA500)
            .setTimestamp();
          if (isValidHttpUrl(cfg.thumbnail)) dmEmbed.setThumbnail(cfg.thumbnail);
          if (isValidHttpUrl(cfg.image)) dmEmbed.setImage(cfg.image);
          await targetUser.send({ embeds: [dmEmbed] });
        } catch (dmErr) {
          systemLog('warn', `Could not dispatch mute DM notification to user: ${targetUser.tag}`);
        }
      }
      await targetMember.timeout(durationMs, reason);
    } 
    
    else if (commandKey === 'unmute') {
      if (!targetMember) {
        const errUnmute = '❌ Error: Target member not found or invalid specification.';
        return isInteraction ? context.reply({ content: errUnmute, ephemeral: true }) : context.reply(errUnmute);
      }
      await targetMember.timeout(null);
    }

  } catch (executionError) {
    systemLog('error', `Execution failure inside module [${commandKey}]: ${executionError.message}`);
    const failNotice = '⚠️ An internal API error occurred while attempting to execute this moderation action.';
    return isInteraction ? context.reply({ content: failNotice, ephemeral: true }) : context.reply(failNotice);
  }

  // --- RENDER PUBLIC EMBED & BUTTON COMPONENTS ---
  const publicEmbed = new EmbedBuilder()
    .setTitle(cfg.title)
    .setDescription(
      cfg.description
        .replace('{guild}', guild.name)
        .replace('{reason}', reason || 'N/A')
        .replace('{duration}', durationStr || 'N/A')
        .replace('{user}', targetUser ? targetUser.tag : (userId || 'N/A'))
    )
    .setColor(0x00AE86)
    .setTimestamp();

  if (isValidHttpUrl(cfg.thumbnail)) publicEmbed.setThumbnail(cfg.thumbnail);
  if (isValidHttpUrl(cfg.image)) publicEmbed.setImage(cfg.image);

  const actionComponents = buildCommandButtons(commandKey);
  const payload = {
    embeds: [publicEmbed],
    components: actionComponents,
    ephemeral: !cfg.public
  };

  return context.reply(payload);
}

// ==========================================
// 7. EVENT HANDLERS (INTERACTIONS & MESSAGES)
// ==========================================

// Chat Input & Component Interaction Listener
client.on('interactionCreate', async interaction => {
  try {
    // A. Slash Command Handler
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;
      systemLog('info', `Received chat input interaction: /${commandName} from user ${interaction.user.tag}`);

      if (commandName === 'embed-dashboard') {
        const dashboardRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('edit_embed_ban').setLabel('Edit /ban Embed').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('edit_embed_mute').setLabel('Edit /mute Embed').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('toggle_layout_ban').setLabel('Toggle Button Style (Slide/Sep)').setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
          content: '**🎨 Embed Dashboard Control Panel**\nSelect an action below to modify embed titles, markdown body descriptions, images, thumbnails, and interactive row styles.',
          components: [dashboardRow],
          ephemeral: false
        });
      }

      else if (commandName === 'moderation-dashboard') {
        const statusSummary = Object.entries(botConfig.commands).map(([key, val]) => 
          `• **/${val.name}** | Status: \`${val.enabled ? 'Enabled' : 'Disabled'}\` | Public: \`${val.public}\` | DMs: \`${val.sendDm}\``
        ).join('\n');

        const modRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('mod_toggle_ban').setLabel('Toggle /ban').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('mod_toggle_mute').setLabel('Toggle /mute').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('mod_toggle_dm_ban').setLabel('Toggle Ban DM').setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
          content: `**⚙️ Moderation Settings Dashboard**\n\n${statusSummary}\n\n*Use control keys below to reconfigure parameters:*`,
          components: [modRow],
          ephemeral: false
        });
      }

      else if (['ban', 'unban', 'mute', 'unmute'].includes(commandName)) {
        await executeCommand(interaction, commandName, [], true);
      }
    }

    // B. Button Click Handler
    else if (interaction.isButton()) {
      const customId = interaction.customId;
      systemLog('info', `Button interaction triggered: ${customId} by ${interaction.user.tag}`);

      if (customId === 'edit_embed_ban' || customId === 'edit_embed_mute') {
        const targetCmd = customId.includes('ban') ? 'ban' : 'mute';
        const currentData = botConfig.commands[targetCmd];

        const modal = new ModalBuilder()
          .setCustomId(`modal_edit_${targetCmd}`)
          .setTitle(`Customize /${targetCmd} Embed`);

        const titleInput = new TextInputBuilder()
          .setCustomId('input_title')
          .setLabel('Embed Title')
          .setStyle(TextInputStyle.Short)
          .setValue(currentData.title)
          .setRequired(true);

        const descInput = new TextInputBuilder()
          .setCustomId('input_desc')
          .setLabel('Description Template')
          .setStyle(TextInputStyle.Paragraph)
          .setValue(currentData.description)
          .setRequired(true);

        const thumbInput = new TextInputBuilder()
          .setCustomId('input_thumb')
          .setLabel('Thumbnail URL (Optional)')
          .setStyle(TextInputStyle.Short)
          .setValue(currentData.thumbnail || '')
          .setRequired(false);

        const imageInput = new TextInputBuilder()
          .setCustomId('input_image')
          .setLabel('Image URL (Optional)')
          .setStyle(TextInputStyle.Short)
          .setValue(currentData.image || '')
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(descInput),
          new ActionRowBuilder().addComponents(thumbInput),
          new ActionRowBuilder().addComponents(imageInput)
        );

        return await interaction.showModal(modal);
      }

      else if (customId === 'toggle_layout_ban') {
        botConfig.commands.ban.buttonStyle = botConfig.commands.ban.buttonStyle === 'separate' ? 'slide' : 'separate';
        return interaction.update({
          content: `✅ Ban action layout updated. Current style: **${botConfig.commands.ban.buttonStyle}**`
        });
      }

      else if (customId.startsWith('mod_toggle_')) {
        const tokens = customId.split('_');
        const actionType = tokens[2]; // toggle or dm
        const subjectCmd = tokens[3]; // ban or mute

        if (actionType === 'toggle') {
          botConfig.commands[subjectCmd].enabled = !botConfig.commands[subjectCmd].enabled;
          return interaction.update({
            content: `⚙️ Command \`/${subjectCmd}\` state updated to: **${botConfig.commands[subjectCmd].enabled ? 'Enabled' : 'Disabled'}**`
          });
        } else if (actionType === 'dm') {
          botConfig.commands[subjectCmd].sendDm = !botConfig.commands[subjectCmd].sendDm;
          return interaction.update({
            content: `⚙️ DM notifications for \`/${subjectCmd}\` updated to: **${botConfig.commands[subjectCmd].sendDm ? 'Enabled' : 'Disabled'}**`
          });
        }
      }

      else if (customId.startsWith('action_') || customId.startsWith('slide_')) {
        return interaction.reply({
          content: 'ℹ️ Interactive button action registered successfully.',
          ephemeral: true
        });
      }
    }

    // C. Modal Submission Handler
    else if (interaction.isModalSubmit()) {
      const modalId = interaction.customId;
      systemLog('info', `Modal submitted: ${modalId} by ${interaction.user.tag}`);

      if (modalId === 'modal_edit_ban' || modalId === 'modal_edit_mute') {
        const targetCmd = modalId.includes('ban') ? 'ban' : 'mute';
        
        const newTitle = interaction.fields.getTextInputValue('input_title');
        const newDesc = interaction.fields.getTextInputValue('input_desc');
        const newThumb = interaction.fields.getTextInputValue('input_thumb');
        const newImage = interaction.fields.getTextInputValue('input_image');

        if (!isValidHttpUrl(newThumb) || !isValidHttpUrl(newImage)) {
          return interaction.reply({
            content: '❌ Validation Error: Please provide valid HTTP or HTTPS URLs for image and thumbnail fields.',
            ephemeral: true
          });
        }

        botConfig.commands[targetCmd].title = newTitle;
        botConfig.commands[targetCmd].description = newDesc;
        botConfig.commands[targetCmd].thumbnail = newThumb;
        botConfig.commands[targetCmd].image = newImage;

        return interaction.reply({
          content: `✅ Successfully saved and applied template changes for **/${targetCmd}**!`,
          ephemeral: true
        });
      }
    }

  } catch (interactionError) {
    systemLog('error', `Unhandled interaction exception: ${interactionError.message}`);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '⚠️ An unexpected error occurred while processing your request.', ephemeral: true }).catch(() => {});
    }
  }
});

// Prefix Command Message Listener (?command support)
client.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const cleanBody = message.content.slice(PREFIX.length).trim();
  const args = cleanBody.split(/ +/);
  const commandName = args.shift().toLowerCase();

  systemLog('info', `Received prefix execution query: ?${commandName} from ${message.author.tag}`);

  if (['ban', 'unban', 'mute', 'unmute'].includes(commandName)) {
    await executeCommand(message, commandName, args, false);
  } else if (commandName === 'embed-dashboard') {
    message.reply('ℹ️ Please use the official slash command version `/embed-dashboard` to load interactive UI modals.');
  } else if (commandName === 'moderation-dashboard') {
    message.reply('ℹ️ Please use the official slash command version `/moderation-dashboard` to load management panels.');
  }
});

// ==========================================
// 8. ERROR BOUNDARIES & BOT INITIALIZATION
// ==========================================
process.on('unhandledRejection', error => {
  systemLog('error', `Unhandled Promise Rejection caught: ${error.message}`);
  console.error(error);
});

process.on('uncaughtException', error => {
  systemLog('error', `Uncaught Exception caught: ${error.message}`);
  console.error(error);
});

// Authenticate Bot Instance
systemLog('info', 'Attempting connection handshake with Discord Gateway...');
client.login(process.env.TOKEN);
