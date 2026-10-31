'use strict';
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, Events,
  GatewayIntentBits, ModalBuilder, Partials, PermissionFlagsBits, REST, Routes,
  SlashCommandBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { DISCORD_TOKEN: TOKEN, CLIENT_ID, GUILD_ID } = process.env;
const STATE_FILE = path.join(__dirname, 'bot-state.json');
const CATALOG = [
  // Direct, familiar moderation commands: no /mod prefix.
  ['ban','Moderation','Ban a member',['user','reason']], ['tempban','Moderation','Ban a member for a duration',['user','duration','reason']], ['unban','Moderation','Unban a Discord user ID',['user_id','reason']], ['kick','Moderation','Kick a member',['user','reason']], ['timeout','Moderation','Timeout a member',['user','duration','reason']], ['untimeout','Moderation','Remove a member timeout',['user','reason']], ['warn','Moderation','Warn a member',['user','reason']], ['warnings','Moderation','View a memberâ€™s warnings',['user']], ['delwarn','Moderation','Delete a warning by its number',['user','warning_id']], ['clearwarnings','Moderation','Clear a memberâ€™s warnings',['user','reason']], ['case','Moderation','View a moderation case',['case_id']], ['cases','Moderation','View a memberâ€™s moderation cases',['user']], ['purge','Moderation','Bulk delete messages with optional filters',['count','filter','user','text']], ['slowmode','Moderation','Set channel slowmode',['duration']], ['lock','Moderation','Lock the current channel',['reason']], ['unlock','Moderation','Unlock the current channel',['reason']],
  ['automod-setup','AutoMod','Configure spam, invite, link, and word filters',[]], ['automod-rule','AutoMod','Add or remove a blocked phrase',['action','text']], ['automod-exempt','AutoMod','Exempt or un-exempt a channel',['action','channel']], ['automod-test','AutoMod','Test text against AutoMod rules',['text']],
  ['ticket-setup','Tickets','Configure the full ticket system',[]], ['ticket-open','Tickets','Open a support ticket',[]], ['ticket-close','Tickets','Close this ticket',['reason']], ['ticket-add','Tickets','Add a member to this ticket',['user']], ['ticket-remove','Tickets','Remove a member from this ticket',['user']], ['ticket-claim','Tickets','Claim or release this ticket',[]], ['ticket-transcript','Tickets','Export this ticket conversation',[]], ['ticket-stats','Tickets','Show ticket statistics',[]],
  ['welcome-setup','Welcome & Leave','Configure the welcome message',[]], ['welcome-test','Welcome & Leave','Preview the welcome message',[]], ['leave-setup','Welcome & Leave','Configure the leave message',[]],
  ['role-menu','Roles','Create a self-service role menu',['title','description','text']], ['role-add','Roles','Add a role to a member',['user','role','reason']], ['role-remove','Roles','Remove a role from a member',['user','role','reason']], ['role-info','Roles','Show role details',['role']], ['role-reaction-menu','Roles','Configure a reaction role menu',['message_id','role','emoji']],
  ['poll-create','Community','Create a timed poll',['question','options','duration']], ['giveaway-start','Community','Start a giveaway',['prize','duration','winners']], ['giveaway-end','Community','End a giveaway early',['message_id']], ['suggest','Community','Submit a suggestion',['text']], ['suggest-review','Community','Review a suggestion',['message_id','status','reason']], ['starboard-setup','Community','Configure the starboard',['channel','threshold']], ['afk','Community','Set your AFK status',['reason']],
  ['info-user','Utilities','Show member information',['user']], ['info-server','Utilities','Show server information',[]], ['info-avatar','Utilities','Show a user avatar',['user']], ['info-role','Utilities','Show role information',['role']], ['info-channel','Utilities','Show channel information',['channel']], ['remind','Utilities','Set a personal reminder',['duration','text']], ['tag','Utilities','Create a server tag or display one',['name','tag_content']],
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
  const defaults = { commands: Object.fromEntries(MODS.map(k => [k, defaultMod()])), welcome: defaultWelcome(), leave: defaultLeave(), tickets: defaultTickets(), logs: { enabled: false, channelId: '', categories: { moderation: true, automod: true, tickets: true, members: true, messages: false, server: true }, ignoredChannels: [] }, automod: { enabled: false, blockInvites: false, blockLinks: false, blockedWords: [], exemptChannels: [] }, starboard: { channelId: '', threshold: 3 }, afkUsers: {}, openTickets: {}, records: { warnings: {}, notes: {}, reports: [], cases: [], temporaryBans: {}, automod: [], suggestions: [], giveaways: [], polls: [], tags: {}, reminders: [], reactionRoles: [], roleMenus: {} }, raidMode: {}, ticketClaims: {} };
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    saved.commands ||= {};
    for (const k of MODS) saved.commands[k] = { ...defaults.commands[k], ...(saved.commands[k] || {}), fieldLabels: { ...defaults.commands[k].fieldLabels, ...(saved.commands[k]?.fieldLabels || {}) } };
    saved.welcome = { ...defaults.welcome, ...(saved.welcome || {}) };
    saved.leave = { ...defaults.leave, ...(saved.leave || {}) };
    saved.tickets = { ...defaults.tickets, ...(saved.tickets || {}) };
    saved.logs = { ...defaults.logs, ...(saved.logs || {}), categories: { ...defaults.logs.categories, ...(saved.logs?.categories || {}) } };
    saved.automod = { ...defaults.automod, ...(saved.automod || {}) };
    saved.starboard = { ...defaults.starboard, ...(saved.starboard || {}) }; saved.afkUsers ||= {};
    saved.openTickets ||= {}; saved.records ||= defaults.records; saved.records.warnings ||= {}; saved.records.notes ||= {}; saved.records.reports ||= []; saved.records.cases ||= []; saved.records.temporaryBans ||= {}; saved.records.automod ||= []; saved.records.suggestions ||= []; saved.records.giveaways ||= []; saved.records.polls ||= []; saved.records.tags ||= {}; saved.records.reminders ||= []; saved.records.reactionRoles ||= []; saved.records.roleMenus ||= {}; saved.raidMode ||= {}; saved.ticketClaims ||= {};
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
const fill = (s, values) => String(s || '').replace(/\{(server|action|reason|duration|duration_line|user|username|memberCount|staffRoleId|moderator|channel|count|caseId)\}/g, (_, k) => values[k] ?? '');
async function deny(i) { const p = { content: 'You need **Manage Server** or **Administrator** for this action.', ephemeral: true }; return i.replied || i.deferred ? i.followUp(p) : i.reply(p); }
function modEmbed(key, page = 0, fields = []) {
  const cfg = state.commands[key], slide = cfg.slides[Math.max(0, Math.min(page, cfg.slides.length - 1))];
  const e = new EmbedBuilder().setColor(color(slide.color)).setTitle(fill(slide.title, {action:'Action',user:'@Member',reason:'Reason',duration:'15m',duration_line:'\nDuration: 15m',server:'Server',moderator:'Moderator',channel:'channel',count:'5',caseId:'1'}).slice(0, 256)).setDescription(fill(slide.description, {action:'Action',user:'@Member',reason:'Reason',duration:'15m',duration_line:'\nDuration: 15m',server:'Server',moderator:'Moderator',channel:'channel',count:'5',caseId:'1'}).slice(0, 4000) || '\u200b');
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
const LOG_CATEGORIES = ['moderation','automod','tickets','members','messages','server'];
function logsDash(){const c=state.logs,selected=LOG_CATEGORIES.filter(k=>c.categories[k]);return{content:`**Unified logs** Â· ${c.enabled?'enabled':'disabled'} Â· channel: ${c.channelId||'not set'}\nAutoMod logs are included below.`,ephemeral:true,components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('logs:toggle').setLabel(c.enabled?'Disable logging':'Enable logging').setStyle(c.enabled?ButtonStyle.Danger:ButtonStyle.Success),new ButtonBuilder().setCustomId('logs:settings').setLabel('Configure log channel and exclusions').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('logs:test').setLabel('Send test log').setStyle(ButtonStyle.Secondary)),new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('logs:categories').setPlaceholder('Choose logged events').setMinValues(1).setMaxValues(LOG_CATEGORIES.length).addOptions(LOG_CATEGORIES.map(k=>({label:k==='automod'?'AutoMod actions':k[0].toUpperCase()+k.slice(1),value:k,default:selected.includes(k)}))))]};}
function automodDash(){const c=state.automod;return{content:`**AutoMod** Â· ${c.enabled?'enabled':'disabled'} Â· blocked phrases ${c.blockedWords.length} Â· exempt channels ${c.exemptChannels.length}`,ephemeral:true,components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('am:toggle').setLabel(c.enabled?'Disable AutoMod':'Enable AutoMod').setStyle(c.enabled?ButtonStyle.Danger:ButtonStyle.Success),new ButtonBuilder().setCustomId('am:invites').setLabel(`Invites: ${c.blockInvites?'blocked':'allowed'}`).setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId('am:links').setLabel(`External links: ${c.blockLinks?'blocked':'allowed'}`).setStyle(ButtonStyle.Secondary)),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('am:logs').setLabel('Open unified logs setup').setStyle(ButtonStyle.Primary))]};}
function logsSettingsModal(){const c=state.logs,m=new ModalBuilder().setCustomId('modal:logs').setTitle('Unified logs setup');for(const[id,label,value,max]of[['channelId','Log channel ID',c.channelId,100],['ignoredChannels','Ignored channel IDs, comma-separated',c.ignoredChannels.join(','),1000]])m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(max).setValue(value.slice(0,max))));return m;}
async function logEvent(guild,category,text,fields=[],sourceChannelId=null){const c=state.logs;if(!c.enabled||!c.categories[category]||!c.channelId)return;if(sourceChannelId&&c.ignoredChannels.includes(sourceChannelId))return;const ch=await guild.channels.fetch(c.channelId).catch(()=>null);if(!ch?.isTextBased())return;const e=new EmbedBuilder().setColor(category==='automod'?0xE67E22:0x5865F2).setTitle(category==='automod'?'AutoMod action':`${category} log`).setDescription(String(text).slice(0,4000)).addFields(fields.slice(0,25)).setTimestamp();await ch.send({embeds:[e]}).catch(err=>console.error('Log error:',err.message));}
async function handleAutoModMessage(m){const c=state.automod;if(!c.enabled||!m.guild||m.author.bot||c.exemptChannels.includes(m.channelId))return;const text=m.content||'';let rule='';if(c.blockInvites&&/(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)/i.test(text))rule='Discord invite';else if(c.blockLinks&&/https?:\/\//i.test(text))rule='external link';else if(c.blockedWords.some(w=>w&&text.toLowerCase().includes(w.toLowerCase())))rule='blocked phrase';if(!rule)return;try{await m.delete();}catch{return;}state.records.automod.push({guildId:m.guildId,userId:m.author.id,channelId:m.channelId,rule,createdAt:Date.now(),content:text.slice(0,500)});if(state.records.automod.length>500)state.records.automod.shift();save();await logEvent(m.guild,'automod',`${m.author.tag} message removed in <#${m.channelId}>: ${rule}.`,[{name:'Message',value:text.slice(0,1024)||'(empty)'}],m.channelId);}
function serverDash(section) {
  const cfg = section === 'welcome' ? state.welcome : section === 'leave' ? state.leave : state.tickets;
  const enabled = cfg.enabled;
  const title = section === 'welcome' ? 'Welcome messages' : section === 'leave' ? 'Leave messages' : 'Ticket system';
  const content = section === 'tickets'
    ? `**${title}** Â· ${enabled ? 'enabled' : 'disabled'} Â· category ${cfg.categoryId || 'not set'} Â· staff role ${cfg.staffRoleId || 'not set'} Â· logs configured in /logs-setup`
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
    ['categoryId','Ticket category channel ID',c.categoryId],['staffRoleId','Support role ID',c.staffRoleId],['panelButton','Panel button label',c.panelButton],['channelName','Channel name template: ticket-{username}',c.channelName],
  ] : [['channelId','Message channel ID',c.channelId]];
  for(const [id,label,value] of fields) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(value||'')));
  return modal;
}
function ticketIntroModal(){const c=state.tickets,m=new ModalBuilder().setCustomId('modal:ticketintro').setTitle('Ticket intro and close button');
  for(const [id,label,value,style,max] of [['intro','Ticket opening message: {user}, {staffRoleId}',c.intro,TextInputStyle.Paragraph,1500],['closeButton','Close button label',c.closeButton,TextInputStyle.Short,80],['closedPrefix','Closed channel prefix',c.closedPrefix,TextInputStyle.Short,20]])m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true).setMaxLength(max).setValue((value||'').slice(0,max)))); return m;}
