#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

for dependency in cast node; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    echo "ERROR: missing required command '$dependency'" >&2
    if [[ "$dependency" == "cast" ]]; then
      echo "Install Foundry first: https://book.getfoundry.sh/getting-started/installation" >&2
    fi
    exit 1
  fi
done

"$ROOT_DIR/scripts/verify-live.sh"
node "$ROOT_DIR/scripts/verify-agent-receipts.mjs"
node "$ROOT_DIR/scripts/verify-transaction-trail.mjs"
node "$ROOT_DIR/scripts/verify-council-proof.mjs"
node "$ROOT_DIR/scripts/verify-delegated-council-proofs.mjs"
node "$ROOT_DIR/scripts/verify-source.mjs"

echo "STEWARD_FULL_PROOF_VALID"
