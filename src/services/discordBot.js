import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { db } from '../database/index.js';
import { supervisor } from '../daemon/supervisor.js';
import { logStreamer } from '../daemon/logStreamer.js';
import { getSystemStats } from '../daemon/metrics.js';
import { config } from '../config.js';

function getDirectoryStats(dirPath) {
  let totalBytes = 0;
  let fileCount = 0;
  if (!fs.existsSync(dirPath)) return { sizeMb: '0.00', fileCount: 0 };

  function traverse(current) {
    try {
      const items = fs.readdirSync(current, { withFileTypes: true });
      for (const item of items) {
        const full = path.join(current, item.name);
        if (item.isDirectory()) {
          traverse(full);
        } else if (item.isFile()) {
          fileCount++;
          try {
            totalBytes += fs.statSync(full).size;
          } catch (e) {}
        }
      }
    } catch (e) {}
  }
  traverse(dirPath);
  return {
    sizeMb: (totalBytes / (1024 * 1024)).toFixed(2),
    fileCount
  };
}

function listContainerFiles(appId, subPath = '') {
  const appDir = path.join(config.appsDir, appId);
  const cleanSub = (subPath || '').trim().replace(/^[\/\\]+/, '');
  const targetDir = path.normalize(path.join(appDir, cleanSub));

  if (!targetDir.startsWith(appDir)) {
    throw new Error('Access denied: Path traversal outside server directory.');
  }
  if (!fs.existsSync(targetDir)) {
    throw new Error(`Directory "${subPath || '/'}" does not exist.`);
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const items = entries.map(e => {
    const full = path.join(targetDir, e.name);
    let size = 0;
    const isDir = e.isDirectory();
    try {
      size = fs.statSync(full).size;
    } catch (err) {}

    let icon = '📄';
    if (isDir) icon = '📁';
    else if (e.name.match(/\.(zip|tar|gz|tgz|bz2|xz|7z|rar)$/i)) icon = '📦';
    else if (e.name.match(/\.(json|env|yml|yaml|ini|conf)$/i)) icon = '⚙️';
    else if (e.name.match(/\.(js|ts|mjs|cjs)$/i)) icon = '⚡';
    else if (e.name.match(/\.(py|pyw)$/i)) icon = '🐍';
    else if (e.name.match(/\.(sh|bash|bat|cmd)$/i)) icon = '💻';

    const sizeStr = isDir ? 'DIR' : (size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${(size / 1024).toFixed(1)} KB`);
    return { name: e.name, isDir, sizeStr, icon };
  });

  items.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  });

  return { items, targetDir, subPath: cleanSub ? `/${cleanSub}` : '/' };
}

class DiscordBotService {
  constructor() {
    this.client = null;
    this.status = 'offline';
    this.botUser = null;
    this.lastError = null;
    this.token = null;
    this.guildId = null;
    this.adminUserIds = [];
    this.initialized = false;
    this.liveConsoleSessions = new Map();
  }

  getBaseDomain() {
    try {
      const row = db.prepare("SELECT value FROM panel_settings WHERE key = 'base_domain'").get();
      if (row && row.value && row.value.trim().length > 0) return row.value.trim();
    } catch (e) {}
    return config.baseDomain || process.env.BASE_DOMAIN || '';
  }

  // Load configuration from database panel_settings
  loadSettings() {
    try {
      const tokenRow = db.prepare("SELECT value FROM panel_settings WHERE key = 'discord_bot_token'").get();
      const enabledRow = db.prepare("SELECT value FROM panel_settings WHERE key = 'discord_bot_enabled'").get();
      const guildRow = db.prepare("SELECT value FROM panel_settings WHERE key = 'discord_bot_guild_id'").get();
      const adminsRow = db.prepare("SELECT value FROM panel_settings WHERE key = 'discord_bot_admin_ids'").get();

      this.token = tokenRow ? tokenRow.value : '';
      this.enabled = enabledRow ? enabledRow.value === '1' : false;
      this.guildId = guildRow ? guildRow.value : '';
      this.adminUserIds = adminsRow && adminsRow.value 
        ? adminsRow.value.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      return {
        token: this.token,
        enabled: this.enabled,
        guildId: this.guildId,
        adminUserIds: this.adminUserIds
      };
    } catch (err) {
      console.error('[DiscordBot] Error loading settings:', err.message);
      return { token: '', enabled: false, guildId: '', adminUserIds: [] };
    }
  }

  // Save settings into panel_settings
  saveSettings({ token, enabled, guildId, adminUserIds }) {
    const upsert = db.prepare(`
      INSERT INTO panel_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    if (token !== undefined) upsert.run('discord_bot_token', token.trim());
    if (enabled !== undefined) upsert.run('discord_bot_enabled', enabled ? '1' : '0');
    if (guildId !== undefined) upsert.run('discord_bot_guild_id', guildId.trim());
    if (adminUserIds !== undefined) {
      const str = Array.isArray(adminUserIds) ? adminUserIds.join(',') : adminUserIds;
      upsert.run('discord_bot_admin_ids', str.trim());
    }

    this.loadSettings();
  }

  // Check if a Discord user is authorized to perform actions (Admin only)
  isAuthorized(userId, member = null, guild = null) {
    if (this.adminUserIds.length > 0 && this.adminUserIds.includes(userId)) {
      return true;
    }
    if (guild && guild.ownerId === userId) {
      return true;
    }
    if (member && member.permissions) {
      if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
      if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
    }
    return false;
  }

  // Initialize and boot bot if configured
  async init() {
    this.loadSettings();
    if (this.enabled && this.token) {
      console.log('[DiscordBot] Initializing configured Discord Bot...');
      await this.start();
    } else {
      this.status = 'offline';
    }
  }

  // Start Discord client
  async start() {
    if (!this.token) {
      this.status = 'offline';
      this.lastError = 'No bot token configured';
      return { success: false, error: this.lastError };
    }

    if (this.client) {
      try {
        await this.client.destroy();
      } catch (e) {}
    }

    this.status = 'connecting';
    this.lastError = null;

    try {
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
        ]
      });

      this.client.once('ready', async () => {
        this.status = 'online';
        this.botUser = {
          id: this.client.user.id,
          tag: this.client.user.tag,
          username: this.client.user.username,
          avatar: this.client.user.displayAvatarURL()
        };
        console.log(`[DiscordBot] 🟢 Connected successfully as @${this.client.user.tag}!`);
        await this.registerSlashCommands();
      });

      this.client.on('error', (err) => {
        console.error('[DiscordBot] Client error:', err.message);
        this.status = 'error';
        this.lastError = err.message;
      });

      this.client.on('interactionCreate', async (interaction) => {
        try {
          if (interaction.isChatInputCommand()) {
            await this.handleCommand(interaction);
          } else if (interaction.isButton()) {
            await this.handleButton(interaction);
          } else if (interaction.isModalSubmit()) {
            await this.handleModal(interaction);
          }
        } catch (err) {
          console.error('[DiscordBot] Interaction error:', err);
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: `⚠️ Error: ${err.message}`, ephemeral: true }).catch(() => {});
          } else {
            await interaction.reply({ content: `⚠️ Error: ${err.message}`, ephemeral: true }).catch(() => {});
          }
        }
      });

      await this.client.login(this.token);
      return { success: true, status: 'connecting' };
    } catch (err) {
      console.error('[DiscordBot] Login failed:', err.message);
      this.status = 'error';
      this.lastError = err.message;
      return { success: false, error: err.message };
    }
  }

  // Stop Discord client
  async stop() {
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (e) {}
      this.client = null;
    }
    this.status = 'offline';
    this.botUser = null;
    console.log('[DiscordBot] 🔴 Discord Bot client stopped.');
    return { success: true };
  }

  // Register All Slash Commands
  async registerSlashCommands() {
    if (!this.client || !this.client.user) return;

    const commands = [
      new SlashCommandBuilder()
        .setName('servers')
        .setDescription('List all hosted servers and their current status')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

      new SlashCommandBuilder()
        .setName('server')
        .setDescription('View and control a specific server with interactive buttons')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('identifier')
            .setDescription('Server name or ID (e.g. app_9d50e0fc or MyServer)')
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName('createserver')
        .setDescription('Deploy a new server instance directly from Discord')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Server instance name')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('type')
            .setDescription('Runtime environment')
            .setRequired(true)
            .addChoices(
              { name: 'Node.js (LTS)', value: 'nodejs' },
              { name: 'Python 3', value: 'python' }
            )
        )
        .addStringOption(opt =>
          opt.setName('owner')
            .setDescription("Owner's Gmail or email address (e.g. user@gmail.com)")
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName('ram')
            .setDescription('Allocated RAM limit in MB (default: 1024)')
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName('cpu')
            .setDescription('CPU quota % (default: 100)')
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName('port')
            .setDescription('Custom TCP port (e.g. 3100, default: auto-assign)')
            .setRequired(false)
        ),

      new SlashCommandBuilder()
        .setName('deleteserver')
        .setDescription('Permanently delete a server container and release its port')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('identifier')
            .setDescription('Server name or ID to delete')
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName('startserver')
        .setDescription('Power on a server container')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('identifier')
            .setDescription('Server name or ID')
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName('stopserver')
        .setDescription('Stop a running server container')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('identifier')
            .setDescription('Server name or ID')
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName('restartserver')
        .setDescription('Restart a server container')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('identifier')
            .setDescription('Server name or ID')
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName('cmd')
        .setDescription('Send a command directly to a server console')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('identifier')
            .setDescription('Server name or ID')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('command')
            .setDescription('Command line string to execute')
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName('logs')
        .setDescription('View the latest live console output of a server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('identifier')
            .setDescription('Server name or ID')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('lines')
            .setDescription('Number of lines to retrieve (default: 25)')
            .setRequired(false)
        ),

      new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Inspect detailed server specifications, storage size, and files count')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('identifier')
            .setDescription('Server name or ID')
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName('createuser')
        .setDescription('Create a new user account on Eclipse Panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('username')
            .setDescription('Unique username')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('email')
            .setDescription('Email address')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('password')
            .setDescription('Account login password')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('role')
            .setDescription('Account permissions role')
            .setRequired(false)
            .addChoices(
              { name: 'Standard User', value: 'user' },
              { name: 'Administrator', value: 'admin' }
            )
        ),

      new SlashCommandBuilder()
        .setName('users')
        .setDescription('List all registered panel operators, roles, and server counts')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

      new SlashCommandBuilder()
        .setName('panel')
        .setDescription('View live VPS telemetry, CPU, RAM, and infrastructure health')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

      new SlashCommandBuilder()
        .setName('files')
        .setDescription('Browse files and folders inside a server container')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('identifier')
            .setDescription('Server name or ID')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('path')
            .setDescription('Subdirectory path (default: root /)')
            .setRequired(false)
        ),

      new SlashCommandBuilder()
        .setName('viewfile')
        .setDescription('View contents of a text or code file in server storage')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('identifier')
            .setDescription('Server name or ID')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('path')
            .setDescription('File path to inspect (e.g. config.json, package.json)')
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName('deletefile')
        .setDescription('Permanently delete a file or directory from server storage')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('identifier')
            .setDescription('Server name or ID')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('path')
            .setDescription('File or folder path to delete')
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName('startup')
        .setDescription('View or update server entrypoint and startup command')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('identifier')
            .setDescription('Server name or ID')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('entrypoint')
            .setDescription('Main entrypoint file (e.g. index.js, main.py)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('command')
            .setDescription('Startup command execution string')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('args')
            .setDescription('Runtime arguments')
            .setRequired(false)
        ),

      new SlashCommandBuilder()
        .setName('settings')
        .setDescription('View or update server resource limits and custom domain')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('identifier')
            .setDescription('Server name or ID')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Rename server')
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName('ram')
            .setDescription('Memory limit in MB (e.g. 2048)')
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName('cpu')
            .setDescription('CPU quota % (e.g. 100)')
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName('disk')
            .setDescription('Disk storage quota in MB (e.g. 10240)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('domain')
            .setDescription('Custom domain / subdomain')
            .setRequired(false)
        ),

      new SlashCommandBuilder()
        .setName('liveconsole')
        .setDescription('Open a live updating terminal console session with real-time stream & stdin controls')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('identifier')
            .setDescription('Server name or ID')
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName('console')
        .setDescription('Open a live updating terminal console session (alias for /liveconsole)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('identifier')
            .setDescription('Server name or ID')
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName('help')
        .setDescription('View documentation and command reference for Eclipse Discord Bot')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(this.token);

    try {
      if (this.guildId) {
        await rest.put(
          Routes.applicationGuildCommands(this.client.user.id, this.guildId),
          { body: commands }
        );
        console.log(`[DiscordBot] Registered ${commands.length} slash commands to Guild ID: ${this.guildId}`);
      } else {
        await rest.put(
          Routes.applicationCommands(this.client.user.id),
          { body: commands }
        );
        console.log(`[DiscordBot] Registered ${commands.length} global slash commands.`);
      }
    } catch (err) {
      console.error('[DiscordBot] Failed to register slash commands:', err.message);
    }
  }

  // Handle Slash Commands
  async handleCommand(interaction) {
    const { commandName } = interaction;

    // Strict Admin Authorization Check: Bot is exclusively accessible by Discord Server Administrators
    if (!this.isAuthorized(interaction.user.id, interaction.member, interaction.guild)) {
      return interaction.reply({
        content: '❌ **Access Denied**: This Eclipse Panel bot can only be accessed and managed by server administrators.',
        ephemeral: true
      });
    }

    if (commandName === 'servers') {
      await this.cmdListServers(interaction);
    } else if (commandName === 'server') {
      await this.cmdGetServer(interaction);
    } else if (commandName === 'createserver') {
      await this.cmdCreateServer(interaction);
    } else if (commandName === 'deleteserver') {
      await this.cmdDeleteServer(interaction);
    } else if (commandName === 'startserver') {
      await this.cmdQuickPower(interaction, 'start');
    } else if (commandName === 'stopserver') {
      await this.cmdQuickPower(interaction, 'stop');
    } else if (commandName === 'restartserver') {
      await this.cmdQuickPower(interaction, 'restart');
    } else if (commandName === 'cmd') {
      await this.cmdConsole(interaction);
    } else if (commandName === 'liveconsole' || commandName === 'console') {
      await this.cmdLiveConsole(interaction);
    } else if (commandName === 'logs') {
      await this.cmdLogs(interaction);
    } else if (commandName === 'files') {
      await this.cmdFiles(interaction);
    } else if (commandName === 'viewfile') {
      await this.cmdViewFile(interaction);
    } else if (commandName === 'deletefile') {
      await this.cmdDeleteFile(interaction);
    } else if (commandName === 'startup') {
      await this.cmdStartup(interaction);
    } else if (commandName === 'settings') {
      await this.cmdSettings(interaction);
    } else if (commandName === 'serverinfo') {
      await this.cmdServerInfo(interaction);
    } else if (commandName === 'createuser') {
      await this.cmdCreateUser(interaction);
    } else if (commandName === 'users') {
      await this.cmdListUsers(interaction);
    } else if (commandName === 'panel') {
      await this.cmdPanelStats(interaction);
    } else if (commandName === 'help') {
      await this.cmdHelp(interaction);
    }
  }

  // 1. /servers command
  async cmdListServers(interaction) {
    const apps = db.prepare('SELECT a.*, u.username as owner_username FROM apps a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC').all();

    if (!apps || apps.length === 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🌑 Eclipse Panel · Hosted Servers')
            .setDescription('No servers deployed yet. Use `/createserver` to deploy your first instance!')
            .setColor(0x06B6D4)
        ]
      });
    }

    const baseDomain = this.getBaseDomain();
    const hostIp = config.vpsPublicIp || '20.219.198.128';
    const lines = apps.map(app => {
      const isRunning = app.status === 'running' || app.status === 'online';
      const statusEmoji = isRunning ? '🟢' : (app.status === 'starting' ? '🔄' : '⏹️');
      let addr = `${hostIp}:${app.port}`;
      if (app.domain && app.domain.trim().length > 0) {
        addr = `${app.domain}:${app.port}`;
      } else if (baseDomain) {
        const slug = app.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || app.id;
        addr = `${slug}.${baseDomain}:${app.port}`;
      }
      return `${statusEmoji} **${app.name}** (\`${app.id}\`) — \`${addr}\` | ${app.type === 'python' ? '🐍 Python' : '⚡ Node.js'} | ${app.memory_limit}MB RAM`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`🌑 Eclipse Panel · Deployed Servers (${apps.length})`)
      .setDescription(lines.join('\n\n'))
      .setColor(0x06B6D4)
      .setFooter({ text: 'Use /server <id or name> for interactive control buttons' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // 2. /server command with interactive buttons
  async cmdGetServer(interaction) {
    const query = interaction.options.getString('identifier').trim();
    const app = db.prepare(`
      SELECT a.*, u.username as owner_username, u.email as owner_email 
      FROM apps a 
      LEFT JOIN users u ON a.user_id = u.id 
      WHERE a.id = ? OR LOWER(a.name) = LOWER(?)
    `).get(query, query);

    if (!app) {
      return interaction.reply({
        content: `❌ Server matching "${query}" was not found in Eclipse Panel.`,
        ephemeral: true
      });
    }

    const embed = this.buildServerEmbed(app);
    const buttonRows = this.buildServerButtons(app.id, app.status);

    await interaction.reply({ embeds: [embed], components: buttonRows });
  }

  // 3. /createserver command (Clean slate, zero files by default)
  async cmdCreateServer(interaction) {
    const name = interaction.options.getString('name').trim();
    const type = interaction.options.getString('type').toLowerCase();
    const ram = interaction.options.getInteger('ram') || 1024;
    const cpu = interaction.options.getInteger('cpu') || 100;
    const customPort = interaction.options.getInteger('port');
    const ownerInput = interaction.options.getString('owner')?.trim();

    await interaction.deferReply();

    // Determine server recipient / owner
    let owner = null;
    let isNewUserCreated = false;
    let generatedPassword = null;

    if (ownerInput) {
      const cleanInput = ownerInput.toLowerCase();
      owner = db.prepare('SELECT id, username, email FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?').get(cleanInput, cleanInput);

      if (!owner) {
        // Automatically create account for this Gmail/email
        let username = cleanInput.includes('@') ? cleanInput.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') : cleanInput;
        if (!username || username.length < 3) username = `user_${Math.random().toString(36).substring(2, 7)}`;

        let checkUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        let counter = 1;
        const baseUsername = username;
        while (checkUser) {
          username = `${baseUsername}${counter++}`;
          checkUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        }

        const email = cleanInput.includes('@') ? cleanInput : `${cleanInput}@vexezor.bond`;
        generatedPassword = crypto.randomBytes(6).toString('hex');
        const hash = bcrypt.hashSync(generatedPassword, 10);

        const result = db.prepare(`
          INSERT INTO users (username, email, password_hash, role)
          VALUES (?, ?, ?, 'user')
        `).run(username, email, hash);

        owner = { id: result.lastInsertRowid, username, email };
        isNewUserCreated = true;
      }
    } else {
      owner = db.prepare("SELECT id, username, email FROM users WHERE role = 'admin' LIMIT 1").get();
      if (!owner) owner = { id: 1, username: 'admin', email: 'admin@eclipse.local' };
    }

    // Port allocation
    let port = customPort;
    if (!port) {
      const used = new Set(db.prepare('SELECT port FROM apps WHERE port IS NOT NULL').all().map(a => a.port));
      port = 3000;
      while (used.has(port) && port < 9999) port++;
    }

    const appId = `app_${crypto.randomBytes(4).toString('hex')}`;
    const defaultEntry = type === 'python' ? 'main.py' : 'index.js';
    const appDir = path.join(config.appsDir, appId);

    // Create empty app directory without any boilerplate files
    if (!fs.existsSync(appDir)) {
      fs.mkdirSync(appDir, { recursive: true });
    }

    const baseDomain = this.getBaseDomain();
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || appId;
    const serverDomain = baseDomain ? `${slug}.${baseDomain}` : '';

    db.prepare(`
      INSERT INTO apps (id, name, type, user_id, entrypoint, port, memory_limit, cpu_limit, disk_limit, domain, status, node_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 5120, ?, 'stopped', 'node_local')
    `).run(appId, name, type, owner.id, defaultEntry, port, ram, cpu, serverDomain);

    const newApp = db.prepare('SELECT * FROM apps WHERE id = ?').get(appId);
    let desc = `✅ **Server Created Successfully!**\nAllocated to: **${owner.email}** (@${owner.username})\n\nContainer is clean and empty. Upload your project files or use the buttons below:`;

    if (isNewUserCreated) {
      desc = `✅ **Server & Account Created Successfully!**\nNew account provisioned for **${owner.email}**.\n\n👤 **Username:** \`${owner.username}\`\n🔑 **Temporary Password:** \`${generatedPassword}\`\n🌐 **Panel Login:** \`http://${config.vpsPublicIp || '20.219.198.128'}:8090/login\`\n\nUse the buttons below to control your container:`;
    }

    const embed = this.buildServerEmbed(newApp).setDescription(desc);
    const buttonRows = this.buildServerButtons(appId, 'stopped');

    await interaction.editReply({ embeds: [embed], components: buttonRows });
  }

  // 4. /deleteserver command
  async cmdDeleteServer(interaction) {
    const query = interaction.options.getString('identifier').trim();
    const app = db.prepare('SELECT * FROM apps WHERE id = ? OR LOWER(name) = LOWER(?)').get(query, query);

    if (!app) {
      return interaction.reply({ content: `❌ Server matching "${query}" was not found.`, ephemeral: true });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`btn_confirmdel_${app.id}`).setLabel('Yes, Permanently Delete').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
      new ButtonBuilder().setCustomId(`btn_cancel_${app.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: `⚠️ **Confirm Permanent Deletion**\nAre you sure you want to permanently delete **${app.name}** (\`${app.id}\`)? All server files, databases, and assigned ports will be released immediately.`,
      components: [row]
    });
  }

  // 5. Quick power commands (/startserver, /stopserver, /restartserver)
  async cmdQuickPower(interaction, action) {
    const query = interaction.options.getString('identifier').trim();
    const app = db.prepare('SELECT * FROM apps WHERE id = ? OR LOWER(name) = LOWER(?)').get(query, query);

    if (!app) {
      return interaction.reply({ content: `❌ Server matching "${query}" was not found.`, ephemeral: true });
    }

    await interaction.deferReply();

    try {
      if (action === 'start') await supervisor.startApp(app.id);
      else if (action === 'stop') await supervisor.stopApp(app.id);
      else if (action === 'restart') await supervisor.restartApp(app.id);

      await new Promise(r => setTimeout(r, 700));
      const updated = db.prepare('SELECT * FROM apps WHERE id = ?').get(app.id);
      const embed = this.buildServerEmbed(updated);
      const rows = this.buildServerButtons(app.id, updated.status);

      await interaction.editReply({ embeds: [embed], components: rows });
    } catch (err) {
      await interaction.editReply({ content: `⚠️ Failed to ${action} server: ${err.message}` });
    }
  }

  // 6. /cmd command (Terminal console execution)
  async cmdConsole(interaction) {
    const query = interaction.options.getString('identifier').trim();
    const command = interaction.options.getString('command').trim();

    const app = db.prepare('SELECT * FROM apps WHERE id = ? OR LOWER(name) = LOWER(?)').get(query, query);
    if (!app) {
      return interaction.reply({ content: `❌ Server matching "${query}" was not found.`, ephemeral: true });
    }

    await interaction.deferReply();

    try {
      const result = await supervisor.sendCommand(app.id, command);
      await new Promise(r => setTimeout(r, 600));

      const logs = logStreamer.getLogs(app.id, 15);
      const snippet = logs.map(l => l.data).join('').trim().slice(-1400) || 'Command sent to process stdin.';

      const embed = new EmbedBuilder()
        .setTitle(`💻 Console Output · ${app.name}`)
        .setColor(0x06B6D4)
        .setDescription(`**Executed:** \`${command}\`\n\`\`\`ansi\n${snippet}\n\`\`\``)
        .setFooter({ text: `App ID: ${app.id}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: `⚠️ Command execution failed: ${err.message}` });
    }
  }

  // 6B. /liveconsole command (Interactive real-time live streaming terminal)
  async cmdLiveConsole(interaction, passedAppId = null) {
    const query = passedAppId || interaction.options.getString('identifier').trim();
    const app = db.prepare('SELECT * FROM apps WHERE id = ? OR LOWER(name) = LOWER(?)').get(query, query);
    if (!app) {
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ content: `❌ Server matching "${query}" was not found.` });
      }
      return interaction.reply({ content: `❌ Server matching "${query}" was not found.`, ephemeral: true });
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const sessionId = crypto.randomBytes(4).toString('hex');
    const isRunning = app.status === 'running' || app.status === 'online';

    const embed = this.buildLiveConsoleEmbed(app, sessionId, false, false);
    const rows = this.buildLiveConsoleButtons(app.id, sessionId, false, isRunning);

    const replyMsg = await interaction.editReply({ embeds: [embed], components: rows });

    const session = {
      sessionId,
      appId: app.id,
      interaction,
      messageId: replyMsg.id,
      isPaused: false,
      cleared: false,
      lastSnippet: '',
      startTime: Date.now(),
      timer: null
    };

    session.timer = setInterval(async () => {
      try {
        // Auto-terminate session after 10 minutes of operation
        if (Date.now() - session.startTime > 10 * 60 * 1000) {
          clearInterval(session.timer);
          this.liveConsoleSessions.delete(sessionId);
          const expired = this.buildLiveConsoleEmbed(app, sessionId, false, true);
          await interaction.editReply({ embeds: [expired], components: [] }).catch(() => {});
          return;
        }

        if (session.isPaused) return;

        const currentApp = db.prepare('SELECT * FROM apps WHERE id = ?').get(app.id);
        const isAppRunning = currentApp && (currentApp.status === 'running' || currentApp.status === 'online');

        const logs = session.cleared ? [] : logStreamer.getLogs(app.id, 25);
        const snippet = logs.map(l => l.data || l.message || '').join('').trim().slice(-1600);

        if (snippet === session.lastSnippet) return;
        session.lastSnippet = snippet;

        const updatedEmbed = this.buildLiveConsoleEmbed(currentApp || app, sessionId, false, false, snippet);
        const updatedRows = this.buildLiveConsoleButtons(app.id, sessionId, false, isAppRunning);

        await interaction.editReply({ embeds: [updatedEmbed], components: updatedRows }).catch(err => {
          if (err.code === 10008 || err.code === 40060) {
            clearInterval(session.timer);
            this.liveConsoleSessions.delete(sessionId);
          }
        });
      } catch (err) {
        clearInterval(session.timer);
        this.liveConsoleSessions.delete(sessionId);
      }
    }, 2500);

    this.liveConsoleSessions.set(sessionId, session);
  }

  // 7. /logs command
  async cmdLogs(interaction) {
    const query = interaction.options.getString('identifier').trim();
    const linesCount = interaction.options.getInteger('lines') || 25;

    const app = db.prepare('SELECT * FROM apps WHERE id = ? OR LOWER(name) = LOWER(?)').get(query, query);
    if (!app) {
      return interaction.reply({ content: `❌ Server matching "${query}" was not found.`, ephemeral: true });
    }

    const logs = logStreamer.getLogs(app.id, linesCount);
    const rawLogs = logs.map(l => l.data).join('').trim() || 'No logs recorded for this server yet.';
    const snippet = rawLogs.length > 1850 ? rawLogs.slice(-1850) : rawLogs;

    const embed = new EmbedBuilder()
      .setTitle(`📜 Live Logs · ${app.name} (${app.id})`)
      .setColor(0x10B981)
      .setDescription(`\`\`\`ansi\n${snippet}\n\`\`\``)
      .setFooter({ text: `Showing last ${linesCount} lines · Eclipse LogStreamer` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // 7B. /files command (Browse files and directories)
  async cmdFiles(interaction) {
    const query = interaction.options.getString('identifier').trim();
    const subPath = interaction.options.getString('path') || '';

    const app = db.prepare('SELECT * FROM apps WHERE id = ? OR LOWER(name) = LOWER(?)').get(query, query);
    if (!app) return interaction.reply({ content: `❌ Server matching "${query}" was not found.`, ephemeral: true });

    try {
      const fileData = listContainerFiles(app.id, subPath);
      const embed = this.buildFilesEmbed(app, fileData);
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      await interaction.reply({ content: `⚠️ File listing failed: ${err.message}`, ephemeral: true });
    }
  }

  // 7C. /viewfile command (Read file content)
  async cmdViewFile(interaction) {
    const query = interaction.options.getString('identifier').trim();
    const filePath = interaction.options.getString('path').trim();

    const app = db.prepare('SELECT * FROM apps WHERE id = ? OR LOWER(name) = LOWER(?)').get(query, query);
    if (!app) return interaction.reply({ content: `❌ Server matching "${query}" was not found.`, ephemeral: true });

    const appDir = path.join(config.appsDir, app.id);
    const targetFile = path.normalize(path.join(appDir, filePath));
    if (!targetFile.startsWith(appDir)) {
      return interaction.reply({ content: '❌ Access denied: Path traversal detected.', ephemeral: true });
    }
    if (!fs.existsSync(targetFile)) {
      return interaction.reply({ content: `❌ File "${filePath}" does not exist in server storage.`, ephemeral: true });
    }
    const stat = fs.statSync(targetFile);
    if (stat.isDirectory()) {
      return interaction.reply({ content: `❌ "${filePath}" is a directory. Use \`/files\` to browse directories.`, ephemeral: true });
    }

    try {
      let content = fs.readFileSync(targetFile, 'utf8');
      const ext = path.extname(targetFile).replace('.', '') || 'text';
      let preview = content.slice(0, 1800);
      if (content.length > 1800) preview += '\n... [content truncated: file exceeds 1800 characters]';

      const embed = new EmbedBuilder()
        .setTitle(`📄 ${filePath} (${(stat.size / 1024).toFixed(1)} KB)`)
        .setColor(0x10B981)
        .setDescription(`\`\`\`${ext}\n${preview}\n\`\`\``)
        .setFooter({ text: `Server: ${app.name} (${app.id})` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      await interaction.reply({ content: `⚠️ Failed to read file: ${err.message}`, ephemeral: true });
    }
  }

  // 7D. /deletefile command (Delete file or directory)
  async cmdDeleteFile(interaction) {
    const query = interaction.options.getString('identifier').trim();
    const filePath = interaction.options.getString('path').trim();

    const app = db.prepare('SELECT * FROM apps WHERE id = ? OR LOWER(name) = LOWER(?)').get(query, query);
    if (!app) return interaction.reply({ content: `❌ Server matching "${query}" was not found.`, ephemeral: true });

    const appDir = path.join(config.appsDir, app.id);
    const target = path.normalize(path.join(appDir, filePath));
    if (!target.startsWith(appDir) || target === appDir) {
      return interaction.reply({ content: '❌ Access denied: Cannot delete server root directory.', ephemeral: true });
    }
    if (!fs.existsSync(target)) {
      return interaction.reply({ content: `❌ Path "${filePath}" not found in server.`, ephemeral: true });
    }

    try {
      const isDir = fs.statSync(target).isDirectory();
      if (isDir) {
        fs.rmSync(target, { recursive: true, force: true });
      } else {
        fs.unlinkSync(target);
      }
      await interaction.reply({ content: `🗑️ Successfully deleted ${isDir ? 'directory' : 'file'} \`${filePath}\` from **${app.name}**.` });
    } catch (err) {
      await interaction.reply({ content: `⚠️ Deletion failed: ${err.message}`, ephemeral: true });
    }
  }

  // 7E. /startup command (View/Update startup command & entrypoint)
  async cmdStartup(interaction) {
    const query = interaction.options.getString('identifier').trim();
    const entrypoint = interaction.options.getString('entrypoint');
    const command = interaction.options.getString('command');
    const args = interaction.options.getString('args');

    const app = db.prepare('SELECT * FROM apps WHERE id = ? OR LOWER(name) = LOWER(?)').get(query, query);
    if (!app) return interaction.reply({ content: `❌ Server matching "${query}" was not found.`, ephemeral: true });

    let updated = false;
    if (entrypoint !== null && entrypoint !== undefined) {
      app.entrypoint = entrypoint.trim();
      app.main_file = entrypoint.trim();
      updated = true;
    }
    if (command !== null && command !== undefined) {
      app.startup_cmd = command.trim();
      updated = true;
    }
    if (args !== null && args !== undefined) {
      app.node_args = args.trim();
      updated = true;
    }

    if (updated) {
      db.prepare('UPDATE apps SET entrypoint = ?, main_file = ?, startup_cmd = ?, node_args = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(app.entrypoint, app.main_file, app.startup_cmd, app.node_args, app.id);
    }

    const embed = this.buildStartupEmbed(app);
    if (updated) {
      embed.setDescription('✅ **Startup variables updated successfully!**\nChanges will take effect on next restart.');
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_editstartup_${app.id}`)
        .setLabel('Edit Startup via Modal')
        .setEmoji('✏️')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  }

  // 7F. /settings command (View/Update resources & domain)
  async cmdSettings(interaction) {
    const query = interaction.options.getString('identifier').trim();
    const name = interaction.options.getString('name');
    const ram = interaction.options.getInteger('ram');
    const cpu = interaction.options.getInteger('cpu');
    const disk = interaction.options.getInteger('disk');
    const domain = interaction.options.getString('domain');

    const app = db.prepare('SELECT * FROM apps WHERE id = ? OR LOWER(name) = LOWER(?)').get(query, query);
    if (!app) return interaction.reply({ content: `❌ Server matching "${query}" was not found.`, ephemeral: true });

    let updated = false;
    if (name) {
      app.name = name.trim();
      updated = true;
    }
    if (ram) {
      app.memory_limit = ram;
      updated = true;
    }
    if (cpu) {
      app.cpu_limit = cpu;
      updated = true;
    }
    if (disk) {
      app.disk_limit = disk;
      updated = true;
    }
    if (domain !== null && domain !== undefined) {
      app.domain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      updated = true;
    }

    if (updated) {
      db.prepare('UPDATE apps SET name = ?, memory_limit = ?, cpu_limit = ?, disk_limit = ?, domain = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(app.name, app.memory_limit, app.cpu_limit, app.disk_limit, app.domain, app.id);
    }

    const embed = this.buildSettingsEmbed(app);
    if (updated) {
      embed.setDescription('✅ **Server hardware limits & domain updated successfully!**');
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_editsettings_${app.id}`)
        .setLabel('Edit Settings via Modal')
        .setEmoji('✏️')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  }

  // Handle Discord Modal Submissions
  async handleModal(interaction) {
    if (!this.isAuthorized(interaction.user.id, interaction.member, interaction.guild)) {
      return interaction.reply({ content: '❌ Access Denied: Administrator permissions required.', ephemeral: true });
    }

    const customId = interaction.customId;

    if (customId.startsWith('modal_livecmd_')) {
      const sessionId = customId.replace('modal_livecmd_', '');
      const session = this.liveConsoleSessions.get(sessionId);
      if (!session) {
        return interaction.reply({ content: '⚠️ Live Console session expired.', ephemeral: true });
      }
      const command = interaction.fields.getTextInputValue('livecmd_input').trim();
      const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(session.appId);
      if (!app) return interaction.reply({ content: '❌ Server not found.', ephemeral: true });

      try {
        await supervisor.sendCommand(session.appId, command);
        session.lastSnippet = '';
        await interaction.reply({
          content: `⚡ **Sent to console stdin:** \`${command}\``,
          ephemeral: true
        });
      } catch (err) {
        await interaction.reply({
          content: `⚠️ Failed to send command: ${err.message}`,
          ephemeral: true
        });
      }
    } else if (customId.startsWith('modal_cmd_')) {
      const appId = customId.replace('modal_cmd_', '');
      const command = interaction.fields.getTextInputValue('cmd_input').trim();
      const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(appId);
      if (!app) return interaction.reply({ content: '❌ Server not found.', ephemeral: true });

      await interaction.deferReply();
      try {
        await supervisor.sendCommand(appId, command);
        await new Promise(r => setTimeout(r, 600));

        const logs = logStreamer.getLogs(appId, 15);
        const snippet = logs.map(l => l.data).join('').trim().slice(-1400) || 'Command sent to process stdin.';

        const embed = new EmbedBuilder()
          .setTitle(`💻 Console Output · ${app.name}`)
          .setColor(0x06B6D4)
          .setDescription(`**Executed:** \`${command}\`\n\`\`\`ansi\n${snippet}\n\`\`\``)
          .setFooter({ text: `Server: ${app.name} (${app.id})` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        await interaction.editReply({ content: `⚠️ Command failed: ${err.message}` });
      }
    } else if (customId.startsWith('modal_startup_')) {
      const appId = customId.replace('modal_startup_', '');
      const entrypoint = interaction.fields.getTextInputValue('startup_entry').trim();
      const startup_cmd = interaction.fields.getTextInputValue('startup_cmd').trim();
      const node_args = interaction.fields.getTextInputValue('startup_args').trim();

      const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(appId);
      if (!app) return interaction.reply({ content: '❌ Server not found.', ephemeral: true });

      db.prepare('UPDATE apps SET entrypoint = ?, main_file = ?, startup_cmd = ?, node_args = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(entrypoint, entrypoint, startup_cmd, node_args, appId);

      await interaction.reply({
        content: `✅ **Startup configuration updated for \`${app.name}\`!**\n• Entrypoint: \`${entrypoint}\`\n• Startup Command: \`${startup_cmd || 'Auto'}\`\n• Args: \`${node_args || 'None'}\`\n_Changes will take effect on next server restart._`,
        ephemeral: true
      });
    } else if (customId.startsWith('modal_settings_')) {
      const appId = customId.replace('modal_settings_', '');
      const name = interaction.fields.getTextInputValue('set_name').trim();
      const ram = parseInt(interaction.fields.getTextInputValue('set_ram').trim() || '1024', 10);
      const cpu = parseInt(interaction.fields.getTextInputValue('set_cpu').trim() || '100', 10);
      const disk = parseInt(interaction.fields.getTextInputValue('set_disk').trim() || '5120', 10);
      const domain = interaction.fields.getTextInputValue('set_domain').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

      const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(appId);
      if (!app) return interaction.reply({ content: '❌ Server not found.', ephemeral: true });

      db.prepare('UPDATE apps SET name = ?, memory_limit = ?, cpu_limit = ?, disk_limit = ?, domain = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(name || app.name, ram, cpu, disk, domain, appId);

      await interaction.reply({
        content: `✅ **Hardware & Domain settings updated for \`${name || app.name}\`!**\n• RAM: \`${ram} MB\`\n• CPU: \`${cpu}%\`\n• Disk: \`${disk} MB\`\n• Domain: \`${domain || 'Auto'}\``,
        ephemeral: true
      });
    }
  }

  // 8. /serverinfo command (Deep inspection)
  async cmdServerInfo(interaction) {
    const query = interaction.options.getString('identifier').trim();
    const app = db.prepare('SELECT a.*, u.username as owner_username, u.email as owner_email FROM apps a LEFT JOIN users u ON a.user_id = u.id WHERE a.id = ? OR LOWER(a.name) = LOWER(?)').get(query, query);

    if (!app) {
      return interaction.reply({ content: `❌ Server matching "${query}" was not found.`, ephemeral: true });
    }

    const appDir = path.join(config.appsDir, app.id);
    const stats = getDirectoryStats(appDir);
    const embed = this.buildServerInfoEmbed(app, stats);

    await interaction.reply({ embeds: [embed] });
  }

  // 9. /createuser command
  async cmdCreateUser(interaction) {
    const username = interaction.options.getString('username').trim().toLowerCase();
    const email = interaction.options.getString('email').trim().toLowerCase();
    const password = interaction.options.getString('password');
    const role = interaction.options.getString('role') || 'user';

    await interaction.deferReply({ ephemeral: true });

    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) {
      return interaction.editReply({ content: `❌ A user with username "${username}" or email "${email}" already exists.` });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    const res = db.prepare(`
      INSERT INTO users (username, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `).run(username, email, hash, role);

    const embed = new EmbedBuilder()
      .setTitle('👤 User Account Created')
      .setColor(0x10B981)
      .setDescription(`User **@${username}** has been registered successfully!`)
      .addFields(
        { name: 'User ID', value: `#${res.lastInsertRowid}`, inline: true },
        { name: 'Username', value: `\`${username}\``, inline: true },
        { name: 'Role', value: role === 'admin' ? '👑 Administrator' : '👤 Standard User', inline: true },
        { name: 'Email', value: `\`${email}\``, inline: false },
        { name: 'Login Panel URL', value: `http://${config.vpsPublicIp || '20.219.198.128'}:8090/login`, inline: false }
      )
      .setFooter({ text: 'Eclipse Panel Authentication Engine' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }

  // 10. /users command
  async cmdListUsers(interaction) {
    const users = db.prepare(`
      SELECT u.id, u.username, u.email, u.role, u.created_at,
             (SELECT COUNT(*) FROM apps a WHERE a.user_id = u.id) as server_count
      FROM users u
      ORDER BY u.role DESC, u.created_at ASC
    `).all();

    const lines = users.map(u => {
      const roleBadge = u.role === 'admin' ? '👑 Admin' : '👤 User';
      return `**@${u.username}** (${u.email}) — ${roleBadge} | **${u.server_count}** servers`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`👥 Eclipse Panel Operators (${users.length})`)
      .setColor(0x06B6D4)
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: 'Use /createuser to register new accounts' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // 11. /panel command
  async cmdPanelStats(interaction) {
    const stats = getSystemStats();
    const totalApps = db.prepare('SELECT COUNT(*) as count FROM apps').get().count;
    const runningApps = db.prepare("SELECT COUNT(*) as count FROM apps WHERE status = 'running' OR status = 'online'").get().count;
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

    const hostIp = config.vpsPublicIp || '20.219.198.128';

    const embed = new EmbedBuilder()
      .setTitle('🌑 Eclipse Panel · Cloud VPS Telemetry')
      .setColor(0x06B6D4)
      .setDescription(`**Host Address:** \`http://${hostIp}:8090\`\n**Platform:** ${stats.os ? stats.os.platform : 'Linux'} (${stats.os ? stats.os.distro : 'Ubuntu'})`)
      .addFields(
        { name: 'CPU Load', value: `\`${stats.cpu ? stats.cpu.usage_percent : 0}%\``, inline: true },
        { name: 'RAM Usage', value: `\`${stats.memory ? stats.memory.used_mb : 0} / ${stats.memory ? stats.memory.total_mb : 0} MB\``, inline: true },
        { name: 'Disk Free', value: `\`${stats.disk ? stats.disk.free_gb : 0} GB\``, inline: true },
        { name: 'Active Containers', value: `\`${runningApps} online / ${totalApps} total\``, inline: true },
        { name: 'Registered Users', value: `\`${totalUsers}\``, inline: true },
        { name: 'Uptime', value: `\`${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m\``, inline: true }
      )
      .setFooter({ text: 'Eclipse Panel · Cloud Container Infrastructure · Made by Vexezor' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // 12. /help command
  async cmdHelp(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🌑 Eclipse Panel Discord Bot · Command Manual')
      .setColor(0x5865F2)
      .setDescription('Complete reference for all interactive Discord commands and power tools:')
      .addFields(
        {
          name: '🚀 Server Lifecycle Management',
          value: '• `/servers` — List all servers with status, port, subdomain, and RAM\n• `/server <identifier>` — Control card with interactive power buttons\n• `/createserver <name> <type> [ram] [cpu] [port] [owner]` — Deploy server container\n• `/deleteserver <identifier>` — Permanently delete server and release port'
        },
        {
          name: '⚡ Power & Console Controls',
          value: '• `/liveconsole <identifier>` (or `/console`) — Interactive real-time live terminal console with streaming stdio\n• `/startserver <identifier>` — Power on server\n• `/stopserver <identifier>` — Gracefully stop server\n• `/restartserver <identifier>` — Restart server process\n• `/cmd <identifier> <command>` — Send terminal command to server console (or click `💬 Send Cmd`)\n• `/logs <identifier> [lines]` — View live stdout/stderr console logs'
        },
        {
          name: '📁 Files & Server Storage',
          value: '• `/files <identifier> [path]` — Interactive directory file browser\n• `/viewfile <identifier> <path>` — View file contents with syntax highlighting\n• `/deletefile <identifier> <path>` — Delete file or directory\n• Or click `📁 Files` button directly on any `/server` card'
        },
        {
          name: '🚀 Startup & Settings',
          value: '• `/startup <identifier> [entrypoint] [command] [args]` — View or update entrypoint & startup command\n• `/settings <identifier> [name] [ram] [cpu] [disk] [domain]` — Update RAM, CPU, Disk quota & domain\n• Or click `🚀 Startup` or `⚙️ Settings` on `/server` to edit via modal popup!'
        },
        {
          name: '📊 Inspection & Monitoring',
          value: '• `/serverinfo <identifier>` — View disk usage, files count, port, subdomain, and owner\n• `/panel` — View live VPS CPU load, RAM usage, disk, and telemetry'
        },
        {
          name: '👥 User & Account Administration',
          value: '• `/createuser <username> <email> <password> [role]` — Register new panel user\n• `/users` — List all registered users, roles, and server counts'
        }
      )
      .setFooter({ text: 'Eclipse Panel · Made by Vexezor' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // Delete server internal helper
  async deleteServerInternal(appId) {
    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(appId);
    if (!app) return;

    await supervisor.killApp(appId);
    const appDir = path.join(config.appsDir, appId);
    if (fs.existsSync(appDir)) {
      try {
        fs.rmSync(appDir, { recursive: true, force: true });
      } catch (e) {}
    }
    db.prepare('DELETE FROM apps WHERE id = ?').run(appId);
  }

  // Handle Interactive Button Clicks (Start, Stop, Restart, Kill, Refresh, Logs, Info, Delete)
  async handleButton(interaction) {
    const customId = interaction.customId; // e.g. btn_start_app_1234
    const parts = customId.split('_');
    const action = parts[1]; // start, stop, restart, kill, refresh, logs, info, del, confirmdel, cancel
    const appId = parts.slice(2).join('_'); // app_1234

    // Strict Admin Authorization Check: Buttons exclusively operable by Discord Server Administrators
    if (!this.isAuthorized(interaction.user.id, interaction.member, interaction.guild)) {
      return interaction.reply({
        content: '❌ **Access Denied**: This Eclipse Panel bot can only be accessed and managed by server administrators.',
        ephemeral: true
      });
    }

    // Live Console Controls
    if (action === 'livecmd') {
      const sessionId = parts[2];
      const session = this.liveConsoleSessions.get(sessionId);
      const targetApp = session ? db.prepare('SELECT * FROM apps WHERE id = ?').get(session.appId) : null;
      if (!session || !targetApp) {
        return interaction.reply({ content: '⚠️ Live console session expired. Run `/liveconsole` to start a new one.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId(`modal_livecmd_${sessionId}`)
        .setTitle(`Terminal Input · ${targetApp.name.slice(0, 20)}`);

      const cmdInput = new TextInputBuilder()
        .setCustomId('livecmd_input')
        .setLabel('Command to send to stdin')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. status, help, npm test, say Hello')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(cmdInput));
      return interaction.showModal(modal);
    }

    if (action === 'livepause') {
      const sessionId = parts[2];
      const session = this.liveConsoleSessions.get(sessionId);
      if (!session) return interaction.reply({ content: '⚠️ Session expired.', ephemeral: true });

      session.isPaused = !session.isPaused;
      const targetApp = db.prepare('SELECT * FROM apps WHERE id = ?').get(session.appId);
      const isRunning = targetApp && (targetApp.status === 'running' || targetApp.status === 'online');

      const embed = this.buildLiveConsoleEmbed(targetApp, sessionId, session.isPaused, false, session.lastSnippet);
      const rows = this.buildLiveConsoleButtons(session.appId, sessionId, session.isPaused, isRunning);

      return interaction.update({ embeds: [embed], components: rows });
    }

    if (action === 'liverefresh') {
      const sessionId = parts[2];
      const session = this.liveConsoleSessions.get(sessionId);
      if (!session) return interaction.reply({ content: '⚠️ Session expired.', ephemeral: true });

      const targetApp = db.prepare('SELECT * FROM apps WHERE id = ?').get(session.appId);
      const isRunning = targetApp && (targetApp.status === 'running' || targetApp.status === 'online');
      const logs = logStreamer.getLogs(session.appId, 25);
      const snippet = logs.map(l => l.data || l.message || '').join('').trim().slice(-1600);
      session.lastSnippet = snippet;

      const embed = this.buildLiveConsoleEmbed(targetApp, sessionId, session.isPaused, false, snippet);
      const rows = this.buildLiveConsoleButtons(session.appId, sessionId, session.isPaused, isRunning);

      return interaction.update({ embeds: [embed], components: rows });
    }

    if (action === 'liveclear') {
      const sessionId = parts[2];
      const session = this.liveConsoleSessions.get(sessionId);
      if (!session) return interaction.reply({ content: '⚠️ Session expired.', ephemeral: true });

      session.cleared = true;
      session.lastSnippet = '';
      const targetApp = db.prepare('SELECT * FROM apps WHERE id = ?').get(session.appId);
      const isRunning = targetApp && (targetApp.status === 'running' || targetApp.status === 'online');

      const embed = this.buildLiveConsoleEmbed(targetApp, sessionId, session.isPaused, false, '[Console display cleared by operator]');
      const rows = this.buildLiveConsoleButtons(session.appId, sessionId, session.isPaused, isRunning);

      return interaction.update({ embeds: [embed], components: rows });
    }

    if (action === 'livestop') {
      const sessionId = parts[2];
      const session = this.liveConsoleSessions.get(sessionId);
      if (session) {
        clearInterval(session.timer);
        this.liveConsoleSessions.delete(sessionId);
        const targetApp = db.prepare('SELECT * FROM apps WHERE id = ?').get(session.appId);
        const embed = this.buildLiveConsoleEmbed(targetApp, sessionId, false, true, session.lastSnippet);
        return interaction.update({ embeds: [embed], components: [] });
      }
      return interaction.update({ content: '⏹️ Live Console session ended.', components: [] });
    }

    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(appId);

    // Open Live Console from Server Card button
    if (action === 'openliveconsole') {
      return this.cmdLiveConsole(interaction, appId);
    }

    // Cancel deletion
    if (action === 'cancel') {
      return interaction.update({ content: '✅ Action cancelled.', components: [] });
    }

    // Confirm deletion
    if (action === 'confirmdel') {
      await this.deleteServerInternal(appId);
      return interaction.update({ content: `🗑️ **Server \`${app ? app.name : appId}\` has been permanently deleted.**`, components: [] });
    }

    if (!app) {
      return interaction.reply({ content: `❌ Server \`${appId}\` not found in panel database.`, ephemeral: true });
    }

    // Open Console Command Modal
    if (action === 'cmdmodal') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_cmd_${appId}`)
        .setTitle(`Console Cmd · ${app.name.slice(0, 25)}`);

      const cmdInput = new TextInputBuilder()
        .setCustomId('cmd_input')
        .setLabel('Command to send to stdin')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. say Hello, help, npm test, status')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(cmdInput));
      return interaction.showModal(modal);
    }

    // Quick files browser button
    if (action === 'files') {
      try {
        const fileData = listContainerFiles(appId, '');
        const embed = this.buildFilesEmbed(app, fileData);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      } catch (err) {
        return interaction.reply({ content: `⚠️ Failed to read server files: ${err.message}`, ephemeral: true });
      }
    }

    // Quick startup button
    if (action === 'startup') {
      const embed = this.buildStartupEmbed(app);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`btn_editstartup_${appId}`)
          .setLabel('Edit Startup via Modal')
          .setEmoji('✏️')
          .setStyle(ButtonStyle.Primary)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // Quick settings button
    if (action === 'settings') {
      const embed = this.buildSettingsEmbed(app);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`btn_editsettings_${appId}`)
          .setLabel('Edit Settings via Modal')
          .setEmoji('✏️')
          .setStyle(ButtonStyle.Primary)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // Modal to edit startup
    if (action === 'editstartup') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_startup_${appId}`)
        .setTitle(`Edit Startup · ${app.name.slice(0, 25)}`);

      const entryInput = new TextInputBuilder()
        .setCustomId('startup_entry')
        .setLabel('Main Entrypoint File')
        .setStyle(TextInputStyle.Short)
        .setValue(app.entrypoint || (app.type === 'python' ? 'main.py' : 'index.js'))
        .setRequired(true);

      const cmdInput = new TextInputBuilder()
        .setCustomId('startup_cmd')
        .setLabel('Custom Startup Command (Optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. npm start, python3 main.py')
        .setValue(app.startup_cmd || '')
        .setRequired(false);

      const argsInput = new TextInputBuilder()
        .setCustomId('startup_args')
        .setLabel('Process Arguments (Optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. --experimental-strip-types, -u')
        .setValue(app.node_args || '')
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(entryInput),
        new ActionRowBuilder().addComponents(cmdInput),
        new ActionRowBuilder().addComponents(argsInput)
      );
      return interaction.showModal(modal);
    }

    // Modal to edit settings
    if (action === 'editsettings') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_settings_${appId}`)
        .setTitle(`Edit Settings · ${app.name.slice(0, 25)}`);

      const nameInput = new TextInputBuilder()
        .setCustomId('set_name')
        .setLabel('Server Name')
        .setStyle(TextInputStyle.Short)
        .setValue(app.name || '')
        .setRequired(true);

      const ramInput = new TextInputBuilder()
        .setCustomId('set_ram')
        .setLabel('Memory Limit (MB)')
        .setStyle(TextInputStyle.Short)
        .setValue(String(app.memory_limit || 1024))
        .setRequired(true);

      const cpuInput = new TextInputBuilder()
        .setCustomId('set_cpu')
        .setLabel('CPU Limit (%)')
        .setStyle(TextInputStyle.Short)
        .setValue(String(app.cpu_limit || 100))
        .setRequired(true);

      const diskInput = new TextInputBuilder()
        .setCustomId('set_disk')
        .setLabel('Disk Limit (MB)')
        .setStyle(TextInputStyle.Short)
        .setValue(String(app.disk_limit || 5120))
        .setRequired(true);

      const domainInput = new TextInputBuilder()
        .setCustomId('set_domain')
        .setLabel('Custom Domain (Optional)')
        .setStyle(TextInputStyle.Short)
        .setValue(app.domain || '')
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(ramInput),
        new ActionRowBuilder().addComponents(cpuInput),
        new ActionRowBuilder().addComponents(diskInput),
        new ActionRowBuilder().addComponents(domainInput)
      );
      return interaction.showModal(modal);
    }

    // Quick logs button
    if (action === 'logs') {
      const logs = logStreamer.getLogs(appId, 25);
      const snippet = logs.map(l => l.data).join('').trim().slice(-1850) || 'No logs recorded yet.';
      return interaction.reply({
        content: `📜 **Live Console Logs · ${app.name} (${appId}):**\n\`\`\`ansi\n${snippet}\n\`\`\``,
        ephemeral: true
      });
    }

    // Quick info button
    if (action === 'info') {
      const stats = getDirectoryStats(path.join(config.appsDir, appId));
      const embed = this.buildServerInfoEmbed(app, stats);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Delete prompt button
    if (action === 'del') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`btn_confirmdel_${appId}`).setLabel('Confirm Permanent Deletion').setStyle(ButtonStyle.Danger).setEmoji('⚠️'),
        new ButtonBuilder().setCustomId(`btn_cancel_${appId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      );
      return interaction.reply({
        content: `⚠️ **Confirm Permanent Deletion**\nAre you sure you want to permanently delete **${app.name}** (\`${appId}\`)? All server files, databases, and assigned ports will be released immediately.`,
        components: [row],
        ephemeral: true
      });
    }

    await interaction.deferUpdate();

    try {
      if (action === 'start') {
        await supervisor.startApp(appId);
      } else if (action === 'stop') {
        await supervisor.stopApp(appId);
      } else if (action === 'restart') {
        await supervisor.restartApp(appId);
      } else if (action === 'kill') {
        await supervisor.killApp(appId);
      }

      await new Promise(r => setTimeout(r, 700));

      const updatedApp = db.prepare('SELECT * FROM apps WHERE id = ?').get(appId);
      const embed = this.buildServerEmbed(updatedApp);
      const buttonRows = this.buildServerButtons(appId, updatedApp.status);

      await interaction.editReply({ embeds: [embed], components: buttonRows });
    } catch (err) {
      await interaction.followUp({ content: `⚠️ Failed to execute ${action}: ${err.message}`, ephemeral: true });
    }
  }

  // Helper: Build Rich Server Embed
  buildServerEmbed(app) {
    const isRunning = app.status === 'running' || app.status === 'online';
    const isStarting = app.status === 'starting';
    const isCrashed = app.status === 'crashed' || app.status === 'error';

    let statusEmoji = '⏹️ Offline';
    let color = 0x64748B;
    if (isRunning) {
      statusEmoji = '🟢 Running';
      color = 0x10B981;
    } else if (isStarting) {
      statusEmoji = '🔄 Starting...';
      color = 0xF59E0B;
    } else if (isCrashed) {
      statusEmoji = '⚠️ Crashed / Error';
      color = 0xEF4444;
    }

    const baseDomain = this.getBaseDomain();
    const hostIp = (app.primary_ip && app.primary_ip !== '0.0.0.0') ? app.primary_ip : (config.vpsPublicIp || '20.219.198.128');
    let serverAddress = `${hostIp}:${app.port}`;
    if (app.domain && app.domain.trim().length > 0) {
      serverAddress = `${app.domain}:${app.port}`;
    } else if (baseDomain) {
      const slug = app.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || app.id;
      const sub = `${slug}.${baseDomain}`;
      serverAddress = `${sub}:${app.port}`;
      try {
        db.prepare('UPDATE apps SET domain = ? WHERE id = ?').run(sub, app.id);
      } catch (e) {}
    }
    const runtimeLabel = app.type === 'python' ? '🐍 Python 3' : '⚡ Node.js';

    const owner = db.prepare('SELECT username, email FROM users WHERE id = ?').get(app.user_id);
    const ownerText = owner ? `@${owner.username} (${owner.email})` : `User #${app.user_id}`;

    const embed = new EmbedBuilder()
      .setTitle(`🌑 ${app.name} (${app.id})`)
      .setColor(color)
      .setDescription(`**Dedicated Host:** \`${serverAddress}\`\n**Status:** ${statusEmoji}`)
      .addFields(
        { name: 'Runtime', value: runtimeLabel, inline: true },
        { name: 'Port', value: `\`${app.port || 'Auto'}\``, inline: true },
        { name: 'Owner', value: `\`${ownerText}\``, inline: true },
        { name: 'RAM Limit', value: `\`${app.memory_limit || 1024} MB\``, inline: true },
        { name: 'CPU Quota', value: `\`${app.cpu_limit || 100}%\``, inline: true },
        { name: 'Entrypoint', value: `\`${app.entrypoint || (app.type === 'python' ? 'main.py' : 'index.js')}\``, inline: true },
        { name: 'Auto-Restart', value: app.auto_restart ? '✅ Enabled' : '❌ Disabled', inline: true }
      )
      .setFooter({ text: 'Eclipse Panel · Cloud Container Infrastructure' })
      .setTimestamp();

    return embed;
  }

  // Helper: Build Detailed Technical Server Info Embed
  buildServerInfoEmbed(app, stats) {
    const isRunning = app.status === 'running' || app.status === 'online';
    const baseDomain = this.getBaseDomain();
    const hostIp = config.vpsPublicIp || '20.219.198.128';
    const serverAddress = app.domain ? `${app.domain}:${app.port}` : `${hostIp}:${app.port}`;
    const owner = db.prepare('SELECT username, email FROM users WHERE id = ?').get(app.user_id);

    return new EmbedBuilder()
      .setTitle(`ℹ️ Detailed Specifications · ${app.name}`)
      .setColor(0x06B6D4)
      .setDescription(`**Instance ID:** \`${app.id}\`\n**Dedicated Address:** \`${serverAddress}\``)
      .addFields(
        { name: 'Runtime Engine', value: `${app.type === 'python' ? '🐍 Python 3' : '⚡ Node.js'} (v${app.runtime_version || 'Default'})`, inline: true },
        { name: 'Status', value: isRunning ? '🟢 Running' : '⏹️ Stopped', inline: true },
        { name: 'TCP Port', value: `\`${app.port || 3000}\``, inline: true },
        { name: 'Owner Account', value: owner ? `@${owner.username} (${owner.email})` : `User #${app.user_id}`, inline: true },
        { name: 'Memory Limit', value: `\`${app.memory_limit} MB\``, inline: true },
        { name: 'CPU Limit', value: `\`${app.cpu_limit}%\``, inline: true },
        { name: 'Disk Limit', value: `\`${app.disk_limit} MB\``, inline: true },
        { name: 'Actual Disk Used', value: `\`${stats.sizeMb} MB\` (${stats.fileCount} files)`, inline: true },
        { name: 'Entrypoint File', value: `\`${app.entrypoint || 'index.js'}\``, inline: true },
        { name: 'Auto-Restart on Crash', value: app.auto_restart ? '✅ Yes' : '❌ No', inline: true },
        { name: 'Created At', value: `\`${app.created_at || 'N/A'}\``, inline: true },
        { name: 'Custom Subdomain', value: `\`${app.domain || 'Auto Wildcard'}\``, inline: true }
      )
      .setFooter({ text: 'Eclipse Panel · Container Telemetry' })
      .setTimestamp();
  }

  // Helper: Build Files Browser Embed
  buildFilesEmbed(app, fileData) {
    const { items, subPath } = fileData;
    let fileListStr = '';
    if (items.length === 0) {
      fileListStr = '_Directory is empty._';
    } else {
      fileListStr = items.slice(0, 25).map(item => {
        const type = item.isDir ? '📁' : item.icon;
        return `${type} \`${item.name}\` — *${item.sizeStr}*`;
      }).join('\n');
      if (items.length > 25) {
        fileListStr += `\n*...and ${items.length - 25} more items*`;
      }
    }

    return new EmbedBuilder()
      .setTitle(`📁 File Manager · ${app.name}`)
      .setColor(0x06B6D4)
      .setDescription(`**Current Directory:** \`${subPath}\`\n\n${fileListStr}`)
      .addFields(
        {
          name: '💡 File Commands',
          value: `• Browse folder: \`/files ${app.id} <subfolder>\`\n• View file: \`/viewfile ${app.id} <path>\`\n• Delete file: \`/deletefile ${app.id} <path>\``,
          inline: false
        }
      )
      .setFooter({ text: `Server: ${app.name} (${app.id}) · Eclipse Panel` })
      .setTimestamp();
  }

  // Helper: Build Startup Embed
  buildStartupEmbed(app) {
    return new EmbedBuilder()
      .setTitle(`🚀 Startup Configuration · ${app.name}`)
      .setColor(0x8B5CF6)
      .setDescription(`Inspect and modify startup parameters for container \`${app.id}\`.`)
      .addFields(
        { name: 'Runtime', value: app.type === 'python' ? '🐍 Python 3' : '⚡ Node.js', inline: true },
        { name: 'Main Entrypoint', value: `\`${app.entrypoint || (app.type === 'python' ? 'main.py' : 'index.js')}\``, inline: true },
        { name: 'Process Arguments', value: `\`${app.node_args || 'None'}\``, inline: true },
        { name: 'Custom Startup Command', value: `\`${app.startup_cmd || 'Auto (Default runtime runner)'}\``, inline: false },
        { name: 'Auto Restart on Crash', value: app.auto_restart ? '✅ Enabled' : '❌ Disabled', inline: true }
      )
      .setFooter({ text: 'Eclipse Panel · Container Startup Engine · Made by Vexezor' })
      .setTimestamp();
  }

  // Helper: Build Settings Embed
  buildSettingsEmbed(app) {
    return new EmbedBuilder()
      .setTitle(`⚙️ Server Settings & Resource Quotas · ${app.name}`)
      .setColor(0xF59E0B)
      .setDescription(`Hardware limits and network routing configuration for container \`${app.id}\`.`)
      .addFields(
        { name: 'Server Name', value: `\`${app.name}\``, inline: true },
        { name: 'Server ID', value: `\`${app.id}\``, inline: true },
        { name: 'Assigned Port', value: `\`${app.port || 'Auto'}\``, inline: true },
        { name: 'RAM Limit', value: `\`${app.memory_limit || 1024} MB\``, inline: true },
        { name: 'CPU Quota', value: `\`${app.cpu_limit || 100}%\``, inline: true },
        { name: 'Disk Storage Quota', value: `\`${app.disk_limit || 5120} MB\``, inline: true },
        { name: 'Custom Domain / Host', value: `\`${app.domain || 'Auto Wildcard'}\``, inline: false }
      )
      .setFooter({ text: 'Eclipse Panel · Resource Governor · Made by Vexezor' })
      .setTimestamp();
  }

  // Helper: Build Interactive Action Buttons (Three Rows: Power, Controls, Maintenance)
  buildServerButtons(appId, currentStatus) {
    const isRunning = currentStatus === 'running' || currentStatus === 'online';

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_start_${appId}`)
        .setLabel('Start')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Success)
        .setDisabled(isRunning),

      new ButtonBuilder()
        .setCustomId(`btn_stop_${appId}`)
        .setLabel('Stop')
        .setEmoji('⏹️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!isRunning),

      new ButtonBuilder()
        .setCustomId(`btn_restart_${appId}`)
        .setLabel('Restart')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`btn_kill_${appId}`)
        .setLabel('Force Kill')
        .setEmoji('⚡')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isRunning),

      new ButtonBuilder()
        .setCustomId(`btn_refresh_${appId}`)
        .setLabel('Refresh')
        .setEmoji('📊')
        .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_openliveconsole_${appId}`)
        .setLabel('Live Console')
        .setEmoji('🔴')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`btn_cmdmodal_${appId}`)
        .setLabel('Send Cmd')
        .setEmoji('💬')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!isRunning),

      new ButtonBuilder()
        .setCustomId(`btn_files_${appId}`)
        .setLabel('Files')
        .setEmoji('📁')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`btn_startup_${appId}`)
        .setLabel('Startup')
        .setEmoji('🚀')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`btn_settings_${appId}`)
        .setLabel('Settings')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Secondary)
    );

    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_logs_${appId}`)
        .setLabel('Logs')
        .setEmoji('📜')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`btn_info_${appId}`)
        .setLabel('Specs')
        .setEmoji('ℹ️')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`btn_del_${appId}`)
        .setLabel('Delete')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
    );

    return [row1, row2, row3];
  }

  // Helper: Build Live Console Embed
  buildLiveConsoleEmbed(app, sessionId, isPaused = false, isStopped = false, customSnippet = null) {
    const isRunning = app && (app.status === 'running' || app.status === 'online');
    const hostIp = (app && app.primary_ip && app.primary_ip !== '0.0.0.0') ? app.primary_ip : (config.vpsPublicIp || '20.219.198.128');
    const address = app && app.domain ? `${app.domain}:${app.port}` : `${hostIp}:${app ? app.port : '3000'}`;

    let statusText = '🟢 STREAMING LIVE (2.5s)';
    let color = 0x06B6D4;
    if (isStopped) {
      statusText = '⏹️ SESSION ENDED';
      color = 0x64748B;
    } else if (isPaused) {
      statusText = '⏸️ STREAM PAUSED';
      color = 0xF59E0B;
    } else if (!isRunning) {
      statusText = '🔴 CONTAINER OFFLINE';
      color = 0xEF4444;
    }

    let logsText = customSnippet;
    if (logsText === null || logsText === undefined) {
      const logs = app ? logStreamer.getLogs(app.id, 25) : [];
      logsText = logs.map(l => l.data || l.message || '').join('').trim().slice(-1600);
    }
    if (!logsText) logsText = 'No logs recorded yet. Waiting for container stdio stream...';

    const embed = new EmbedBuilder()
      .setTitle(`🖥️ Live Terminal Console · ${app ? app.name : 'Server'}`)
      .setColor(color)
      .setDescription(
        `**Instance:** \`${app ? app.id : 'N/A'}\` &nbsp;|&nbsp; **Port:** \`${address}\`\n` +
        `**Status:** \`${statusText}\` &nbsp;|&nbsp; **Runtime:** \`${app ? (app.type === 'python' ? 'Python 3' : 'Node.js') : 'N/A'}\`\n\n` +
        `\`\`\`ansi\n${logsText}\n\`\`\``
      )
      .setFooter({ text: `Eclipse Panel Live Terminal · Session #${sessionId} · Made by Vexezor` })
      .setTimestamp();

    return embed;
  }

  // Helper: Build Live Console Action Buttons
  buildLiveConsoleButtons(appId, sessionId, isPaused, isRunning) {
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_livecmd_${sessionId}`)
        .setLabel('Send Cmd')
        .setEmoji('💬')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!isRunning),

      new ButtonBuilder()
        .setCustomId(`btn_livepause_${sessionId}`)
        .setLabel(isPaused ? 'Resume' : 'Pause')
        .setEmoji(isPaused ? '▶️' : '⏸️')
        .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`btn_liverefresh_${sessionId}`)
        .setLabel('Refresh')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`btn_liveclear_${sessionId}`)
        .setLabel('Clear')
        .setEmoji('🧹')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`btn_livestop_${sessionId}`)
        .setLabel('End')
        .setEmoji('⏹️')
        .setStyle(ButtonStyle.Danger)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_start_${appId}`)
        .setLabel('Start')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Success)
        .setDisabled(isRunning),

      new ButtonBuilder()
        .setCustomId(`btn_stop_${appId}`)
        .setLabel('Stop')
        .setEmoji('⏹️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!isRunning),

      new ButtonBuilder()
        .setCustomId(`btn_restart_${appId}`)
        .setLabel('Restart')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`btn_kill_${appId}`)
        .setLabel('Force Kill')
        .setEmoji('⚡')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isRunning)
    );

    return [row1, row2];
  }

  // Get status for API / Admin UI
  getStatus() {
    return {
      status: this.status,
      enabled: this.enabled,
      hasToken: Boolean(this.token),
      tokenPrefix: this.token ? `${this.token.substring(0, 8)}...` : '',
      guildId: this.guildId,
      adminUserIds: this.adminUserIds,
      botUser: this.botUser,
      lastError: this.lastError
    };
  }
}

export const discordBotService = new DiscordBotService();
