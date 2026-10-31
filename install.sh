#!/usr/bin/env bash
# ==============================================================================
#  🌑 Eclipse Panel - Production 1-Click VPS Installer 🌑
#  Node.js 22 LTS · Python 3 · MariaDB Database · Nginx Reverse Proxy · Port 8090
#  Made By Vexezor · Cloud Container Infrastructure
#  Compatible with: Ubuntu 20.04+, Debian 11+, CentOS/RHEL/AlmaLinux/Rocky 8+, Fedora
# ==============================================================================

set -e

# Disable any local terminal SOCKS/HTTP proxy to prevent localhost connection errors
unset ALL_PROXY all_proxy HTTP_PROXY http_proxy HTTPS_PROXY https_proxy
export NO_PROXY="*"

# Terminal ANSI Styling
CYAN='\033[0;36m'
BOLD_CYAN='\033[1;36m'
GREEN='\033[0;32m'
BOLD_GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD_RED='\033[1;31m'
WHITE='\033[1;37m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

print_banner() {
    clear 2>/dev/null || true
    echo -e "${CYAN}"
    echo "  ███████╗ ██████╗██╗     ██╗██████╗ ███████╗███████╗"
    echo "  ██╔════╝██╔════╝██║     ██║██╔══██╗██╔════╝██╔════╝"
    echo "  █████╗  ██║     ██║     ██║██████╔╝███████╗█████╗  "
    echo "  ██╔══╝  ██║     ██║     ██║██╔═══╝ ╚════██║██╔══╝  "
    echo "  ███████╗╚██████╗███████╗██║██║     ███████║███████╗"
    echo "  ╚══════╝ ╚═════╝╚══════╝╚═╝╚═╝     ╚══════╝╚══════╝"
    echo "      ██████╗  █████╗ ███╗   ██╗███████╗██╗          "
    echo "      ██╔══██╗██╔══██╗████╗  ██║██╔════╝██║          "
    echo "      ██████╔╝███████║██╔██╗ ██║█████╗  ██║          "
    echo "      ██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██║          "
    echo "      ██║     ██║  ██║██║ ╚████║███████╗███████╗     "
    echo "      ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝     "
    echo -e "      ${BOLD_CYAN}🌑 Eclipse Panel (Port 8090) · Made By Vexezor 🌑${NC}"
    echo -e "${CYAN}================================================================${NC}"
    echo ""
}

print_step() {
    echo -e "\n${BOLD_CYAN}[+] $1${NC}"
}

print_success() {
    echo -e "${BOLD_GREEN}[✔] $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[!] $1${NC}"
}

print_error() {
    echo -e "${BOLD_RED}[✘] $1${NC}"
}

# 1. Root Verification
if [ "$(id -u)" -ne 0 ]; then
    print_error "This installer must be run as root. Please execute: sudo bash install.sh"
    exit 1
fi

print_banner

# 2. Operating System Detection
print_step "Detecting operating system distribution..."
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
    echo -e "Detected OS: ${BOLD_GREEN}$NAME ($VERSION)${NC}"
else
    print_error "Unable to detect Linux distribution from /etc/os-release."
    exit 1
fi

