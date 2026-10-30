#!/usr/bin/env bash
# ==============================================================================
#  🌑 Eclipse Panel - 1-Click Automated VPS Installer (Port 8090 + MariaDB) 🌑
#  Installs Node.js 22, Python 3 + venv, MariaDB Database, Daemon & Dashboard
#  Compatible with: Ubuntu 20.04+, Debian 11+, CentOS/RHEL/AlmaLinux 8+, Fedora
# ==============================================================================

set -e

# ANSI Color Codes
RED='\033[0;31m'
BOLD_RED='\033[1;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

print_banner() {
    clear
    echo -e "${BOLD_RED}"
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
    echo -e "      ${PURPLE}🌑 Python & Node.js Hosting Daemon + MariaDB (Port 8090) 🌑${NC}"
    echo -e "${CYAN}================================================================${NC}"
    echo ""
}

print_step() {
    echo -e "\n${BOLD_RED}[+] $1${NC}"
}

print_success() {
    echo -e "${GREEN}[✔] $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[!] $1${NC}"
}

print_error() {
    echo -e "${RED}[✘] $1${NC}"
}

# 1. Check Root Privileges
if [ "$(id -u)" -ne 0 ]; then
    print_error "This installer must be run as root. Please run with 'sudo bash install.sh'"
    exit 1
fi

print_banner

# 2. Detect Package Manager & Distro
print_step "Detecting operating system..."
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
    echo -e "Detected OS: ${CYAN}$NAME ($VERSION)${NC}"
else
    print_error "Cannot detect operating system distribution."
    exit 1
fi

# 3. Update repositories and install base utilities
print_step "Updating system packages and installing prerequisites..."
if [[ "$OS" =~ ^(ubuntu|debian)$ ]]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y curl wget git build-essential ca-certificates gnupg ufw lsof nginx \
                       mariadb-server mariadb-client libmariadb-dev libmariadb-dev-compat
elif [[ "$OS" =~ ^(centos|rhel|almalinux|rocky|fedora)$ ]]; then
    dnf -y update || yum -y update
    dnf -y install curl wget git gcc-c++ make ca-certificates gnupg2 tar firewalld lsof nginx \
                   mariadb-server mariadb mariadb-devel || \
    yum -y install curl wget git gcc-c++ make ca-certificates gnupg2 tar firewalld lsof nginx \
                   mariadb-server mariadb mariadb-devel
fi

# 4. Install & Configure MariaDB Database Engine
print_step "Configuring and securing MariaDB database service..."
systemctl enable mariadb
systemctl restart mariadb

# Verify MariaDB is running
if ! systemctl is-active --quiet mariadb; then
    print_error "MariaDB failed to start. Attempting rescue..."
    systemctl status mariadb --no-pager || true
    systemctl restart mariadb
fi

# Generate random secure database password
DB_PASS=$(openssl rand -hex 16 2>/dev/null || tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 24)

# Determine root mysql command
MYSQL_ROOT="mysql -u root"
if ! $MYSQL_ROOT -e "SELECT 1;" >/dev/null 2>&1; then
    if [ -f /root/.my.cnf ]; then
        MYSQL_ROOT="mysql --defaults-file=/root/.my.cnf"
    fi
fi

# Provision eclipse_panel database and eclipse_user
print_step "Creating 'eclipse_panel' database and provisioning user..."
$MYSQL_ROOT <<EOF
CREATE DATABASE IF NOT EXISTS eclipse_panel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'eclipse_user'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER 'eclipse_user'@'localhost' IDENTIFIED BY '${DB_PASS}';
CREATE USER IF NOT EXISTS 'eclipse_user'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
ALTER USER 'eclipse_user'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON eclipse_panel.* TO 'eclipse_user'@'localhost';
GRANT ALL PRIVILEGES ON eclipse_panel.* TO 'eclipse_user'@'127.0.0.1';
FLUSH PRIVILEGES;
EOF

# Ensure /root/.my.cnf exists for passwordless root mysql CLI
if [ ! -f /root/.my.cnf ]; then
    cat <<EOF > /root/.my.cnf
[client]
user=root
EOF
    chmod 600 /root/.my.cnf
fi

print_success "MariaDB active & provisioned with database 'eclipse_panel'!"

# 5. Install Node.js (v22 LTS or newer)
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
    print_step "Installing Node.js 22 LTS..."
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

# 6. Install Python 3, pip & venv
print_step "Checking Python 3, pip, and venv..."
if [[ "$OS" =~ ^(ubuntu|debian)$ ]]; then
    apt-get install -y python3 python3-pip python3-venv python3-dev
elif [[ "$OS" =~ ^(centos|rhel|almalinux|rocky|fedora)$ ]]; then
    dnf -y install python3 python3-pip python3-devel || yum -y install python3 python3-pip python3-devel
fi
print_success "Python installed: $(python3 --version)"

