#!/usr/bin/env bash
# Called by the OS service manager (systemd / launchd) to start the server.
# Sources .env so that settings changes made via the dashboard take effect on restart.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

if [[ -f "$PROJECT_ROOT/.env" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$PROJECT_ROOT/.env"
    set +a
fi

exec node "$PROJECT_ROOT/dist/index.js"
