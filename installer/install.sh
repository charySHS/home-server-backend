#!/usr/bin/env bash
# Home Server installer — Linux & macOS
# Run from anywhere inside the project:
#   chmod +x installer/install.sh && sudo installer/install.sh   (Linux)
#   chmod +x installer/install.sh && installer/install.sh        (macOS)

set -euo pipefail

# ─── Colour helpers ────────────────────────────────────────────────────────────

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

step()  { echo -e "\n${CYAN}==> $*${NC}"; }
ok()    { echo -e "    ${GREEN}OK${NC}  $*"; }
warn()  { echo -e "    ${YELLOW}WARN${NC} $*"; }
fail()  { echo -e "    ${RED}ERR${NC} $*"; exit 1; }

# ─── Detect OS ─────────────────────────────────────────────────────────────────

OS=""
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "linux"* ]]; then
    OS="linux"
else
    fail "Unsupported OS: $OSTYPE. Use install.ps1 on Windows."
fi

ok "Detected OS: $OS"

# ─── Locate project root ────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
    fail "Cannot find package.json. Run this script from inside the home-server project."
fi

echo ""
echo "  Home Server Installer"
echo "  Project: $PROJECT_ROOT"
echo ""

# ─── Check Node.js ─────────────────────────────────────────────────────────────

step "Checking Node.js"

if ! command -v node &>/dev/null; then
    fail "Node.js not found. Install Node.js 18+ from https://nodejs.org and re-run."
fi

NODE_VERSION=$(node --version)
NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')

if (( NODE_MAJOR < 18 )); then
    fail "Node.js 18+ required. Found $NODE_VERSION. Update from https://nodejs.org"
fi

NODE_BIN=$(command -v node)
ok "Node.js $NODE_VERSION ($NODE_BIN)"

# ─── Install dependencies ───────────────────────────────────────────────────────

step "Installing dependencies"
cd "$PROJECT_ROOT"
npm install --prefer-offline --silent || fail "npm install failed."
ok "Dependencies installed"

# ─── Build TypeScript ───────────────────────────────────────────────────────────

step "Building TypeScript"
npm run build --silent || fail "TypeScript build failed. Run 'npm run build' manually to see errors."
ok "Build complete"

# ─── Storage location ───────────────────────────────────────────────────────────

step "Storage location"

if [[ "$OS" == "macos" ]]; then
    DEFAULT_STORAGE="$HOME/server-storage"
else
    DEFAULT_STORAGE="$HOME/server-storage"
fi

echo -e "    ${YELLOW}Where should your files be stored?${NC}"
echo    "    Press Enter to use the default: $DEFAULT_STORAGE"
read -r -p "    Storage path: " STORAGE_INPUT

STORAGE_DIR="${STORAGE_INPUT:-$DEFAULT_STORAGE}"
STORAGE_DIR="${STORAGE_DIR/#\~/$HOME}"   # expand leading ~

mkdir -p "$STORAGE_DIR/data" "$STORAGE_DIR/uploads"
ok "Storage: $STORAGE_DIR"

# ─── Write .env ─────────────────────────────────────────────────────────────────

step "Writing .env"

ENV_PATH="$PROJECT_ROOT/.env"
cat > "$ENV_PATH" <<EOF
BASE_DIR=$STORAGE_DIR
JWT_EXPIRATION=7d
ADMIN_DEBUG_LOGS=false
EOF

ok ".env written"

# ─── Make run script executable ─────────────────────────────────────────────────

chmod +x "$SCRIPT_DIR/run-server.sh"

# ─── OS-specific service setup ──────────────────────────────────────────────────

LOG_OUT="$PROJECT_ROOT/server.log"
LOG_ERR="$PROJECT_ROOT/server-error.log"

if [[ "$OS" == "linux" ]]; then

    step "Creating systemd user service"

    SERVICE_DIR="$HOME/.config/systemd/user"
    mkdir -p "$SERVICE_DIR"

    cat > "$SERVICE_DIR/home-server.service" <<EOF
[Unit]
Description=Home Server
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_ROOT
ExecStart=$SCRIPT_DIR/run-server.sh
Restart=on-failure
RestartSec=5
StandardOutput=append:$LOG_OUT
StandardError=append:$LOG_ERR

