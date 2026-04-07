#!/usr/bin/env bash
# Home Server uninstaller — Linux & macOS

set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

step() { echo -e "\n${CYAN}==> $*${NC}"; }
ok()   { echo -e "    ${GREEN}OK${NC}  $*"; }
warn() { echo -e "    ${YELLOW}--${NC}  $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

OS=""
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "linux"* ]]; then
    OS="linux"
else
    echo "Unsupported OS: $OSTYPE"; exit 1
fi

echo ""
echo "  Home Server Uninstaller"
echo "  Project: $PROJECT_ROOT"
echo ""

# ─── Stop and remove the service ───────────────────────────────────────────

step "Stopping service"

if [[ "$OS" == "linux" ]]; then
    systemctl --user stop home-server 2>/dev/null  && ok "Service stopped" || warn "Service was not running"
    systemctl --user disable home-server 2>/dev/null || true

    SERVICE_FILE="$HOME/.config/systemd/user/home-server.service"
    if [[ -f "$SERVICE_FILE" ]]; then
        rm "$SERVICE_FILE"
        systemctl --user daemon-reload
        ok "Service file removed"
    else
        warn "Service file not found (already removed?)"
    fi

elif [[ "$OS" == "macos" ]]; then
    PLIST="$HOME/Library/LaunchAgents/dev.homeserver.plist"
    if [[ -f "$PLIST" ]]; then
        launchctl unload "$PLIST" 2>/dev/null && ok "Agent unloaded" || warn "Agent was not loaded"
        rm "$PLIST"
        ok "Plist removed"
    else
        warn "Plist not found (already removed?)"
    fi
fi

# ─── Remove run script ──────────────────────────────────────────────────────

step "Removing launcher script"

if [[ -f "$SCRIPT_DIR/run-server.sh" ]]; then
    rm "$SCRIPT_DIR/run-server.sh"
    ok "run-server.sh removed"
else
    warn "run-server.sh not found"
fi

# ─── Kill any leftover process on port 3000 ────────────────────────────────

step "Checking for leftover process"

if command -v lsof &>/dev/null; then
    PID=$(lsof -ti tcp:3000 2>/dev/null || true)
    if [[ -n "$PID" ]]; then
        kill -9 "$PID" 2>/dev/null && ok "Killed process on port 3000 (PID $PID)" || true
    else
        warn "No process found on port 3000"
    fi
fi

# ─── Optional: remove .env ─────────────────────────────────────────────────

step "Configuration"

ENV_PATH="$PROJECT_ROOT/.env"
if [[ -f "$ENV_PATH" ]]; then
    read -r -p "    Remove .env (server configuration)? [y/N]: " REMOVE_ENV
    if [[ "${REMOVE_ENV,,}" == "y" ]]; then
        rm "$ENV_PATH"
        ok ".env removed"
    else
        warn ".env kept at $ENV_PATH"
    fi
fi

# ─── Optional: remove storage data ─────────────────────────────────────────

step "Storage"

STORAGE_DIR=""
if [[ -f "$ENV_PATH" ]]; then
    STORAGE_DIR=$(grep -E "^BASE_DIR=" "$ENV_PATH" 2>/dev/null | cut -d= -f2- || true)
fi
STORAGE_DIR="${STORAGE_DIR:-$HOME/server-storage}"

if [[ -d "$STORAGE_DIR" ]]; then
    echo -e "    ${YELLOW}Storage directory: $STORAGE_DIR${NC}"
    echo -e "    ${YELLOW}WARNING: This contains all uploaded files.${NC}"
    read -r -p "    Delete storage directory and all files? [y/N]: " REMOVE_STORAGE
    if [[ "${REMOVE_STORAGE,,}" == "y" ]]; then
        rm -rf "$STORAGE_DIR"
        ok "Storage deleted: $STORAGE_DIR"
    else
        warn "Storage kept at $STORAGE_DIR"
    fi
else
    warn "Storage directory not found at $STORAGE_DIR"
fi

# ─── Done ──────────────────────────────────────────────────────────────────

echo ""
echo -e "  ${GREEN}Uninstall complete.${NC}"
echo ""
