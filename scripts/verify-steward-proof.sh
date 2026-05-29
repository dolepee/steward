#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

"$ROOT_DIR/scripts/verify-live.sh"
node "$ROOT_DIR/scripts/verify-agent-receipts.mjs"

echo "STEWARD_FULL_PROOF_VALID"