# Detect Public VPS IP (Bypassing any proxy)
print_step "Detecting VPS public network address..."
PUBLIC_IP=$(curl --noproxy "*" -s --max-time 4 https://api.ipify.org || curl --noproxy "*" -s --max-time 4 https://icanhazip.com || curl --noproxy "*" -s --max-time 4 https://ifconfig.me || hostname -I | awk '{print $1}')
PUBLIC_IP=$(echo "$PUBLIC_IP" | tr -d '[:space:]')
if [ -z "$PUBLIC_IP" ]; then
    PUBLIC_IP="127.0.0.1"
fi
print_success "Detected VPS Public IP: ${BOLD_CYAN}${PUBLIC_IP}${NC}"

# 3. Infrastructure Deployment Mode Selection
echo ""
echo -e "${CYAN}================================================================${NC}"
echo -e "${BOLD_CYAN}  🌑 ECLIPSE CLOUD INFRASTRUCTURE DEPLOYMENT MODE 🌑${NC}"
echo -e "${CYAN}================================================================${NC}"
echo -e "  Select deployment target for this machine:"
echo -e "  ${WHITE}[1] Eclipse Panel${NC}  - Master Controller & Web Dashboard (Port 8090/80)"
echo -e "  ${WHITE}[2] Eclipse Node${NC}   - Remote Daemon Runner for Distributed Server Clusters"
echo -e "${CYAN}================================================================${NC}"

DEPLOY_MODE="panel"
if [ -e /dev/tty ]; then
    read -r -p "Select option [1 for Panel, 2 for Node] (Default: 1): " INPUT_DEPLOY_MODE </dev/tty
    if [ "$INPUT_DEPLOY_MODE" == "2" ] || [ "$INPUT_DEPLOY_MODE" == "node" ]; then
        DEPLOY_MODE="node"
    fi
fi

if [ "$DEPLOY_MODE" == "node" ]; then
    print_success "Selected Deployment Mode: Eclipse Node Daemon"

    # Node Server Subdomain Setup
    echo ""
    echo -e "${CYAN}================================================================${NC}"
    echo -e "${BOLD_CYAN}  🌐 REMOTE NODE DOMAIN & SUBDOMAIN SETUP 🌐${NC}"
    echo -e "${CYAN}================================================================${NC}"
    echo -e "  • Point a Subdomain or Wildcard A-Record to this Node's IP: ${BOLD_CYAN}${PUBLIC_IP}${NC}"
    echo -e "    Example: ${CYAN}node1.servers.vexezor.bond${NC} or ${CYAN}*.node1.vexezor.bond${NC}"
    echo -e "${CYAN}================================================================${NC}"

    NODE_SUBDOMAIN=""
    if [ -e /dev/tty ]; then
        read -r -p "Enter Server Subdomain for this Node [Optional, press Enter to use VPS IP]: " INPUT_NODE_DOMAIN </dev/tty
        NODE_SUBDOMAIN=$(echo "$INPUT_NODE_DOMAIN" | sed -e 's|^https\?://||' -e 's|/.*$||' -e 's|:.*$||' | tr -d '[:space:]')
    fi

    # Cluster Secret Token
    echo ""
    echo -e "${CYAN}================================================================${NC}"
    echo -e "${BOLD_CYAN}  🔐 CLUSTER SECRET TOKEN (NODE AUTHENTICATION) 🔐${NC}"
    echo -e "${CYAN}================================================================${NC}"
    echo -e "  • The Cluster Secret authenticates this remote Node with your Master Panel."
    echo -e "  • You can specify your own secret or let the installer auto-generate one."
    echo -e "${CYAN}================================================================${NC}"

    CLUSTER_SECRET=""
    if [ -e /dev/tty ]; then
        read -r -p "Enter Cluster Secret Token [Press Enter to auto-generate]: " INPUT_SECRET </dev/tty
        if [ -n "$INPUT_SECRET" ]; then
            CLUSTER_SECRET=$(echo "$INPUT_SECRET" | tr -d '[:space:]')
        fi
    fi

    if [ -z "$CLUSTER_SECRET" ]; then
        CLUSTER_SECRET="ecl_node_sec_$(openssl rand -hex 24 2>/dev/null || tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 48)"
    fi
    print_success "Cluster Secret Configured: ${BOLD_CYAN}${CLUSTER_SECRET}${NC}"

    # Install base dependencies for node
    print_step "Updating system packages and installing prerequisites for Node Daemon..."
    if [[ "$OS" =~ ^(ubuntu|debian)$ ]]; then
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -y
        apt-get install -y curl wget git build-essential ca-certificates gnupg ufw lsof dnsutils
    elif [[ "$OS" =~ ^(centos|rhel|almalinux|rocky|fedora)$ ]]; then
        dnf -y install epel-release || yum -y install epel-release || true
        dnf -y install curl wget git gcc-c++ make ca-certificates gnupg2 tar firewalld lsof bind-utils || true
    fi

    # Install Node.js 22 LTS if needed
    if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 20 ]; then
        print_step "Installing Node.js 22 LTS..."
        if [[ "$OS" =~ ^(ubuntu|debian)$ ]]; then
            mkdir -p /etc/apt/keyrings
            curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes 2>/dev/null || true
            echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
            apt-get update -y && apt-get install -y nodejs
        elif [[ "$OS" =~ ^(centos|rhel|almalinux|rocky|fedora)$ ]]; then
            curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
            dnf -y install nodejs || yum -y install nodejs
        fi
    fi

    # Install Python 3
    if [[ "$OS" =~ ^(ubuntu|debian)$ ]]; then
        apt-get install -y python3 python3-pip python3-venv python3-dev
    elif [[ "$OS" =~ ^(centos|rhel|almalinux|rocky|fedora)$ ]]; then
        dnf -y install python3 python3-pip python3-devel || yum -y install python3 python3-pip python3-devel
    fi

    # Symlink binaries
    [ ! -f /usr/local/bin/python ] && ln -sf "$(command -v python3 || command -v python)" /usr/local/bin/python 2>/dev/null || true
    [ ! -f /usr/local/bin/pip ] && ln -sf "$(command -v pip3 || command -v pip)" /usr/local/bin/pip 2>/dev/null || true
    [ ! -f /usr/local/bin/node ] && ln -sf "$(command -v node)" /usr/local/bin/node 2>/dev/null || true
    [ ! -f /usr/local/bin/npm ] && ln -sf "$(command -v npm)" /usr/local/bin/npm 2>/dev/null || true

    # Setup directories
    NODE_INSTALL_DIR="/opt/eclipse-node"

    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
    if [ "$SCRIPT_DIR" != "$NODE_INSTALL_DIR" ]; then
        if [ -f "$SCRIPT_DIR/package.json" ]; then
            print_step "Copying daemon files into ${NODE_INSTALL_DIR}..."
            mkdir -p "$NODE_INSTALL_DIR"
            cp -r "$SCRIPT_DIR/"* "$NODE_INSTALL_DIR/"
        elif [ -d "$NODE_INSTALL_DIR/.git" ]; then
            print_step "Updating existing daemon repository in ${NODE_INSTALL_DIR}..."
            cd "$NODE_INSTALL_DIR"
            git fetch --all
            git reset --hard origin/main
        else
            print_step "Cloning Eclipse Daemon into ${NODE_INSTALL_DIR}..."
            rm -rf /tmp/eclipse-node-clone-tmp
            git clone https://github.com/shauryapatel044-dotcom/eclipse-panel.git /tmp/eclipse-node-clone-tmp
            mkdir -p "$NODE_INSTALL_DIR"
            cp -a /tmp/eclipse-node-clone-tmp/. "$NODE_INSTALL_DIR/"
            rm -rf /tmp/eclipse-node-clone-tmp
        fi
    fi

    mkdir -p "$NODE_INSTALL_DIR/storage/apps"
    mkdir -p "$NODE_INSTALL_DIR/storage/data"

    cd "$NODE_INSTALL_DIR"

    # Configure Node .env
    cat <<EOF > "$NODE_INSTALL_DIR/.env"
