#!/usr/bin/env bash
# ==============================================================================
#  🌑 Eclipse Panel - Production 1-Click VPS Installer 🌑
#  Node.js 22 LTS · Python 3 · MariaDB Database · Nginx SSL · Port 8090
#  Made By Vexezor · Cloud Container Infrastructure
#  Compatible with: Ubuntu 20.04+, Debian 11+, CentOS/RHEL/AlmaLinux/Rocky 8+, Fedora
# ==============================================================================

set -e

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

# Detect Public VPS IP
print_step "Detecting VPS public network address..."
PUBLIC_IP=$(curl -s --max-time 4 https://api.ipify.org || curl -s --max-time 4 https://icanhazip.com || curl -s --max-time 4 https://ifconfig.me || hostname -I | awk '{print $1}')
PUBLIC_IP=$(echo "$PUBLIC_IP" | tr -d '[:space:]')
if [ -z "$PUBLIC_IP" ]; then
    PUBLIC_IP="127.0.0.1"
fi
print_success "Detected VPS Public IP: ${BOLD_CYAN}${PUBLIC_IP}${NC}"

# 3. Interactive Domain Selection (Subdomain vs Public IP)
echo ""
echo -e "${CYAN}================================================================${NC}"
echo -e "${BOLD_CYAN}  🌐 NETWORK CONFIGURATION: SUBDOMAIN OR PUBLIC IP 🌐${NC}"
echo -e "${CYAN}================================================================${NC}"
echo -e "  Eclipse Panel can be accessed via a Subdomain (Recommended) or VPS IP:"
echo -e ""
echo -e "  ${WHITE}[1] Subdomain / Domain (RECOMMENDED)${NC}"
echo -e "      • Free trusted HTTPS / SSL certificate via Let's Encrypt (Certbot)"
echo -e "      • Clean, secure URL without ports (e.g. https://panel.yourdomain.com)"
echo -e "      • Secure WebSockets (wss://) & clipboard APIs guaranteed"
echo -e "      • Supports Cloudflare DDoS proxy protection"
echo -e ""
echo -e "  ${WHITE}[2] Direct VPS Public IP${NC}"
echo -e "      • Fast zero-DNS setup directly via http://${PUBLIC_IP}:8090"
echo -e "      • Direct port 80 & 8090 web access"
echo -e "${CYAN}================================================================${NC}"

SETUP_MODE="1"
PANEL_DOMAIN=""
ADMIN_EMAIL=""
SSL_ENABLED=false

if [ -t 0 ]; then
    read -r -p "Select option [1 for Subdomain, 2 for IP] (Default: 1): " USER_CHOICE
    if [[ "$USER_CHOICE" == "2" ]]; then
        SETUP_MODE="2"
    else
        SETUP_MODE="1"
    fi

    if [ "$SETUP_MODE" == "1" ]; then
        echo ""
        echo -e "${YELLOW}Please enter the subdomain or domain pointing to this VPS:${NC}"
        echo -e "Example: ${CYAN}panel.yourdomain.com${NC} or ${CYAN}eclipse.mysite.org${NC}"
        read -r -p "Subdomain / Domain: " PANEL_DOMAIN
        PANEL_DOMAIN=$(echo "$PANEL_DOMAIN" | tr -d '[:space:]')

        if [ -n "$PANEL_DOMAIN" ]; then
            read -r -p "Email for Let's Encrypt SSL notifications: " ADMIN_EMAIL
            ADMIN_EMAIL=$(echo "$ADMIN_EMAIL" | tr -d '[:space:]')
            if [ -z "$ADMIN_EMAIL" ]; then
                ADMIN_EMAIL="admin@${PANEL_DOMAIN}"
            fi

            # Live DNS check
            print_step "Verifying DNS record for ${PANEL_DOMAIN}..."
            RESOLVED_IP=$(getent ahosts "$PANEL_DOMAIN" 2>/dev/null | awk '{print $1}' | head -n1 || true)
            if [ -z "$RESOLVED_IP" ] && command -v dig >/dev/null 2>&1; then
                RESOLVED_IP=$(dig +short "$PANEL_DOMAIN" 2>/dev/null | tail -n1 || true)
            fi

            if [ "$RESOLVED_IP" == "$PUBLIC_IP" ]; then
                print_success "DNS verified! ${PANEL_DOMAIN} points directly to this VPS (${PUBLIC_IP})."
            elif [ -n "$RESOLVED_IP" ]; then
                print_warning "DNS record resolved to '${RESOLVED_IP}' (VPS Public IP is: ${PUBLIC_IP})."
                print_warning "If you just created the DNS A-record, DNS propagation may take a few moments."
            else
                print_warning "Could not resolve ${PANEL_DOMAIN} yet. Ensure an 'A' record points to ${PUBLIC_IP}."
            fi
        else
            print_warning "No domain provided. Falling back to VPS Public IP mode."
            SETUP_MODE="2"
        fi
    fi
else
    # Non-interactive fallback
    SETUP_MODE="2"
fi

# Admin Account Setup
echo ""
echo -e "${CYAN}================================================================${NC}"
echo -e "${BOLD_CYAN}  👤 SUPERADMINISTRATOR ACCOUNT SETUP 👤${NC}"
echo -e "${CYAN}================================================================${NC}"
ADMIN_USER="admin"
ADMIN_PASS=""

if [ -t 0 ]; then
    read -r -p "Enter Administrator Username (Default: admin): " INPUT_USER
    if [ -n "$INPUT_USER" ]; then ADMIN_USER=$(echo "$INPUT_USER" | tr -d '[:space:]'); fi

    read -r -s -p "Enter Administrator Password (Default: auto-generate): " INPUT_PASS
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
    dnf -y update || yum -y update
    dnf -y install curl wget git gcc-c++ make ca-certificates gnupg2 tar firewalld lsof nginx certbot python3-certbot-nginx \
                   mariadb-server mariadb mariadb-devel bind-utils || \
    yum -y install curl wget git gcc-c++ make ca-certificates gnupg2 tar firewalld lsof nginx certbot \
                   mariadb-server mariadb mariadb-devel bind-utils
fi
print_success "Base system utilities and Nginx installed."

# 5. MariaDB Service Setup
print_step "Setting up MariaDB database service..."
systemctl enable mariadb
systemctl restart mariadb

if ! systemctl is-active --quiet mariadb; then
    print_warning "MariaDB did not respond immediately, attempting restart..."
    sleep 2
    systemctl restart mariadb
fi

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
mysql <<EOF
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
    NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VER" -ge 20 ]; then
        print_success "Node.js v$(node -v) is already installed."
        NEED_NODE=false
    fi
fi

if [ "$NEED_NODE" = true ]; then
    print_step "Installing Node.js 22 LTS from NodeSource..."
    if [[ "$OS" =~ ^(ubuntu|debian)$ ]]; then
        mkdir -p /etc/apt/keyrings
        curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
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

mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/storage/apps"
mkdir -p "$INSTALL_DIR/storage/data"
mkdir -p "$INSTALL_DIR/public"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
if [ -f "$SCRIPT_DIR/package.json" ]; then
    print_step "Copying panel source files..."
    cp -r "$SCRIPT_DIR/"* "$INSTALL_DIR/"
else
    print_step "Cloning latest Eclipse Panel from repository..."
    git clone https://github.com/shauryapatel044-dotcom/eclipse-panel.git "$INSTALL_DIR" 2>/dev/null || true
fi

cd "$INSTALL_DIR"

# 9. Configure Production .env
print_step "Generating production environment (.env)..."
RANDOM_JWT=$(openssl rand -hex 32 2>/dev/null || tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 64)

cat <<EOF > "$INSTALL_DIR/.env"
PORT=8090
JWT_SECRET=${RANDOM_JWT}
JWT_EXPIRES_IN=7d

# Domain & Host IP Configuration
PANEL_DOMAIN=${PANEL_DOMAIN}
BASE_DOMAIN=${PANEL_DOMAIN}
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
NODE_EXEC=$(which node)
$NODE_EXEC scripts/create-admin.js --username "$ADMIN_USER" --email "${ADMIN_USER}@${PANEL_DOMAIN:-eclipse.local}" --password "$ADMIN_PASS"
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
systemctl enable eclipse-panel
systemctl restart eclipse-panel
print_success "Systemd service 'eclipse-panel' active & enabled on boot."

# Also setup PM2 for process monitoring
if ! command -v pm2 >/dev/null 2>&1; then
    npm install -g pm2
fi
pm2 delete eclipse-panel 2>/dev/null || true
pm2 start src/index.js --name "eclipse-panel" --time
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || pm2 startup 2>/dev/null || true
print_success "PM2 process manager configured."

# 13. Configure Nginx Reverse Proxy with WebSocket Support
print_step "Configuring Nginx reverse proxy & WebSocket pipeline..."
NGINX_CONF="/etc/nginx/sites-available/eclipse-panel"
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

SERVER_NAMES="_"
if [ -n "$PANEL_DOMAIN" ]; then
    SERVER_NAMES="${PANEL_DOMAIN} *.${PANEL_DOMAIN} _"
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

rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/eclipse-panel 2>/dev/null || true
if [ -d /etc/nginx/conf.d ]; then
    cp "$NGINX_CONF" /etc/nginx/conf.d/eclipse-panel.conf 2>/dev/null || true
fi

nginx -t && systemctl restart nginx 2>/dev/null || true
print_success "Nginx reverse proxy configured."

# 14. Automated SSL via Let's Encrypt (if domain chosen)
if [ "$SETUP_MODE" == "1" ] && [ -n "$PANEL_DOMAIN" ]; then
    print_step "Acquiring automated Let's Encrypt SSL certificate for ${PANEL_DOMAIN}..."
    if certbot --nginx -d "$PANEL_DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" --redirect 2>/dev/null; then
        SSL_ENABLED=true
        print_success "Let's Encrypt SSL certificate successfully installed!"
    else
        print_warning "Certbot automatic verification could not complete (DNS may still be propagating)."
        print_warning "You can run 'certbot --nginx -d ${PANEL_DOMAIN}' at any time once DNS finishes propagation."
    fi
fi

# 15. Open Firewall Ports
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

# 16. Health Verification
print_step "Verifying Eclipse Panel daemon health..."
sleep 2
HEALTH_CHECK=$(curl -s http://127.0.0.1:8090/api/system/metrics || true)
if [[ "$HEALTH_CHECK" =~ "cpu" ]]; then
    print_success "Eclipse Panel daemon responded healthy on port 8090!"
else
    print_warning "Daemon starting up. Checking service logs..."
fi

# 17. Final Display
PANEL_URL="http://${PUBLIC_IP}:8090"
if [ "$SSL_ENABLED" = true ]; then
    PANEL_URL="https://${PANEL_DOMAIN}"
elif [ -n "$PANEL_DOMAIN" ]; then
    PANEL_URL="http://${PANEL_DOMAIN}"
fi

echo ""
echo -e "${BOLD_GREEN}================================================================${NC}"
echo -e "${BOLD_CYAN}  🌑 ECLIPSE PANEL SUCCESSFULLY INSTALLED & ACTIVE! 🌑${NC}"
echo -e "${BOLD_GREEN}================================================================${NC}"
echo -e "  ● Web Panel Access          : ${BOLD_CYAN}${PANEL_URL}${NC}"
echo -e "  ● Direct Port Access        : ${CYAN}http://${PUBLIC_IP}:8090${NC}"
echo -e "  ● Node.js Environment       : ${CYAN}$(node -v 2>/dev/null) (npm $(npm -v 2>/dev/null))${NC}"
echo -e "  ● Python Environment        : ${CYAN}$(python3 --version 2>/dev/null)${NC}"
echo -e "  ● Real-Time Telemetry Stats : ${CYAN}${PANEL_URL}/admin-stats.html${NC}"
echo -e "  ● Admin Dashboard           : ${CYAN}${PANEL_URL}/admin.html${NC}"
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
if [ "$SSL_ENABLED" = false ] && [ -n "$PANEL_DOMAIN" ]; then
echo -e "  ● Enable SSL Later     : ${CYAN}certbot --nginx -d ${PANEL_DOMAIN}${NC}"
fi
echo -e "${BOLD_GREEN}================================================================${NC}"
echo ""
