'use strict';
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, Events,
  GatewayIntentBits, ModalBuilder, PermissionFlagsBits, REST, Routes,
  SlashCommandBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { DISCORD_TOKEN: TOKEN, CLIENT_ID, GUILD_ID } = process.env;
const STATE_FILE = path.join(__dirname, 'bot-state.json');
const CATALOG = [
  // Member moderation (23)
  ['ban','Members','Ban a member', ['user','reason']], ['unban','Members','Unban by Discord user ID',['user_id','reason']], ['kick','Members','Kick a member',['user','reason']], ['softban','Members','Ban then unban to remove recent messages',['user','reason']], ['tempban','Members','Temporarily ban a member',['user','duration','reason']], ['mute','Members','Timeout a member',['user','duration','reason']], ['unmute','Members','Remove a member timeout',['user','reason']], ['warn','Members','Issue a recorded warning',['user','reason']], ['warnings','Members','View a memberâ€™s warning history',['user']], ['clearwarnings','Members','Clear a memberâ€™s warning history',['user','reason']], ['setnickname','Members','Set a member nickname',['user','nickname','reason']], ['resetnickname','Members','Reset a member nickname',['user','reason']], ['addrole','Roles & voice','Give a role to a member',['user','role','reason']], ['removerole','Roles & voice','Remove a role from a member',['user','role','reason']], ['roleinfo','Roles & voice','Inspect a role and its members',['role']], ['memberinfo','Members','Inspect a memberâ€™s account and server profile',['user']], ['modnote','Members','Add a private staff note',['user','text']], ['modnotes','Members','Read private staff notes',['user']], ['clearnotes','Members','Clear private staff notes',['user','reason']], ['quarantine','Roles & voice','Apply a quarantine role',['user','role','reason']], ['release','Roles & voice','Remove a quarantine role',['user','role','reason']], ['deafen','Roles & voice','Server-deafen a voice member',['user','reason']], ['undeafen','Roles & voice','Remove server deafen',['user','reason']], ['voicemute','Roles & voice','Server-mute a voice member',['user','reason']], ['voiceunmute','Roles & voice','Remove server voice mute',['user','reason']], ['disconnect','Roles & voice','Disconnect a member from voice',['user','reason']], ['movevoice','Roles & voice','Move a member to a voice channel',['user','channel','reason']],
  // Message moderation (17)
  ['purge','Messages','Bulk delete recent messages',['count']], ['purgeuser','Messages','Delete recent messages from one member',['user','count']], ['purgebots','Messages','Delete recent bot messages',['count']], ['purgelinks','Messages','Delete recent messages containing links',['count']], ['purgeattachments','Messages','Delete recent messages with attachments',['count']], ['purgeembeds','Messages','Delete recent messages with embeds',['count']], ['purgecontains','Messages','Delete recent messages containing text',['text','count']], ['purgecommands','Messages','Delete recent slash/prefix command messages',['count']], ['purgeinvites','Messages','Delete messages containing Discord invites',['count']], ['purgeimages','Messages','Delete recent messages containing images',['count']], ['pin','Messages','Pin a message by its ID',['message_id']], ['unpin','Messages','Unpin a message by its ID',['message_id']], ['slowmode','Messages','Set this channelâ€™s slowmode',['seconds']], ['slowmodeoff','Messages','Disable channel slowmode',[]], ['clearreactions','Messages','Remove all reactions from a message',['message_id']], ['cleanwebhooks','Messages','Delete recent webhook messages',['count']], ['purgeattachmentsonly','Messages','Delete messages with file attachments',['count']],
  // Channel and server safety (16)
  ['lock','Channels','Lock this channel for @everyone', ['reason']], ['unlock','Channels','Unlock this channel',['reason']], ['lockdown','Channels','Lock this channel and threads',['reason']], ['unlockdown','Channels','Remove this channel lockdown',['reason']], ['lockthread','Channels','Lock the current thread',['reason']], ['unlockthread','Channels','Unlock the current thread',['reason']], ['archive','Channels','Archive the current thread',['reason']], ['unarchive','Channels','Unarchive the current thread',['reason']], ['settopic','Channels','Set this channel topic',['topic']], ['resettopic','Channels','Clear this channel topic',[]], ['channelinfo','Channels','Show details about this channel',[]], ['raidmode','Channels','Enable raid slowmode in this channel',[]], ['normalmode','Channels','Restore normal channel slowmode',[]], ['setchannelname','Channels','Rename this channel',['text']], ['setnsfw','Channels','Mark this channel NSFW',['enabled']], ['clearlock','Channels','Clear this channelâ€™s @everyone send restriction',[]],
  // Cases, reports, and staff workflow (12)
  ['report','Staff tools','Submit a report for staff review',['user','description']], ['reports','Staff tools','View unresolved member reports',[]], ['resolvereport','Staff tools','Resolve a report by its ID',['report_id','resolution']], ['case','Staff tools','View a moderation case by ID',['case_id']], ['cases','Staff tools','View recent moderation cases for a member',['user']], ['modlog','Staff tools','View a memberâ€™s moderation history',['user']], ['raidstatus','Staff tools','Show raid-mode status for this channel',[]], ['staffannounce','Staff tools','Post a formatted notice to the configured staff log channel',['text']], ['purgeown','Staff tools','Delete recent messages by a selected member (staff only)',['user','count']], ['appealinfo','Staff tools','Display an appeal instruction message',['text']], ['rolegrant','Roles & voice','Add one role to a selected member',['user','role']], ['rolerevoke','Roles & voice','Remove one role from a selected member',['user','role']],
].map(([name, category, description, options]) => ({name,category,description,options}));
const MODS = CATALOG.map(x => x.name);
const CATEGORY_NAMES = [...new Set(CATALOG.map(x => x.category))];
const MAX_TIMEOUT = 28 * 86400000;
const DEFAULT_COLOR = '#5865F2';
if (!TOKEN || !CLIENT_ID || !GUILD_ID) { console.error('Set DISCORD_TOKEN, CLIENT_ID, and GUILD_ID in .env.'); process.exit(1); }
const defaultSlide = () => ({ title: 'Moderation action', description: '{action} for {user}.\nReason: {reason}{duration_line}', color: DEFAULT_COLOR, image: '', thumbnail: '', footer: '' });
const defaultMod = () => ({ enabled: true, name: '', visibility: 'public', sendDM: true, dmTitle: 'A moderation action was taken', dmMessage: 'A moderator has taken an action on your account in **{server}**.\nAction: **{action}**\nReason: {reason}{duration_line}', responseLinks: [], fieldLabels: { user: 'User', reason: 'Reason', duration: 'Duration' }, slides: [defaultSlide()] });
const defaultWelcome = () => ({ enabled: false, channelId: '', title: 'Welcome to {server}!', message: 'Welcome {user}! You are member **#{memberCount}**.', color: DEFAULT_COLOR, image: '', thumbnail: '' });
const defaultLeave = () => ({ enabled: false, channelId: '', title: 'A member left', message: '{user} has left **{server}**.', color: DEFAULT_COLOR, image: '', thumbnail: '' });
const defaultTickets = () => ({ enabled: false, categoryId: '', staffRoleId: '', logChannelId: '', panelTitle: 'Need help?', panelDescription: 'Press the button below to open a private support ticket.', panelButton: 'Create ticket', channelName: 'ticket-{username}', intro: 'Hi {user}, tell us how we can help. <@&{staffRoleId}>', color: DEFAULT_COLOR, closeButton: 'Close ticket', closedPrefix: 'closed-' });
function loadState() {
  const defaults = { commands: Object.fromEntries(MODS.map(k => [k, defaultMod()])), welcome: defaultWelcome(), leave: defaultLeave(), tickets: defaultTickets(), openTickets: {}, records: { warnings: {}, notes: {}, reports: [], cases: [], temporaryBans: {} }, raidMode: {} };
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    saved.commands ||= {};
    for (const k of MODS) saved.commands[k] = { ...defaults.commands[k], ...(saved.commands[k] || {}), fieldLabels: { ...defaults.commands[k].fieldLabels, ...(saved.commands[k]?.fieldLabels || {}) } };
    saved.welcome = { ...defaults.welcome, ...(saved.welcome || {}) };
    saved.leave = { ...defaults.leave, ...(saved.leave || {}) };
    saved.tickets = { ...defaults.tickets, ...(saved.tickets || {}) };
    saved.openTickets ||= {}; saved.records ||= defaults.records; saved.records.warnings ||= {}; saved.records.notes ||= {}; saved.records.reports ||= []; saved.records.cases ||= []; saved.records.temporaryBans ||= {}; saved.raidMode ||= {};
    return saved;
  } catch { return defaults; }
}
let state = loadState();
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
const slashName = k => state.commands[k].name || k;
const isAdmin = i => i.memberPermissions?.has(PermissionFlagsBits.Administrator) || i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
const color = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : DEFAULT_COLOR;
const url = s => { try { const u = new URL(s); return ['https:', 'http:'].includes(u.protocol) ? s : ''; } catch { return ''; } };
const cleanName = (s, fallback) => s.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || fallback;
const fill = (s, values) => String(s || '').replace(/\{(server|action|reason|duration|duration_line|user|username|memberCount|staffRoleId)\}/g, (_, k) => values[k] ?? '');
async function deny(i) { const p = { content: 'You need **Manage Server** or **Administrator** for this action.', ephemeral: true }; return i.replied || i.deferred ? i.followUp(p) : i.reply(p); }
function modEmbed(key, page = 0, fields = []) {
  const cfg = state.commands[key], slide = cfg.slides[Math.max(0, Math.min(page, cfg.slides.length - 1))];
  const e = new EmbedBuilder().setColor(color(slide.color)).setTitle(fill(slide.title, {} ).slice(0, 256)).setDescription(fill(slide.description, {}).slice(0, 4000) || '\u200b');
  if (url(slide.image)) e.setImage(url(slide.image)); if (url(slide.thumbnail)) e.setThumbnail(url(slide.thumbnail));
  if (fields.length) e.addFields(fields.slice(0, 25));
  if (cfg.slides.length > 1) e.setFooter({ text: `${slide.footer || 'Browse using the buttons'} â€¢ ${page + 1}/${cfg.slides.length}`.slice(0, 2048) }); else if (slide.footer) e.setFooter({ text: slide.footer.slice(0, 2048) });
  return e;
}
function linkRows(key, page) {
  const rows = [], links = state.commands[key].responseLinks.filter(x => x.label && url(x.url)).slice(0, 5);
  if (links.length) rows.push(new ActionRowBuilder().addComponents(links.map(x => new ButtonBuilder().setLabel(x.label.slice(0, 80)).setStyle(ButtonStyle.Link).setURL(url(x.url)))));
  if (state.commands[key].slides.length > 1) rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`slide:${key}:${page - 1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`slide:${key}:${page + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page >= state.commands[key].slides.length - 1),
  ));
  return rows;
}
function selector(id, selected, category) {
  const selectedDef = CATALOG.find(x => x.name === selected) || CATALOG[0];
  const chosenCategory = category || selectedDef.category;
  const defs = CATALOG.filter(x => x.category === chosenCategory);
  const commandRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder('Choose a command to customize').addOptions(defs.map(x => ({ label: `/${slashName(x.name)}`, value: x.name, default: x.name === selected }))));
  const categoryRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(id.replace(':select', ':category')).setPlaceholder(`Category: ${chosenCategory}`).addOptions(CATEGORY_NAMES.map(x => ({ label: x, value: x, default: x === chosenCategory }))));
  return [categoryRow, commandRow];
}
function embedDash(key, page = 0) {
  const c = state.commands[key], last = c.slides.length - 1, category = CATALOG.find(x => x.name === key)?.category || CATEGORY_NAMES[0];
  return { content: `Editing **/${slashName(key)}** Â· slide ${page + 1}/${c.slides.length}. Placeholders: \`{action}\`, \`{user}\`, \`{reason}\`, \`{duration}\`, \`{duration_line}\`, \`{server}\`, \`{moderator}\`, \`{channel}\`, \`{count}\`. Each command has its own text, field labels, style, and buttons.`, embeds: [modEmbed(key, page)], ephemeral: true, components: [...selector('embed:select', key, category), new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`e:edit:${key}:${page}`).setLabel('Edit embed text/style').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`e:fields:${key}:${page}`).setLabel('Edit field labels').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`e:footer:${key}:${page}`).setLabel('Edit footer').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`e:links:${key}:${page}`).setLabel('Edit link buttons').setStyle(ButtonStyle.Secondary),
  ), new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`e:add:${key}:${page}`).setLabel('Add slide').setStyle(ButtonStyle.Success).setDisabled(c.slides.length >= 10),
    new ButtonBuilder().setCustomId(`e:delete:${key}:${page}`).setLabel('Delete slide').setStyle(ButtonStyle.Danger).setDisabled(c.slides.length <= 1),
    new ButtonBuilder().setCustomId(`e:page:${key}:${page - 1}`).setLabel('Previous slide').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`e:page:${key}:${page + 1}`).setLabel('Next slide').setStyle(ButtonStyle.Secondary).setDisabled(page >= last),
  )] };
}
function modDash(key) {
  const c = state.commands[key], category = CATALOG.find(x => x.name === key)?.category || CATEGORY_NAMES[0];
  return { content: `**/${slashName(key)}** Â· ${c.enabled ? 'enabled' : 'disabled'} Â· ${c.visibility} response Â· DMs ${c.sendDM ? 'on' : 'off'}`, embeds: [modEmbed(key)], ephemeral: true, components: [...selector('mod:select', key, category), new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`m:toggle:${key}`).setLabel(c.enabled ? 'Disable' : 'Enable').setStyle(c.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`m:settings:${key}`).setLabel('Edit name and DM text').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`m:vis:${key}`).setLabel(`Response: ${c.visibility}`).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`m:dm:${key}`).setLabel(`DMs: ${c.sendDM ? 'on' : 'off'}`).setStyle(c.sendDM ? ButtonStyle.Success : ButtonStyle.Secondary),
  )] };
}
function serverDash(section) {
  const cfg = section === 'welcome' ? state.welcome : section === 'leave' ? state.leave : state.tickets;
  const enabled = cfg.enabled;
  const title = section === 'welcome' ? 'Welcome messages' : section === 'leave' ? 'Leave messages' : 'Ticket system';
  const content = section === 'tickets'
    ? `**${title}** Â· ${enabled ? 'enabled' : 'disabled'} Â· category ${cfg.categoryId || 'not set'} Â· staff role ${cfg.staffRoleId || 'not set'} Â· log channel ${cfg.logChannelId || 'not set'}`
    : `**${title}** Â· ${enabled ? 'enabled' : 'disabled'} Â· channel ${cfg.channelId || 'not set'} Â· placeholders: \`{user}\`, \`{server}\`, \`{memberCount}\``;
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`s:toggle:${section}`).setLabel(enabled ? 'Disable' : 'Enable').setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`s:content:${section}`).setLabel('Edit text and embed').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`s:settings:${section}`).setLabel(section === 'tickets' ? 'Edit ticket setup' : 'Set channel').setStyle(ButtonStyle.Secondary),
  )];
  if (section === 'tickets') {
    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('s:panel:tickets').setLabel('Post ticket panel here').setStyle(ButtonStyle.Success)));
    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('s:intro:tickets').setLabel('Edit ticket intro and close button').setStyle(ButtonStyle.Secondary)));
  }
  return { content, embeds: [previewServerEmbed(section)], ephemeral: true, components: rows };
}
function previewServerEmbed(section) {
  const cfg = section === 'welcome' ? state.welcome : section === 'leave' ? state.leave : state.tickets;
  const e = new EmbedBuilder().setColor(color(cfg.color)).setTitle(fill(section === 'tickets' ? cfg.panelTitle : cfg.title, { server: 'Example server', user: '@ExampleUser', memberCount: '42' }).slice(0, 256))
    .setDescription(fill(section === 'tickets' ? cfg.panelDescription : cfg.message, { server: 'Example server', user: '@ExampleUser', memberCount: '42', username: 'exampleuser', staffRoleId: 'staff-role-id' }).slice(0, 4000) || '\u200b');
  if (url(cfg.image)) e.setImage(url(cfg.image)); if (url(cfg.thumbnail)) e.setThumbnail(url(cfg.thumbnail)); return e;
}
function slideModal(key, page, adding) {
  const old = adding ? defaultSlide() : state.commands[key].slides[page];
  const modal = new ModalBuilder().setCustomId(`modal:slide:${key}:${page}:${adding ? 'add' : 'edit'}`).setTitle(`${adding ? 'Add' : 'Edit'} /${slashName(key)} embed`);
  for (const [id, label, style, max, required] of [['title','Title',TextInputStyle.Short,256,false],['description','Description (supports placeholders)',TextInputStyle.Paragraph,4000,true],['color','Hex color, e.g. #5865F2',TextInputStyle.Short,20,false],['image','Image URL (optional)',TextInputStyle.Short,500,false],['thumbnail','Thumbnail URL (optional)',TextInputStyle.Short,500,false]])
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max).setValue((old[id] || '').slice(0,max))));
  return modal;
}
function footerModal(key, page) {
  const footer = state.commands[key].slides[page]?.footer || '';
  return new ModalBuilder().setCustomId(`modal:footer:${key}:${page}`).setTitle(`Edit footer for /${slashName(key)}`).addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('footer').setLabel('Footer text (blank removes it)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(2048).setValue(footer.slice(0, 2048))));
}
function fieldsModal(key) {
  const f = state.commands[key].fieldLabels, modal = new ModalBuilder().setCustomId(`modal:fields:${key}`).setTitle(`Embed field labels for /${slashName(key)}`);
  for (const [id,label] of [['user','User field label (blank hides it)'],['reason','Reason field label (blank hides it)'],['duration','Duration / period field label (blank hides it)']]) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(f[id] || '')));
  return modal;
}
function linksModal(key) {
  const modal = new ModalBuilder().setCustomId(`modal:links:${key}`).setTitle(`Link buttons for /${slashName(key)}`);
  for (let n=1;n<=2;n++) { const x=state.commands[key].responseLinks[n-1]||{};
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(`label${n}`).setLabel(`Button ${n} label (blank removes)`).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80).setValue((x.label||'').slice(0,80))));
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(`url${n}`).setLabel(`Button ${n} URL`).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500).setValue((x.url||'').slice(0,500))));
  } return modal;
}
function modSettingsModal(key) {
  const c=state.commands[key], modal=new ModalBuilder().setCustomId(`modal:modsettings:${key}`).setTitle(`Settings for /${slashName(key)}`);
  for (const [id,label,style,max,value] of [['name','Slash command name',TextInputStyle.Short,32,slashName(key)],['dmTitle','DM embed title',TextInputStyle.Short,100,c.dmTitle],['dmMessage','DM message: {server}, {action}, {reason}, {duration_line}',TextInputStyle.Paragraph,1500,c.dmMessage]]) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true).setMaxLength(max).setValue(value.slice(0,max))));
  return modal;
}
function serverContentModal(section) {
  const c=section==='welcome'?state.welcome:section==='leave'?state.leave:state.tickets;
  const titleField=section==='tickets'?'panelTitle':'title', descField=section==='tickets'?'panelDescription':'message';
  const modal=new ModalBuilder().setCustomId(`modal:scontent:${section}`).setTitle(`Edit ${section} embed and text`);
  for (const [id,label,style,max,value,required] of [[titleField,'Embed title',TextInputStyle.Short,256,c[titleField],false],[descField,'Embed/message text',TextInputStyle.Paragraph,4000,c[descField],true],['color','Hex color',TextInputStyle.Short,20,c.color,false],['image','Image URL (optional)',TextInputStyle.Short,500,c.image,false],['thumbnail','Thumbnail URL (optional)',TextInputStyle.Short,500,c.thumbnail,false]]) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max).setValue((value||'').slice(0,max))));
  return modal;
}
function serverSettingsModal(section) {
  const c=section==='welcome'?state.welcome:section==='leave'?state.leave:state.tickets;
  const modal=new ModalBuilder().setCustomId(`modal:ssettings:${section}`).setTitle(`${section} configuration`);
  const fields=section==='tickets' ? [
    ['categoryId','Ticket category channel ID',c.categoryId],['staffRoleId','Support role ID',c.staffRoleId],['logChannelId','Ticket log channel ID',c.logChannelId],['panelButton','Panel button label',c.panelButton],['channelName','Channel name template: ticket-{username}',c.channelName],
  ] : [['channelId','Message channel ID',c.channelId]];
  for(const [id,label,value] of fields) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(value||'')));
  return modal;
}
function ticketIntroModal(){const c=state.tickets,m=new ModalBuilder().setCustomId('modal:ticketintro').setTitle('Ticket intro and close button');
  for(const [id,label,value,style,max] of [['intro','Ticket opening message: {user}, {staffRoleId}',c.intro,TextInputStyle.Paragraph,1500],['closeButton','Close button label',c.closeButton,TextInputStyle.Short,80],['closedPrefix','Closed channel prefix',c.closedPrefix,TextInputStyle.Short,20]])m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true).setMaxLength(max).setValue((value||'').slice(0,max)))); return m;}