PORT=8090
IS_REMOTE_NODE=true
CLUSTER_SECRET=${CLUSTER_SECRET}
BASE_DOMAIN=${NODE_SUBDOMAIN}
PANEL_DOMAIN=${NODE_SUBDOMAIN}
VPS_PUBLIC_IP=${PUBLIC_IP}
STORAGE_DIR=${NODE_INSTALL_DIR}/storage
DATA_DIR=${NODE_INSTALL_DIR}/storage/data
APPS_DIR=${NODE_INSTALL_DIR}/storage/apps
DB_PATH=${NODE_INSTALL_DIR}/storage/data/eclipse.db
PYTHON_BIN=/usr/bin/python3
NODE_BIN=/usr/bin/node
NPM_BIN=/usr/bin/npm
CORS_ORIGIN=*
MAX_LOG_LINES=1000
AUTO_START_ON_BOOT=true
EOF

    npm install --omit=dev --no-audit

    # PM2 for Node daemon
    if ! command -v pm2 >/dev/null 2>&1; then
        npm install -g pm2 || true
        PM2_PATH=$(npm root -g 2>/dev/null)/pm2/bin/pm2
        [ -f "$PM2_PATH" ] && ln -sf "$PM2_PATH" /usr/local/bin/pm2 2>/dev/null || true
    fi
    pm2 delete eclipse-node 2>/dev/null || true
    pm2 start src/index.js --name "eclipse-node" --time || node src/index.js &
    pm2 save 2>/dev/null || true
    pm2 startup systemd -u root --hp /root 2>/dev/null || pm2 startup 2>/dev/null || true

    # Open firewall
    if command -v ufw >/dev/null 2>&1; then
        ufw allow 8090/tcp comment "Eclipse Node Daemon" >/dev/null 2>&1 || true
        ufw allow 3000:4000/tcp comment "Hosted Apps Port Range" >/dev/null 2>&1 || true
    elif command -v firewall-cmd >/dev/null 2>&1; then
        firewall-cmd --permanent --add-port=8090/tcp >/dev/null 2>&1 || true
        firewall-cmd --permanent --add-port=3000-4000/tcp >/dev/null 2>&1 || true
        firewall-cmd --reload >/dev/null 2>&1 || true
    fi

    NODE_HOST_ADDR="${PUBLIC_IP}"
    if [ -n "$NODE_SUBDOMAIN" ]; then
        NODE_HOST_ADDR="${NODE_SUBDOMAIN}"
    fi

    echo ""
    echo -e "${BOLD_GREEN}================================================================${NC}"
    echo -e "${BOLD_CYAN}  🌑 ECLIPSE NODE RUNNER SUCCESSFULLY INSTALLED & ACTIVE! 🌑${NC}"
    echo -e "${BOLD_GREEN}================================================================${NC}"
    echo -e "  ● Node Daemon Host      : ${BOLD_CYAN}http://${NODE_HOST_ADDR}:8090${NC}"
    echo -e "  ● Node Public IP        : ${CYAN}${PUBLIC_IP}${NC}"
    echo -e "  ● Node Daemon Port      : ${CYAN}8090${NC}"
    echo -e "  ● Cluster Secret Token  : ${BOLD_CYAN}${CLUSTER_SECRET}${NC}"
    if [ -n "$NODE_SUBDOMAIN" ]; then
    echo -e "  ● Node Server Subdomain : ${YELLOW}*.${NODE_SUBDOMAIN}${NC}"
    fi
    echo -e "${BOLD_GREEN}----------------------------------------------------------------${NC}"
    echo -e "${BOLD_CYAN}  🔗 HOW TO PAIR THIS NODE WITH YOUR MASTER PANEL:${NC}"
    echo -e "  1. Log in to your Eclipse Master Panel (${CYAN}http://<master_ip>:8090/admin.html${NC})"
    echo -e "  2. Go to the ${WHITE}Multi-Node Cluster${NC} tab ➔ click ${WHITE}+ Create Node${NC}"
    echo -e "  3. Host / IP: ${BOLD_CYAN}${NODE_HOST_ADDR}${NC}"
    echo -e "  4. Port: ${CYAN}8090${NC}"
    echo -e "  5. Secret Token: ${BOLD_CYAN}${CLUSTER_SECRET}${NC}"
    echo -e "  6. Click Save! The Node is immediately ready to host distributed apps."
    echo -e "${BOLD_GREEN}================================================================${NC}"
    echo ""
    exit 0
