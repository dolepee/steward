#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

load_env_file() {
  local file="$1"
  local line key value

  [[ -f "$file" ]] || return 0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue

    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    value="${value#\"}"
    value="${value%\"}"
    value="${value#\'}"
    value="${value%\'}"

    if [[ -z "${!key+x}" ]]; then
      export "$key=$value"
    fi
  done <"$file"
}

require_command() {
  local dependency="$1"
  if ! command -v "$dependency" >/dev/null 2>&1; then
    echo "ERROR: missing required command '$dependency'" >&2
    exit 1
  fi
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: missing required env $name" >&2
    exit 1
  fi
}

contains_expected_cases() {
  local actual_csv="$1"
  local expected_csv="$2"
  local expected

  IFS="," read -ra expected <<<"$expected_csv"
  for expected in "${expected[@]}"; do
    expected="${expected//[[:space:]]/}"
    [[ -z "$expected" ]] && continue
    if [[ ",$actual_csv," != *",$expected,"* ]]; then
      return 1
    fi
  done

  return 0
}

load_env_file "$ENV_FILE"

require_command cast
require_command forge
require_command node

export SOMNIA_TESTNET_RPC="${SOMNIA_TESTNET_RPC:-https://dream-rpc.somnia.network}"
export URL_PIPELINE_EXPECT_CASES="${URL_PIPELINE_EXPECT_CASES:-YES,NO,ABSTAIN}"
POLL_SECONDS="${URL_PIPELINE_POLL_SECONDS:-900}"
POLL_INTERVAL="${URL_PIPELINE_POLL_INTERVAL:-20}"
SKIP_SEED="${URL_PIPELINE_SKIP_SEED:-false}"

require_env STEWARD_URL_PIPELINE
require_env MINI_GOVERNOR

cd "$ROOT_DIR"

if [[ -z "${URL_PIPELINE_FROM_BLOCK:-}" ]]; then
  current_block="$(cast block-number --rpc-url "$SOMNIA_TESTNET_RPC")"
  lookback="${URL_PIPELINE_BLOCK_LOOKBACK:-5}"
  if (( current_block > lookback )); then
    export URL_PIPELINE_FROM_BLOCK="$((current_block - lookback))"
  else
    export URL_PIPELINE_FROM_BLOCK=0
  fi
fi

echo "Steward URL pipeline proof run"
echo "RPC: $SOMNIA_TESTNET_RPC"
echo "Pipeline: $STEWARD_URL_PIPELINE"
echo "Governor: $MINI_GOVERNOR"
echo "From block: $URL_PIPELINE_FROM_BLOCK"
echo "Expected cases: $URL_PIPELINE_EXPECT_CASES"
echo

if [[ "$SKIP_SEED" != "true" && "$SKIP_SEED" != "1" ]]; then
  require_env PRIVATE_KEY
  echo "Seeding three URL pipeline jobs..."
  forge script script/SeedUrlPipelineProofs.s.sol \
    --rpc-url "$SOMNIA_TESTNET_RPC" \
    --private-key "$PRIVATE_KEY" \
    --broadcast \
    --legacy
  echo
else
  echo "Skipping seed step because URL_PIPELINE_SKIP_SEED=$SKIP_SEED"
  echo
fi

proof_env="$(mktemp)"
collector_err="$(mktemp)"
trap 'rm -f "$proof_env" "$collector_err"' EXIT

deadline=$((SECONDS + POLL_SECONDS))
attempt=1

while (( SECONDS <= deadline )); do
  echo "Collecting complete URL pipeline jobs (attempt $attempt)..."
  if node scripts/collect-url-pipeline-proof-env.mjs >"$proof_env" 2>"$collector_err"; then
    cat "$collector_err"

    # shellcheck disable=SC1090
    source "$proof_env"

    if contains_expected_cases "${URL_PIPELINE_CASES:-}" "$URL_PIPELINE_EXPECT_CASES"; then
      echo "Collected expected cases: $URL_PIPELINE_CASES"
      echo
      node scripts/verify-url-pipeline-trail.mjs
      echo "STEWARD_URL_PIPELINE_PROOF_RUN_VALID"
      exit 0
    fi

    echo "Collected cases '$URL_PIPELINE_CASES', waiting for '$URL_PIPELINE_EXPECT_CASES'."
  else
    cat "$collector_err" >&2
  fi

  attempt=$((attempt + 1))
  if (( SECONDS + POLL_INTERVAL > deadline )); then
    break
  fi
  sleep "$POLL_INTERVAL"
done

echo "ERROR: URL pipeline proof did not complete within ${POLL_SECONDS}s" >&2
echo "If callbacks landed later, rerun with URL_PIPELINE_SKIP_SEED=true and the same URL_PIPELINE_FROM_BLOCK." >&2
exit 1
