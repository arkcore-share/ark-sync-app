#!/usr/bin/env bash
# Nous Research Hermes Agent — https://github.com/NousResearch/hermes-agent
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$SCRIPT_DIR/hermes-cleanup-npm-rn.sh"
echo "[hermes-agent] Official install.sh"
exec bash -c 'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash'