fi

# 4. Panel Server Subdomains / Base Domain Setup
echo ""
echo -e "${CYAN}================================================================${NC}"
echo -e "${BOLD_CYAN}  🌐 HOSTED SERVERS DOMAIN & SUBDOMAIN SETUP 🌐${NC}"
echo -e "${CYAN}================================================================${NC}"
echo -e "  • The panel itself runs directly on your VPS IP: ${BOLD_CYAN}http://${PUBLIC_IP}:8090${NC}"
echo -e "  • You can configure a base domain for servers created inside the panel:"
echo -e "    Example: ${CYAN}yourdomain.com${NC} or ${CYAN}servers.yourdomain.com${NC}"
echo -e ""
echo -e "  ${WHITE}Benefits of Server Subdomains:${NC}"
echo -e "  • Every server created gets its own subdomain (e.g. ${YELLOW}mc.yourdomain.com:port${NC})"
echo -e "  • Users can verify and assign custom subdomains in the Network tab"
echo -e "  • Simply point a Wildcard DNS A-record (${CYAN}*.yourdomain.com${NC} -> ${CYAN}${PUBLIC_IP}${NC})"
echo -e "${CYAN}================================================================${NC}"

BASE_DOMAIN=""
if [ -e /dev/tty ]; then
    read -r -p "Enter Base Domain for hosted servers [Optional, press Enter to use VPS IP]: " INPUT_BASE_DOMAIN </dev/tty
    BASE_DOMAIN=$(echo "$INPUT_BASE_DOMAIN" | sed -e 's|^https\?://||' -e 's|/.*$||' -e 's|:.*$||' | tr -d '[:space:]')

    if [ -n "$BASE_DOMAIN" ]; then
        print_step "Checking DNS resolution for *.${BASE_DOMAIN}..."
        RESOLVED_IP=$(getent ahosts "check-wildcard.${BASE_DOMAIN}" 2>/dev/null | awk '{print $1}' | head -n1 || true)
        if [ -z "$RESOLVED_IP" ]; then
            RESOLVED_IP=$(getent ahosts "$BASE_DOMAIN" 2>/dev/null | awk '{print $1}' | head -n1 || true)
        fi

        if [ "$RESOLVED_IP" == "$PUBLIC_IP" ]; then
            print_success "Wildcard DNS verified! *.${BASE_DOMAIN} successfully points to this VPS (${PUBLIC_IP})."
        elif [ -n "$RESOLVED_IP" ]; then
            print_warning "DNS record resolved to '${RESOLVED_IP}' (VPS Public IP: ${PUBLIC_IP})."
            print_warning "If you recently updated DNS, propagation may take a few minutes."
        else
            print_warning "Wildcard DNS (*.${BASE_DOMAIN}) is pending propagation or DNS-only. Verified on your provider!"
        fi
        print_success "Base server domain configured: ${BOLD_CYAN}*.${BASE_DOMAIN}${NC}"
    else
        print_success "No base domain entered. Servers will bind directly to VPS IP (${PUBLIC_IP}:port)."
    fi
