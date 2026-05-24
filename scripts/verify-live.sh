#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${SOMNIA_TESTNET_RPC:-https://api.infra.testnet.somnia.network}"
STEWARD="${STEWARD:-0x6932C7827E7BFd9f0015Ed93fA120379E0d20541}"
MINI_GOVERNOR="${MINI_GOVERNOR:-0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389}"
REQUEST_ID="${REQUEST_ID:-1698384}"
PROPOSAL_ID="${PROPOSAL_ID:-1}"

vote_request=$(cast call "$STEWARD" \
  "voteRequests(uint256)(uint256,uint256,uint8,uint8,uint8,string,uint256)" \
  "$REQUEST_ID" \
  --rpc-url "$RPC_URL")

governor_vote=$(cast call "$MINI_GOVERNOR" \
  "votes(uint256,address)(uint8)" \
  "$PROPOSAL_ID" \
  "$STEWARD" \
  --rpc-url "$RPC_URL")

echo "Steward live proof"
echo "RPC: $RPC_URL"
echo "Steward: $STEWARD"
echo "MiniGovernor: $MINI_GOVERNOR"
echo "Request: $REQUEST_ID"
echo
echo "$vote_request"
echo
echo "Governor vote for proposal $PROPOSAL_ID by Steward: $governor_vote"