# 7. Set up Installation Directory & Public Frontend
INSTALL_DIR="/opt/eclipse-panel"
print_step "Setting up Eclipse Panel in ${INSTALL_DIR}..."

mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/storage/apps"
mkdir -p "$INSTALL_DIR/storage/data"
mkdir -p "$INSTALL_DIR/public"

# Copy panel source files into /opt/eclipse-panel
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
if [ -f "$SCRIPT_DIR/package.json" ]; then
    print_step "Syncing panel files, daemon supervisor & frontend..."
    cp -r "$SCRIPT_DIR/"* "$INSTALL_DIR/"
else
    print_step "Downloading latest Eclipse Panel codebase..."
    git clone https://github.com/shauryapatel044-dotcom/eclipse-panel.git "$INSTALL_DIR" 2>/dev/null || true
fi

cd "$INSTALL_DIR"

# 8. Configure Environment (.env on Port 8090 + MariaDB)
print_step "Configuring production environment on Port 8090 with MariaDB..."
RANDOM_JWT=$(openssl rand -hex 32 2>/dev/null || tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 64)

cat <<EOF > "$INSTALL_DIR/.env"
PORT=8090
JWT_SECRET=${RANDOM_JWT}
JWT_EXPIRES_IN=7d

# Database Configuration (MariaDB VPS Database)
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
print_success "Generated .env with unique JWT secret and MariaDB credentials."

# 9. Install NPM Dependencies
print_step "Installing backend production dependencies (including mysql2)..."
npm install --omit=dev --no-audit

# 10. Setup Systemd Background Daemon
print_step "Configuring systemd background service (eclipse-panel.service)..."
NODE_PATH=$(which node)

cat <<EOF > /etc/systemd/system/eclipse-panel.service
[Unit]
Description=Eclipse Panel - Python & Node.js Hosting Daemon
After=network.target mariadb.service
Wants=mariadb.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${NODE_PATH} src/index.js
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

# 11. Configure Nginx Reverse Proxy with WebSocket Support (Port 80 -> Port 8090)
print_step "Configuring Nginx reverse proxy (Port 80 -> Port 8090 + WebSockets)..."
if command -v nginx >/dev/null 2>&1; then
    NGINX_CONF="/etc/nginx/sites-available/eclipse-panel"
    mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
    
    cat <<'EOF' > "$NGINX_CONF"
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 100M;

    # Backend API & Static Frontend on Port 8090
    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket Log & Telemetry Streaming
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

    if [ -d /etc/nginx/sites-enabled ]; then
        rm -f /etc/nginx/sites-enabled/default
        ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/eclipse-panel
    fi

    nginx -t && systemctl restart nginx || print_warning "Nginx test had warnings, panel is still running directly on port 8090."
fi

# 12. Open Firewall Ports (80 & 8090)
print_step "Opening firewall ports (80 & 8090)..."
if command -v ufw >/dev/null 2>&1; then
    ufw allow 80/tcp comment "HTTP Web" >/dev/null 2>&1 || true
    ufw allow 8090/tcp comment "Eclipse Panel Port 8090" >/dev/null 2>&1 || true
elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port=80/tcp >/dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=8090/tcp >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true
fi

# Detect Public IP
PUBLIC_IP=$(curl -s https://api.ipify.org || hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${BOLD_RED}  🌑 ECLIPSE PANEL & MARIADB SUCCESSFULLY INSTALLED! 🌑${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "  ● Web Dashboard (Port 8090) : ${CYAN}http://${PUBLIC_IP}:8090${NC}"
echo -e "  ● Web Dashboard (Port 80)   : ${CYAN}http://${PUBLIC_IP}${NC}"
echo -e "  ● Real-Time VPS Telemetry   : ${CYAN}http://${PUBLIC_IP}:8090/admin-stats.html${NC}"
echo -e "  ● Backend REST API          : ${CYAN}http://${PUBLIC_IP}:8090/api${NC}"
echo -e "  ● Live WebSocket Stream     : ${CYAN}ws://${PUBLIC_IP}:8090/ws${NC}"
echo -e "  ● Panel Service Status      : ${CYAN}systemctl status eclipse-panel${NC}"
echo -e "  ● MariaDB Service Status    : ${CYAN}systemctl status mariadb${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "${BOLD_RED}  🗄️  MARIADB DATABASE CREDENTIALS (FOR YOUR APPS):${NC}"
echo -e "  ● Database Name : ${YELLOW}eclipse_panel${NC}"
echo -e "  ● Database User : ${YELLOW}eclipse_user${NC}"
echo -e "  ● Database Pass : ${YELLOW}${DB_PASS}${NC}"
echo -e "  ● Database Host : ${YELLOW}127.0.0.1:3306${NC}"
echo -e "  ● Connection URI: ${CYAN}mysql://eclipse_user:${DB_PASS}@127.0.0.1:3306/eclipse_panel${NC}"
echo -e "${GREEN}================================================================${NC}\n"
