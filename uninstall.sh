#!/usr/bin/env bash
# ==============================================================================
#  🌑 Eclipse Panel & Node - Complete Clean Uninstaller 🌑
#  Permanently removes services, processes, databases, configs, and ports
#  Made By Vexezor · Cloud Container Infrastructure
# ==============================================================================

set -e

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
echo -e "${BOLD_RED}"
echo "  ███████╗ ██████╗██╗     ██╗██████╗ ███████╗███████╗"
echo "  ██╔════╝██╔════╝██║     ██║██╔══██╗██╔════╝██╔════╝"
echo "  █████╗  ██║     ██║     ██║██████╔╝███████╗█████╗  "
echo "  ██╔══╝  ██║     ██║     ██║██╔═══╝ ╚════██║██╔══╝  "
echo "  ███████╗╚██████╗███████╗██║██║     ███████║███████╗"
echo "  ╚══════╝ ╚═════╝╚══════╝╚═╝╚═╝     ╚══════╝╚══════╝"
echo -e "           ${YELLOW}🌑 COMPLETE CLEAN SYSTEM UNINSTALLER 🌑${NC}"
echo -e "${CYAN}================================================================${NC}"

if [ "$(id -u)" -ne 0 ]; then
    echo -e "${BOLD_RED}[✘] This script must be run as root: 'sudo bash uninstall.sh'${NC}"
    exit 1
fi

FORCE=false
if [ "$1" == "--force" ] || [ "$1" == "-f" ] || [ "$1" == "-y" ]; then
    FORCE=true
fi

if [ "$FORCE" = false ]; then
    echo -e "${YELLOW}WARNING: This will completely wipe Eclipse Panel, Eclipse Node,${NC}"
    echo -e "${YELLOW}all hosted applications, user databases, PM2 tasks, and configs.${NC}"
    read -p "Are you sure you want to proceed with full uninstallation? (y/N): " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[yY]$ ]]; then
        echo -e "${CYAN}Uninstall cancelled.${NC}"
        exit 0
    fi
fi

# 1. Kill background processes and stop PM2
echo -e "\n${BOLD_RED}[1/7] Stopping and terminating all running daemons and containers...${NC}"
if command -v pm2 >/dev/null 2>&1; then
    pm2 delete eclipse-panel 2>/dev/null || true
    pm2 delete eclipse-node 2>/dev/null || true
    pm2 save 2>/dev/null || true
fi

# Kill any processes still binding on ports 8090, 80, and user app ports 3000-4000
if command -v fuser >/dev/null 2>&1; then
    fuser -k -9 8090/tcp 2>/dev/null || true
    for port in $(seq 3000 3105); do
        fuser -k -9 ${port}/tcp 2>/dev/null || true
    done
fi

# 2. Remove systemd services
echo -e "\n${BOLD_RED}[2/7] Removing systemd unit files...${NC}"
systemctl stop eclipse-panel 2>/dev/null || true
systemctl disable eclipse-panel 2>/dev/null || true
rm -f /etc/systemd/system/eclipse-panel.service

systemctl stop eclipse-node 2>/dev/null || true
systemctl disable eclipse-node 2>/dev/null || true
rm -f /etc/systemd/system/eclipse-node.service

systemctl daemon-reload
echo -e "${GREEN}[✔] Systemd services stopped and removed.${NC}"

# 3. Clean Nginx configurations
echo -e "\n${BOLD_RED}[3/7] Reverting Nginx reverse proxy configurations...${NC}"
rm -f /etc/nginx/sites-available/eclipse-panel
rm -f /etc/nginx/sites-enabled/eclipse-panel
rm -f /etc/nginx/conf.d/eclipse-panel.conf
if command -v nginx >/dev/null 2>&1; then
    nginx -t 2>/dev/null && systemctl restart nginx 2>/dev/null || true
fi
echo -e "${GREEN}[✔] Nginx reverse proxy removed.${NC}"

# 4. Clean MariaDB Database
echo -e "\n${BOLD_RED}[4/7] Dropping MariaDB 'eclipse_panel' database and credentials...${NC}"
MYSQL_CMD="mysql"
if ! command -v mysql >/dev/null 2>&1; then
    MYSQL_CMD="mariadb"
fi

if command -v $MYSQL_CMD >/dev/null 2>&1; then
    $MYSQL_CMD <<EOF 2>/dev/null || true
DROP DATABASE IF EXISTS eclipse_panel;
DROP USER IF EXISTS 'eclipse_user'@'localhost';
DROP USER IF EXISTS 'eclipse_user'@'127.0.0.1';
FLUSH PRIVILEGES;
EOF
    echo -e "${GREEN}[✔] MariaDB database dropped.${NC}"
fi
rm -f /root/.my.cnf 2>/dev/null || true

# 5. Revert firewall ports
echo -e "\n${BOLD_RED}[5/7] Reverting firewall rules...${NC}"
if command -v ufw >/dev/null 2>&1; then
    ufw delete allow 8090/tcp 2>/dev/null || true
elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --remove-port=8090/tcp 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
fi
echo -e "${GREEN}[✔] Port 8090 closed.${NC}"

# 6. Delete directory files
echo -e "\n${BOLD_RED}[6/7] Removing installation directories (/opt/eclipse-panel, /opt/eclipse-node)...${NC}"
rm -rf /opt/eclipse-panel
rm -rf /opt/eclipse-node
echo -e "${GREEN}[✔] File systems wiped.${NC}"

# 7. Clean caches
echo -e "\n${BOLD_RED}[7/7] Cleaning temporary caches...${NC}"
npm cache clean --force 2>/dev/null || true

echo ""
echo -e "${BOLD_GREEN}================================================================${NC}"
echo -e "${BOLD_CYAN}  🌑 ECLIPSE INFRASTRUCTURE COMPLETELY UNINSTALLED! 🌑${NC}"
echo -e "${BOLD_GREEN}================================================================${NC}"
echo -e "  Your server is now clean and ready for a fresh installation."
echo -e "${BOLD_GREEN}================================================================${NC}"
echo ""
