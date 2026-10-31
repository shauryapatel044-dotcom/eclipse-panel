#!/usr/bin/env bash
# ==============================================================================
#  🌑 Eclipse Panel & Node - Zero-Downtime Updater 🌑
#  Safely updates codebase from Git, updates dependencies, and restarts daemon
#  Made By Vexezor · Cloud Container Infrastructure
# ==============================================================================

set -e

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
    echo -e "${BOLD_RED}[✘] Eclipse installation not found in /opt/eclipse-panel or /opt/eclipse-node.${NC}"
    exit 1
fi

echo -e "Target Directory : ${BOLD_CYAN}${INSTALL_DIR}${NC}"
echo -e "Target Service   : ${BOLD_CYAN}${SERVICE_NAME}${NC}"
cd "$INSTALL_DIR"

# 1. Backup persistent databases
echo -e "\n${BOLD_CYAN}[1/5] Creating safe backup of database & application data...${NC}"
BACKUP_DIR="/opt/eclipse-backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

if [ -f "$INSTALL_DIR/storage/data/eclipse.db" ]; then
    cp "$INSTALL_DIR/storage/data/eclipse.db" "$BACKUP_DIR/"
    echo -e "${GREEN}[✔] SQLite database preserved at ${BACKUP_DIR}/eclipse.db${NC}"
fi

if [ -f "$INSTALL_DIR/.env" ]; then
    cp "$INSTALL_DIR/.env" "$BACKUP_DIR/.env"
fi

if command -v mysqldump >/dev/null 2>&1; then
    mysqldump -u root eclipse_panel > "$BACKUP_DIR/eclipse_panel.sql" 2>/dev/null || true
fi

# 2. Pull latest release from GitHub
echo -e "\n${BOLD_CYAN}[2/5] Fetching latest updates from GitHub repository...${NC}"
if [ -d ".git" ]; then
    git config --global --add safe.directory "$INSTALL_DIR" 2>/dev/null || true
    git fetch --all --prune
    git reset --hard origin/main 2>/dev/null || git pull origin main || git pull origin master
    LATEST_COMMIT=$(git log -1 --format="%h - %s (%ci)" 2>/dev/null || echo "Latest")
    echo -e "${GREEN}[✔] Updated to commit: ${WHITE}${LATEST_COMMIT}${NC}"
else
    echo -e "${YELLOW}[!] Working directory is not a Git clone. Using current local files.${NC}"
fi

# Restore .env if needed
if [ ! -f "$INSTALL_DIR/.env" ] && [ -f "$BACKUP_DIR/.env" ]; then
    cp "$BACKUP_DIR/.env" "$INSTALL_DIR/.env"
fi

# 3. Update production dependencies
echo -e "\n${BOLD_CYAN}[3/5] Updating production dependencies (including Discord bot & drivers)...${NC}"
npm install --omit=dev --no-audit
echo -e "${GREEN}[✔] Node modules up to date.${NC}"

# Ensure global PM2 path and Pterodactyl-compatible binary symlinks
if ! command -v pm2 >/dev/null 2>&1; then
    npm install -g pm2 || true
    PM2_PATH=$(npm root -g 2>/dev/null)/pm2/bin/pm2
    [ -f "$PM2_PATH" ] && ln -sf "$PM2_PATH" /usr/local/bin/pm2 2>/dev/null || true
fi

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

# 4. Restart Background Daemon
echo -e "\n${BOLD_CYAN}[4/5] Restarting ${SERVICE_NAME} daemon...${NC}"
if command -v pm2 >/dev/null 2>&1; then
    pm2 restart "$SERVICE_NAME" 2>/dev/null || pm2 start src/index.js --name "$SERVICE_NAME" --time 2>/dev/null || true
    pm2 save 2>/dev/null || true
fi

if systemctl list-unit-files | grep -q "${SERVICE_NAME}.service"; then
    systemctl daemon-reload
    systemctl restart "$SERVICE_NAME" 2>/dev/null || true
fi

# 5. Verify Health
echo -e "\n${BOLD_CYAN}[5/5] Verifying daemon health...${NC}"
sleep 2
HEALTH_CHECK=$(curl --noproxy "*" -s --max-time 4 http://127.0.0.1:8090/api/health || true)

if [[ "$HEALTH_CHECK" =~ "online" ]]; then
    echo -e "${BOLD_GREEN}[✔] Daemon is healthy and responding on port 8090!${NC}"
else
    echo -e "${YELLOW}[!] Daemon is still initializing. Check logs with 'pm2 logs ${SERVICE_NAME}'${NC}"
fi

echo ""
echo -e "${BOLD_GREEN}================================================================${NC}"
echo -e "${BOLD_CYAN}  🌑 ECLIPSE INFRASTRUCTURE UPDATED SUCCESSFULLY! 🌑${NC}"
echo -e "${BOLD_GREEN}================================================================${NC}"
echo -e "  ● Service Name       : ${BOLD_CYAN}${SERVICE_NAME}${NC}"
echo -e "  ● Installation Path  : ${CYAN}${INSTALL_DIR}${NC}"
echo -e "  ● Live Web Panel     : ${CYAN}http://$(curl -s --max-time 2 https://api.ipify.org 2>/dev/null || echo 'localhost'):8090${NC}"
echo -e "  ● Service Logs       : ${CYAN}pm2 logs ${SERVICE_NAME}${NC}"
echo -e "  ● Restart Command    : ${CYAN}pm2 restart ${SERVICE_NAME}${NC}"
echo -e "${BOLD_GREEN}================================================================${NC}"
echo ""