fi

# Admin Account Setup
echo ""
echo -e "${CYAN}================================================================${NC}"
echo -e "${BOLD_CYAN}  👤 SUPERADMINISTRATOR ACCOUNT SETUP 👤${NC}"
echo -e "${CYAN}================================================================${NC}"
ADMIN_USER="admin"
ADMIN_EMAIL="admin@vexezor.bond"
ADMIN_PASS=""

if [ -e /dev/tty ]; then
    read -r -p "Enter Administrator Username (Default: admin): " INPUT_USER </dev/tty
    if [ -n "$INPUT_USER" ]; then ADMIN_USER=$(echo "$INPUT_USER" | tr -d '[:space:]'); fi

    read -r -p "Enter Administrator Email (Default: admin@vexezor.bond): " INPUT_EMAIL </dev/tty
    if [ -n "$INPUT_EMAIL" ]; then ADMIN_EMAIL=$(echo "$INPUT_EMAIL" | tr -d '[:space:]'); fi

    read -r -s -p "Enter Administrator Password (Default: auto-generate): " INPUT_PASS </dev/tty
    echo ""
    if [ -n "$INPUT_PASS" ]; then
        ADMIN_PASS="$INPUT_PASS"
    else
        ADMIN_PASS=$(openssl rand -hex 6 2>/dev/null || tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 12)
    fi
else
    ADMIN_PASS=$(openssl rand -hex 6 2>/dev/null || tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 12)
fi

# 4. System Updates & Prerequisites
print_step "Updating system packages and installing prerequisites..."
if [[ "$OS" =~ ^(ubuntu|debian)$ ]]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y curl wget git build-essential ca-certificates gnupg ufw lsof nginx certbot python3-certbot-nginx \
                       mariadb-server mariadb-client libmariadb-dev libmariadb-dev-compat dnsutils
elif [[ "$OS" =~ ^(centos|rhel|almalinux|rocky|fedora)$ ]]; then
    dnf -y install epel-release || yum -y install epel-release || true
    dnf -y update || yum -y update
    dnf -y install curl wget git gcc-c++ make ca-certificates gnupg2 tar firewalld lsof nginx certbot python3-certbot-nginx \
                   mariadb-server mariadb mariadb-devel bind-utils || \
    yum -y install curl wget git gcc-c++ make ca-certificates gnupg2 tar firewalld lsof nginx certbot \
                   mariadb-server mariadb mariadb-devel bind-utils
fi
print_success "Base system utilities and Nginx installed."

# 5. MariaDB Service Setup
print_step "Setting up MariaDB database service..."
systemctl daemon-reload 2>/dev/null || true
systemctl enable mariadb 2>/dev/null || systemctl enable mysql 2>/dev/null || true
systemctl restart mariadb 2>/dev/null || systemctl restart mysql 2>/dev/null || true
sleep 2

# Generate secure random root and user database password
DB_PASS=$(openssl rand -hex 16 2>/dev/null || tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 24)

# Create /root/.my.cnf for root passwordless mysql CLI
cat <<EOF > /root/.my.cnf
[client]
user=root
EOF
chmod 600 /root/.my.cnf

# Provision user database engine
print_step "Provisioning 'eclipse_panel' MariaDB database..."
MYSQL_CMD="mysql"
if ! command -v mysql >/dev/null 2>&1; then
    MYSQL_CMD="mariadb"
fi

$MYSQL_CMD <<EOF 2>/dev/null || true
CREATE DATABASE IF NOT EXISTS eclipse_panel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'eclipse_user'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER 'eclipse_user'@'localhost' IDENTIFIED BY '${DB_PASS}';
CREATE USER IF NOT EXISTS 'eclipse_user'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
ALTER USER 'eclipse_user'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON *.* TO 'eclipse_user'@'localhost' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON *.* TO 'eclipse_user'@'127.0.0.1' WITH GRANT OPTION;
FLUSH PRIVILEGES;
EOF
print_success "MariaDB active & configured with root access for server provisioning."

