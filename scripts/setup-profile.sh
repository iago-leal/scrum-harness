#!/usr/bin/env bash
# Creates the hermetic DSH_HOME and the `scrum` profile inside this repository.
# Idempotent: reruns refresh the symlinks.
#
# Usage:  bash scripts/setup-profile.sh
# Then:   bash scripts/serve.sh   (boots the web GUI with the scrum profile)

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="$REPO/.dsh-home"
PROFILE="$HOME_DIR/profiles/scrum"

mkdir -p "$PROFILE/node_modules/@scrum-harness"

cat > "$PROFILE/package.json" <<'JSON'
{
  "name": "dsh-profile-scrum",
  "private": true,
  "dependencies": {
    "@scrum-harness/bundle": "file:../../../packages/bundle-scrum"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@scrum-harness/bundle"
      ]
    }
  }
}
JSON

for pkg in bundle-scrum scrum-domain tool-scrum command-scrum scrum-api ui-scrum; do
  case "$pkg" in
    bundle-scrum) name="bundle" ;;
    scrum-domain) name="domain" ;;
    ui-scrum) name="ui" ;;
    *) name="$pkg" ;;
  esac
  if [ -d "$REPO/packages/$pkg" ]; then
    ln -sfn "$REPO/packages/$pkg" "$PROFILE/node_modules/@scrum-harness/$name"
  fi
done

echo "Profile ready: $PROFILE"
echo "Boot with: bash scripts/serve.sh"
