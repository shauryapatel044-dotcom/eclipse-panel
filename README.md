# 🌑 Eclipse Panel - Cloud Container Infrastructure (Port 8090)
*Made by Vexezor*

A lightweight, high-performance hosting panel engine and process supervisor built specifically for running **Python** and **Node.js** applications on any Linux VPS or server. Features a modern dark obsidian & electric cyan themed UI, automated Let's Encrypt SSL, subdomain routing, MariaDB isolated database provisioning, real-time WebSocket log streaming, live per-core CPU/RAM/Disk metrics, and granular collaborator sub-users.

---

## ⚡ 1-Click Automated VPS Installer

Run this command as root on your Linux VPS (Ubuntu 20.04+, Debian 11+, CentOS, AlmaLinux, Rocky Linux):

```bash
git clone https://github.com/shauryapatel044-dotcom/eclipse-panel.git /opt/eclipse-panel
cd /opt/eclipse-panel
sudo bash install.sh
```

Or run directly from the folder on your VPS:
```bash
sudo bash install.sh
```

### What `install.sh` Does Automatically:
1. **Interactive Subdomain vs Public IP Choice**:
   - **Option 1 (Recommended)**: Set your subdomain (e.g. `panel.yourdomain.com`). The installer automatically installs `certbot`, verifies DNS, configures Nginx, and installs a free Let's Encrypt SSL certificate (`https://panel.yourdomain.com`).
   - **Option 2 (Direct IP)**: Instantly detects your VPS public IP and provisions access directly on port `80` and `8090` (`http://<VPS_IP>:8090`).
2. **Node.js 22 LTS & Python 3**: Installs Node.js 22 LTS (via NodeSource official repo), Python 3 with `pip` & `venv`, and build tools.
3. **MariaDB Database Provisioning**: Installs and starts MariaDB server, sets up root CLI access, creates the `eclipse_panel` database and `eclipse_user` with a secure random password for user apps.
4. **SuperAdmin Account Setup**: Prompts for administrator username and password (or auto-generates credentials) and initializes the database.
5. **Systemd & PM2 24/7 Daemons**: Creates `/etc/systemd/system/eclipse-panel.service` with auto-restart on boot, as well as a PM2 process supervisor.
6. **Nginx Reverse Proxy & WebSocket Pipeline**: Proxies port 80/443 to port 8090, including live bidirectional terminal WebSockets (`/ws`).
7. **Firewall Setup**: Automatically opens ports `80`, `443`, `8090`, `3306`, and application range `3000-4000` via UFW or Firewalld.

---

## 🌐 Subdomain vs. Public IP: Which is Better?

| Feature | Subdomain (`panel.yourdomain.com`) | VPS Public IP (`123.45.67.89:8090`) |
|---|---|---|
| **SSL / HTTPS Encryption** | 🟢 **Yes** (Free automated Let's Encrypt SSL) | 🔴 No (Browsers show "Not Secure" warning) |
| **Secure WebSockets (`wss://`)** | 🟢 **Yes** (Fully supported by all browsers) | ⚠️ Unencrypted `ws://` only |
| **Clean URLs** | 🟢 `https://panel.yourdomain.com` (no ports!) | ⚠️ `http://123.45.67.89:8090` |
| **DDoS / Cloudflare Proxy** | 🟢 **Yes** (Can hide your origin VPS IP) | 🔴 No (Exposes direct VPS IP to scanners) |
| **Server Migration** | 🟢 Change 1 DNS record without breaking bookmarks | 🔴 Must reconfigure every client & app |
| **Verdict** | ⭐ **Best & Recommended** | Useful for fast local testing |

---

## 🖥️ Web Navigation & Dashboard Routes

| Route | Page | Purpose |
|---|---|---|
| `GET /` | **Server Cockpit Dashboard** | Active server instances, search, deployment modal, cluster telemetry gauges. |
| `GET /app.html?id=...` | **Server Control Center** | Live WebSocket terminal streaming, start/stop/restart pills, file manager, database, sub-users, backups, settings. |
| `GET /admin.html` | **Administrator Control Center** | Global server management, user roles, system telemetry, node monitor. |
| `GET /admin-stats.html` | **Real-Time VPS Telemetry** | Live RAM usage, per-core CPU load, disk usage %, and rolling 60s stream chart. |
| `GET /login.html` | **Authentication & Onboarding** | Operator login and initial administrator account creation. |

---

## 📡 REST & WebSocket API (Port 8090)

- **HTTP API Base**: `http://<YOUR_IP_OR_DOMAIN>:8090/api`
- **WebSocket Endpoint**: `ws://<YOUR_IP_OR_DOMAIN>:8090/ws` (or `wss://<DOMAIN>/ws`)
- **System Telemetry Channel**: Subscribe with `{"type": "subscribe", "channel": "system:stats"}` to receive real-time per-core CPU %, RAM %, and Disk % every 2 seconds.
- **MariaDB Database URI**: `mysql://eclipse_user:<PASSWORD>@<YOUR_VPS_IP>:3306/eclipse_panel`
