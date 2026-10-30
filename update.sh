#!/usr/bin/env bash
# ==============================================================================
#  🌑 Eclipse Panel - Updater Script 🌑
#  Safely updates codebase, dependencies, and restarts daemon
# ==============================================================================

set -e

BOLD_RED='\033[1;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BOLD_RED}"
echo "  🌑 ECLIPSE PANEL - AUTO UPDATER 🌑"
echo -e "${CYAN}================================================================${NC}"

if [ "$(id -u)" -ne 0 ]; then
    echo -e "${BOLD_RED}[✘] Please run as root: 'sudo bash update.sh'${NC}"
    exit 1
fi

INSTALL_DIR="/opt/eclipse-panel"
if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${BOLD_RED}[✘] Eclipse Panel not found at ${INSTALL_DIR}${NC}"
    exit 1
fi

cd "$INSTALL_DIR"

echo -e "\n${CYAN}[1/4] Creating safety backup of data...${NC}"
BACKUP_DIR="/opt/eclipse-panel-backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
if [ -d "$INSTALL_DIR/storage/data" ]; then
    cp -r "$INSTALL_DIR/storage/data" "$BACKUP_DIR/"
fi
if command -v mysqldump >/dev/null 2>&1; then
    mysqldump -u root eclipse_panel > "$BACKUP_DIR/eclipse_panel.sql" 2>/dev/null || true
fi
echo -e "${GREEN}[✔] Backup preserved at ${BACKUP_DIR}${NC}"

echo -e "\n${CYAN}[2/4] Pulling latest updates from Git...${NC}"
if [ -d ".git" ]; then
    git pull origin main || git pull origin master || echo "Using local codebase"
fi

echo -e "\n${CYAN}[3/4] Updating production dependencies...${NC}"
npm install --omit=dev --no-audit

echo -e "\n${CYAN}[4/4] Restarting Eclipse Panel background daemon...${NC}"
systemctl daemon-reload
systemctl restart eclipse-panel

sleep 2
if systemctl is-active --quiet eclipse-panel; then
    echo -e "\n${GREEN}================================================================${NC}"
    echo -e "${BOLD_RED}  🎉 ECLIPSE PANEL SUCCESSFULLY UPDATED & RESTARTED! 🎉${NC}"
    echo -e "${GREEN}================================================================${NC}"
    systemctl status eclipse-panel --no-pager
else
    echo -e "\n${BOLD_RED}[✘] Warning: Service did not start cleanly. Check logs with 'journalctl -u eclipse-panel -f'${NC}"
fi
