'use strict';
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Events,
  GatewayIntentBits, ModalBuilder, PermissionFlagsBits, REST, Routes,
  SlashCommandBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const { DISCORD_TOKEN: TOKEN, CLIENT_ID, GUILD_ID } = process.env;
const STATE_FILE = path.join(__dirname, 'bot-state.json');
const KEYS = ['ban', 'unban', 'mute', 'unmute'];
const MAX_TIMEOUT = 28 * 86400000;
const DEFAULT_COLOR = '#5865F2';
if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Set DISCORD_TOKEN, CLIENT_ID, and GUILD_ID in .env.');
  process.exit(1);
}
const freshCommand = () => ({
  enabled: true, name: '', visibility: 'public', sendDM: true,
  dmTitle: 'A moderation action was taken',
  dmMessage: 'A moderator has taken an action on your account in **{server}**.\nAction: **{action}**\nReason: {reason}',
  responseLinks: [],
  slides: [{ title: 'Moderation action', description: 'Use /embed-dashboard to customize this response.', color: DEFAULT_COLOR, image: '', thumbnail: '', footer: '' }],
});
function loadState() {
  const defaults = Object.fromEntries(KEYS.map(k => [k, freshCommand()]));
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    for (const k of KEYS) {
      saved.commands ||= {};
      saved.commands[k] = { ...defaults[k], ...(saved.commands[k] || {}) };
      if (!Array.isArray(saved.commands[k].slides) || !saved.commands[k].slides.length) saved.commands[k].slides = defaults[k].slides;
      if (!Array.isArray(saved.commands[k].responseLinks)) saved.commands[k].responseLinks = [];
    }
    return saved;
  } catch { return { commands: defaults }; }
}
let state = loadState();
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
const slashName = k => state.commands[k].name || k;
const isAdmin = i => i.memberPermissions?.has(PermissionFlagsBits.Administrator) || i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
const safeColor = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : DEFAULT_COLOR;
const safeUrl = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? value : ''; } catch { return ''; } };
const safeName = (s, fallback) => s.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || fallback;
function embedFor(key, page = 0, fields = []) {
  const slides = state.commands[key].slides;
  const slide = slides[Math.max(0, Math.min(page, slides.length - 1))];
  const e = new EmbedBuilder().setColor(safeColor(slide.color)).setTitle((slide.title || 'Moderation').slice(0, 256)).setDescription((slide.description || '\u200b').slice(0, 4000));
  if (safeUrl(slide.image)) e.setImage(safeUrl(slide.image));
  if (safeUrl(slide.thumbnail)) e.setThumbnail(safeUrl(slide.thumbnail));
  if (fields.length) e.addFields(fields.slice(0, 25));
  if (slides.length > 1) e.setFooter({ text: `${slide.footer || 'Browse with the buttons'} â€¢ ${page + 1}/${slides.length}`.slice(0, 2048) });
  else if (slide.footer) e.setFooter({ text: slide.footer.slice(0, 2048) });
  return e;
}
function responseButtons(key, page) {
  const rows = [];
  const links = state.commands[key].responseLinks.filter(x => x.label && safeUrl(x.url)).slice(0, 5);
  if (links.length) rows.push(new ActionRowBuilder().addComponents(links.map(x => new ButtonBuilder().setLabel(x.label.slice(0, 80)).setStyle(ButtonStyle.Link).setURL(safeUrl(x.url)))));
  const count = state.commands[key].slides.length;
  if (count > 1) rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`slide:${key}:${page - 1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`slide:${key}:${page + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page >= count - 1),
  ));
  return rows;
}
async function deny(i) {
  const data = { content: 'You need **Manage Server** or **Administrator** for this action.', ephemeral: true };
  return i.replied || i.deferred ? i.followUp(data) : i.reply(data);
}
function commandData() {
  const data = [
    new SlashCommandBuilder().setName('embed-dashboard').setDescription('Edit moderation embeds, slides, images, thumbnails, and link buttons'),
    new SlashCommandBuilder().setName('moderation-dashboard').setDescription('Configure moderation commands, names, visibility, and DMs'),
    new SlashCommandBuilder().setName(slashName('ban')).setDescription('Ban a member').addUserOption(o => o.setName('user').setDescription('Member to ban').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason').setMaxLength(500)),
    new SlashCommandBuilder().setName(slashName('unban')).setDescription('Unban a user by Discord ID').addStringOption(o => o.setName('user_id').setDescription('Discord user ID').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason').setMaxLength(500)),
    new SlashCommandBuilder().setName(slashName('mute')).setDescription('Temporarily time out a member').addUserOption(o => o.setName('user').setDescription('Member to mute').setRequired(true)).addStringOption(o => o.setName('duration').setDescription('For example 30s, 15m, or 2h').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason').setMaxLength(500)),
    new SlashCommandBuilder().setName(slashName('unmute')).setDescription('Remove a member timeout').addUserOption(o => o.setName('user').setDescription('Member to unmute').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason').setMaxLength(500)),
  ];
  return data.map(x => x.toJSON());
}
async function syncCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commandData() });
}
function selectRow(id, selected) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder('Choose a moderation command').addOptions(KEYS.map(k => ({ label: `/${slashName(k)}`, value: k, default: k === selected }))));
}
function embedDashboard(key, page) {
  const c = state.commands[key];
  const editRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dash:edit:embed:${key}:${page}`).setLabel('Edit slide').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`dash:add:embed:${key}:${page}`).setLabel('Add slide').setStyle(ButtonStyle.Success).setDisabled(c.slides.length >= 10),
    new ButtonBuilder().setCustomId(`dash:delete:embed:${key}:${page}`).setLabel('Delete slide').setStyle(ButtonStyle.Danger).setDisabled(c.slides.length <= 1),
  );
  const pageRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dash:page:embed:${key}:${page - 1}`).setLabel('Previous slide').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`dash:page:embed:${key}:${page + 1}`).setLabel('Next slide').setStyle(ButtonStyle.Secondary).setDisabled(page >= c.slides.length - 1),
    new ButtonBuilder().setCustomId(`dash:links:embed:${key}:${page}`).setLabel('Edit link buttons').setStyle(ButtonStyle.Secondary),
  );
  return { content: `Editing **/${slashName(key)}** Â· slide ${page + 1}/${c.slides.length}`, embeds: [embedFor(key, page)], components: [selectRow('embed:select', key), editRow, pageRow], ephemeral: true };
}
function moderationDashboard(key) {
  const c = state.commands[key];
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod:toggle:${key}`).setLabel(c.enabled ? 'Disable command' : 'Enable command').setStyle(c.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`mod:settings:${key}`).setLabel('Edit name and DM text').setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod:visibility:${key}`).setLabel(`Response: ${c.visibility}`).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod:dm:${key}`).setLabel(`DMs: ${c.sendDM ? 'on' : 'off'}`).setStyle(c.sendDM ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
  return { content: `**/${slashName(key)}** Â· ${c.enabled ? 'enabled' : 'disabled'} Â· ${c.visibility} response Â· DMs ${c.sendDM ? 'on' : 'off'} Â· ${c.slides.length} slide(s)`, embeds: [embedFor(key)], components: [selectRow('mod:select', key), row1, row2], ephemeral: true };
}
function slideModal(key, page, add) {
  const old = add ? { title: '', description: '', color: DEFAULT_COLOR, image: '', thumbnail: '' } : state.commands[key].slides[page];
  const modal = new ModalBuilder().setCustomId(`modal:slide:embed:${key}:${page}:${add ? 'add' : 'edit'}`).setTitle(`${add ? 'Add' : 'Edit'} /${slashName(key)} slide`);
  for (const [id, label, style, max] of [
    ['title', 'Title', TextInputStyle.Short, 256], ['description', 'Description', TextInputStyle.Paragraph, 4000],
    ['color', 'Hex color, e.g. #5865F2', TextInputStyle.Short, 20], ['image', 'Image URL (optional)', TextInputStyle.Short, 500], ['thumbnail', 'Thumbnail URL (optional)', TextInputStyle.Short, 500],
  ]) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(id === 'description').setMaxLength(max).setValue((old[id] || '').slice(0, max))));
  return modal;
}
function linksModal(key, page) {
  const modal = new ModalBuilder().setCustomId(`modal:links:embed:${key}:${page}`).setTitle(`Link buttons for /${slashName(key)}`);
  for (let i = 0; i < 2; i++) {
    const item = state.commands[key].responseLinks[i] || {};
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(`label${i + 1}`).setLabel(`Button ${i + 1} label (blank removes)`).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80).setValue((item.label || '').slice(0, 80))));
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(`url${i + 1}`).setLabel(`Button ${i + 1} URL (https://...)`).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500).setValue((item.url || '').slice(0, 500))));
  }
  return modal;
}
function settingsModal(key) {
  const c = state.commands[key];
  const modal = new ModalBuilder().setCustomId(`modal:settings:${key}`).setTitle(`Settings for /${slashName(key)}`);
  for (const [id, label, style, max] of [
    ['name', 'Slash command name', TextInputStyle.Short, 32], ['dmTitle', 'DM embed title', TextInputStyle.Short, 100],
    ['dmMessage', 'DM message: {server}, {action}, {reason}', TextInputStyle.Paragraph, 1500],
  ]) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true).setMaxLength(max).setValue((id === 'name' ? slashName(key) : c[id]).slice(0, max))));
  return modal;
}
function parseDuration(raw) {
  const m = /^\s*(\d{1,6})\s*([smhd])\s*$/i.exec(raw || '');
  if (!m) return null;
  const ms = Number(m[1]) * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2].toLowerCase()]);
  return Number.isSafeInteger(ms) && ms > 0 && ms <= MAX_TIMEOUT ? ms : null;
}
const template = (s, v) => s.replace(/\{(server|action|reason)\}/g, (_, k) => v[k] ?? '');
async function dmUser(user, key, values) {
  const c = state.commands[key];
  if (!c.sendDM) return 'DM delivery is disabled';
  try {
    const e = new EmbedBuilder().setColor(safeColor(c.slides[0]?.color)).setTitle(template(c.dmTitle, values).slice(0, 256)).setDescription(template(c.dmMessage, values).slice(0, 4000));
    if (safeUrl(c.slides[0]?.image)) e.setImage(safeUrl(c.slides[0].image));
    if (safeUrl(c.slides[0]?.thumbnail)) e.setThumbnail(safeUrl(c.slides[0].thumbnail));
    await user.send({ embeds: [e] }); return 'DM sent';
  } catch { return 'DM could not be delivered (their DMs may be closed)'; }
}
async function allowed(i, member, permission) {
  if (!isAdmin(i) || !i.guild.members.me?.permissions.has(permission)) return false;
  if (member) {
    if (member.id === i.user.id || member.id === i.guild.ownerId) return false;
    const bot = i.guild.members.me;
    if (member.roles.highest.position >= bot.roles.highest.position) return false;
    if (member.roles.highest.position >= i.member.roles.highest.position && i.guild.ownerId !== i.user.id) return false;
  }
  return true;
}
async function finish(i, key, fields, dmText) {
  const c = state.commands[key];
  return i.reply({ content: dmText, embeds: [embedFor(key, 0, fields)], components: responseButtons(key, 0), ephemeral: c.visibility === 'private' });
}
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.once(Events.ClientReady, async c => {
  console.log(`Ready as ${c.user.tag}`);
  try { await syncCommands(); console.log(`Registered commands for guild ${GUILD_ID}`); }
  catch (e) { console.error('Command registration failed:', e.message); }
});
client.on(Events.InteractionCreate, async i => {
  try {
    if (i.isChatInputCommand()) {
      if (i.commandName === 'embed-dashboard' || i.commandName === 'moderation-dashboard') {
        if (!isAdmin(i)) return deny(i);
        return i.reply(i.commandName === 'embed-dashboard' ? embedDashboard('ban', 0) : moderationDashboard('ban'));
      }
      const key = KEYS.find(k => slashName(k) === i.commandName);
      if (!key) return;
      if (!state.commands[key].enabled) return i.reply({ content: 'This moderation command is disabled.', ephemeral: true });
      if (!isAdmin(i)) return deny(i);
      const reason = i.options.getString('reason') || 'No reason provided';
      const guild = i.guild;
      if (key === 'ban') {
        const user = i.options.getUser('user', true), member = await guild.members.fetch(user.id).catch(() => null);
        if (!await allowed(i, member, PermissionFlagsBits.BanMembers)) return i.reply({ content: 'Cannot ban that member. Check role hierarchy and bot permissions.', ephemeral: true });
        const dm = await dmUser(user, key, { server: guild.name, action: 'Ban', reason });
        await guild.members.ban(user.id, { reason: `${reason} | Moderator: ${i.user.tag}` });
        return finish(i, key, [{ name: 'User', value: `${user.tag} (${user.id})` }, { name: 'Reason', value: reason }], dm);
      }
      if (key === 'unban') {
        const id = i.options.getString('user_id', true).trim();
        if (!/^\d{17,20}$/.test(id)) return i.reply({ content: 'Enter a valid Discord user ID.', ephemeral: true });
        if (!i.memberPermissions.has(PermissionFlagsBits.BanMembers)) return i.reply({ content: 'The bot needs **Ban Members** permission.', ephemeral: true });
        const user = await client.users.fetch(id).catch(() => null);
        if (!user) return i.reply({ content: 'Could not find that Discord user.', ephemeral: true });
        if (!await guild.bans.fetch(id).catch(() => null)) return i.reply({ content: 'That user is not banned from this server.', ephemeral: true });
        const dm = await dmUser(user, key, { server: guild.name, action: 'Unban', reason });
        await guild.members.unban(id, `${reason} | Moderator: ${i.user.tag}`);
        return finish(i, key, [{ name: 'User', value: `${user.tag} (${user.id})` }, { name: 'Reason', value: reason }], dm);
      }
      if (key === 'mute') {
        const user = i.options.getUser('user', true), member = await guild.members.fetch(user.id).catch(() => null), raw = i.options.getString('duration', true), duration = parseDuration(raw);
        if (!duration) return i.reply({ content: 'Use `30s`, `15m`, `2h`, or `1d`. Discord timeouts max out at 28 days.', ephemeral: true });
        if (!member) return i.reply({ content: 'That user is not a member of this server.', ephemeral: true });
        if (!await allowed(i, member, PermissionFlagsBits.ModerateMembers)) return i.reply({ content: 'Cannot mute that member. Check role hierarchy and bot permissions.', ephemeral: true });
        const dm = await dmUser(user, key, { server: guild.name, action: `Mute for ${raw}`, reason });
        await member.timeout(duration, `${reason} | Moderator: ${i.user.tag}`);
        return finish(i, key, [{ name: 'User', value: `${user.tag} (${user.id})` }, { name: 'Duration', value: raw }, { name: 'Reason', value: reason }], dm);
      }
      if (key === 'unmute') {
        const user = i.options.getUser('user', true), member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return i.reply({ content: 'That user is not a member of this server.', ephemeral: true });
        if (!await allowed(i, member, PermissionFlagsBits.ModerateMembers)) return i.reply({ content: 'Cannot unmute that member. Check role hierarchy and bot permissions.', ephemeral: true });
        const dm = await dmUser(user, key, { server: guild.name, action: 'Unmute', reason });
        await member.timeout(null, `${reason} | Moderator: ${i.user.tag}`);
        return finish(i, key, [{ name: 'User', value: `${user.tag} (${user.id})` }, { name: 'Reason', value: reason }], dm);
      }
    }
    if (i.isStringSelectMenu()) {
      if (!isAdmin(i)) return deny(i);
      const key = i.values[0];
      if (!KEYS.includes(key)) return;
      if (i.customId === 'embed:select') return i.update(embedDashboard(key, 0));
      if (i.customId === 'mod:select') return i.update(moderationDashboard(key));
    }
    if (i.isButton()) {
      if (i.customId.startsWith('slide:')) {
        const [, key, pageText] = i.customId.split(':');
        const page = Number(pageText);
        return i.update({ embeds: [embedFor(key, page)], components: responseButtons(key, page) });
      }
      if (i.customId.startsWith('mod:') || i.customId.startsWith('dash:')) {
        if (!isAdmin(i)) return deny(i);
        const p = i.customId.split(':');
        if (p[0] === 'mod') {
          const [, action, key] = p;
          if (action === 'toggle') state.commands[key].enabled = !state.commands[key].enabled;
          if (action === 'visibility') state.commands[key].visibility = state.commands[key].visibility === 'public' ? 'private' : 'public';
          if (action === 'dm') state.commands[key].sendDM = !state.commands[key].sendDM;
          save();
          if (action === 'settings') return i.showModal(settingsModal(key));
          return i.update(moderationDashboard(key));
        }
        const [, action, , key, rawPage] = p;
        let page = Math.max(0, Math.min(Number(rawPage) || 0, state.commands[key].slides.length - 1));
        if (action === 'links') return i.showModal(linksModal(key, page));
        if (action === 'edit') return i.showModal(slideModal(key, page, false));
        if (action === 'add') return i.showModal(slideModal(key, state.commands[key].slides.length, true));
        if (action === 'page') return i.update(embedDashboard(key, Math.max(0, Math.min(Number(rawPage), state.commands[key].slides.length - 1))));
        if (action === 'delete') {
          if (state.commands[key].slides.length <= 1) return i.reply({ content: 'Keep at least one slide per command.', ephemeral: true });
          state.commands[key].slides.splice(page, 1); save();
          return i.update(embedDashboard(key, Math.min(page, state.commands[key].slides.length - 1)));
        }
      }
    }
    if (i.isModalSubmit()) {
      if (!isAdmin(i)) return deny(i);
      const p = i.customId.split(':');
      if (p[0] === 'modal' && p[1] === 'slide') {
        const [, , , key, rawPage, op] = p, page = Number(rawPage);
        const slide = {
          title: i.fields.getTextInputValue('title').trim(),
          description: i.fields.getTextInputValue('description').trim(),
          color: safeColor(i.fields.getTextInputValue('color').trim()),
          image: safeUrl(i.fields.getTextInputValue('image').trim()), thumbnail: safeUrl(i.fields.getTextInputValue('thumbnail').trim()), footer: '',
        };
        if (op === 'add') state.commands[key].slides.push(slide); else state.commands[key].slides[page] = slide;
        save();
        return i.reply(embedDashboard(key, op === 'add' ? state.commands[key].slides.length - 1 : page));
      }
      if (p[0] === 'modal' && p[1] === 'links') {
        const [, , , key, rawPage] = p, links = [];
        for (let n = 1; n <= 2; n++) {
          const label = i.fields.getTextInputValue(`label${n}`).trim(), url = safeUrl(i.fields.getTextInputValue(`url${n}`).trim());
          if (label && url) links.push({ label, url });
        }
        state.commands[key].responseLinks = links; save();
        return i.reply(embedDashboard(key, Number(rawPage) || 0));
      }
      if (p[0] === 'modal' && p[1] === 'settings') {
        const key = p[2], name = safeName(i.fields.getTextInputValue('name').trim(), key);
        if (KEYS.some(other => other !== key && slashName(other) === name)) return i.reply({ content: 'That command name is already taken.', ephemeral: true });
        state.commands[key].name = name === key ? '' : name;
        state.commands[key].dmTitle = i.fields.getTextInputValue('dmTitle').trim();
        state.commands[key].dmMessage = i.fields.getTextInputValue('dmMessage').trim(); save();
        try { await syncCommands(); }
        catch (e) { console.error('Rename registration failed:', e.message); return i.reply({ content: 'Saved settings, but Discord rejected the rename. Check command registration and retry.', ephemeral: true }); }
        return i.reply({ content: `Saved. Use **/${name}** now. Visibility and DM delivery are toggled in the moderation dashboard.`, ephemeral: true });
      }
    }
  } catch (e) {
    console.error('Interaction error:', e);
    const msg = { content: 'Something went wrong. Check the bot console for details.', ephemeral: true };
    if (i.replied || i.deferred) await i.followUp(msg).catch(() => {}); else await i.reply(msg).catch(() => {});
  }
});
client.login(TOKEN);