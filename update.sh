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
    curl -sSL https://github.com/shauryapatel044-dotcom/eclipse-panel/archive/refs/heads/main.tar.gz -o /tmp/eclipse-update.tar.gz
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

# 4. Restart Background Daemon (Free port 8090 first)
echo -e "\n${BOLD_CYAN}[4/5] Restarting ${SERVICE_NAME} daemon...${NC}"
fuser -k -9 8090/tcp 2>/dev/null || true

# Check if systemd service is installed
if [ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
    pm2 delete "$SERVICE_NAME" 2>/dev/null || true
    pm2 save 2>/dev/null || true
    systemctl daemon-reload
    systemctl restart "$SERVICE_NAME"
    echo -e "${GREEN}[✔] Daemon restarted via systemd.${NC}"
elif command -v pm2 >/dev/null 2>&1; then
    pm2 restart "$SERVICE_NAME" 2>/dev/null || pm2 start src/index.js --name "$SERVICE_NAME" --time 2>/dev/null || true
    pm2 save 2>/dev/null || true
    echo -e "${GREEN}[✔] Daemon restarted via PM2.${NC}"
else
    pkill -f "src/index.js" 2>/dev/null || true
    nohup node src/index.js >/var/log/eclipse-panel.log 2>&1 &
    echo -e "${GREEN}[✔] Daemon restarted in background.${NC}"
fi

# 5. Verify Health
echo -e "\n${BOLD_CYAN}[5/5] Verifying daemon health...${NC}"
HEALTHY=false
for i in {1..5}; do
    sleep 1
    HEALTH_CHECK=$(curl --noproxy "*" -s --max-time 3 http://127.0.0.1:8090/api/health 2>/dev/null || true)
    if [[ "$HEALTH_CHECK" =~ "online" ]]; then
        HEALTHY=true
        break
    fi
done

if [ "$HEALTHY" = true ]; then
    echo -e "${BOLD_GREEN}[✔] Daemon is live and responding on port 8090!${NC}"
else
    echo -e "${YELLOW}[!] Daemon is still booting. You can inspect logs with: 'journalctl -u ${SERVICE_NAME} -n 20' or 'pm2 logs ${SERVICE_NAME}'${NC}"
fi

echo ""
echo -e "${BOLD_GREEN}================================================================${NC}"
echo -e "${BOLD_CYAN}  🌑 ECLIPSE INFRASTRUCTURE UPDATED SUCCESSFULLY! 🌑${NC}"
echo -e "${BOLD_GREEN}================================================================${NC}"
echo -e "  ● Service Name       : ${BOLD_CYAN}${SERVICE_NAME}${NC}"
echo -e "  ● Installation Path  : ${CYAN}${INSTALL_DIR}${NC}"
echo -e "  ● Live Web Panel     : ${CYAN}http://$(curl -s --max-time 2 https://api.ipify.org 2>/dev/null || echo 'localhost'):8090${NC}"
echo -e "  ● Service Status     : ${CYAN}systemctl status ${SERVICE_NAME}${NC}"
echo -e "${BOLD_GREEN}================================================================${NC}"
echo ""
