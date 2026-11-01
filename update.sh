#!/usr/bin/env bash
# ==============================================================================
#  🌑 Eclipse Panel & Node - Zero-Downtime Auto-Updater 🌑
#  Guarantees repository sync, dependency installation, and daemon restart
#  Made By Vexezor · Cloud Container Infrastructure
# ==============================================================================

# Disable local proxies
unset ALL_PROXY all_proxy HTTP_PROXY http_proxy HTTPS_PROXY https_proxy
export NO_PROXY="*"

CYAN='\033[0;36m'
BOLD_CYAN='\033[1;36m'
GREEN='\033[0;32m'
BOLD_GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD_RED='\033[1;31m'
WHITE='\033[1;37m'
NC='\033[0m'

clear 2>/dev/null || true
echo -e "${CYAN}================================================================${NC}"
echo -e "${BOLD_CYAN}  🌑 ECLIPSE CLOUD INFRASTRUCTURE - AUTO UPDATER 🌑${NC}"
echo -e "${CYAN}================================================================${NC}"

if [ "$(id -u)" -ne 0 ]; then
    echo -e "${BOLD_RED}[✘] Please execute updater as root: 'sudo bash update.sh'${NC}"
    exit 1
fi

# Detect whether this machine is running Eclipse Panel or Eclipse Node
INSTALL_DIR=""
SERVICE_NAME="eclipse-panel"

if [ -d "/opt/eclipse-panel" ]; then
    INSTALL_DIR="/opt/eclipse-panel"
    SERVICE_NAME="eclipse-panel"
elif [ -d "/opt/eclipse-node" ]; then
    INSTALL_DIR="/opt/eclipse-node"
    SERVICE_NAME="eclipse-node"
elif [ -f "./package.json" ]; then
    INSTALL_DIR="$(pwd)"
    SERVICE_NAME="eclipse-panel"
else
    INSTALL_DIR="/opt/eclipse-panel"
    mkdir -p "$INSTALL_DIR"
    SERVICE_NAME="eclipse-panel"
fi

echo -e "Target Directory : ${BOLD_CYAN}${INSTALL_DIR}${NC}"
echo -e "Target Service   : ${BOLD_CYAN}${SERVICE_NAME}${NC}"
cd "$INSTALL_DIR"

# 1. Backup persistent databases and credentials
echo -e "\n${BOLD_CYAN}[1/5] Backing up configuration and SQLite database...${NC}"
BACKUP_DIR="/opt/eclipse-backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

if [ -f "$INSTALL_DIR/storage/data/eclipse.db" ]; then
    cp "$INSTALL_DIR/storage/data/eclipse.db" "$BACKUP_DIR/eclipse.db" 2>/dev/null || true
    echo -e "${GREEN}[✔] SQLite database preserved at ${BACKUP_DIR}/eclipse.db${NC}"
fi

if [ -f "$INSTALL_DIR/.env" ]; then
    cp "$INSTALL_DIR/.env" "$BACKUP_DIR/.env" 2>/dev/null || true
fi

# 2. Fetch and pull latest release from GitHub
echo -e "\n${BOLD_CYAN}[2/5] Fetching latest codebase from GitHub repository...${NC}"
git config --global --add safe.directory "$INSTALL_DIR" 2>/dev/null || true

if [ ! -d "$INSTALL_DIR/.git" ]; then
    echo -e "${YELLOW}[!] Initializing Git repository link in ${INSTALL_DIR}...${NC}"
    git init
    git remote add origin https://github.com/shauryapatel044-dotcom/eclipse-panel.git 2>/dev/null || git remote set-url origin https://github.com/shauryapatel044-dotcom/eclipse-panel.git
fi

git remote set-url origin https://github.com/shauryapatel044-dotcom/eclipse-panel.git 2>/dev/null || true
git fetch origin main --depth=1 2>/dev/null || git fetch --all 2>/dev/null || true

# Force update working tree to origin/main
if git show-ref --verify --quiet refs/remotes/origin/main; then
    git reset --hard origin/main
elif git show-ref --verify --quiet refs/remotes/origin/master; then
    git reset --hard origin/master
