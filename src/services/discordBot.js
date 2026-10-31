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
import { getSystemStats } from '../daemon/metrics.js';
import { config } from '../config.js';

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

  // Check if a Discord user is authorized to perform actions
  isAuthorized(userId, member = null) {
    // If specific admin user IDs are configured, check them
    if (this.adminUserIds.length > 0) {
      if (this.adminUserIds.includes(userId)) return true;
    }
    // If user has Discord Administrator permission in the guild
    if (member && member.permissions) {
      if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
      if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
    }
    // If no admin user IDs are configured, allow guild admins
    if (this.adminUserIds.length === 0 && member && member.permissions) {
      return member.permissions.has(PermissionFlagsBits.Administrator);
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

    // Stop existing client if running
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

      // Handle Interactions (Slash commands & Buttons)
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
            await interaction.followUp({ content: `⚠️ Error executing interaction: ${err.message}`, ephemeral: true }).catch(() => {});
          } else {
            await interaction.reply({ content: `⚠️ Error executing interaction: ${err.message}`, ephemeral: true }).catch(() => {});
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

  // Register Slash Commands
  async registerSlashCommands() {
    if (!this.client || !this.client.user) return;

    const commands = [
      new SlashCommandBuilder()
        .setName('servers')
        .setDescription('List all hosted servers and their current status'),

      new SlashCommandBuilder()
        .setName('server')
        .setDescription('View and control a specific server with interactive buttons')
        .addStringOption(opt =>
          opt.setName('identifier')
            .setDescription('Server name or ID (e.g. app_9d50e0fc or MyServer)')
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName('createserver')
        .setDescription('Deploy a new server instance directly from Discord')
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
        )
        .addStringOption(opt =>
          opt.setName('owner')
            .setDescription('Recipient Gmail / email address or username on the panel')
            .setRequired(false)
        ),

      new SlashCommandBuilder()
        .setName('createuser')
        .setDescription('Create a new user account on Eclipse Panel')
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
        .setName('panel')
        .setDescription('View live VPS telemetry, CPU, RAM, and infrastructure health')
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

    // Check authorization for management commands
    if (['createserver', 'createuser'].includes(commandName)) {
      if (!this.isAuthorized(interaction.user.id, interaction.member)) {
        return interaction.reply({
          content: '❌ **Access Denied**: You do not have permission to execute administrative panel commands.',
          ephemeral: true
        });
      }
    }

    if (commandName === 'servers') {
      await this.cmdListServers(interaction);
    } else if (commandName === 'server') {
      await this.cmdGetServer(interaction);
    } else if (commandName === 'createserver') {
      await this.cmdCreateServer(interaction);
    } else if (commandName === 'createuser') {
      await this.cmdCreateUser(interaction);
    } else if (commandName === 'panel') {
      await this.cmdPanelStats(interaction);
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
    const buttons = this.buildServerButtons(app.id, app.status);

    await interaction.reply({ embeds: [embed], components: [buttons] });
  }

  // 3. /createserver command
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
      // Default to first admin if no owner provided
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

    if (!fs.existsSync(appDir)) {
      fs.mkdirSync(appDir, { recursive: true });
    }

    // Starter code
    if (type === 'python') {
      const pythonCode = `from http.server import HTTPServer, BaseHTTPRequestHandler\n\nclass Handler(BaseHTTPRequestHandler):\n    def do_GET(self):\n        self.send_response(200)\n        self.send_header('Content-type', 'text/html')\n        self.end_headers()\n        self.wfile.write(b"<h1>Eclipse Server Online</h1><p>Created via Discord Bot!</p>")\n\nif __name__ == '__main__':\n    server = HTTPServer(('0.0.0.0', ${port}), Handler)\n    print(f"Server online on port ${port}")\n    server.serve_forever()\n`;
      fs.writeFileSync(path.join(appDir, defaultEntry), pythonCode);
    } else {
      const nodeCode = `import http from 'http';\n\nconst server = http.createServer((req, res) => {\n  res.writeHead(200, { 'Content-Type': 'text/html' });\n  res.end('<h1>Eclipse Server Online</h1><p>Created via Discord Bot!</p>');\n});\n\nserver.listen(${port}, '0.0.0.0', () => {\n  console.log('Server online on port ${port}');\n});\n`;
      fs.writeFileSync(path.join(appDir, defaultEntry), nodeCode);
      fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: appId, version: '1.0.0', type: 'module', main: defaultEntry }, null, 2));
    }

    const baseDomain = this.getBaseDomain();
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || appId;
    const serverDomain = baseDomain ? `${slug}.${baseDomain}` : '';

    db.prepare(`
      INSERT INTO apps (id, name, type, user_id, entrypoint, port, memory_limit, cpu_limit, disk_limit, domain, status, node_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 5120, ?, 'stopped', 'node_local')
    `).run(appId, name, type, owner.id, defaultEntry, port, ram, cpu, serverDomain);

    const newApp = db.prepare('SELECT * FROM apps WHERE id = ?').get(appId);
    let desc = `✅ **Server Created Successfully!**\nAllocated to: **${owner.email}** (@${owner.username})\n\nUse the buttons below to power on your container:`;

    if (isNewUserCreated) {
      desc = `✅ **Server & Account Created Successfully!**\nNew account provisioned for **${owner.email}**.\n\n👤 **Username:** \`${owner.username}\`\n🔑 **Temporary Password:** \`${generatedPassword}\`\n🌐 **Panel Login:** \`http://${config.vpsPublicIp || '20.219.198.128'}:8090/login\`\n\nUse the buttons below to power on the server:`;
    }

    const embed = this.buildServerEmbed(newApp).setDescription(desc);
    const buttons = this.buildServerButtons(appId, 'stopped');

    await interaction.editReply({ embeds: [embed], components: [buttons] });
  }

  // 4. /createuser command
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

  // 5. /panel command
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

  // Handle Interactive Button Clicks (Start, Stop, Restart, Kill, Refresh)
  async handleButton(interaction) {
    const customId = interaction.customId; // e.g. btn_start_app_1234
    const parts = customId.split('_');
    const action = parts[1]; // start, stop, restart, kill, refresh
    const appId = parts.slice(2).join('_'); // app_1234

    // Check authorization
    if (!this.isAuthorized(interaction.user.id, interaction.member)) {
      return interaction.reply({
        content: '❌ **Access Denied**: You do not have permission to manage servers via this Discord Bot.',
        ephemeral: true
      });
    }

    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(appId);
    if (!app) {
      return interaction.reply({ content: `❌ Server \`${appId}\` not found in panel database.`, ephemeral: true });
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

      // Wait 700ms for supervisor process state to update
      await new Promise(r => setTimeout(r, 700));

      const updatedApp = db.prepare('SELECT * FROM apps WHERE id = ?').get(appId);
      const embed = this.buildServerEmbed(updatedApp);
      const buttons = this.buildServerButtons(appId, updatedApp.status);

      await interaction.editReply({ embeds: [embed], components: [buttons] });
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
    let color = 0x64748B; // Slate grey
    if (isRunning) {
      statusEmoji = '🟢 Running';
      color = 0x10B981; // Emerald green
    } else if (isStarting) {
      statusEmoji = '🔄 Starting...';
      color = 0xF59E0B; // Amber
    } else if (isCrashed) {
      statusEmoji = '⚠️ Crashed / Error';
      color = 0xEF4444; // Red
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

  // Helper: Build Interactive Action Buttons
  buildServerButtons(appId, currentStatus) {
    const isRunning = currentStatus === 'running' || currentStatus === 'online';

    const startBtn = new ButtonBuilder()
      .setCustomId(`btn_start_${appId}`)
      .setLabel('Start')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Success)
      .setDisabled(isRunning);

    const stopBtn = new ButtonBuilder()
      .setCustomId(`btn_stop_${appId}`)
      .setLabel('Stop')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!isRunning);

    const restartBtn = new ButtonBuilder()
      .setCustomId(`btn_restart_${appId}`)
      .setLabel('Restart')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary);

    const killBtn = new ButtonBuilder()
      .setCustomId(`btn_kill_${appId}`)
      .setLabel('Force Kill')
      .setEmoji('⚡')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!isRunning);

    const refreshBtn = new ButtonBuilder()
      .setCustomId(`btn_refresh_${appId}`)
      .setLabel('Refresh')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Secondary);

    return new ActionRowBuilder().addComponents(startBtn, stopBtn, restartBtn, killBtn, refreshBtn);
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