[Install]
WantedBy=default.target
EOF

    systemctl --user daemon-reload
    systemctl --user enable home-server
    ok "Service enabled (home-server.service)"

    # Enable linger so the service survives without an active login session
    if command -v loginctl &>/dev/null; then
        loginctl enable-linger "$USER" 2>/dev/null || \
            warn "Could not enable linger — server will only run while logged in."
        ok "Linger enabled for $USER"
    fi

    step "Starting server"
    systemctl --user restart home-server
    sleep 3

elif [[ "$OS" == "macos" ]]; then

    step "Creating launchd agent"

    PLIST_DIR="$HOME/Library/LaunchAgents"
    mkdir -p "$PLIST_DIR"
    PLIST="$PLIST_DIR/dev.homeserver.plist"

    # Unload existing agent if present
    if [[ -f "$PLIST" ]]; then
        launchctl unload "$PLIST" 2>/dev/null || true
    fi

    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>dev.homeserver</string>

    <key>ProgramArguments</key>
    <array>
        <string>$SCRIPT_DIR/run-server.sh</string>
    </array>

    <key>WorkingDirectory</key>
    <string>$PROJECT_ROOT</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>ThrottleInterval</key>
    <integer>5</integer>

    <key>StandardOutPath</key>
    <string>$LOG_OUT</string>

    <key>StandardErrorPath</key>
    <string>$LOG_ERR</string>
</dict>
</plist>
EOF

    launchctl load "$PLIST"
    ok "Agent loaded (dev.homeserver)"

    step "Starting server"
    launchctl start dev.homeserver 2>/dev/null || true
    sleep 3

fi

# ─── Verify server is up ─────────────────────────────────────────────────────────

step "Verifying server"

ATTEMPTS=0
until curl -sf http://localhost:3000/health >/dev/null 2>&1; do
    ATTEMPTS=$((ATTEMPTS + 1))
    if (( ATTEMPTS >= 10 )); then
        fail "Server did not respond on port 3000. Check $LOG_ERR for details."
    fi
    sleep 2
done

ok "Server is up on port 3000"

# ─── Admin account ───────────────────────────────────────────────────────────────

step "Creating admin account"

SETUP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/v1/auth/setup \
    -H "Content-Type: application/json" \
    -d '{"username":"__probe__","password":"__probe__"}' 2>/dev/null)

if [[ "$SETUP_STATUS" == "403" ]]; then
    warn "Admin account already exists — skipping."
else
    echo -e "    ${YELLOW}Choose a username and password for your admin account.${NC}"
    read -r -p "    Username: " ADMIN_USER
    read -r -s -p "    Password: " ADMIN_PASS
    echo ""

    if [[ -z "$ADMIN_USER" || -z "$ADMIN_PASS" ]]; then
        warn "No credentials entered. Visit http://localhost:3000/setup to finish."
    else
        RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/v1/auth/setup \
            -H "Content-Type: application/json" \
            -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" 2>/dev/null)

        if [[ "$RESULT" == "200" || "$RESULT" == "201" ]]; then
            ok "Admin account created: $ADMIN_USER"
        else
            warn "Could not create admin automatically (HTTP $RESULT)."
            warn "Visit http://localhost:3000/setup in your browser to finish."
        fi
    fi
fi

# ─── Done ────────────────────────────────────────────────────────────────────────

echo ""
echo -e "  ${GREEN}Installation complete!${NC}"
echo ""
echo "  Server:    http://localhost:3000/health"
echo "  Setup:     http://localhost:3000/setup  (if admin not yet created)"
echo "  Storage:   $STORAGE_DIR"
echo "  Logs:      $LOG_OUT"
echo ""

if [[ "$OS" == "linux" ]]; then
    echo "  The server starts automatically at boot."
    echo "  To manage:  systemctl --user {start|stop|restart|status} home-server"
elif [[ "$OS" == "macos" ]]; then
    echo "  The server starts automatically at login."
    echo "  To manage:  launchctl {start|stop} dev.homeserver"
fi

echo ""
