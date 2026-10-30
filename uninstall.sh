#!/usr/bin/env bash
# ==============================================================================
#  🌑 Eclipse Panel - Complete Uninstaller 🌑
#  Permanently removes service, files, database, reverse proxy, and firewall rules
# ==============================================================================

set -e

BOLD_RED='\033[1;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

clear
echo -e "${BOLD_RED}"
echo "  ███████╗ ██████╗██╗     ██╗██████╗ ███████╗███████╗"
echo "  ██╔════╝██╔════╝██║     ██║██╔══██╗██╔════╝██╔════╝"
echo "  █████╗  ██║     ██║     ██║██████╔╝███████╗█████╗  "
echo "  ██╔══╝  ██║     ██║     ██║██╔═══╝ ╚════██║██╔══╝  "
echo "  ███████╗╚██████╗███████╗██║██║     ███████║███████╗"
echo "  ╚══════╝ ╚═════╝╚══════╝╚═╝╚═╝     ╚══════╝╚══════╝"
echo -e "           ${YELLOW}🌑 COMPLETE SYSTEM UNINSTALLER 🌑${NC}"
echo -e "${CYAN}================================================================${NC}"

if [ "$(id -u)" -ne 0 ]; then
    echo -e "${BOLD_RED}[✘] This script must be run as root: 'sudo bash uninstall.sh'${NC}"
    exit 1
fi

echo -e "${YELLOW}WARNING: This will permanently delete Eclipse Panel, its databases,${NC}"
echo -e "${YELLOW}hosted application files, systemd daemon, and Nginx configurations.${NC}"
read -p "Are you sure you want to completely uninstall Eclipse Panel? (y/N): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[yY]$ ]]; then
    echo -e "${CYAN}Uninstall aborted.${NC}"
    exit 0
fi

echo -e "\n${BOLD_RED}[1/6] Stopping and disabling systemd service...${NC}"
if systemctl is-active --quiet eclipse-panel 2>/dev/null; then
    systemctl stop eclipse-panel || true
fi
systemctl disable eclipse-panel 2>/dev/null || true
rm -f /etc/systemd/system/eclipse-panel.service
systemctl daemon-reload
echo -e "${GREEN}[✔] Systemd service removed.${NC}"

echo -e "\n${BOLD_RED}[2/6] Removing Nginx reverse proxy configuration...${NC}"
rm -f /etc/nginx/sites-available/eclipse-panel
rm -f /etc/nginx/sites-enabled/eclipse-panel
if command -v nginx >/dev/null 2>&1; then
    nginx -t 2>/dev/null && systemctl restart nginx || true
fi
echo -e "${GREEN}[✔] Nginx configuration removed.${NC}"

echo -e "\n${BOLD_RED}[3/6] Dropping MariaDB database 'eclipse_panel' & user...${NC}"
if command -v mysql >/dev/null 2>&1; then
    mysql -u root <<EOF 2>/dev/null || true
DROP DATABASE IF EXISTS eclipse_panel;
DROP USER IF EXISTS 'eclipse_user'@'localhost';
DROP USER IF EXISTS 'eclipse_user'@'127.0.0.1';
FLUSH PRIVILEGES;
EOF
    echo -e "${GREEN}[✔] MariaDB database dropped.${NC}"
fi

echo -e "\n${BOLD_RED}[4/6] Reverting firewall port 8090...${NC}"
if command -v ufw >/dev/null 2>&1; then
    ufw delete allow 8090/tcp 2>/dev/null || true
elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --remove-port=8090/tcp 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
fi
echo -e "${GREEN}[✔] Firewall port 8090 closed.${NC}"

echo -e "\n${BOLD_RED}[5/6] Deleting application and panel files...${NC}"
INSTALL_DIR="/opt/eclipse-panel"
if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    echo -e "${GREEN}[✔] Deleted ${INSTALL_DIR}${NC}"
fi

echo -e "\n${BOLD_RED}[6/6] Cleaning temporary artifacts...${NC}"
rm -f /root/.my.cnf 2>/dev/null || true

echo -e "\n${GREEN}================================================================${NC}"
echo -e "${BOLD_RED}  🌑 ECLIPSE PANEL HAS BEEN COMPLETELY UNINSTALLED! 🌑${NC}"
echo -e "${GREEN}================================================================${NC}\n"
