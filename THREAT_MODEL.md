# Steward Threat Model

Steward is a hackathon MVP for verifiable agent-driven governance on Somnia. This document states the security model plainly so judges can distinguish the proven loop from future production work.

## Security Goal

For a registered delegation and proposal, Steward should only cast a governor vote after SomniaAgents calls back with a successful LLM response that starts with one allowed value: `YES`, `NO`, or `ABSTAIN`.

## Trusted Components

| Component | Trust assumption |
| --- | --- |
| SomniaAgents requester | The deployed requester address is the only authorized callback sender. |
| Somnia LLM Inference agent | The agent response is the decision input Steward parses into support values. |
| MiniGovernor | Used as a minimal, source-verified governor target for the proof loop. |
| Somnia receipt service | Used for public validator receipt JSON because the current live callbacks returned onchain `receipt = 0`. |

## Enforced Invariants

| Invariant | Enforcement |
| --- | --- |
| Unauthorized callers cannot finalize requests | `handleResponse` reverts unless `msg.sender == SOMNIA_AGENTS`. |
| Unknown requests cannot be finalized | `handleResponse` reverts when `voteRequests[requestId]` is empty. |
| A request cannot be settled twice | `handleResponse` requires pending state before writing a result. |
| Mismatched platform details are rejected | Nonzero `details.id` must equal the callback `requestId`. |
| Invalid LLM output cannot cast a vote | Output must start with `YES`, `NO`, or `ABSTAIN`; otherwise the request fails. |
| Governor rejection is not hidden | If the governor rejects the vote, Steward records the request as failed. |
| Expired or revoked delegations cannot request new votes | `requestVote` checks active delegation state before calling SomniaAgents. |

## Failure Behavior

Steward fails closed. If SomniaAgents returns a failed status, returns no successful result, returns unparsable output, calls back with mismatched details, or the governor rejects the vote, Steward does not pretend a vote was cast. It records a failed request and emits `StewardVoteFailed`.

## What The Live Proof Covers

- Three live Somnia agent requests: YES, NO, and ABSTAIN.
- Three async callbacks from SomniaAgents into Steward.
- Three MiniGovernor votes cast by Steward.
- Nine successful validator receipts from Somnia's public receipt service, with threshold-2-of-3 metadata, at least two runner addresses per request, timing, token usage, and decoded LLM steps.
- Source-verified `Steward` and `MiniGovernor` contracts on Somnia Testnet.
- Reproducible checks through `./scripts/verify-steward-proof.sh`.

## Honest Limitations

- This is not a production DAO delegate marketplace.
- The governor is a minimal proof target, not Snapshot, Tally, Governor Bravo, or OpenZeppelin Governor.
- Steward does not score delegate reputation, slash bad votes, or aggregate multiple agents.
- The current live callback examples store `receipt = 0` onchain, so receipt proof uses Somnia's public receipt service plus request/callback transaction logs.
- The LLM response is constrained to allowed vote strings, but the contract does not judge whether the model's reasoning is good.

## Production Hardening Path

Before production use, Steward would need a real governor adapter, stronger prompt/version pinning, explicit proposal source authentication, multi-agent or policy quorum options, and a reputation or slashing layer for bad delegate outcomes.