function parseDuration(raw){const m=/^\s*(\d{1,6})\s*([smhd])\s*$/i.exec(raw||'');if(!m)return null;const ms=Number(m[1])*({s:1000,m:60000,h:3600000,d:86400000}[m[2].toLowerCase()]);return Number.isSafeInteger(ms)&&ms>0&&ms<=MAX_TIMEOUT?ms:null;}
function addOption(builder, field) {
  const optional = ['reason','filter','category'].includes(field);
  if (field === 'user') return builder.addUserOption(o => o.setName('user').setDescription('Target member').setRequired(true));
  if (field === 'user_id') return builder.addStringOption(o => o.setName('user_id').setDescription('Discord user ID').setRequired(true));
  if (field === 'role') return builder.addRoleOption(o => o.setName('role').setDescription('Role to affect').setRequired(true));
  if (field === 'channel') return builder.addChannelOption(o => o.setName('channel').setDescription('Target text channel').addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement).setRequired(true));
  if (field === 'count') return builder.addIntegerOption(o => o.setName('count').setDescription('Maximum number of messages, 1 to 100').setMinValue(1).setMaxValue(100).setRequired(true));
  if (field === 'winners') return builder.addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(20).setRequired(true));
  if (field === 'warning_id') return builder.addIntegerOption(o => o.setName('warning_id').setDescription('Warning number').setMinValue(1).setRequired(true));
  if (field === 'threshold') return builder.addIntegerOption(o => o.setName('threshold').setDescription('Reaction threshold').setMinValue(1).setMaxValue(100).setRequired(true));
  const details = {
    reason:['Reason (optional)',500], duration:['Duration like 30s, 15m, 2h, or 1d',100],
    filter:['all, links, bots, attachments, or text',30], action:['add/remove or exempt/unexempt',20], text:['Text / phrase / message',1000],
    category:['Optional ticket category',100], title:['Panel title',100], description:['Panel description',1000],
    question:['Poll question',300], options:['Poll choices separated by | (2 to 10)',1000], prize:['Giveaway prize',200],
    status:['approve, deny, or consider',20], message_id:['Message ID',30], emoji:['Emoji',100],
    name:['Tag name',100], case_id:['Case number',30],
  };
  const [description,max] = details[field] || [field,100];
  return builder.addStringOption(o=>o.setName(field).setDescription(description).setMaxLength(max).setRequired(!optional));
}
async function syncCommands() {
  const fixed = [
    new SlashCommandBuilder().setName('embed-dashboard').setDescription('Customize every moderation command response embed'),
    new SlashCommandBuilder().setName('moderation-dashboard').setDescription('Enable, rename, and configure moderation commands'),
    new SlashCommandBuilder().setName('logs-setup').setDescription('Configure all server logs, including AutoMod logs'),
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
  const has = permission => Boolean(i.memberPermissions?.has(permission));
  if (has(PermissionFlagsBits.Administrator)) return true;
  if (['ticket-open','suggest','poll-create','afk','info-user','info-server','info-avatar','info-role','info-channel','ticket-stats','automod-test','tag','remind'].includes(key)) return true;
  if (['ticket-close','ticket-add','ticket-remove','ticket-claim','ticket-transcript'].includes(key)) return true; // Ticket ownership/staff role is checked in the handler.
  if (['ban','unban','tempban'].includes(key)) return has(PermissionFlagsBits.BanMembers);
  if (key === 'kick') return has(PermissionFlagsBits.KickMembers);
  if (['timeout','untimeout','warn','warnings','delwarn','clearwarnings','cases','case'].includes(key)) return has(PermissionFlagsBits.ModerateMembers) || has(PermissionFlagsBits.ManageGuild);
  if (['role-add','role-remove','role-menu','role-reaction-menu'].includes(key)) return has(PermissionFlagsBits.ManageRoles);
  if (['purge'].includes(key)) return has(PermissionFlagsBits.ManageMessages);
  if (key === 'slowmode' || key === 'lock' || key === 'unlock') return has(PermissionFlagsBits.ManageChannels);
  if (['automod-rule','automod-exempt','ticket-setup','welcome-setup','leave-setup','automod-setup','starboard-setup','giveaway-start','giveaway-end','suggest-review'].includes(key)) return has(PermissionFlagsBits.ManageGuild) || has(PermissionFlagsBits.ManageMessages);
  return has(PermissionFlagsBits.ManageGuild) || has(PermissionFlagsBits.ManageMessages);
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
  if(key==='automod-rule'){
    const action=i.options.getString('action',true),text=i.options.getString('text',true).trim();if(action==='add'){if(!state.automod.blockedWords.some(x=>x.toLowerCase()===text.toLowerCase()))state.automod.blockedWords.push(text.slice(0,100));}else if(action==='remove')state.automod.blockedWords=state.automod.blockedWords.filter(x=>x.toLowerCase()!==text.toLowerCase());else return i.reply({content:'Action must be add or remove.',ephemeral:true});save();return i.reply({content:`Blocked phrase list updated (${state.automod.blockedWords.length} phrases).`,ephemeral:true});
  }
  if(key==='automod-exempt'){const action=i.options.getString('action',true),ch=i.options.getChannel('channel',true);if(action==='exempt'&&!state.automod.exemptChannels.includes(ch.id))state.automod.exemptChannels.push(ch.id);else if(action==='unexempt')state.automod.exemptChannels=state.automod.exemptChannels.filter(x=>x!==ch.id);else if(!['exempt','unexempt'].includes(action))return i.reply({content:'Action must be exempt or unexempt.',ephemeral:true});save();return i.reply({content:`AutoMod exemption updated for ${ch}.`,ephemeral:true});}
  if(key==='automod-test'){const text=i.options.getString('text',true),c=state.automod,match=(c.blockInvites&&hasInvite({content:text}))||(c.blockLinks&&isLinkMessage({content:text}))||c.blockedWords.some(w=>text.toLowerCase().includes(w.toLowerCase()));return i.reply({content:match?'Text matches an active AutoMod rule.':'No active AutoMod rule matches this text.',ephemeral:true});}
  if(key==='ticket-setup')return i.reply(serverDash('tickets'));
  if(key==='welcome-setup')return i.reply(serverDash('welcome'));
  if(key==='leave-setup')return i.reply(serverDash('leave'));
  if(key==='automod-setup')return i.reply(automodDash());
  if(key==='ticket-panel'){if(!isAdmin(i))return deny(i);if(!state.tickets.enabled)return i.reply({content:'Enable tickets in /ticket-setup first.',ephemeral:true});return i.reply(ticketPanelPayload());}
  if(key==='ticket-open'){
    if(!state.tickets.enabled)return i.reply({content:'Tickets are disabled. Ask staff to configure /ticket-setup.',ephemeral:true});const existing=state.openTickets[guild.id]?.[i.user.id];if(existing){const old=await guild.channels.fetch(existing).catch(()=>null);if(old)return i.reply({content:`You already have an open ticket: ${old}`,ephemeral:true});}
    const c=state.tickets,cat=await guild.channels.fetch(c.categoryId).catch(()=>null),staff=await guild.roles.fetch(c.staffRoleId).catch(()=>null);if(!cat||cat.type!==ChannelType.GuildCategory||!staff)return i.reply({content:'Ticket setup needs a valid category and staff role in /ticket-setup.',ephemeral:true});
    const name=cleanName(fill(c.channelName,{username:i.user.username.toLowerCase().replace(/[^a-z0-9-]/g,'-')}),`ticket-${i.user.id.slice(-6)}`);const ch=await guild.channels.create({name,type:ChannelType.GuildText,parent:cat.id,topic:`Support ticket for ${i.user.tag} (${i.user.id})`,permissionOverwrites:[{id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},{id:i.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]},{id:staff.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},{id:client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ReadMessageHistory]}]});state.openTickets[guild.id]||={};state.openTickets[guild.id][i.user.id]=ch.id;save();await ch.send({content:`<@${i.user.id}> <@&${staff.id}>`,embeds:[new EmbedBuilder().setColor(color(c.color)).setTitle('Support ticket').setDescription(fill(c.intro,{user:`<@${i.user.id}>`,staffRoleId:staff.id}))],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:close').setLabel(c.closeButton.slice(0,80)).setStyle(ButtonStyle.Danger))]});await logEvent(guild,'tickets',`Ticket opened by ${i.user.tag}: ${ch}.`);return i.reply({content:`Ticket created: ${ch}`,ephemeral:true});
  }
  if(key==='ticket-close'||key==='ticket-add'||key==='ticket-remove'||key==='ticket-claim'||key==='ticket-transcript'){
    const ch=i.channel,owner=ch.topic?.match(/\((\d{17,20})\)/)?.[1],staff=state.tickets.staffRoleId&&i.member.roles.cache.has(state.tickets.staffRoleId),isOwner=owner===i.user.id,isStaff=isAdmin(i)||Boolean(staff);if(!owner)return i.reply({content:'Run this inside a support ticket.',ephemeral:true});
    if(key==='ticket-close'){if(!isOwner&&!isStaff)return deny(i);await ch.permissionOverwrites.edit(owner,{SendMessages:false}).catch(()=>{});const prefix=state.tickets.closedPrefix||'closed-';if(!ch.name.startsWith(prefix))await ch.setName(`${prefix}${ch.name}`.slice(0,100)).catch(()=>{});delete state.openTickets[guild.id]?.[owner];save();await logEvent(guild,'tickets',`Ticket closed by ${i.user.tag}: ${ch.name}.`);return i.reply({content:`Ticket closed by ${i.user}.`,components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:reopen').setLabel('Reopen ticket').setStyle(ButtonStyle.Success))]});}
    if(!isStaff)return deny(i);
    if(key==='ticket-add'||key==='ticket-remove'){const target=i.options.getUser('user',true);await ch.permissionOverwrites.edit(target.id,key==='ticket-add'?{ViewChannel:true,SendMessages:true,ReadMessageHistory:true}:{ViewChannel:false,SendMessages:false,ReadMessageHistory:false});return i.reply({content:`${target} ${key==='ticket-add'?'added to':'removed from'} this ticket.`});}
    if(key==='ticket-claim'){const current=state.ticketClaims[ch.id];if(current===i.user.id){delete state.ticketClaims[ch.id];save();return i.reply({content:'Ticket claim released.'});}if(current)return i.reply({content:`Already claimed by <@${current}>.`,ephemeral:true});state.ticketClaims[ch.id]=i.user.id;save();return i.reply({content:`Ticket claimed by ${i.user}.`});}
    if(key==='ticket-transcript'){const messages=await ch.messages.fetch({limit:100});const transcript=[...messages.values()].reverse().map(m=>`[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content||'[attachment/embed]'}`).join('\n');return i.reply({content:'Ticket transcript, last 100 messages:',files:[new AttachmentBuilder(Buffer.from(transcript||'(No messages)','utf8'),{name:`ticket-${ch.id}-transcript.txt`})],ephemeral:true});}
  }
  if(key==='ticket-stats'){const total=Object.keys(state.openTickets[guild.id]||{}).length;return i.reply({content:`Open tickets tracked in this server: ${total}.`,ephemeral:true});}
  if(key==='delwarn'){const list=state.records.warnings[`${guild.id}:${user?.id}`]||[],n=i.options.getInteger('warning_id',true)-1;if(n<0||n>=list.length)return i.reply({content:'Warning number not found.',ephemeral:true});list.splice(n,1);save();return i.reply({content:`Warning removed for ${user.tag}.`,ephemeral:true});}
  if(key==='case'){const id=i.options.getString('case_id',true),entry=state.records.cases.find(x=>x.guildId===guild.id&&x.id===id);if(!entry)return i.reply({content:'Case not found.',ephemeral:true});return i.reply({content:`Case #${entry.id} Â· ${entry.command} Â· ${entry.target} Â· ${entry.reason}`,ephemeral:true});}
  if(key==='cases'){const list=state.records.cases.filter(x=>x.guildId===guild.id&&x.target.includes(user?.id||'' )).slice(-10).reverse();return i.reply({content:list.length?list.map(x=>`#${x.id} Â· ${x.command} Â· ${x.reason}`).join('\n'):'No cases found.',ephemeral:true});}
  if(key==='purge'){const count=i.options.getInteger('count',true),filter=i.options.getString('filter')||'all',target=i.options.getUser('user');const out=await bulkPurge(i,key,m=>{if(m.pinned)return false;if(target&&m.author.id!==target.id)return false;if(filter==='links')return isLinkMessage(m);if(filter==='bots')return m.author.bot;if(filter==='attachments')return m.attachments.size>0;if(filter==='text')return m.content.toLowerCase().includes(i.options.getString('text')?.toLowerCase()||'');return true;});await logEvent(guild,'moderation',`${i.user.tag} purged ${out.count} messages in #${i.channel.name}.`,[],i.channelId);return i.reply({content:`Deleted ${out.count} messages.`,ephemeral:true});}
  if(key==='welcome-test') { const e=previewServerEmbed('welcome');e.setTitle(fill(state.welcome.title,{server:guild.name,user:i.user.username,memberCount:guild.memberCount}));e.setDescription(fill(state.welcome.message,{server:guild.name,user:`<@${i.user.id}>`,memberCount:guild.memberCount}));return i.reply({embeds:[e],ephemeral:true}); }
  if(key==='role-add'||key==='role-remove'){const role=i.options.getRole('role',true);if(!member||!i.memberPermissions.has(PermissionFlagsBits.ManageRoles)||!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)||role.position>=guild.members.me.roles.highest.position||(role.position>=i.member.roles.highest.position&&guild.ownerId!==i.user.id))return i.reply({content:'Manage Roles and valid role hierarchy are required.',ephemeral:true});if(key==='role-add')await member.roles.add(role,reason);else await member.roles.remove(role,reason);await logEvent(guild,'server',`${i.user.tag} ${key==='role-add'?'added':'removed'} role ${role.name} ${key==='role-add'?'to':'from'} ${user.tag}.`);return i.reply({content:`${role} ${key==='role-add'?'added to':'removed from'} ${user}.`,ephemeral:true});}
  if(key==='role-info'){const role=i.options.getRole('role',true);return i.reply({embeds:[new EmbedBuilder().setTitle(role.name).setColor(role.color||DEFAULT_COLOR).setDescription(`ID: ${role.id}\nMembers: ${role.members.size}\nPosition: ${role.position}`)],ephemeral:true});}
  if(key==='role-menu'){
    const pairs=i.options.getString('text',true).split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const [id,...label]=x.split(':');return{id:id.trim(),label:label.join(':').trim()};}).filter(x=>x.id&&x.label).slice(0,25);
    if(pairs.length<1)return i.reply({content:'Provide choices as `ROLE_ID:Label; ROLE_ID:Label`.',ephemeral:true});
    const choices=[];for(const item of pairs){const role=await guild.roles.fetch(item.id).catch(()=>null);if(!role||role.id===guild.id||role.position>=guild.members.me.roles.highest.position||role.permissions.has([PermissionFlagsBits.Administrator,PermissionFlagsBits.ManageGuild,PermissionFlagsBits.ManageRoles,PermissionFlagsBits.BanMembers,PermissionFlagsBits.KickMembers,PermissionFlagsBits.ManageChannels]))continue;choices.push({label:item.label.slice(0,100),value:role.id,description:role.name.slice(0,100)});}
    if(!choices.length)return i.reply({content:'No valid, safe, assignable roles were provided. Check role IDs and place the bot role above them.',ephemeral:true});
    const token=`${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;state.records.roleMenus ||= {};state.records.roleMenus[token]={guildId:guild.id,roleIds:choices.map(x=>x.value)};save();
    const msg=await i.channel.send({embeds:[new EmbedBuilder().setColor(DEFAULT_COLOR).setTitle(i.options.getString('title',true)).setDescription(i.options.getString('description',true))],components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`rolesel:${token}`).setPlaceholder('Choose a role to toggle').addOptions(choices))]});return i.reply({content:`Role menu posted: ${msg.url}`,ephemeral:true});
  }
  if(key==='role-reaction-menu'){
    const msg=await i.channel.messages.fetch(i.options.getString('message_id',true)).catch(()=>null),role=i.options.getRole('role',true),emoji=i.options.getString('emoji',true);if(!msg)return i.reply({content:'Message not found in this channel.',ephemeral:true});if(role.position>=guild.members.me.roles.highest.position||role.permissions.has([PermissionFlagsBits.Administrator,PermissionFlagsBits.ManageGuild,PermissionFlagsBits.ManageRoles,PermissionFlagsBits.BanMembers,PermissionFlagsBits.KickMembers,PermissionFlagsBits.ManageChannels]))return i.reply({content:'That role is too high or has powerful permissions.',ephemeral:true});state.records.reactionRoles.push({guildId:guild.id,channelId:i.channelId,messageId:msg.id,roleId:role.id,emoji});save();await msg.react(emoji).catch(()=>{});return i.reply({content:`Reaction role configured for ${role}.`,ephemeral:true});
  }
  if(key==='info-user'){const target=user||i.user,mem=await guild.members.fetch(target.id).catch(()=>null);return i.reply({embeds:[new EmbedBuilder().setColor(DEFAULT_COLOR).setTitle(target.tag).setThumbnail(target.displayAvatarURL()).setDescription(`ID: ${target.id}\nCreated: <t:${Math.floor(target.createdTimestamp/1000)}:F>\nJoined: ${mem?.joinedTimestamp?`<t:${Math.floor(mem.joinedTimestamp/1000)}:F>`:'Unknown'}`)],ephemeral:true});}
  if(key==='info-avatar'){const target=user||i.user;return i.reply({embeds:[new EmbedBuilder().setTitle(`${target.tag}'s avatar`).setImage(target.displayAvatarURL({size:1024}))],ephemeral:true});}
  if(key==='info-server')return i.reply({embeds:[new EmbedBuilder().setColor(DEFAULT_COLOR).setTitle(guild.name).setThumbnail(guild.iconURL()).setDescription(`Members: ${guild.memberCount}\nCreated: <t:${Math.floor(guild.createdTimestamp/1000)}:F>\nOwner: <@${guild.ownerId}>`)],ephemeral:true});
  if(key==='info-role'){const role=i.options.getRole('role',true);return i.reply({embeds:[new EmbedBuilder().setTitle(role.name).setColor(role.color||DEFAULT_COLOR).setDescription(`ID: ${role.id}\nMembers: ${role.members.size}\nPosition: ${role.position}`)],ephemeral:true});}
  if(key==='info-channel'){const ch=i.options.getChannel('channel',true);return i.reply({embeds:[new EmbedBuilder().setTitle(ch.name).setDescription(`ID: ${ch.id}\nType: ${ch.type}\nCreated: <t:${Math.floor(ch.createdTimestamp/1000)}:F>`)],ephemeral:true});}
  if(key==='afk'){const reasonText=i.options.getString('reason')||'Away';state.afkUsers[`${guild.id}:${i.user.id}`]={reason:reasonText,at:Date.now()};save();return i.reply({content:`AFK set: ${reasonText}`,ephemeral:true});}
  if(key==='remind'){const raw=i.options.getString('duration',true),ms=parseDuration(raw),text=i.options.getString('text',true);if(!ms||ms>30*86400000)return i.reply({content:'Use a duration like 10m, 2h, or 1d (maximum 30 days).',ephemeral:true});const due=Date.now()+ms;state.records.reminders.push({userId:i.user.id,guildId:guild.id,channelId:i.channelId,text,due});save();setTimeout(async()=>{const ch=await guild.channels.fetch(i.channelId).catch(()=>null);if(ch?.isTextBased())await ch.send({content:`<@${i.user.id}> reminder: ${text}`}).catch(()=>{});},Math.min(ms,2147483647));return i.reply({content:`Reminder set for <t:${Math.floor(due/1000)}:R>.`,ephemeral:true});}
  if(key==='tag'){const name=i.options.getString('name',true).toLowerCase(),content=i.options.getString('tag_content');if(content){if(!i.memberPermissions.has(PermissionFlagsBits.ManageMessages))return deny(i);state.records.tags[`${guild.id}:${name}`]=content;save();return i.reply({content:`Tag **${name}** saved.`,ephemeral:true});}const value=state.records.tags[`${guild.id}:${name}`];return value?i.reply({content:value}):i.reply({content:`No saved tag named **${name}**.`,ephemeral:true});}
  if(key==='poll-create'){const q=i.options.getString('question',true),choices=i.options.getString('options',true).split('|').map(x=>x.trim()).filter(Boolean).slice(0,10);if(choices.length<2)return i.reply({content:'Provide 2 to 10 options separated by |.',ephemeral:true});const e=new EmbedBuilder().setColor(DEFAULT_COLOR).setTitle(q.slice(0,256)).setDescription(choices.map((x,n)=>`${String.fromCodePoint(0x1F1E6+n)} ${x}`).join('\n'));const msg=await i.channel.send({embeds:[e]});for(let n=0;n<choices.length;n++)await msg.react(String.fromCodePoint(0x1F1E6+n));state.records.polls.push({guildId:guild.id,messageId:msg.id,question:q,options:choices,createdAt:Date.now()});save();return i.reply({content:`Poll posted: ${msg.url}`,ephemeral:true});}
  if(key==='giveaway-start'){const durationText=i.options.getString('duration',true),ms=parseDuration(durationText),prize=i.options.getString('prize',true),winners=i.options.getInteger('winners',true);if(!ms||ms>30*86400000)return i.reply({content:'Use duration like 10m, 2h, or 1d, up to 30 days.',ephemeral:true});const end=Date.now()+ms,msg=await i.channel.send({embeds:[new EmbedBuilder().setColor(DEFAULT_COLOR).setTitle('ðŸŽ‰ Giveaway').setDescription(`Prize: **${prize}**\nWinners: ${winners}\nEnds: <t:${Math.floor(end/1000)}:R>\nReact with ðŸŽ‰ to enter.`)]});await msg.react('ðŸŽ‰');state.records.giveaways.push({guildId:guild.id,channelId:i.channelId,messageId:msg.id,prize,winners,end,ended:false});save();setTimeout(()=>endGiveaway(guild.id,msg.id).catch(console.error),Math.min(ms,2147483647));return i.reply({content:`Giveaway started: ${msg.url}`,ephemeral:true});}
  if(key==='giveaway-end'){const id=i.options.getString('message_id',true),ok=await endGiveaway(guild.id,id);return i.reply({content:ok?'Giveaway ended.':'No active giveaway with that message ID.',ephemeral:true});}
  if(key==='suggest'){const text=i.options.getString('text',true);const logCh=state.logs.channelId?await guild.channels.fetch(state.logs.channelId).catch(()=>null):null;let sent=null;if(logCh?.isTextBased())sent=await logCh.send({embeds:[new EmbedBuilder().setColor(DEFAULT_COLOR).setTitle('Suggestion').setDescription(text).setFooter({text:`From ${i.user.tag}`})]});state.records.suggestions.push({guildId:guild.id,userId:i.user.id,text,messageId:sent?.id||'',status:'pending',createdAt:Date.now()});save();return i.reply({content:'Suggestion sent to staff for review.',ephemeral:true});}
  if(key==='suggest-review'){const id=i.options.getString('message_id',true),status=i.options.getString('status',true).toLowerCase(),record=state.records.suggestions.find(x=>x.guildId===guild.id&&x.messageId===id);if(!['approve','deny','consider'].includes(status))return i.reply({content:'Status must be approve, deny, or consider.',ephemeral:true});if(!record)return i.reply({content:'Suggestion message not found in the botâ€™s records.',ephemeral:true});record.status=status;record.reviewedBy=i.user.id;record.reviewReason=i.options.getString('reason')||'';save();return i.reply({content:`Suggestion marked **${status}**.`,ephemeral:true});}
  if(key==='starboard-setup'){if(!isAdmin(i))return deny(i);state.starboard.channelId=i.options.getChannel('channel',true).id;state.starboard.threshold=i.options.getInteger('threshold',true);save();return i.reply({content:`Starboard configured in <#${state.starboard.channelId}> at ${state.starboard.threshold} reactions.`,ephemeral:true});}
  if (key === 'ban' || key === 'tempban' || key === 'softban') {
    if (!user) return i.reply({ content: 'Select a target member.', ephemeral: true });
    let temp = '';
    if (key === 'tempban') { temp = i.options.getString('duration', true); if (!parseDuration(temp)) return i.reply({ content: 'Enter a duration such as 10m, 2h, or 1d (maximum 28 days).', ephemeral: true }); }
    const dmText = await dm(user, key === 'softban' ? 'Softban' : 'Ban', temp);
    await guild.members.ban(user.id, { reason: `${reason} | Moderator: ${i.user.tag}` });
    if (key === 'softban') await guild.members.unban(user.id, `Softban cleanup | ${i.user.tag}`);
    if (key === 'tempban') { const expiresAt=Date.now()+parseDuration(temp);state.records.temporaryBans[`${guild.id}:${user.id}`]={userId:user.id,guildId:guild.id,expiresAt};save();scheduleTempban(guild.id,user.id,expiresAt); }
    vals.action = key === 'softban' ? 'Softban' : key === 'tempban' ? 'Temporary ban' : 'Ban'; vals.duration = temp; resultText = dmText;
  } else if (key === 'unban') {
    const id = i.options.getString('user_id', true).trim(); if (!/^\d{17,20}$/.test(id)) return i.reply({ content: 'That is not a valid Discord user ID.', ephemeral: true });
    const banned = await guild.bans.fetch(id).catch(()=>null), target = await client.users.fetch(id).catch(()=>null);
    if (!banned || !target) return i.reply({ content: 'That user is not banned here, or could not be found.', ephemeral: true });
    resultText = await dm(target, 'Unban'); await guild.members.unban(id, `${reason} | Moderator: ${i.user.tag}`);delete state.records.temporaryBans[`${guild.id}:${id}`];save();vals.user = `${target.tag} (${id})`; vals.action = 'Unban';
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
  } else if (key === 'slowmode') {
    const raw=i.options.getString('duration',true).trim().toLowerCase();const seconds=raw==='off'?0:Math.floor((parseDuration(raw)||0)/1000);if(raw!=='off'&&(!seconds||seconds>21600))return i.reply({content:'Use `off` or a duration up to 6 hours, such as 30s, 5m, or 2h.',ephemeral:true});if(!i.channel.setRateLimitPerUser)return i.reply({content:'Slowmode is not available in this channel.',ephemeral:true});await i.channel.setRateLimitPerUser(seconds,reason);vals.action=seconds?`Slowmode set to ${raw}`:'Slowmode disabled';vals.duration=seconds?raw:'';
  } else if (key === 'slowmodeoff') {

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
  else if(key==='report'){const rep={id:String((state.records.reports.at(-1)?.id||0)+1),guildId:guild.id,userId:user.id,reporterId:i.user.id,description:i.options.getString('description',true),createdAt:Date.now(),resolved:false};state.records.reports.push(rep);save();const ticketCfg=state.tickets;if(state.logs.channelId)await writeLog(guild,`Report #${rep.id} about <@${user.id}> from <@${i.user.id}>: ${rep.description}`);vals.action=`Report submitted #${rep.id}`;vals.reason=rep.description;}
  else if(key==='reports'){vals.action='Open reports';const list=state.records.reports.filter(r=>r.guildId===guild.id&&!r.resolved).slice(-10);fields.push({name:'Reports',value:list.length?list.map(r=>`#${r.id} about <@${r.userId}>: ${r.description}`).join('\n').slice(0,1024):'No open reports.'});}
  else if(key==='resolvereport'){const id=i.options.getString('report_id',true),rep=state.records.reports.find(r=>r.guildId===guild.id&&r.id===id);if(!rep)return i.reply({content:'Report ID not found.',ephemeral:true});rep.resolved=true;rep.resolution=i.options.getString('resolution',true);rep.resolvedBy=i.user.id;save();vals.action=`Report #${id} resolved`;vals.reason=rep.resolution;}
  else if(key==='case'){const id=i.options.getString('case_id',true),item=state.records.cases.find(x=>x.guildId===guild.id&&x.id===id);if(!item)return i.reply({content:'Case ID not found.',ephemeral:true});vals.action=`Case #${id}`;fields.push({name:'Action',value:item.command,inline:true},{name:'Target',value:item.target,inline:true},{name:'Reason',value:item.reason},{name:'Moderator',value:`<@${item.moderatorId}>`,inline:true});}
  else if(key==='cases'||key==='modlog'){const list=state.records.cases.filter(x=>x.guildId===guild.id&&x.target.includes(user.id)).slice(-10).reverse();vals.action='Moderation history';fields.push({name:'Cases',value:list.length?list.map(x=>`#${x.id} Â· ${x.command} Â· ${x.reason}`).join('\n').slice(0,1024):'No cases found.'});}
  else if(key==='staffannounce'){if(!state.logs.channelId)return i.reply({content:'Set the staff log channel in /logs-setup first.',ephemeral:true});const staffChannel=await guild.channels.fetch(state.logs.channelId).catch(()=>null);if(!staffChannel?.isTextBased())return i.reply({content:'The configured staff log channel is missing or not a text channel.',ephemeral:true});const notice=i.options.getString('text',true);await staffChannel.send({embeds:[new EmbedBuilder().setColor(color(state.commands[key].slides[0].color)).setTitle(fill(state.commands[key].slides[0].title,{action:'Staff notice',user:i.user.tag,reason:'',duration_line:''})).setDescription(notice).setTimestamp()]});vals.action='Staff notice posted';vals.reason=notice;}
  else if(key==='appealinfo'){vals.action='Appeal information';vals.reason=i.options.getString('text',true);}
  else { return i.reply({content:'This command is not implemented yet.',ephemeral:true}); }
  const labels=state.commands[key].fieldLabels;
  if(labels.user && vals.user && !fields.some(f=>f.name===labels.user)) fields.unshift({name:labels.user,value:String(vals.user).slice(0,1024),inline:true});
  if(labels.duration && vals.duration && !fields.some(f=>f.name===labels.duration)) fields.push({name:labels.duration,value:String(vals.duration).slice(0,1024),inline:true});
  if(labels.reason && vals.reason && !fields.some(f=>f.name===labels.reason)) fields.push({name:labels.reason,value:String(vals.reason).slice(0,1024)});
  const readOnly=['warnings','modnotes','roleinfo','memberinfo','channelinfo','raidstatus','reports','case','cases','modlog','appealinfo'];
  const caseId=readOnly.includes(key)?null:recordCase(guild.id,key,targetValue||vals.user||'N/A',reason,i.user.id);if(caseId){save();fields.push({name:'Case',value:`#${caseId}`,inline:true});}
  if(!readOnly.includes(key))await logEvent(guild,'moderation',`${i.user.tag} ran /${key} on ${targetValue||vals.user||'server'}: ${reason}`,[{name:'Case',value:caseId?`#${caseId}`:'N/A'}],i.channelId);
  const embed=buildActionEmbed(key,vals,fields),c=state.commands[key];
  return i.reply({content:resultText||undefined,embeds:[embed],components:linkRows(key,0),ephemeral:c.visibility==='private'});
}
function scheduleTempban(guildId,userId,expiresAt) {
  const wait=Math.max(0,expiresAt-Date.now()); setTimeout(async()=>{try{const rec=state.records.temporaryBans[`${guildId}:${userId}`];if(!rec||rec.expiresAt!==expiresAt)return;if(Date.now()<expiresAt){scheduleTempban(guildId,userId,expiresAt);return;}const guild=await client.guilds.fetch(guildId);await guild.members.unban(userId,'Temporary ban expired');delete state.records.temporaryBans[`${guildId}:${userId}`];save();}catch(e){console.error('Temporary ban expiry failed:',e.message);}},Math.min(wait,2147483647));
}
async function endGiveaway(guildId,messageId){const g=await client.guilds.fetch(guildId).catch(()=>null);const rec=state.records.giveaways.find(x=>x.guildId===guildId&&x.messageId===messageId&&!x.ended);if(!g||!rec)return false;const ch=await g.channels.fetch(rec.channelId).catch(()=>null);const msg=await ch?.messages.fetch(messageId).catch(()=>null);if(!msg)return false;const reaction=msg.reactions.cache.get('ðŸŽ‰');const users=reaction?await reaction.users.fetch():null;const entrants=users?[...users.values()].filter(u=>!u.bot):[];const winners=[];while(entrants.length&&winners.length<rec.winners){const n=Math.floor(Math.random()*entrants.length);winners.push(entrants.splice(n,1)[0]);}rec.ended=true;rec.winnerIds=winners.map(u=>u.id);save();await msg.reply(winners.length?`Winner(s) for **${rec.prize}**: ${winners.map(u=>`<@${u.id}>`).join(', ')}`:`No valid entrants for **${rec.prize}**.`).catch(()=>{});return true;}
function ticketPanelPayload(){const c=state.tickets;return{embeds:[previewServerEmbed('tickets')],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:create').setLabel((c.panelButton||'Create ticket').slice(0,80)).setStyle(ButtonStyle.Primary))]};}
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent,GatewayIntentBits.GuildMessageReactions],partials:[Partials.Message,Partials.Channel,Partials.Reaction,Partials.User]});
client.once(Events.ClientReady,async c=>{console.log(`Ready as ${c.user.tag}`);for(const r of Object.values(state.records.temporaryBans||{}))scheduleTempban(r.guildId,r.userId,r.expiresAt);for(const r of state.records.giveaways||[])if(!r.ended)setTimeout(()=>endGiveaway(r.guildId,r.messageId).catch(console.error),Math.min(Math.max(0,r.end-Date.now()),2147483647));for(const r of state.records.reminders||[])if(r.due>Date.now())setTimeout(async()=>{const g=await client.guilds.fetch(r.guildId).catch(()=>null),ch=await g?.channels.fetch(r.channelId).catch(()=>null);if(ch?.isTextBased())await ch.send({content:`<@${r.userId}> reminder: ${r.text}`}).catch(()=>{});},Math.min(r.due-Date.now(),2147483647));try{await syncCommands();console.log(`Registered ${CATALOG.length} moderation commands for guild ${GUILD_ID}`);}catch(e){console.error('Command registration failed:',e.message);}});
client.on(Events.GuildMemberAdd,async member=>{const c=state.welcome;if(!c.enabled||!c.channelId)return;const ch=await member.guild.channels.fetch(c.channelId).catch(()=>null);if(!ch?.isTextBased())return;const e=previewServerEmbed('welcome');e.setTitle(fill(c.title,{server:member.guild.name,user:member.user.username,memberCount:member.guild.memberCount}));e.setDescription(fill(c.message,{server:member.guild.name,user:`<@${member.id}>`,memberCount:member.guild.memberCount}));await ch.send({embeds:[e]}).catch(err=>console.error('Welcome send failed:',err.message));await logEvent(member.guild,'members',`${member.user.tag} joined the server.`);});
client.on(Events.GuildMemberRemove,async member=>{const c=state.leave;if(!c.enabled||!c.channelId)return;const ch=await member.guild.channels.fetch(c.channelId).catch(()=>null);if(!ch?.isTextBased())return;const e=previewServerEmbed('leave');e.setTitle(fill(c.title,{server:member.guild.name,user:member.user.username,memberCount:member.guild.memberCount}));e.setDescription(fill(c.message,{server:member.guild.name,user:`${member.user.username} (${member.user.tag})`,memberCount:member.guild.memberCount}));await ch.send({embeds:[e]}).catch(err=>console.error('Leave send failed:',err.message));await logEvent(member.guild,'members',`${member.user.tag} left the server.`);});
client.on(Events.MessageCreate,async m=>{handleAutoModMessage(m).catch(e=>console.error('AutoMod error:',e.message));if(!m.guild||m.author.bot)return;const key=`${m.guild.id}:${m.author.id}`;if(state.afkUsers[key]){delete state.afkUsers[key];save();m.reply('Welcome back, I removed your AFK status.').catch(()=>{});}for(const u of m.mentions.users.values()){const afk=state.afkUsers[`${m.guild.id}:${u.id}`];if(afk)m.reply(`${u.username} is AFK: ${afk.reason}`).catch(()=>{});}});
client.on(Events.MessageReactionRemove,async(reaction,user)=>{if(reaction.partial)await reaction.fetch().catch(()=>null);if(user.bot||!reaction.message.guild)return;for(const bind of state.records.reactionRoles||[]){if(bind.guildId===reaction.message.guild.id&&bind.messageId===reaction.message.id&&(bind.emoji===reaction.emoji.name||bind.emoji===reaction.emoji.toString()||bind.emoji===reaction.emoji.id)){const member=await reaction.message.guild.members.fetch(user.id).catch(()=>null);const role=await reaction.message.guild.roles.fetch(bind.roleId).catch(()=>null);if(member&&role)await member.roles.remove(role,'Reaction role removed').catch(()=>{});}}});
client.on(Events.MessageReactionAdd,async(reaction,user)=>{if(reaction.partial)await reaction.fetch().catch(()=>null);if(user.bot)return;const m=reaction.message;if(m.guild){for(const bind of state.records.reactionRoles||[]){if(bind.guildId===m.guild.id&&bind.messageId===m.id&&(bind.emoji===reaction.emoji.name||bind.emoji===reaction.emoji.toString()||bind.emoji===reaction.emoji.id)){const member=await m.guild.members.fetch(user.id).catch(()=>null);const role=await m.guild.roles.fetch(bind.roleId).catch(()=>null);if(member&&role&&role.position<m.guild.members.me.roles.highest.position)await member.roles.add(role,'Reaction role').catch(()=>{});}}}if(!m.guild||reaction.emoji.name!=='â­'||!state.starboard.channelId)return;if(reaction.count<state.starboard.threshold||m.channelId===state.starboard.channelId)return;const dest=await m.guild.channels.fetch(state.starboard.channelId).catch(()=>null);if(!dest?.isTextBased())return;const embed=new EmbedBuilder().setColor(0xF1C40F).setAuthor({name:m.author?.tag||'Member',iconURL:m.author?.displayAvatarURL()}).setDescription(`${m.content||'(attachment)'}\n\n[Jump to message](${m.url})`).setFooter({text:`â­ ${reaction.count} Â· #${m.channel.name}`});await dest.send({embeds:[embed]}).catch(()=>{});});
client.on(Events.InteractionCreate,async i=>{try{
  if(i.isChatInputCommand()){
    if(['embed-dashboard','moderation-dashboard','logs-setup','ticket-setup','welcome-setup','leave-setup','automod-setup'].includes(i.commandName)){if(!isAdmin(i))return deny(i);if(i.commandName==='embed-dashboard')return i.reply(embedDash('ban'));if(i.commandName==='moderation-dashboard')return i.reply(modDash('ban'));if(i.commandName==='logs-setup')return i.reply(logsDash());if(i.commandName==='ticket-setup')return i.reply(serverDash('tickets'));if(i.commandName==='welcome-setup')return i.reply(serverDash('welcome'));if(i.commandName==='leave-setup')return i.reply(serverDash('leave'));if(i.commandName==='automod-setup')return i.reply(automodDash());}
    const def=CATALOG.find(x=>slashName(x.name)===i.commandName);if(def)return executeCatalogCommand(i,def.name);
  }
  if(i.isStringSelectMenu()){if(i.customId.startsWith('rolesel:')){const token=i.customId.split(':')[1],menu=state.records.roleMenus?.[token];if(!menu||menu.guildId!==i.guildId)return i.reply({content:'This role menu is no longer active.',ephemeral:true});const roleId=i.values[0],role=await i.guild.roles.fetch(roleId).catch(()=>null),member=await i.guild.members.fetch(i.user.id);if(!menu.roleIds.includes(roleId)||!role||role.position>=i.guild.members.me.roles.highest.position)return i.reply({content:'That role canâ€™t be self-assigned.',ephemeral:true});if(member.roles.cache.has(roleId)){await member.roles.remove(roleId,'Self-service role menu');return i.reply({content:`Removed ${role.name}.`,ephemeral:true});}await member.roles.add(roleId,'Self-service role menu');return i.reply({content:`Added ${role.name}.`,ephemeral:true});}if(!isAdmin(i))return deny(i);if(i.customId==='logs:categories'){for(const k of LOG_CATEGORIES)state.logs.categories[k]=i.values.includes(k);save();return i.update(logsDash());}const [kind,action]=i.customId.split(':');if(action==='category'){const list=CATALOG.filter(x=>x.category===i.values[0]);const key=list[0]?.name||'ban';return i.update(kind==='embed'?embedDash(key):modDash(key));}const key=i.values[0];if(!CATALOG.some(x=>x.name===key))return;if(kind==='embed')return i.update(embedDash(key));if(kind==='mod')return i.update(modDash(key));}
  if(i.isButton()){
    if(i.customId.startsWith('logs:')){if(!isAdmin(i))return deny(i);if(i.customId==='logs:toggle'){state.logs.enabled=!state.logs.enabled;save();return i.update(logsDash());}if(i.customId==='logs:settings')return i.showModal(logsSettingsModal());if(i.customId==='logs:test'){if(!state.logs.enabled)return i.reply({content:'Enable logging first.',ephemeral:true});await logEvent(i.guild,'server',`Test log requested by ${i.user.tag}.`);return i.reply({content:'Test log sent if the channel is configured correctly.',ephemeral:true});}}
    if(i.customId.startsWith('am:')){if(!isAdmin(i))return deny(i);if(i.customId==='am:toggle')state.automod.enabled=!state.automod.enabled;else if(i.customId==='am:invites')state.automod.blockInvites=!state.automod.blockInvites;else if(i.customId==='am:links')state.automod.blockLinks=!state.automod.blockLinks;else if(i.customId==='am:logs')return i.reply(logsDash());save();return i.update(automodDash());}
    if(i.customId.startsWith('slide:')){const [,key,p]=i.customId.split(':');return i.update({embeds:[modEmbed(key,Number(p))],components:linkRows(key,Number(p))});}
    if(i.customId==='ticket:create'){
      if(!state.tickets.enabled)return i.reply({content:'The ticket system is disabled.',ephemeral:true});
      const existing=state.openTickets[i.guildId]?.[i.user.id];if(existing){const ch=await i.guild.channels.fetch(existing).catch(()=>null);if(ch)return i.reply({content:`You already have an open ticket: ${ch}`,ephemeral:true});}
      const c=state.tickets,category=await i.guild.channels.fetch(c.categoryId).catch(()=>null),staff=await i.guild.roles.fetch(c.staffRoleId).catch(()=>null);
      if(!category||category.type!==ChannelType.GuildCategory||!staff)return i.reply({content:'Ticket setup is incomplete. Ask an administrator to check category and staff role IDs in /ticket-setup.',ephemeral:true});
      const channelName=cleanName(fill(c.channelName,{username:i.user.username.toLowerCase().replace(/[^a-z0-9-]/g,'-')}),`ticket-${i.user.id.slice(-6)}`).slice(0,90);
      const channel=await i.guild.channels.create({name:channelName,type:ChannelType.GuildText,parent:category.id,topic:`Support ticket for ${i.user.tag} (${i.user.id})`,permissionOverwrites:[{id:i.guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},{id:i.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]},{id:staff.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageMessages]},{id:client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ReadMessageHistory]}]});
      state.openTickets[i.guildId]||={};state.openTickets[i.guildId][i.user.id]=channel.id;save();
      const e=new EmbedBuilder().setColor(color(c.color)).setTitle('Support ticket').setDescription(fill(c.intro,{user:`<@${i.user.id}>`,staffRoleId:staff.id}));
      await channel.send({content:`<@${i.user.id}> <@&${staff.id}>`,embeds:[e],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:close').setLabel(c.closeButton.slice(0,80)).setStyle(ButtonStyle.Danger))]});
      await logEvent(i.guild,'tickets',`Ticket created by ${i.user.tag}: ${channel}.`);
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
        await logEvent(i.guild,'tickets',`Ticket closed by ${i.user.tag}: ${i.channel.name}.`,[],i.channelId);
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
    if(i.customId==='modal:logs'){state.logs.channelId=i.fields.getTextInputValue('channelId').trim();state.logs.ignoredChannels=i.fields.getTextInputValue('ignoredChannels').split(',').map(x=>x.trim()).filter(Boolean);save();return i.reply(logsDash());}
    if(p[0]==='modal'&&p[1]==='slide'){const [, ,key,raw,op]=p,page=Number(raw),d={title:i.fields.getTextInputValue('title').trim(),description:i.fields.getTextInputValue('description').trim(),color:color(i.fields.getTextInputValue('color').trim()),image:url(i.fields.getTextInputValue('image').trim()),thumbnail:url(i.fields.getTextInputValue('thumbnail').trim()),footer:op==='add'?'':(state.commands[key].slides[page]?.footer||'')};if(op==='add')state.commands[key].slides.push(d);else state.commands[key].slides[page]=d;save();return i.reply(embedDash(key,op==='add'?state.commands[key].slides.length-1:page));}
    if(p[0]==='modal'&&p[1]==='footer'){const key=p[2],page=Number(p[3]);state.commands[key].slides[page].footer=i.fields.getTextInputValue('footer').trim();save();return i.reply(embedDash(key,page));}
    if(p[0]==='modal'&&p[1]==='fields'){const key=p[2];for(const field of ['user','reason','duration'])state.commands[key].fieldLabels[field]=i.fields.getTextInputValue(field).trim();save();return i.reply(embedDash(key));}
    if(p[0]==='modal'&&p[1]==='links'){const key=p[2],links=[];for(let n=1;n<=2;n++){const label=i.fields.getTextInputValue(`label${n}`).trim(),href=url(i.fields.getTextInputValue(`url${n}`).trim());if(label&&href)links.push({label,url:href});}state.commands[key].responseLinks=links;save();return i.reply(embedDash(key));}
    if(p[0]==='modal'&&p[1]==='modsettings'){const key=p[2],name=cleanName(i.fields.getTextInputValue('name').trim(),key);if(MODS.some(k=>k!==key&&slashName(k)===name))return i.reply({content:'That slash command name is already in use.',ephemeral:true});const c=state.commands[key];c.name=name===key?'':name;c.dmTitle=i.fields.getTextInputValue('dmTitle').trim();c.dmMessage=i.fields.getTextInputValue('dmMessage').trim();save();try{await syncCommands();}catch(e){console.error('Rename registration failed:',e.message);return i.reply({content:'Saved settings, but Discord rejected the renamed command. Check bot registration and retry.',ephemeral:true});}return i.reply({content:`Saved. Use **/${name}** now.`,ephemeral:true});}
    if(p[0]==='modal'&&p[1]==='scontent'){const section=p[2],c=section==='welcome'?state.welcome:section==='leave'?state.leave:state.tickets,titleKey=section==='tickets'?'panelTitle':'title',descKey=section==='tickets'?'panelDescription':'message';c[titleKey]=i.fields.getTextInputValue(titleKey).trim();c[descKey]=i.fields.getTextInputValue(descKey).trim();c.color=color(i.fields.getTextInputValue('color').trim());c.image=url(i.fields.getTextInputValue('image').trim());c.thumbnail=url(i.fields.getTextInputValue('thumbnail').trim());save();return i.reply(serverDash(section));}
    if(p[0]==='modal'&&p[1]==='ssettings'){const section=p[2],c=section==='welcome'?state.welcome:section==='leave'?state.leave:state.tickets;for(const id of ['channelId','categoryId','staffRoleId','panelButton','channelName'])if(i.fields.fields.has(id))c[id]=i.fields.getTextInputValue(id).trim();save();return i.reply(serverDash(section));}
    if(i.customId==='modal:ticketintro'){for(const id of ['intro','closeButton','closedPrefix'])state.tickets[id]=i.fields.getTextInputValue(id).trim();save();return i.reply(serverDash('tickets'));}
  }
}catch(e){console.error('Interaction failed:',e);const p={content:'Something went wrong. Check the bot console for details.',ephemeral:true};if(i.replied||i.deferred)await i.followUp(p).catch(()=>{});else await i.reply(p).catch(()=>{});}});
client.login(TOKEN);