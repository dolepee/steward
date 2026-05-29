#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${SOMNIA_TESTNET_RPC:-https://dream-rpc.somnia.network}"
STEWARD="${STEWARD:-0x6932C7827E7BFd9f0015Ed93fA120379E0d20541}"
MINI_GOVERNOR="${MINI_GOVERNOR:-0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389}"
REQUEST_ID="${REQUEST_ID:-1698384}"
PROPOSAL_ID="${PROPOSAL_ID:-1}"

echo "Steward live proof"
echo "RPC: $RPC_URL"
echo "Steward: $STEWARD"
echo "MiniGovernor: $MINI_GOVERNOR"
echo

strip_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "$value"
}

assert_eq() {
  local label="$1"
  local actual="$2"
  local expected="$3"

  if [[ "$actual" != "$expected" ]]; then
    echo "ERROR: $label expected $expected, got $actual" >&2
    exit 1
  fi
}

verify_one() {
  local label="$1"
  local request_id="$2"
  local proposal_id="$3"
  local expected_support="$4"
  local expected_reason="$5"
  local vote_request_fields
  local governor_vote
  local delegation_id
  local returned_proposal_id
  local request_state
  local platform_status
  local support
  local reason
  local receipt

  mapfile -t vote_request_fields < <(cast call "$STEWARD" \
    "voteRequests(uint256)(uint256,uint256,uint8,uint8,uint8,string,uint256)" \
    "$request_id" \
    --rpc-url "$RPC_URL")

  governor_vote=$(cast call "$MINI_GOVERNOR" \
    "votes(uint256,address)(uint8)" \
    "$proposal_id" \
    "$STEWARD" \
    --rpc-url "$RPC_URL")

  if [[ "${#vote_request_fields[@]}" -lt 7 ]]; then
    echo "ERROR: unexpected voteRequests output for $label" >&2
    printf '%s\n' "${vote_request_fields[@]}" >&2
    exit 1
  fi

  delegation_id="${vote_request_fields[0]}"
  returned_proposal_id="${vote_request_fields[1]}"
  request_state="${vote_request_fields[2]}"
  platform_status="${vote_request_fields[3]}"
  support="${vote_request_fields[4]}"
  reason="$(strip_quotes "${vote_request_fields[5]}")"
  receipt="${vote_request_fields[6]}"

  assert_eq "$label proposalId" "$returned_proposal_id" "$proposal_id"
  assert_eq "$label request state" "$request_state" "2"
  assert_eq "$label platform status" "$platform_status" "2"
  assert_eq "$label Steward support" "$support" "$expected_support"
  assert_eq "$label Steward reason" "$reason" "$expected_reason"
  assert_eq "$label governor vote" "$governor_vote" "$expected_support"

  echo "$label request $request_id / proposal $proposal_id"
  echo "  delegation: $delegation_id"
  echo "  Steward state: Cast"
  echo "  platform status: Success"
  echo "  Steward support: $support ($expected_reason)"
  echo "  MiniGovernor vote: $governor_vote"
  echo "  callback receipt field: $receipt"
  echo
}

if [[ -n "${REQUEST_ID:-}" && -n "${PROPOSAL_ID:-}" && "${REQUEST_ID}" != "1698384" ]]; then
  if [[ -z "${EXPECTED_SUPPORT:-}" || -z "${EXPECTED_REASON:-}" ]]; then
    echo "ERROR: custom verification requires EXPECTED_SUPPORT and EXPECTED_REASON" >&2
    exit 1
  fi
  verify_one "Custom" "$REQUEST_ID" "$PROPOSAL_ID" "$EXPECTED_SUPPORT" "$EXPECTED_REASON"
else
  verify_one "YES" 1698384 1 1 "YES"
  verify_one "NO" 1738101 2 2 "NO"
  verify_one "ABSTAIN" 1738108 3 3 "ABSTAIN"
fi

echo "STEWARD_LIVE_PROOF_VALID"
