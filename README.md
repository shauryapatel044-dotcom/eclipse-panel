# 🌑 Eclipse Panel - Python & Node.js Hosting Daemon & Backend (Port 8090)

A lightweight, high-performance hosting panel engine and process supervisor built specifically for running **Python** and **Node.js** applications on any Linux VPS. Features a professional dark obsidian & crimson-red themed architecture, VPS MariaDB database (with built-in zero-dependency `node:sqlite` fallback), real-time WebSocket log streaming, live CPU core/RAM/Disk metrics, and user/admin role separation.

---

## ⚡ 1-Click VPS Installation

Run this command on your Linux VPS (Ubuntu, Debian, CentOS, AlmaLinux, Rocky):

```bash
git clone https://github.com/shauryapatel044-dotcom/eclipse-panel.git /opt/eclipse-panel
cd /opt/eclipse-panel
sudo bash install.sh
```

### What `install.sh` Does Automatically:
1. Installs **Node.js 22 LTS**, **Python 3** (with `pip` and `venv`), and **MariaDB Server**.
2. Configures default port to **`8090`** (and Port 80 via Nginx reverse proxy).
3. Creates MariaDB database `eclipse_panel` and provisions user `eclipse_user` with a secure random password.
4. Installs the backend production dependencies.
5. Sets up the **systemd service** (`eclipse-panel.service`) for automatic restart on boot/crash.
6. Configures Nginx with WebSocket upgrade support (`ws://<IP>:8090/ws`).
7. Opens firewall ports `8090` and `80`.
8. Automatically serves the Stitch frontend from `/opt/eclipse-panel/public`.

---

## 🖥️ Live Telemetry & Navigation Routes

| Route | Page | Purpose |
|---|---|---|
| `GET /` | **Overview Dashboard** | Active Python & Node.js apps, instant deploy modal, compute cluster gauges. |
| `GET /admin-stats.html` | **VPS Real-Time Telemetry** | **Live RAM used (GB & %), CPU cores used (real-time % per core), Disk used & %**, MariaDB status, and rolling 60s stream chart! |
| `GET /app.html?id=...` | **Application Control Center** | Live WebSocket terminal streaming, start/stop/restart pills, `npm`/`pip` installer. |
| `GET /admin.html` | **Admin Center** | User management, operator role switching (`admin` / `user`), global process supervisor. |
| `GET /login.html` | **Authentication & Onboarding** | Operator Identity login & SuperAdmin first-user registration. |

---

## 📡 REST & WebSocket API (Port 8090)

- **HTTP API Base**: `http://<YOUR_VPS_IP>:8090/api`
- **WebSocket Endpoint**: `ws://<YOUR_VPS_IP>:8090/ws`
- **System Telemetry Channel**: Subscribe with `{"type": "subscribe", "channel": "system:stats"}` to receive real-time per-core CPU %, RAM %, and Disk % every 2 seconds.
- **MariaDB Database URI**: `mysql://eclipse_user:<PASSWORD>@127.0.0.1:3306/eclipse_panel`
