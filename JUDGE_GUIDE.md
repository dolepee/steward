# Steward Judge Guide

Steward is a verifiable DAO governance proxy on Somnia. A user stores voting criteria, Steward asks Somnia's live LLM Inference agent to evaluate a proposal, and the SomniaAgents callback casts the final YES, NO, or ABSTAIN vote onchain.

## First 60 Seconds

1. Open `https://steward-ashy.vercel.app`.
2. Check the three live proof cards: `YES`, `NO`, and `ABSTAIN`.
3. For each card, inspect the proposal transaction, Somnia agent request, public receipt JSON, and callback vote transaction.
4. Confirm the proof strip shows `9/9` validator receipts and both verified project contracts.
5. Run `./scripts/verify-steward-proof.sh` from the repo. The final marker should be `STEWARD_FULL_PROOF_VALID`.

## Why It Matters

DAO delegation usually ends at a static delegate address or an offchain voting bot. Steward moves the decision path into an auditable agent loop:

- The user delegates criteria, not a hardcoded vote.
- `requestVote` invokes SomniaAgents with proposal text and the user's stored criteria.
- The contract only casts after SomniaAgents calls back with a valid `YES`, `NO`, or `ABSTAIN`.
- The final governor vote and the agent receipt trail are both publicly reproducible.

## Live Proof Anchors

| Surface | Value |
| --- | --- |
| Chain | Somnia Testnet `50312` |
| Steward | `0x6932C7827E7BFd9f0015Ed93fA120379E0d20541` |
| MiniGovernor | `0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389` |
| SomniaAgents requester | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| LLM Inference agent | `12847293847561029384` |

| Outcome | Request ID | Callback result |
| --- | --- | --- |
| `YES` | `1698384` | Steward cast support `1` into MiniGovernor proposal `1`. |
| `NO` | `1738101` | Steward cast support `2` into MiniGovernor proposal `2`. |
| `ABSTAIN` | `1738108` | Steward cast support `3` into MiniGovernor proposal `3`. |

## Verification Command

```shell
git clone https://github.com/dolepee/steward
cd steward
git submodule update --init --recursive
./scripts/verify-steward-proof.sh
```

Expected markers:

```text
STEWARD_LIVE_PROOF_VALID
STEWARD_AGENT_RECEIPTS_VALID
STEWARD_SOURCE_VERIFICATION_VALID
STEWARD_FULL_PROOF_VALID
```

The command checks live onchain state, Somnia's public agent receipt service, and explorer source verification for `Steward` and `MiniGovernor`.

## What Is Load-Bearing

The Somnia agent path is not decorative. `Steward.requestVote` does not accept a frontend-supplied vote. It creates a SomniaAgents request and records the vote only after the authorized SomniaAgents requester calls `handleResponse`.

The callback path rejects:

- Unknown request ids.
- Duplicate callbacks.
- Revoked delegations.
- Invalid or non-matching callback details.
- Agent responses that do not begin with `YES`, `NO`, or `ABSTAIN`.
- Governor failures, which are marked failed rather than reported as cast votes.

## Honest Scope

This is a hackathon MVP that proves the autonomous governance loop on Somnia Testnet. It is not claiming production DAO coverage, Snapshot/Tally integration, delegate marketplaces, slashing, or cross-chain governance.

The current live examples finalized with onchain `receipt = 0`, so the proof uses Somnia's public receipt service plus the request and callback transaction logs. The repo does not claim a nonzero onchain receipt id for these three examples.

## Supporting Docs

- [`PROOF.md`](./PROOF.md): direct proof links and verifier markers.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md): contract and callback flow.
- [`THREAT_MODEL.md`](./THREAT_MODEL.md): trust assumptions, failure modes, and production hardening path.
