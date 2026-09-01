#!/usr/bin/env bash
# Boots the DeepSeek Harness web GUI with the scrum profile from this
# repository's hermetic DSH_HOME, using the BUILT harness checkout (lib/, not
# tsx source, so module identities stay unified with our built plugins).
#
# Usage: bash scripts/serve.sh [port]   (default port 3090)

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HARNESS="${DSH_CHECKOUT:-$REPO/../deepseek-harness}"
PORT="${1:-3090}"

export DSH_HOME="$REPO/.dsh-home"

exec node "$HARNESS/apps/cli/lib/bin.js" --profile scrum --port "$PORT"