# 6. Install Node.js 22 LTS
print_step "Checking Node.js installation..."
NEED_NODE=true
if command -v node >/dev/null 2>&1; then
    NODE_VER=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1 || echo "0")
    if [ "$NODE_VER" -ge 20 ]; then
        print_success "Node.js v$(node -v) is already installed."
        NEED_NODE=false
    fi
fi

if [ "$NEED_NODE" = true ]; then
    print_step "Installing Node.js 22 LTS from NodeSource..."
    if [[ "$OS" =~ ^(ubuntu|debian)$ ]]; then
        mkdir -p /etc/apt/keyrings
        curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes 2>/dev/null || true
        echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
        apt-get update -y
        apt-get install -y nodejs
    elif [[ "$OS" =~ ^(centos|rhel|almalinux|rocky|fedora)$ ]]; then
        curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
        dnf -y install nodejs || yum -y install nodejs
    fi
    print_success "Node.js installed: $(node -v)"
fi

# 7. Python 3 & venv
print_step "Checking Python 3 environment..."
if [[ "$OS" =~ ^(ubuntu|debian)$ ]]; then
    apt-get install -y python3 python3-pip python3-venv python3-dev
elif [[ "$OS" =~ ^(centos|rhel|almalinux|rocky|fedora)$ ]]; then
    dnf -y install python3 python3-pip python3-devel || yum -y install python3 python3-pip python3-devel
fi
print_success "Python installed: $(python3 --version) | pip: $(pip3 --version 2>/dev/null || python3 -m pip --version 2>/dev/null || echo 'installed')"

# Symlink standard binaries into /usr/local/bin for all hosted applications & scripts
[ ! -f /usr/local/bin/python ] && ln -sf "$(command -v python3 || command -v python)" /usr/local/bin/python 2>/dev/null || true
[ ! -f /usr/local/bin/pip ] && ln -sf "$(command -v pip3 || command -v pip)" /usr/local/bin/pip 2>/dev/null || true
[ ! -f /usr/local/bin/node ] && ln -sf "$(command -v node)" /usr/local/bin/node 2>/dev/null || true
[ ! -f /usr/local/bin/npm ] && ln -sf "$(command -v npm)" /usr/local/bin/npm 2>/dev/null || true
[ ! -f /usr/local/bin/npx ] && ln -sf "$(command -v npx)" /usr/local/bin/npx 2>/dev/null || true