else
    # Fallback tarball clone if git remote fetch had network trouble
    echo -e "${YELLOW}[!] Git fetch fallback: Downloading latest release bundle directly...${NC}"
    curl -q -sSL https://github.com/shauryapatel044-dotcom/eclipse-panel/archive/refs/heads/main.tar.gz -o /tmp/eclipse-update.tar.gz
    if [ -f "/tmp/eclipse-update.tar.gz" ]; then
        tar -xzf /tmp/eclipse-update.tar.gz -C /tmp/
        cp -rf /tmp/eclipse-panel-main/* "$INSTALL_DIR/" 2>/dev/null || true
        rm -rf /tmp/eclipse-panel-main /tmp/eclipse-update.tar.gz
    fi
fi

LATEST_COMMIT=$(git log -1 --format="%h - %s (%ci)" 2>/dev/null || echo "Latest Main Release")
echo -e "${GREEN}[✔] Repository synced: ${WHITE}${LATEST_COMMIT}${NC}"

# Restore .env and SQLite DB if needed
if [ -f "$BACKUP_DIR/.env" ]; then
    cp -n "$BACKUP_DIR/.env" "$INSTALL_DIR/.env" 2>/dev/null || true
fi
if [ -f "$BACKUP_DIR/eclipse.db" ] && [ ! -s "$INSTALL_DIR/storage/data/eclipse.db" ]; then
    mkdir -p "$INSTALL_DIR/storage/data"
    cp "$BACKUP_DIR/eclipse.db" "$INSTALL_DIR/storage/data/eclipse.db" 2>/dev/null || true
fi

# Ensure storage directories exist
mkdir -p "$INSTALL_DIR/storage/apps"
mkdir -p "$INSTALL_DIR/storage/data"
mkdir -p "$INSTALL_DIR/public"

# 3. Update production dependencies
echo -e "\n${BOLD_CYAN}[3/5] Updating production dependencies & CLI binaries...${NC}"
npm install --omit=dev --no-audit

# Ensure /usr/local/bin symlinks for startup commands compatibility
mkdir -p /usr/local/bin
[ -n "$(command -v node 2>/dev/null)" ] && ln -sf "$(command -v node)" /usr/local/bin/node 2>/dev/null || true
[ -n "$(command -v npm 2>/dev/null)" ] && ln -sf "$(command -v npm)" /usr/local/bin/npm 2>/dev/null || true
[ -n "$(command -v npx 2>/dev/null)" ] && ln -sf "$(command -v npx)" /usr/local/bin/npx 2>/dev/null || true
[ -n "$(command -v python3 2>/dev/null)" ] && ln -sf "$(command -v python3)" /usr/local/bin/python 2>/dev/null || true
[ -n "$(command -v python3 2>/dev/null)" ] && ln -sf "$(command -v python3)" /usr/local/bin/python3 2>/dev/null || true
[ -n "$(command -v pip3 2>/dev/null)" ] && ln -sf "$(command -v pip3)" /usr/local/bin/pip 2>/dev/null || true
[ -n "$(command -v pip3 2>/dev/null)" ] && ln -sf "$(command -v pip3)" /usr/local/bin/pip3 2>/dev/null || true

# Ensure ts-node is available globally for TypeScript startup commands
if ! command -v ts-node >/dev/null 2>&1; then
    npm install -g ts-node typescript 2>/dev/null || true
    [ -n "$(command -v ts-node 2>/dev/null)" ] && ln -sf "$(command -v ts-node)" /usr/local/bin/ts-node 2>/dev/null || true
fi

echo -e "${GREEN}[✔] Node modules and execution binaries ready.${NC}"

# 4. Reconfigure Reverse Proxy & Restart Background Daemon
echo -e "\n${BOLD_CYAN}[4/5] Self-healing proxy configurations & restarting ${SERVICE_NAME} daemon...${NC}"
pkill -9 -f "src/index.js" 2>/dev/null || true
fuser -k -9 8090/tcp 2>/dev/null || true

# 4A. Self-signed SSL Certificate for Cloudflare Full SSL Support
mkdir -p /etc/ssl/certs /etc/ssl/private
if [ ! -f /etc/ssl/certs/eclipse-panel.crt ] || [ ! -f /etc/ssl/private/eclipse-panel.key ]; then
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout /etc/ssl/private/eclipse-panel.key \
        -out /etc/ssl/certs/eclipse-panel.crt \
        -subj "/C=US/ST=Cloud/L=Eclipse/O=EclipsePanel/CN=*" 2>/dev/null || true
fi

# 4B. Generate Complete Nginx Reverse Proxy (Port 80 & 443 -> Port 8090)
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d
NGINX_CONF="/etc/nginx/sites-available/eclipse-panel"

cat <<'EOF' > "$NGINX_CONF"
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;

    ssl_certificate /etc/ssl/certs/eclipse-panel.crt;
    ssl_certificate_key /etc/ssl/private/eclipse-panel.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    server_name _;

    # Unlimited upload size up to container storage quota
    client_max_body_size 0;

    # Static Assets & API Reverse Proxy
    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }

    # WebSocket Real-Time Stream
    location /ws {
        proxy_pass http://127.0.0.1:8090/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
EOF

# Disable conflicting default server blocks
if [ -f /etc/nginx/nginx.conf ]; then
    sed -i 's/listen       80 default_server;/listen       80;/g' /etc/nginx/nginx.conf 2>/dev/null || true
    sed -i 's/listen       \[::\]:80 default_server;/listen       [::]:80;/g' /etc/nginx/nginx.conf 2>/dev/null || true
fi
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
rm -f /etc/nginx/sites-available/default 2>/dev/null || true
rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true
rm -f /etc/nginx/conf.d/eclipse-panel.conf 2>/dev/null || true

if [ -d /etc/nginx/sites-enabled ]; then
    ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/eclipse-panel
else
    cp -f "$NGINX_CONF" /etc/nginx/conf.d/eclipse-panel.conf
fi
nginx -t 2>/dev/null && systemctl restart nginx 2>/dev/null || true

# 4C. Rebuild and Enable Systemd Service Unit
NODE_BIN_PATH=$(command -v node || echo "/usr/bin/node")

cat <<EOF > "/etc/systemd/system/${SERVICE_NAME}.service"
[Unit]
Description=Eclipse Panel - Cloud Container Infrastructure Daemon
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${NODE_BIN_PATH} src/index.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

command -v pm2 >/dev/null 2>&1 && pm2 delete "$SERVICE_NAME" 2>/dev/null || true
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" 2>/dev/null || true
systemctl restart "${SERVICE_NAME}"
echo -e "${GREEN}[✔] Daemon service reloaded and active via systemd.${NC}"

# 5. Verify Health
echo -e "\n${BOLD_CYAN}[5/5] Verifying daemon health...${NC}"
HEALTHY=false
for i in {1..5}; do
    sleep 1
    HEALTH_CHECK=$(curl -q --noproxy "*" -s --max-time 3 http://127.0.0.1:8090/api/health 2>/dev/null || true)
    if [[ "$HEALTH_CHECK" =~ "online" ]]; then
        HEALTHY=true
        break
    fi
done

if [ "$HEALTHY" = true ]; then
    echo -e "${BOLD_GREEN}[✔] Daemon is live and responding on port 8090!${NC}"
else
    echo -e "${BOLD_RED}[✘] Daemon did not respond in 5s. Inspecting recent journal logs:${NC}"
    journalctl -u "${SERVICE_NAME}" -n 25 --no-pager 2>/dev/null || true
fi

echo ""
echo -e "${BOLD_GREEN}================================================================${NC}"
echo -e "${BOLD_CYAN}  🌑 ECLIPSE INFRASTRUCTURE UPDATED SUCCESSFULLY! 🌑${NC}"
echo -e "${BOLD_GREEN}================================================================${NC}"
echo -e "  ● Service Name       : ${BOLD_CYAN}${SERVICE_NAME}${NC}"
echo -e "  ● Installation Path  : ${CYAN}${INSTALL_DIR}${NC}"
echo -e "  ● Live Web Panel     : ${CYAN}http://$(curl -q -s --max-time 2 https://api.ipify.org 2>/dev/null || echo 'localhost'):8090${NC}"
echo -e "  ● Service Status     : ${CYAN}systemctl status ${SERVICE_NAME}${NC}"
echo -e "${BOLD_GREEN}================================================================${NC}"
echo ""
