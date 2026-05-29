# Steward Proof Guide

Steward's strongest claim is simple: one delegated voting mandate produced three autonomous onchain votes through Somnia's LLM agent path.

## What This Proves

| Claim | Evidence |
| --- | --- |
| Contract-invoked agent call | Each `requestVote` transaction calls SomniaAgents with the live LLM Inference agent ID. |
| Agent-first governance action | Steward does not cast a vote until SomniaAgents calls back with `YES`, `NO`, or `ABSTAIN`. |
| Async callback execution | Each final vote is written by `Steward.handleResponse` after the SomniaAgents callback. |
| Public agent receipt trail | Somnia's receipt service returns validator runner receipts for each request. |
| Transaction-level event trail | The verifier checks `ProposalCreated`, `RequestCreated`, `VoteRequested`, `RequestFinalized`, `VoteCast`, and `StewardVoteCast` logs for all three outcomes. It also decodes each `RequestCreated` payload and confirms the `inferString` call used the expected criteria, proposal text, system prompt, and allowed outputs. |
| Verifiable final state | `MiniGovernor.votes(proposalId, Steward)` matches the agent-returned support value. |

## Fast Verification

Prerequisites: Foundry (`cast`) and Node.js 22+.

```shell
git clone https://github.com/dolepee/steward
cd steward
git submodule update --init --recursive
./scripts/verify-steward-proof.sh
```

Expected final markers:

```text
STEWARD_LIVE_PROOF_VALID
STEWARD_AGENT_RECEIPTS_VALID
STEWARD_TX_TRAIL_VALID
STEWARD_SOURCE_VERIFICATION_VALID
STEWARD_FULL_PROOF_VALID
```

## Proof Set

| Outcome | Request ID | Agent request | Receipt JSON | Callback vote |
| --- | --- | --- | --- | --- |
| `YES` | `1698384` | [`tx`](https://shannon-explorer.somnia.network/tx/0x63c34767e59cc6988fd2ab5ecef9d1089e9f4445e1b1e18a9b490b0d0efc77ef) | [`receipt`](https://receipts.testnet.agents.somnia.host/agent-receipts?requestId=1698384&contractAddress=0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776&type=minimal) | [`tx`](https://shannon-explorer.somnia.network/tx/0xb74e25845472a2f591aa91eefe84e5e2828b41ac11acc78b41ceb1015500c52b) |
| `NO` | `1738101` | [`tx`](https://shannon-explorer.somnia.network/tx/0x6d32b090d9ebacc6dd1dd46c01e0036bff3e684df4a28d3817823cd3747959fc) | [`receipt`](https://receipts.testnet.agents.somnia.host/agent-receipts?requestId=1738101&contractAddress=0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776&type=minimal) | [`tx`](https://shannon-explorer.somnia.network/tx/0xe14303e64f6a5db3d74919c94f42d3c14df3183e225f9996cc29cba86cc66dc3) |
| `ABSTAIN` | `1738108` | [`tx`](https://shannon-explorer.somnia.network/tx/0xa01f30ee06dbfa66b4a60414469d4f0e6406440f11e625a1197de88d797e851d) | [`receipt`](https://receipts.testnet.agents.somnia.host/agent-receipts?requestId=1738108&contractAddress=0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776&type=minimal) | [`tx`](https://shannon-explorer.somnia.network/tx/0xa157564585f473503627c801d6fb5992900dab3d5efcb31d4f15383c16487603) |

## Contracts

| Contract | Address |
| --- | --- |
| Steward | [`0x6932C7827E7BFd9f0015Ed93fA120379E0d20541`](https://shannon-explorer.somnia.network/address/0x6932C7827E7BFd9f0015Ed93fA120379E0d20541) |
| MiniGovernor | [`0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389`](https://shannon-explorer.somnia.network/address/0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389) |
| SomniaAgents requester | [`0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776`](https://shannon-explorer.somnia.network/address/0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776) |
| LLM Inference agent | [`12847293847561029384`](https://agents.testnet.somnia.network/agent/12847293847561029384) |

`Steward` and `MiniGovernor` are source-verified on the Somnia explorer.

## Important Limitation

The deployed Steward contract stores the receipt id returned by the SomniaAgents callback. The current live examples finalized with `receipt = 0`, so this proof uses Somnia's public receipt service plus the transaction-level request and callback logs. The project does not claim a nonzero onchain receipt id for these three examples.