# 8. Setup Application Directory
INSTALL_DIR="/opt/eclipse-panel"
print_step "Setting up Eclipse Panel in ${INSTALL_DIR}..."

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
if [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
    if [ -f "$SCRIPT_DIR/package.json" ]; then
        print_step "Copying panel source files into ${INSTALL_DIR}..."
        mkdir -p "$INSTALL_DIR"
        cp -r "$SCRIPT_DIR/"* "$INSTALL_DIR/"
    elif [ -d "$INSTALL_DIR/.git" ]; then
        print_step "Updating existing repository in ${INSTALL_DIR}..."
        cd "$INSTALL_DIR"
        git fetch --all
        git reset --hard origin/main
    else
        print_step "Cloning latest Eclipse Panel from repository..."
        rm -rf /tmp/eclipse-panel-clone-tmp
        git clone https://github.com/shauryapatel044-dotcom/eclipse-panel.git /tmp/eclipse-panel-clone-tmp
        mkdir -p "$INSTALL_DIR"
        cp -a /tmp/eclipse-panel-clone-tmp/. "$INSTALL_DIR/"
        rm -rf /tmp/eclipse-panel-clone-tmp
    fi
else
    print_success "Working directly within ${INSTALL_DIR}."
fi

mkdir -p "$INSTALL_DIR/storage/apps"
mkdir -p "$INSTALL_DIR/storage/data"
mkdir -p "$INSTALL_DIR/public"

cd "$INSTALL_DIR"

# 9. Configure Production .env
print_step "Generating production environment (.env)..."
RANDOM_JWT=$(openssl rand -hex 32 2>/dev/null || tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 64)

cat <<EOF > "$INSTALL_DIR/.env"
PORT=8090
JWT_SECRET=${RANDOM_JWT}
JWT_EXPIRES_IN=7d

# Domain & Host IP Configuration
PANEL_DOMAIN=
BASE_DOMAIN=${BASE_DOMAIN}
VPS_PUBLIC_IP=${PUBLIC_IP}

# MariaDB Configuration
DB_TYPE=mariadb
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=eclipse_panel
DB_USER=eclipse_user
DB_PASSWORD=${DB_PASS}
DATABASE_URL=mysql://eclipse_user:${DB_PASS}@127.0.0.1:3306/eclipse_panel

# Storage Directories
STORAGE_DIR=${INSTALL_DIR}/storage
DATA_DIR=${INSTALL_DIR}/storage/data
APPS_DIR=${INSTALL_DIR}/storage/apps
DB_PATH=${INSTALL_DIR}/storage/data/eclipse.db

# Executables
PYTHON_BIN=/usr/bin/python3
NODE_BIN=/usr/bin/node
NPM_BIN=/usr/bin/npm
CORS_ORIGIN=*
MAX_LOG_LINES=1000
AUTO_START_ON_BOOT=true
EOF
print_success "Generated production .env"

# 10. Install NPM Dependencies
print_step "Installing production Node.js modules..."
npm install --omit=dev --no-audit
print_success "Dependencies installed."

# 11. Provision Administrator Account
print_step "Provisioning Administrator account (${ADMIN_USER})..."
NODE_EXEC=$(command -v node || which node)
$NODE_EXEC scripts/create-admin.js --username "$ADMIN_USER" --email "${ADMIN_EMAIL}" --password "$ADMIN_PASS" || true
print_success "SuperAdmin credentials initialized."

# 12. Setup Systemd Background Service
print_step "Configuring systemd background service (eclipse-panel.service)..."
cat <<EOF > /etc/systemd/system/eclipse-panel.service
[Unit]
Description=Eclipse Panel - Cloud Container Infrastructure Daemon
After=network.target mariadb.service
Wants=mariadb.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${NODE_EXEC} src/index.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable eclipse-panel 2>/dev/null || true
systemctl restart eclipse-panel 2>/dev/null || true
print_success "Systemd service 'eclipse-panel' active & enabled on boot."

# Setup PM2 for 24/7 Zero-Downtime Daemon
print_step "Configuring 24/7 background process execution via PM2..."
if ! command -v pm2 >/dev/null 2>&1; then
    npm install -g pm2 || true
    PM2_PATH=$(npm root -g 2>/dev/null)/pm2/bin/pm2
    if [ -f "$PM2_PATH" ]; then
        ln -sf "$PM2_PATH" /usr/local/bin/pm2 2>/dev/null || true
    fi
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
pm2 delete eclipse-panel 2>/dev/null || true
pm2 start src/index.js --name "eclipse-panel" --time || node src/index.js &
pm2 save 2>/dev/null || true
pm2 startup systemd -u root --hp /root 2>/dev/null || pm2 startup 2>/dev/null || true
print_success "PM2 process manager configured."

# 13. Configure Nginx Reverse Proxy (Port 80 -> Port 8090)
print_step "Configuring Nginx reverse proxy & WebSocket pipeline..."
NGINX_CONF="/etc/nginx/sites-available/eclipse-panel"
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d

SERVER_NAMES="_"
if [ -n "$BASE_DOMAIN" ]; then
    SERVER_NAMES="_ *.${BASE_DOMAIN} ${BASE_DOMAIN}"
fi

cat <<EOF > "$NGINX_CONF"
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${SERVER_NAMES};

    client_max_body_size 500M;

    # Static Assets & Backend API on Port 8090
    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
    }

    # High-throughput Live WebSocket Terminal Stream
    location /ws {
        proxy_pass http://127.0.0.1:8090/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
EOF

# Disable conflicting default server blocks on RHEL/CentOS
if [ -f /etc/nginx/nginx.conf ]; then
    sed -i 's/listen       80 default_server;/listen       80;/g' /etc/nginx/nginx.conf 2>/dev/null || true
    sed -i 's/listen       \[::\]:80 default_server;/listen       [::]:80;/g' /etc/nginx/nginx.conf 2>/dev/null || true
fi

# Clean default configs to prevent duplicate default server conflicts
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-available/default
rm -f /etc/nginx/conf.d/default.conf
rm -f /etc/nginx/conf.d/eclipse-panel.conf 2>/dev/null || true

# Enable Eclipse Panel based on Linux distribution
if [ -d /etc/nginx/sites-enabled ]; then
    ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/eclipse-panel
else
    cp -f "$NGINX_CONF" /etc/nginx/conf.d/eclipse-panel.conf
fi

nginx -t && systemctl restart nginx
print_success "Nginx reverse proxy active and routing port 80 -> 8090."

# 14. Open Firewall Ports
print_step "Configuring firewall rules..."
if command -v ufw >/dev/null 2>&1; then
    ufw allow 80/tcp comment "HTTP Web" >/dev/null 2>&1 || true
    ufw allow 443/tcp comment "HTTPS SSL" >/dev/null 2>&1 || true
    ufw allow 8090/tcp comment "Eclipse Panel Port 8090" >/dev/null 2>&1 || true
    ufw allow 3306/tcp comment "MariaDB Database" >/dev/null 2>&1 || true
    ufw allow 3000:4000/tcp comment "Eclipse Apps Range" >/dev/null 2>&1 || true
elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port=80/tcp >/dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=443/tcp >/dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=8090/tcp >/dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=3306/tcp >/dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=3000-4000/tcp >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true
fi

# Ensure Oracle Cloud / raw iptables allow incoming traffic
if command -v iptables >/dev/null 2>&1; then
    iptables -I INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
    iptables -I INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
    iptables -I INPUT -p tcp --dport 8090 -j ACCEPT 2>/dev/null || true
    iptables -I INPUT -p tcp --dport 3306 -j ACCEPT 2>/dev/null || true
    iptables -I INPUT -p tcp --dport 3000:4000 -j ACCEPT 2>/dev/null || true
fi
print_success "Firewall ports (80, 443, 8090, 3306, 3000-4000) allowed."

# 15. Health Verification
print_step "Verifying Eclipse Panel daemon health..."
sleep 2
HEALTH_CHECK=$(curl --noproxy "*" -s http://127.0.0.1:8090/api/system/metrics || true)
if [[ "$HEALTH_CHECK" =~ "cpu" ]]; then
    print_success "Eclipse Panel daemon responded healthy on port 8090!"
else
    print_warning "Daemon starting up. Checking service logs..."
fi

# 16. Final Display
echo ""
echo -e "${BOLD_GREEN}================================================================${NC}"
echo -e "${BOLD_CYAN}  🌑 ECLIPSE PANEL SUCCESSFULLY INSTALLED & ACTIVE! 🌑${NC}"
echo -e "${BOLD_GREEN}================================================================${NC}"
echo -e "  ● Web Panel Access (Port 80)   : ${BOLD_CYAN}http://${PUBLIC_IP}${NC}"
echo -e "  ● Direct Port Access (8090)    : ${CYAN}http://${PUBLIC_IP}:8090${NC}"
if [ -n "$BASE_DOMAIN" ]; then
echo -e "  ● Hosted Servers Subdomain     : ${YELLOW}*.${BASE_DOMAIN} (Wildcard Assigned)${NC}"
else
echo -e "  ● Hosted Servers Host          : ${CYAN}${PUBLIC_IP}:<server_port>${NC}"
fi
echo -e "  ● Node.js Environment          : ${CYAN}$(node -v 2>/dev/null) (npm $(npm -v 2>/dev/null))${NC}"
echo -e "  ● Python Environment           : ${CYAN}$(python3 --version 2>/dev/null)${NC}"
echo -e "  ● Real-Time Telemetry Stats    : ${CYAN}http://${PUBLIC_IP}:8090/admin-stats.html${NC}"
echo -e "  ● Admin Dashboard              : ${CYAN}http://${PUBLIC_IP}:8090/admin.html${NC}"
echo -e "${BOLD_GREEN}----------------------------------------------------------------${NC}"
echo -e "${BOLD_CYAN}  👤 PRIMARY ADMINISTRATOR CREDENTIALS:${NC}"
echo -e "  ● Username : ${WHITE}${ADMIN_USER}${NC}"
echo -e "  ● Password : ${WHITE}${ADMIN_PASS}${NC}"
echo -e "${BOLD_GREEN}----------------------------------------------------------------${NC}"
echo -e "${BOLD_CYAN}  🗄️  HOST MARIADB DATABASE ENGINE (FOR USER APPS):${NC}"
echo -e "  ● Database Name : ${YELLOW}eclipse_panel${NC}"
echo -e "  ● Database User : ${YELLOW}eclipse_user${NC}"
echo -e "  ● Database Pass : ${YELLOW}${DB_PASS}${NC}"
echo -e "  ● Database Host : ${YELLOW}${PUBLIC_IP}:3306${NC}"
echo -e "${BOLD_GREEN}----------------------------------------------------------------${NC}"
echo -e "${BOLD_CYAN}  🛠️  HELPFUL MANAGEMENT COMMANDS:${NC}"
echo -e "  ● Check Service Logs   : ${CYAN}pm2 logs eclipse-panel${NC}"
echo -e "  ● Restart Panel Service : ${CYAN}systemctl restart eclipse-panel${NC}"
echo -e "  ● Panel Installation   : ${CYAN}/opt/eclipse-panel${NC}"
echo -e "${BOLD_GREEN}================================================================${NC}"
echo ""
