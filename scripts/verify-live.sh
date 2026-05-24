#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${SOMNIA_TESTNET_RPC:-https://api.infra.testnet.somnia.network}"
STEWARD="${STEWARD:-0x6932C7827E7BFd9f0015Ed93fA120379E0d20541}"
MINI_GOVERNOR="${MINI_GOVERNOR:-0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389}"
REQUEST_ID="${REQUEST_ID:-1698384}"
PROPOSAL_ID="${PROPOSAL_ID:-1}"

echo "Steward live proof"
echo "RPC: $RPC_URL"
echo "Steward: $STEWARD"
echo "MiniGovernor: $MINI_GOVERNOR"
echo

verify_one() {
  local label="$1"
  local request_id="$2"
  local proposal_id="$3"
  local vote_request
  local governor_vote

  vote_request=$(cast call "$STEWARD" \
    "voteRequests(uint256)(uint256,uint256,uint8,uint8,uint8,string,uint256)" \
    "$request_id" \
    --rpc-url "$RPC_URL")

  governor_vote=$(cast call "$MINI_GOVERNOR" \
    "votes(uint256,address)(uint8)" \
    "$proposal_id" \
    "$STEWARD" \
    --rpc-url "$RPC_URL")

  echo "$label request $request_id / proposal $proposal_id"
  echo "$vote_request"
  echo "Governor vote: $governor_vote"
  echo
}

if [[ -n "${REQUEST_ID:-}" && -n "${PROPOSAL_ID:-}" && "${REQUEST_ID}" != "1698384" ]]; then
  verify_one "Custom" "$REQUEST_ID" "$PROPOSAL_ID"
else
  verify_one "YES" 1698384 1
  verify_one "NO" 1738101 2
  verify_one "ABSTAIN" 1738108 3
fi
