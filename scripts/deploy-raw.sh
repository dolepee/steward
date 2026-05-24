#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${SOMNIA_TESTNET_RPC:-https://api.infra.testnet.somnia.network}"
SOMNIA_AGENTS="${SOMNIA_AGENTS:-0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776}"
LLM_AGENT_ID="${LLM_AGENT_ID:-12847293847561029384}"
GAS_PRICE="${GAS_PRICE:-6000000000}"

if [[ -z "${PRIVATE_KEY:-}" ]]; then
  echo "PRIVATE_KEY is required" >&2
  exit 1
fi

forge build >/dev/null

deploy_raw() {
  local artifact="$1"
  local constructor_args="${2:-}"
  local gas_limit="$3"
  local bytecode

  bytecode=$(node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync('$artifact','utf8')).bytecode.object)")

  if [[ -n "$constructor_args" ]]; then
    bytecode="${bytecode}${constructor_args#0x}"
  fi

  cast send \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --legacy \
    --gas-limit "$gas_limit" \
    --gas-price "$GAS_PRICE" \
    --create "$bytecode"
}

echo "Deploying MiniGovernor..."
deploy_raw "out/MiniGovernor.sol/MiniGovernor.json" "" 20000000

echo
echo "Deploying Steward..."
steward_args=$(cast abi-encode "constructor(address,uint256)" "$SOMNIA_AGENTS" "$LLM_AGENT_ID")
deploy_raw "out/Steward.sol/Steward.json" "$steward_args" 35000000
