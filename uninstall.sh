#!/usr/bin/env bash
# ==============================================================================
#  🌑 Eclipse Panel & Node - Complete Clean Uninstaller 🌑
#  Permanently removes services, processes, databases, configs, and ports
#  Made By Vexezor · Cloud Container Infrastructure
# ==============================================================================

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
if [ "$1" == "--force" ] || [ "$1" == "-f" ] || [ "$1" == "-y" ] || [ "$FORCE" == "1" ] || [ "$FORCE" == "true" ]; then
    FORCE=true
fi

if [ "$FORCE" = false ]; then
    echo -e "${YELLOW}WARNING: This will completely wipe Eclipse Panel, Eclipse Node,${NC}"
    echo -e "${YELLOW}all hosted applications, user databases, PM2 tasks, and configs.${NC}"
    if [ -e /dev/tty ]; then
        read -p "Are you sure you want to proceed with full uninstallation? (y/N): " CONFIRM </dev/tty
    else
        read -p "Are you sure you want to proceed with full uninstallation? (y/N): " CONFIRM
    fi
    if [[ ! "$CONFIRM" =~ ^[yY]$ ]]; then
        echo -e "${CYAN}Uninstall cancelled.${NC}"
        exit 0
    fi
fi

# Switch working directory out of /opt/eclipse-panel into /root immediately
cd /root 2>/dev/null || cd /tmp 2>/dev/null || cd /

# 1. Kill background processes and stop services
echo -e "\n${BOLD_RED}[1/6] Stopping and disabling system services...${NC}"
systemctl stop eclipse-panel 2>/dev/null || true
systemctl stop eclipse-node 2>/dev/null || true
systemctl disable eclipse-panel 2>/dev/null || true
systemctl disable eclipse-node 2>/dev/null || true
rm -f /etc/systemd/system/eclipse-panel.service 2>/dev/null || true
rm -f /etc/systemd/system/eclipse-node.service 2>/dev/null || true
systemctl daemon-reload 2>/dev/null || true

# 2. Terminate PM2 tasks if running
if command -v pm2 >/dev/null 2>&1; then
    pm2 delete eclipse-panel 2>/dev/null || true
    pm2 delete eclipse-node 2>/dev/null || true
    pm2 save 2>/dev/null || true
fi

# 3. Terminate running eclipse node/bot processes safely without touching other apps or SSH
echo -e "\n${BOLD_RED}[2/6] Terminating panel background processes...${NC}"
pkill -9 -f "eclipse-panel/src/index.js" 2>/dev/null || true
pkill -9 -f "/opt/eclipse-panel" 2>/dev/null || true
pkill -9 -f "/opt/eclipse-node" 2>/dev/null || true
pkill -9 -f "node src/index.js" 2>/dev/null || true

# Release panel port 8090 safely
if command -v fuser >/dev/null 2>&1; then
    fuser -k -9 8090/tcp 2>/dev/null || true
fi

echo -e "${GREEN}[✔] Services and background processes terminated.${NC}"

# 4. Clean Nginx configurations
echo -e "\n${BOLD_RED}[3/6] Reverting Nginx reverse proxy configurations...${NC}"
rm -f /etc/nginx/sites-available/eclipse-panel 2>/dev/null || true
rm -f /etc/nginx/sites-enabled/eclipse-panel 2>/dev/null || true
rm -f /etc/nginx/conf.d/eclipse-panel.conf 2>/dev/null || true
if command -v nginx >/dev/null 2>&1; then
    nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
fi
echo -e "${GREEN}[✔] Nginx reverse proxy removed.${NC}"

# 5. Clean MariaDB Database
echo -e "\n${BOLD_RED}[4/6] Dropping MariaDB 'eclipse_panel' database and credentials...${NC}"
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

# 6. Revert firewall ports
echo -e "\n${BOLD_RED}[5/6] Reverting firewall rules...${NC}"
if command -v ufw >/dev/null 2>&1; then
    ufw delete allow 8090/tcp 2>/dev/null || true
elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --remove-port=8090/tcp 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
fi
echo -e "${GREEN}[✔] Port 8090 closed.${NC}"

# 7. Delete directory files
echo -e "\n${BOLD_RED}[6/6] Removing installation directories (/opt/eclipse-panel, /opt/eclipse-node)...${NC}"
cd /root 2>/dev/null || cd /tmp 2>/dev/null || cd /
rm -rf /opt/eclipse-panel 2>/dev/null || true
rm -rf /opt/eclipse-node 2>/dev/null || true

echo -e "${GREEN}[✔] File systems wiped successfully.${NC}"

echo ""
echo -e "${BOLD_GREEN}================================================================${NC}"
echo -e "${BOLD_CYAN}  🌑 ECLIPSE INFRASTRUCTURE COMPLETELY UNINSTALLED! 🌑${NC}"
echo -e "${BOLD_GREEN}================================================================${NC}"
echo -e "  Your server is now completely clean and ready for fresh install."
echo -e "${BOLD_GREEN}================================================================${NC}"
echo ""