function parseDuration(raw){const m=/^\s*(\d{1,6})\s*([smhd])\s*$/i.exec(raw||'');if(!m)return null;const ms=Number(m[1])*({s:1000,m:60000,h:3600000,d:86400000}[m[2].toLowerCase()]);return Number.isSafeInteger(ms)&&ms>0&&ms<=MAX_TIMEOUT?ms:null;}
function addOption(builder, field) {
  const optional = field === 'reason';
  if (field === 'user') return builder.addUserOption(o => o.setName('user').setDescription('Target member').setRequired(true));
  if (field === 'user_id') return builder.addStringOption(o => o.setName('user_id').setDescription('Discord user ID').setRequired(true));
  if (field === 'role') return builder.addRoleOption(o => o.setName('role').setDescription('Role to affect').setRequired(true));
  if (field === 'channel') return builder.addChannelOption(o => o.setName('channel').setDescription('Voice channel').addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice).setRequired(true));
  if (field === 'count') return builder.addIntegerOption(o => o.setName('count').setDescription('Maximum number of messages, 1 to 100').setMinValue(1).setMaxValue(100).setRequired(true));
  if (field === 'duration') return builder.addStringOption(o => o.setName('duration').setDescription('Duration like 30s, 15m, 2h, or 1d').setRequired(true));
  if (field === 'seconds') return builder.addIntegerOption(o => o.setName('seconds').setDescription('Slowmode seconds, 0 to 21600').setMinValue(0).setMaxValue(21600).setRequired(true));
  if (field === 'enabled') return builder.addBooleanOption(o => o.setName('enabled').setDescription('Whether NSFW mode should be enabled').setRequired(true));
  const names = { reason: 'reason', nickname: 'nickname', text: 'text', topic: 'topic', message_id: 'message_id', description: 'description', report_id: 'report_id', resolution: 'resolution', case_id: 'case_id' };
  const descriptions = { reason: 'Reason (optional)', nickname: 'New nickname (up to 32 characters)', text: 'Text or filter to apply', topic: 'New channel topic', message_id: 'Message ID', description: 'Describe the report', report_id: 'Report ID', resolution: 'Resolution note', case_id: 'Case ID' };
  return builder.addStringOption(o => o.setName(names[field] || field).setDescription(descriptions[field] || field).setMaxLength(field === 'reason' ? 500 : 1000).setRequired(!optional));
}
async function syncCommands() {
  const fixed = [
    new SlashCommandBuilder().setName('embed-dashboard').setDescription('Customize every moderation command response embed'),
    new SlashCommandBuilder().setName('moderation-dashboard').setDescription('Enable, rename, and configure moderation commands'),
    new SlashCommandBuilder().setName('server-dashboard').setDescription('Configure tickets, welcome, and leave messages'),
    new SlashCommandBuilder().setName('ticket-panel').setDescription('Post the configured ticket panel in this channel'),
  ];
  const commands = CATALOG.map(def => {
    let b = new SlashCommandBuilder().setName(slashName(def.name)).setDescription(def.description.toLowerCase().slice(0, 100));
    for (const field of def.options) b = addOption(b, field);
    return b;
  });
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [...fixed, ...commands].map(x => x.toJSON()) });
}
async function canAct(i,member,permission){if(!i.guild.members.me?.permissions.has(permission))return false;if(member&&(member.id===i.user.id||member.id===i.guild.ownerId||member.roles.highest.position>=i.guild.members.me.roles.highest.position||(member.roles.highest.position>=i.member.roles.highest.position&&i.guild.ownerId!==i.user.id)))return false;return true;}
async function sendDm(user,key,vals){const c=state.commands[key];if(!c.sendDM)return 'DM delivery disabled';try{const txt=fill(c.dmMessage,vals),e=new EmbedBuilder().setColor(color(c.slides[0].color)).setTitle(fill(c.dmTitle,vals).slice(0,256)).setDescription(txt.slice(0,4000));if(url(c.slides[0].image))e.setImage(url(c.slides[0].image));if(url(c.slides[0].thumbnail))e.setThumbnail(url(c.slides[0].thumbnail));await user.send({embeds:[e]});return 'DM sent';}catch{return 'DM not delivered (possibly closed DMs)';}}
async function moderationReply(i,key,vals,dm){const c=state.commands[key],labels=c.fieldLabels,fields=[];if(labels.user)fields.push({name:labels.user,value:vals.user,inline:true});if(labels.duration&&vals.duration)fields.push({name:labels.duration,value:vals.duration,inline:true});if(labels.reason)fields.push({name:labels.reason,value:vals.reason});const desc=fill(c.slides[0].description,{...vals,duration_line:vals.duration?`\nDuration: ${vals.duration}`:''});const embed=modEmbed(key,0,fields).setDescription(desc.slice(0,4000)||'\u200b');return i.reply({content:dm,embeds:[embed],components:linkRows(key,0),ephemeral:c.visibility==='private'});}
function canUseModCommand(i, key) {
  if (i.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  const has = perm => Boolean(i.memberPermissions?.has(perm));
  if (key === 'report') return true;
  if (['ban','unban','softban','tempban'].includes(key)) return has(PermissionFlagsBits.BanMembers);
  if (key === 'kick') return has(PermissionFlagsBits.KickMembers);
  if (['mute','unmute','timeout','untimeout','warn','warnings','clearwarnings','quarantine','release'].includes(key)) return has(PermissionFlagsBits.ModerateMembers) || has(PermissionFlagsBits.ManageGuild);
  if (['addrole','removerole','rolegrant','rolerevoke'].includes(key)) return has(PermissionFlagsBits.ManageRoles);
  if (['purge','purgeuser','purgebots','purgelinks','purgeattachments','purgeembeds','purgecontains','purgecommands','purgeinvites','purgeimages','purgeattachmentsonly','purgeown','pin','unpin','clearreactions','cleanwebhooks'].includes(key)) return has(PermissionFlagsBits.ManageMessages);
  if (['lock','unlock','lockdown','unlockdown','lockthread','unlockthread','archive','unarchive','settopic','resettopic','setchannelname','setnsfw','clearlock','slowmode','slowmodeoff','raidmode','normalmode'].includes(key)) return has(PermissionFlagsBits.ManageChannels);
  if (['deafen','undeafen'].includes(key)) return has(PermissionFlagsBits.DeafenMembers);
  if (['setnickname','resetnickname'].includes(key)) return has(PermissionFlagsBits.ManageNicknames);
  if (['voicemute','voiceunmute','disconnect','movevoice'].includes(key)) return has(PermissionFlagsBits.MuteMembers) || has(PermissionFlagsBits.MoveMembers);
  return has(PermissionFlagsBits.ManageMessages) || has(PermissionFlagsBits.ModerateMembers) || has(PermissionFlagsBits.ManageGuild);
}
function getOpt(i, name) {
  return i.options.getUser(name) || i.options.getRole(name) || i.options.getChannel(name) || i.options.getString(name) || i.options.getInteger(name) || i.options.getBoolean(name) || null;
}
function recordCase(guildId, key, target, reason, moderatorId) {
  const list = state.records.cases;
  const id = String((list.at(-1)?.id || 0) + 1);
  list.push({ id, guildId, command: key, target, reason: reason || 'No reason provided', moderatorId, createdAt: Date.now() });
  if (list.length > 1000) list.splice(0, list.length - 1000);
  return id;
}
function addRowRecord(group, guildId, userId, entry) {
  const id = `${guildId}:${userId}`;
  group[id] ||= [];
  group[id].push(entry);
  if (group[id].length > 100) group[id].splice(0, group[id].length - 100);
}
function buildActionEmbed(key, vals, fields = []) {
  const page = 0, cfg = state.commands[key], slide = cfg.slides[page];
  const variables = { ...vals, duration_line: vals.duration ? `\nDuration: ${vals.duration}` : '', server: vals.server || '', moderator: vals.moderator || '', channel: vals.channel || '', count: vals.count ?? '' };
  const e = modEmbed(key, page, fields);
  e.setTitle(fill(slide.title, variables).slice(0, 256) || 'Moderation update');
  e.setDescription(fill(slide.description, variables).slice(0, 4000) || '\u200b');
  return e;
}
function isLinkMessage(m) { return /https?:\/\//i.test(m.content); }
function hasInvite(m) { return /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)/i.test(m.content); }
function hasImage(m) { return m.attachments.some(a => /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(a.url)) || m.embeds.some(e => Boolean(e.image || e.thumbnail)); }
async function bulkPurge(i, key, filterFn) {
  if (!i.channel?.bulkDelete || !i.channel.isTextBased()) throw new Error('This command only works in a text channel.');
  if (!i.channel.permissionsFor(i.guild.members.me).has(PermissionFlagsBits.ManageMessages)) throw new Error('Bot needs Manage Messages permission in this channel.');
  const count = i.options.getInteger('count', true), fetched = await i.channel.messages.fetch({ limit: Math.min(100, Math.max(count * 3, count)) });
  const candidates = fetched.filter(m => filterFn(m)).first(count);
  const result = await i.channel.bulkDelete(candidates, true);
  return { count: result.size };
}
async function executeCatalogCommand(i, key) {
  const guild = i.guild, def = CATALOG.find(x => x.name === key), reason = i.options.getString('reason') || 'No reason provided';
  if (!def) return;
  if (!state.commands[key].enabled) return i.reply({ content: 'This moderation command is disabled.', ephemeral: true });
  if (!canUseModCommand(i, key)) return deny(i);
  const user = i.options.getUser('user'), member = user ? await guild.members.fetch(user.id).catch(() => null) : null;
  const userVal = user ? `${user.tag} (${user.id})` : '';
  if (member && !['unban','warnings','clearwarnings','memberinfo','modnote','modnotes','clearnotes','report','cases','modlog'].includes(key)) {
    if (member.id === i.user.id || member.id === guild.ownerId || member.roles.highest.position >= guild.members.me.roles.highest.position || (member.roles.highest.position >= i.member.roles.highest.position && guild.ownerId !== i.user.id)) return i.reply({ content: 'Role hierarchy prevents this action on that member.', ephemeral: true });
  }
  let action = def.description, fields = [], targetValue = userVal, duration = '', resultText = '';
  const vals = { action, user: userVal || i.user.tag, reason, duration, moderator: i.user.tag, server: guild.name, channel: i.channel?.name || '', count: '' };
  const dm = async (target, act, durationText = '') => sendDm(target, key, { server: guild.name, action: act, reason, duration: durationText, duration_line: durationText ? `\nDuration: ${durationText}` : '' });
  if (key === 'ban' || key === 'tempban' || key === 'softban') {
    if (!user) return i.reply({ content: 'Select a target member.', ephemeral: true });
    let temp = '';
    if (key === 'tempban') { temp = i.options.getString('duration', true); if (!parseDuration(temp)) return i.reply({ content: 'Enter a duration such as 10m, 2h, or 1d (maximum 28 days).', ephemeral: true }); }
    const dmText = await dm(user, key === 'softban' ? 'Softban' : 'Ban', temp);
    await guild.members.ban(user.id, { reason: `${reason} | Moderator: ${i.user.tag}` });
    if (key === 'softban') await guild.members.unban(user.id, `Softban cleanup | ${i.user.tag}`);
    if (key === 'tempban') { state.records.temporaryBans[`${guild.id}:${user.id}`] = { userId: user.id, guildId: guild.id, expiresAt: Date.now() + parseDuration(temp) }; save(); scheduleTempban(guild.id, user.id, Date.now() + parseDuration(temp)); }
    vals.action = key === 'softban' ? 'Softban' : key === 'tempban' ? 'Temporary ban' : 'Ban'; vals.duration = temp; resultText = dmText;
  } else if (key === 'unban') {
    const id = i.options.getString('user_id', true).trim(); if (!/^\d{17,20}$/.test(id)) return i.reply({ content: 'That is not a valid Discord user ID.', ephemeral: true });
    const banned = await guild.bans.fetch(id).catch(()=>null), target = await client.users.fetch(id).catch(()=>null);
    if (!banned || !target) return i.reply({ content: 'That user is not banned here, or could not be found.', ephemeral: true });
    resultText = await dm(target, 'Unban'); await guild.members.unban(id, `${reason} | Moderator: ${i.user.tag}`); vals.user = `${target.tag} (${id})`; vals.action = 'Unban';
  } else if (['mute','timeout'].includes(key)) {
    const raw = i.options.getString('duration', true), ms = parseDuration(raw); if (!ms) return i.reply({ content: 'Use 30s, 15m, 2h, or 1d. Discord timeout max is 28 days.', ephemeral: true });
    if (!member || !await canAct(i, member, PermissionFlagsBits.ModerateMembers)) return i.reply({ content: 'Cannot timeout that member. Check hierarchy and bot permissions.', ephemeral: true });
    resultText = await dm(user, 'Timeout', raw); await member.timeout(ms, `${reason} | Moderator: ${i.user.tag}`); vals.action = 'Timeout'; vals.duration = raw;
  } else if (['unmute','untimeout'].includes(key)) {
    if (!member || !await canAct(i, member, PermissionFlagsBits.ModerateMembers)) return i.reply({ content: 'Cannot remove timeout. Check hierarchy and bot permissions.', ephemeral: true });
    resultText = await dm(user, 'Timeout removed'); await member.timeout(null, `${reason} | Moderator: ${i.user.tag}`); vals.action = 'Timeout removed';
  } else if (key === 'kick') {
    if (!member || !await canAct(i, member, PermissionFlagsBits.KickMembers)) return i.reply({ content: 'Cannot kick that member. Check hierarchy and bot permissions.', ephemeral: true });
    resultText = await dm(user, 'Kick'); await member.kick(`${reason} | Moderator: ${i.user.tag}`); vals.action = 'Kick';
  } else if (key === 'warn') {
    if (!member) return i.reply({ content: 'Member must still be in this server.', ephemeral: true });
    addRowRecord(state.records.warnings, guild.id, user.id, { reason, moderatorId: i.user.id, createdAt: Date.now() }); save(); resultText = await dm(user, 'Warning'); vals.action = 'Warning';
  } else if (key === 'warnings' || key === 'clearwarnings') {
    const entries = state.records.warnings[`${guild.id}:${user.id}`] || [];
    if (key === 'clearwarnings') { state.records.warnings[`${guild.id}:${user.id}`] = []; save(); vals.action = 'Warnings cleared'; }
    else { vals.action = 'Warning history'; fields.push({ name: 'Warnings', value: entries.length ? entries.slice(-10).map((x,n)=>`${n+1}. ${x.reason} <t:${Math.floor(x.createdAt/1000)}:R>`).join('\n').slice(0,1024) : 'No warnings on record.' }); }
  } else if (key === 'setnickname' || key === 'resetnickname') {
    if (!member || !await canAct(i, member, PermissionFlagsBits.ManageNicknames)) return i.reply({ content: 'Cannot edit that nickname. Check Manage Nicknames and role hierarchy.', ephemeral: true });
    const nick = key === 'resetnickname' ? null : i.options.getString('nickname', true).slice(0,32); await member.setNickname(nick, reason); vals.action = key === 'resetnickname' ? 'Nickname reset' : 'Nickname changed'; vals.duration = nick || 'server username';
  } else if (key === 'addrole' || key === 'removerole' || key === 'quarantine' || key === 'release' || key === 'rolegrant' || key === 'rolerevoke') {
    const role = i.options.getRole('role', true); if (!member) return i.reply({ content: 'Member not found.', ephemeral: true });
    if (!i.memberPermissions.has(PermissionFlagsBits.ManageRoles) || !guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= guild.members.me.roles.highest.position || (role.position >= i.member.roles.highest.position && guild.ownerId !== i.user.id)) return i.reply({ content: 'Manage Roles is required, and the selected role must be below both your top role and the botâ€™s top role.', ephemeral: true });
    const add = ['addrole','quarantine','rolegrant'].includes(key); if (add) await member.roles.add(role, reason); else await member.roles.remove(role, reason); vals.action = `${add?'Role added':'Role removed'}: ${role.name}`; vals.duration = '';
  } else if (['deafen','undeafen','voicemute','voiceunmute','disconnect','movevoice'].includes(key)) {
    if (!member || !member.voice.channel) return i.reply({ content: 'That member is not connected to voice.', ephemeral: true });
    const voicePerm = ['deafen','undeafen'].includes(key) ? PermissionFlagsBits.DeafenMembers : ['voicemute','voiceunmute'].includes(key) ? PermissionFlagsBits.MuteMembers : PermissionFlagsBits.MoveMembers;
    if (!i.memberPermissions.has(voicePerm)) return i.reply({ content: `You need the relevant voice permission (${key}).`, ephemeral: true });
    if (key === 'deafen') await member.voice.setDeaf(true, reason); if (key === 'undeafen') await member.voice.setDeaf(false, reason); if (key === 'voicemute') await member.voice.setMute(true, reason); if (key === 'voiceunmute') await member.voice.setMute(false, reason); if (key === 'disconnect') await member.voice.disconnect(reason); if (key === 'movevoice') { const ch=i.options.getChannel('channel',true); await member.voice.setChannel(ch,reason); vals.duration=ch.name; }
    vals.action = key;
  } else if (key === 'memberinfo') {
    if (!member) return i.reply({ content: 'Member not found.', ephemeral: true }); fields.push({name:'Created',value:`<t:${Math.floor(user.createdTimestamp/1000)}:F>`,inline:true},{name:'Joined',value:member.joinedTimestamp?`<t:${Math.floor(member.joinedTimestamp/1000)}:F>`:'Unknown',inline:true},{name:'Roles',value:member.roles.cache.filter(r=>r.id!==guild.id).map(r=>r.toString()).join(', ').slice(0,1024)||'None'}); vals.action='Member information';
  } else if (key === 'modnote' || key === 'modnotes' || key === 'clearnotes') {
    const id=`${guild.id}:${user.id}`, notes=state.records.notes[id]||[];
    if(key==='modnote'){addRowRecord(state.records.notes,guild.id,user.id,{text:i.options.getString('text',true),moderatorId:i.user.id,createdAt:Date.now()});save();vals.action='Staff note added';}
    else if(key==='clearnotes'){state.records.notes[id]=[];save();vals.action='Staff notes cleared';}
    else {vals.action='Staff notes';fields.push({name:'Private notes',value:notes.length?notes.slice(-10).map(n=>`â€¢ ${n.text}`).join('\n').slice(0,1024):'No staff notes.'});}
  } else if (key === 'roleinfo') {
    const role=i.options.getRole('role',true);vals.action='Role information';fields.push({name:'Role',value:`${role} (${role.id})`,inline:true},{name:'Members',value:String(role.members.size),inline:true},{name:'Color',value:role.hexColor,inline:true});
  } else if (key === 'purge' || key.startsWith('purge')) {
    const filtered = await bulkPurge(i,key,m=>{
      if (m.pinned) return false;
      if (key==='purgeuser'||key==='purgeown') return m.author.id===i.options.getUser('user',true).id;
      if (key==='purgebots') return m.author.bot;
      if (key==='purgelinks') return isLinkMessage(m);
      if (key==='purgeattachments'||key==='purgeattachmentsonly') return m.attachments.size>0;
      if (key==='purgeembeds') return m.embeds.length>0;
      if (key==='purgecontains') return m.content.toLowerCase().includes(i.options.getString('text',true).toLowerCase());
      if (key==='purgecommands') return m.content.startsWith('/')||m.content.startsWith('!')||m.content.startsWith('.');
      if (key==='purgeinvites') return hasInvite(m);
      if (key==='purgeimages') return hasImage(m);
      return true;
    }); vals.action='Messages deleted'; vals.count=filtered.count; vals.reason=`Deleted ${filtered.count} message(s)`;
  } else if (key === 'pin' || key === 'unpin' || key === 'clearreactions') {
    const message=await i.channel.messages.fetch(i.options.getString('message_id',true)).catch(()=>null);if(!message)return i.reply({content:'Message not found in this channel.',ephemeral:true});
    if(!i.channel.permissionsFor(guild.members.me).has(PermissionFlagsBits.ManageMessages))return i.reply({content:'Bot needs Manage Messages permission.',ephemeral:true});
    if(key==='pin')await message.pin(reason);if(key==='unpin')await message.unpin(reason);if(key==='clearreactions')await message.reactions.removeAll();vals.action=key;
  } else if (key === 'slowmode' || key === 'slowmodeoff') {
    if (!i.channel.setRateLimitPerUser) return i.reply({content:'This channel does not support slowmode.',ephemeral:true}); const n=key==='slowmodeoff'?0:i.options.getInteger('seconds',true);await i.channel.setRateLimitPerUser(n,reason);vals.action=n?`Slowmode set to ${n} seconds`:'Slowmode disabled';vals.duration=n?`${n}s`:'';
  } else if (['lock','unlock','lockdown','unlockdown','clearlock'].includes(key)) {
    if(!i.channel.permissionOverwrites)return i.reply({content:'Cannot change permissions in this channel.',ephemeral:true}); const on=['lock','lockdown'].includes(key);await i.channel.permissionOverwrites.edit(guild.roles.everyone.id,{SendMessages:on?false:null,SendMessagesInThreads:on?false:null,CreatePublicThreads:on?false:null,CreatePrivateThreads:on?false:null}, {reason});vals.action=on?'Channel locked':'Channel unlocked';
  } else if (['lockthread','unlockthread','archive','unarchive'].includes(key)) {
    if(!i.channel.isThread())return i.reply({content:'Run this inside a thread.',ephemeral:true});if(key==='lockthread')await i.channel.setLocked(true,reason);if(key==='unlockthread')await i.channel.setLocked(false,reason);if(key==='archive')await i.channel.setArchived(true,reason);if(key==='unarchive')await i.channel.setArchived(false,reason);vals.action=key;
  } else if (key==='settopic'||key==='resettopic') { if(!i.channel.setTopic)return i.reply({content:'This channel does not support a topic.',ephemeral:true});await i.channel.setTopic(key==='resettopic'?null:i.options.getString('topic',true),reason);vals.action='Channel topic updated'; }
  else if(key==='channelinfo'){vals.action='Channel information';fields.push({name:'Channel',value:`${i.channel} (${i.channel.id})`,inline:true},{name:'Type',value:String(i.channel.type),inline:true},{name:'Created',value:`<t:${Math.floor(i.channel.createdTimestamp/1000)}:F>`});}
  else if(key==='setchannelname'){if(!i.channel.setName)return i.reply({content:'Cannot rename this channel.',ephemeral:true});await i.channel.setName(cleanName(i.options.getString('text',true),'moderated-channel'),reason);vals.action='Channel renamed';}
  else if(key==='setnsfw'){if(!i.channel.setNSFW)return i.reply({content:'Cannot set NSFW on this channel.',ephemeral:true});await i.channel.setNSFW(i.options.getBoolean('enabled',true),reason);vals.action='NSFW setting updated';}
  else if(key==='raidmode'||key==='normalmode'){const active=key==='raidmode',seconds=active?10:0;if(i.channel.setRateLimitPerUser)await i.channel.setRateLimitPerUser(seconds,`Raid mode by ${i.user.tag}`);state.raidMode[`${guild.id}:${i.channelId}`]=active;save();vals.action=active?'Raid mode enabled':'Raid mode disabled';}
  else if(key==='raidstatus'){vals.action='Raid mode status';fields.push({name:'Current channel',value:state.raidMode[`${guild.id}:${i.channelId}`]?'Enabled':'Disabled'});}
  else if(key==='cleanwebhooks'){const out=await bulkPurge(i,key,m=>Boolean(m.webhookId));vals.action='Webhook messages deleted';vals.count=out.count;}
  else if(key==='report'){const rep={id:String((state.records.reports.at(-1)?.id||0)+1),guildId:guild.id,userId:user.id,reporterId:i.user.id,description:i.options.getString('description',true),createdAt:Date.now(),resolved:false};state.records.reports.push(rep);save();const ticketCfg=state.tickets;if(ticketCfg.logChannelId)await writeLog(guild,`Report #${rep.id} about <@${user.id}> from <@${i.user.id}>: ${rep.description}`);vals.action=`Report submitted #${rep.id}`;vals.reason=rep.description;}
  else if(key==='reports'){vals.action='Open reports';const list=state.records.reports.filter(r=>r.guildId===guild.id&&!r.resolved).slice(-10);fields.push({name:'Reports',value:list.length?list.map(r=>`#${r.id} about <@${r.userId}>: ${r.description}`).join('\n').slice(0,1024):'No open reports.'});}
  else if(key==='resolvereport'){const id=i.options.getString('report_id',true),rep=state.records.reports.find(r=>r.guildId===guild.id&&r.id===id);if(!rep)return i.reply({content:'Report ID not found.',ephemeral:true});rep.resolved=true;rep.resolution=i.options.getString('resolution',true);rep.resolvedBy=i.user.id;save();vals.action=`Report #${id} resolved`;vals.reason=rep.resolution;}
  else if(key==='case'){const id=i.options.getString('case_id',true),item=state.records.cases.find(x=>x.guildId===guild.id&&x.id===id);if(!item)return i.reply({content:'Case ID not found.',ephemeral:true});vals.action=`Case #${id}`;fields.push({name:'Action',value:item.command,inline:true},{name:'Target',value:item.target,inline:true},{name:'Reason',value:item.reason},{name:'Moderator',value:`<@${item.moderatorId}>`,inline:true});}
  else if(key==='cases'||key==='modlog'){const list=state.records.cases.filter(x=>x.guildId===guild.id&&x.target.includes(user.id)).slice(-10).reverse();vals.action='Moderation history';fields.push({name:'Cases',value:list.length?list.map(x=>`#${x.id} Â· ${x.command} Â· ${x.reason}`).join('\n').slice(0,1024):'No cases found.'});}
  else if(key==='staffannounce'){if(!state.tickets.logChannelId)return i.reply({content:'Set the staff log channel in /server-dashboard first.',ephemeral:true});const staffChannel=await guild.channels.fetch(state.tickets.logChannelId).catch(()=>null);if(!staffChannel?.isTextBased())return i.reply({content:'The configured staff log channel is missing or not a text channel.',ephemeral:true});const notice=i.options.getString('text',true);await staffChannel.send({embeds:[new EmbedBuilder().setColor(color(state.commands[key].slides[0].color)).setTitle(fill(state.commands[key].slides[0].title,{action:'Staff notice',user:i.user.tag,reason:'',duration_line:''})).setDescription(notice).setTimestamp()]});vals.action='Staff notice posted';vals.reason=notice;}
  else if(key==='appealinfo'){vals.action='Appeal information';vals.reason=i.options.getString('text',true);}
  else { return i.reply({content:'This command is not implemented yet.',ephemeral:true}); }
  const labels=state.commands[key].fieldLabels;
  if(labels.user && vals.user && !fields.some(f=>f.name===labels.user)) fields.unshift({name:labels.user,value:String(vals.user).slice(0,1024),inline:true});
  if(labels.duration && vals.duration && !fields.some(f=>f.name===labels.duration)) fields.push({name:labels.duration,value:String(vals.duration).slice(0,1024),inline:true});
  if(labels.reason && vals.reason && !fields.some(f=>f.name===labels.reason)) fields.push({name:labels.reason,value:String(vals.reason).slice(0,1024)});
  const readOnly=['warnings','modnotes','roleinfo','memberinfo','channelinfo','raidstatus','reports','case','cases','modlog','appealinfo'];
  const caseId=readOnly.includes(key)?null:recordCase(guild.id,key,targetValue||vals.user||'N/A',reason,i.user.id);if(caseId){save();fields.push({name:'Case',value:`#${caseId}`,inline:true});}
  const embed=buildActionEmbed(key,vals,fields),c=state.commands[key];
  return i.reply({content:resultText||undefined,embeds:[embed],components:linkRows(key,0),ephemeral:c.visibility==='private'});
}
function scheduleTempban(guildId,userId,expiresAt) {
  const wait=Math.max(0,expiresAt-Date.now()); setTimeout(async()=>{try{const rec=state.records.temporaryBans[`${guildId}:${userId}`];if(!rec||rec.expiresAt!==expiresAt)return;if(Date.now()<expiresAt){scheduleTempban(guildId,userId,expiresAt);return;}const guild=await client.guilds.fetch(guildId);await guild.members.unban(userId,'Temporary ban expired');delete state.records.temporaryBans[`${guildId}:${userId}`];save();}catch(e){console.error('Temporary ban expiry failed:',e.message);}},Math.min(wait,2147483647));
}
function ticketPanelPayload(){const c=state.tickets;return{embeds:[previewServerEmbed('tickets')],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:create').setLabel((c.panelButton||'Create ticket').slice(0,80)).setStyle(ButtonStyle.Primary))]};}
async function writeLog(guild,text){const id=state.tickets.logChannelId;if(!id)return;const ch=await guild.channels.fetch(id).catch(()=>null);if(ch?.isTextBased())await ch.send({content:text}).catch(()=>{});}
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});
client.once(Events.ClientReady,async c=>{console.log(`Ready as ${c.user.tag}`);for(const r of Object.values(state.records.temporaryBans||{}))scheduleTempban(r.guildId,r.userId,r.expiresAt);try{await syncCommands();console.log(`Registered ${CATALOG.length} moderation commands for guild ${GUILD_ID}`);}catch(e){console.error('Command registration failed:',e.message);}});
client.on(Events.GuildMemberAdd,async member=>{const c=state.welcome;if(!c.enabled||!c.channelId)return;const ch=await member.guild.channels.fetch(c.channelId).catch(()=>null);if(!ch?.isTextBased())return;const e=previewServerEmbed('welcome');e.setTitle(fill(c.title,{server:member.guild.name,user:member.user.username,memberCount:member.guild.memberCount}));e.setDescription(fill(c.message,{server:member.guild.name,user:`<@${member.id}>`,memberCount:member.guild.memberCount}));await ch.send({embeds:[e]}).catch(err=>console.error('Welcome send failed:',err.message));});
client.on(Events.GuildMemberRemove,async member=>{const c=state.leave;if(!c.enabled||!c.channelId)return;const ch=await member.guild.channels.fetch(c.channelId).catch(()=>null);if(!ch?.isTextBased())return;const e=previewServerEmbed('leave');e.setTitle(fill(c.title,{server:member.guild.name,user:member.user.username,memberCount:member.guild.memberCount}));e.setDescription(fill(c.message,{server:member.guild.name,user:`${member.user.username} (${member.user.tag})`,memberCount:member.guild.memberCount}));await ch.send({embeds:[e]}).catch(err=>console.error('Leave send failed:',err.message));});
client.on(Events.InteractionCreate,async i=>{try{
  if(i.isChatInputCommand()){
    if(['embed-dashboard','moderation-dashboard','server-dashboard'].includes(i.commandName)){if(!isAdmin(i))return deny(i);if(i.commandName==='embed-dashboard')return i.reply(embedDash('ban'));if(i.commandName==='moderation-dashboard')return i.reply(modDash('ban'));return i.reply(serverDash('tickets'));}
    if(i.commandName==='ticket-panel'){if(!isAdmin(i))return deny(i);if(!state.tickets.enabled)return i.reply({content:'Enable tickets in /server-dashboard first.',ephemeral:true});return i.reply(ticketPanelPayload());}
    const def=CATALOG.find(x=>slashName(x.name)===i.commandName);if(def)return executeCatalogCommand(i,def.name);
  }
  if(i.isStringSelectMenu()){if(!isAdmin(i))return deny(i);const [kind,action]=i.customId.split(':');if(action==='category'){const list=CATALOG.filter(x=>x.category===i.values[0]);const key=list[0]?.name||'ban';return i.update(kind==='embed'?embedDash(key):modDash(key));}const key=i.values[0];if(!CATALOG.some(x=>x.name===key))return;if(kind==='embed')return i.update(embedDash(key));if(kind==='mod')return i.update(modDash(key));}
  if(i.isButton()){
    if(i.customId.startsWith('slide:')){const [,key,p]=i.customId.split(':');return i.update({embeds:[modEmbed(key,Number(p))],components:linkRows(key,Number(p))});}
    if(i.customId==='ticket:create'){
      if(!state.tickets.enabled)return i.reply({content:'The ticket system is disabled.',ephemeral:true});
      const existing=state.openTickets[i.guildId]?.[i.user.id];if(existing){const ch=await i.guild.channels.fetch(existing).catch(()=>null);if(ch)return i.reply({content:`You already have an open ticket: ${ch}`,ephemeral:true});}
      const c=state.tickets,category=await i.guild.channels.fetch(c.categoryId).catch(()=>null),staff=await i.guild.roles.fetch(c.staffRoleId).catch(()=>null);
      if(!category||category.type!==ChannelType.GuildCategory||!staff)return i.reply({content:'Ticket setup is incomplete. Ask an administrator to check category and support role IDs in /server-dashboard.',ephemeral:true});
      const channelName=cleanName(fill(c.channelName,{username:i.user.username.toLowerCase().replace(/[^a-z0-9-]/g,'-')}),`ticket-${i.user.id.slice(-6)}`).slice(0,90);
      const channel=await i.guild.channels.create({name:channelName,type:ChannelType.GuildText,parent:category.id,topic:`Support ticket for ${i.user.tag} (${i.user.id})`,permissionOverwrites:[{id:i.guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},{id:i.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]},{id:staff.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageMessages]},{id:client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ReadMessageHistory]}]});
      state.openTickets[i.guildId]||={};state.openTickets[i.guildId][i.user.id]=channel.id;save();
      const e=new EmbedBuilder().setColor(color(c.color)).setTitle('Support ticket').setDescription(fill(c.intro,{user:`<@${i.user.id}>`,staffRoleId:staff.id}));
      await channel.send({content:`<@${i.user.id}> <@&${staff.id}>`,embeds:[e],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:close').setLabel(c.closeButton.slice(0,80)).setStyle(ButtonStyle.Danger))]});
      return i.reply({content:`Ticket created: ${channel}`,ephemeral:true});
    }
    if(i.customId==='ticket:close'||i.customId==='ticket:reopen'){
      const topic=i.channel.topic||'', ownerMatch=topic.match(/\((\d{17,20})\)/), ownerId=ownerMatch?.[1], staffRole=state.tickets.staffRoleId;
      const isOwner=ownerId===i.user.id, isStaff=isAdmin(i)||Boolean(staffRole&&i.member.roles.cache.has(staffRole));
      if(!isOwner&&!isStaff)return i.reply({content:'Only the ticket opener or support staff can manage this ticket.',ephemeral:true});
      if(i.customId==='ticket:close'){
        await i.channel.permissionOverwrites.edit(ownerId,{SendMessages:false}).catch(()=>{});
        const prefix=state.tickets.closedPrefix||'closed-';if(!i.channel.name.startsWith(prefix))await i.channel.setName(`${prefix}${i.channel.name}`.slice(0,100)).catch(()=>{});
        if(state.openTickets[i.guildId]?.[ownerId]===i.channelId){delete state.openTickets[i.guildId][ownerId];save();}
        await writeLog(i.guild,`Ticket closed: ${i.channel.name} (${i.channelId}), opener <@${ownerId}>, closed by ${i.user.tag}.`);
        return i.reply({content:`Ticket closed by ${i.user}.`,components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:reopen').setLabel('Reopen ticket').setStyle(ButtonStyle.Success))]});
      }
      if(!isStaff)return i.reply({content:'Only support staff can reopen a ticket.',ephemeral:true});
      if(ownerId)await i.channel.permissionOverwrites.edit(ownerId,{ViewChannel:true,SendMessages:true,ReadMessageHistory:true}).catch(()=>{});
      if(i.channel.name.startsWith(state.tickets.closedPrefix))await i.channel.setName(i.channel.name.slice(state.tickets.closedPrefix.length)).catch(()=>{});
      if(ownerId){state.openTickets[i.guildId]||={};state.openTickets[i.guildId][ownerId]=i.channelId;save();}
      return i.reply({content:`Ticket reopened by ${i.user}.`});
    }
    const p=i.customId.split(':');
    if(p[0]==='e'){if(!isAdmin(i))return deny(i);const [,act,key,raw]=p,page=Math.max(0,Number(raw)||0);if(act==='edit')return i.showModal(slideModal(key,page,false));if(act==='add')return i.showModal(slideModal(key,state.commands[key].slides.length,true));if(act==='fields')return i.showModal(fieldsModal(key));if(act==='footer')return i.showModal(footerModal(key,page));if(act==='links')return i.showModal(linksModal(key));if(act==='page')return i.update(embedDash(key,Math.max(0,Math.min(Number(raw),state.commands[key].slides.length-1))));if(act==='delete'){if(state.commands[key].slides.length<2)return i.reply({content:'At least one embed slide is required.',ephemeral:true});state.commands[key].slides.splice(page,1);save();return i.update(embedDash(key,Math.min(page,state.commands[key].slides.length-1)));}}
    if(p[0]==='m'){if(!isAdmin(i))return deny(i);const [,act,key]=p,c=state.commands[key];if(act==='toggle')c.enabled=!c.enabled;else if(act==='vis')c.visibility=c.visibility==='public'?'private':'public';else if(act==='dm')c.sendDM=!c.sendDM;else if(act==='settings')return i.showModal(modSettingsModal(key));save();return i.update(modDash(key));}
    if(p[0]==='s'){if(!isAdmin(i))return deny(i);const [,act,section]=p;if(act==='toggle'){const c=section==='welcome'?state.welcome:section==='leave'?state.leave:state.tickets;c.enabled=!c.enabled;save();return i.update(serverDash(section));}if(act==='content')return i.showModal(section==='tickets'?serverContentModal('tickets'):serverContentModal(section));if(act==='settings')return i.showModal(section==='tickets'?serverSettingsModal('tickets'):serverSettingsModal(section));if(act==='panel'){if(!state.tickets.enabled)return i.reply({content:'Enable tickets first.',ephemeral:true});return i.reply(ticketPanelPayload());}if(act==='intro')return i.showModal(ticketIntroModal());}
  }
  if(i.isModalSubmit()){
    if(!isAdmin(i))return deny(i);const p=i.customId.split(':');
    if(p[0]==='modal'&&p[1]==='slide'){const [, ,key,raw,op]=p,page=Number(raw),d={title:i.fields.getTextInputValue('title').trim(),description:i.fields.getTextInputValue('description').trim(),color:color(i.fields.getTextInputValue('color').trim()),image:url(i.fields.getTextInputValue('image').trim()),thumbnail:url(i.fields.getTextInputValue('thumbnail').trim()),footer:op==='add'?'':(state.commands[key].slides[page]?.footer||'')};if(op==='add')state.commands[key].slides.push(d);else state.commands[key].slides[page]=d;save();return i.reply(embedDash(key,op==='add'?state.commands[key].slides.length-1:page));}
    if(p[0]==='modal'&&p[1]==='footer'){const key=p[2],page=Number(p[3]);state.commands[key].slides[page].footer=i.fields.getTextInputValue('footer').trim();save();return i.reply(embedDash(key,page));}
    if(p[0]==='modal'&&p[1]==='fields'){const key=p[2];for(const field of ['user','reason','duration'])state.commands[key].fieldLabels[field]=i.fields.getTextInputValue(field).trim();save();return i.reply(embedDash(key));}
    if(p[0]==='modal'&&p[1]==='links'){const key=p[2],links=[];for(let n=1;n<=2;n++){const label=i.fields.getTextInputValue(`label${n}`).trim(),href=url(i.fields.getTextInputValue(`url${n}`).trim());if(label&&href)links.push({label,url:href});}state.commands[key].responseLinks=links;save();return i.reply(embedDash(key));}
    if(p[0]==='modal'&&p[1]==='modsettings'){const key=p[2],name=cleanName(i.fields.getTextInputValue('name').trim(),key);if(MODS.some(k=>k!==key&&slashName(k)===name))return i.reply({content:'That slash command name is already in use.',ephemeral:true});const c=state.commands[key];c.name=name===key?'':name;c.dmTitle=i.fields.getTextInputValue('dmTitle').trim();c.dmMessage=i.fields.getTextInputValue('dmMessage').trim();save();try{await syncCommands();}catch(e){console.error('Rename registration failed:',e.message);return i.reply({content:'Saved settings, but Discord rejected the renamed command. Check bot registration and retry.',ephemeral:true});}return i.reply({content:`Saved. Use **/${name}** now.`,ephemeral:true});}
    if(p[0]==='modal'&&p[1]==='scontent'){const section=p[2],c=section==='welcome'?state.welcome:section==='leave'?state.leave:state.tickets,titleKey=section==='tickets'?'panelTitle':'title',descKey=section==='tickets'?'panelDescription':'message';c[titleKey]=i.fields.getTextInputValue(titleKey).trim();c[descKey]=i.fields.getTextInputValue(descKey).trim();c.color=color(i.fields.getTextInputValue('color').trim());c.image=url(i.fields.getTextInputValue('image').trim());c.thumbnail=url(i.fields.getTextInputValue('thumbnail').trim());save();return i.reply(serverDash(section));}
    if(p[0]==='modal'&&p[1]==='ssettings'){const section=p[2],c=section==='welcome'?state.welcome:section==='leave'?state.leave:state.tickets;for(const id of ['channelId','categoryId','staffRoleId','logChannelId','panelButton','channelName'])if(i.fields.fields.has(id))c[id]=i.fields.getTextInputValue(id).trim();save();return i.reply(serverDash(section));}
    if(i.customId==='modal:ticketintro'){for(const id of ['intro','closeButton','closedPrefix'])state.tickets[id]=i.fields.getTextInputValue(id).trim();save();return i.reply(serverDash('tickets'));}
  }
}catch(e){console.error('Interaction failed:',e);const p={content:'Something went wrong. Check the bot console for details.',ephemeral:true};if(i.replied||i.deferred)await i.followUp(p).catch(()=>{});else await i.reply(p).catch(()=>{});}});
client.login(TOKEN);