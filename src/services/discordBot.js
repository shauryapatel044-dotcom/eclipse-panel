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
  PermissionFlagsBits
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
    } else if (commandName === 'logs') {
      await this.cmdLogs(interaction);
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
          value: '• `/servers` — List all servers with status, port, subdomain, and RAM\n• `/server <identifier>` — Control card with interactive power buttons\n• `/createserver <name> <type> [ram] [cpu] [port] [owner]` — Deploy server (empty container)\n• `/deleteserver <identifier>` — Permanently delete server and release port'
        },
        {
          name: '⚡ Power & Terminal Controls',
          value: '• `/startserver <identifier>` — Power on server\n• `/stopserver <identifier>` — Gracefully stop server\n• `/restartserver <identifier>` — Restart server process\n• `/cmd <identifier> <command>` — Send terminal command to server console\n• `/logs <identifier> [lines]` — View live stdout/stderr console logs'
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

    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(appId);

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

  // Helper: Build Interactive Action Buttons (Two Rows)
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
