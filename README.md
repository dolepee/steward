# Steward

One delegate. Three votes. Nine Somnia agent receipts. Runner quorum. Three decoded LLM request payloads.

[![CI](https://github.com/dolepee/steward/actions/workflows/test.yml/badge.svg)](https://github.com/dolepee/steward/actions/workflows/test.yml)
[![Live Proof](https://github.com/dolepee/steward/actions/workflows/live-proof.yml/badge.svg)](https://github.com/dolepee/steward/actions/workflows/live-proof.yml)
[![Live app](https://img.shields.io/badge/live-steward--ashy.vercel.app-6bff7d)](https://steward-ashy.vercel.app)
[![Somnia Testnet](https://img.shields.io/badge/Somnia-Testnet%2050312-10120d)](https://shannon-explorer.somnia.network/address/0x6932C7827E7BFd9f0015Ed93fA120379E0d20541)

Steward is a verifiable DAO governance proxy on Somnia. A user delegates voting criteria, a proposal appears, a Somnia Agent reasons against the criteria, and the callback path records a YES, NO, or ABSTAIN decision onchain.

The current MVP proves the full loop: `Steward` invokes the live Somnia LLM Inference agent, receives the async callback, casts a MiniGovernor vote, and stores the result onchain. The verifier also decodes each live `inferString` request payload and checks the exact proposal text, voting criteria, system prompt, allowed vote outputs, validator receipt steps, runner quorum, timing, and token usage.
Both project contracts are source-verified on the Somnia explorer.

## 30-Second Judge Path

1. Open the live page: `https://steward-ashy.vercel.app`.
2. Inspect the YES, NO, and ABSTAIN proof cards, each with proposal tx, agent request tx, agent receipt JSON, and callback vote tx.
3. Clone the repo and run `./scripts/verify-steward-proof.sh`. The expected final marker is `STEWARD_FULL_PROOF_VALID`.
4. The verifier checks live state, validator receipt quorum, transaction logs, source verification, and decoded LLM request payloads.

For the fastest review path, see [`JUDGE_GUIDE.md`](./JUDGE_GUIDE.md). For product/market framing, see [`PRODUCT.md`](./PRODUCT.md). For the direct receipt map, see [`PROOF.md`](./PROOF.md). For the contract and callback flow, see [`ARCHITECTURE.md`](./ARCHITECTURE.md). For trust assumptions and failure behavior, see [`THREAT_MODEL.md`](./THREAT_MODEL.md).

## Why This Is Somnia-Native

Steward depends on Somnia's agent primitive as the load-bearing action path. The contract does not call an offchain bot controlled by the app. It calls SomniaAgents, passes proposal text and delegation criteria into the live LLM Inference agent, then waits for the platform callback before casting the vote.

Removing Somnia removes the product: there is no auditable agent request, no validator execution receipt, and no trust-minimized callback that binds the reasoning result to the final governance state. The value is not just automation; it is an onchain vote whose agent decision trail can be inspected after the fact.

## Judge-Facing Scorecard

| Criterion | Steward proof |
| --- | --- |
| Functionality | Live contracts on Somnia Testnet, three proposals, three Somnia agent requests, three callback-cast votes, and reproducible verifier scripts. |
| Agent-first design | The contract invokes SomniaAgents and waits for the LLM agent's YES, NO, or ABSTAIN response before changing governance state. |
| Innovation and technical creativity | DAO delegation becomes auditable agent reasoning. The request payload and receipt trail are part of the value, not an afterthought. |
| Autonomous performance | After `requestVote`, the LLM subcommittee response and async callback drive the final vote without a human reviewer approving the decision. |
| Verifiability | The full proof command decodes each live LLM request payload and confirms the mandate, proposal, system prompt, allowed outputs, receipt steps, runner quorum, callback logs, and final governor vote. |

## Live Somnia Testnet Constants

| Surface | Value |
| --- | --- |
| Chain | Somnia Testnet `50312` |
| RPC | `https://dream-rpc.somnia.network` |
| SomniaAgents requester | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| AgentRegistry | `0x08D1Fc808f1983d2Ea7B63a28ECD4d8C885Cd02A` |
| LLM Inference agent ID | [`12847293847561029384`](https://agents.testnet.somnia.network/agent/12847293847561029384) |
| Practical LLM request value | `0.24 STT` |

## MVP Build Order

1. `HelloSomniaCallback`: contract-requested LLM inference, callback auth, decoded response, and callback status storage. Built and tested.
2. `MiniGovernor`: minimal proposal and vote target. Built and tested.
3. `Steward`: delegation criteria, vote request, LLM callback, onchain vote cast, and proof state storage. Built and tested.
4. One-page frontend: delegation card, proposal feed, vote proof timeline.

## Local Verification

Prerequisites:

- Foundry, for `forge` and `cast`.
- Node.js 22+.

Fastest judge path:

```shell
./scripts/verify-steward-proof.sh
```

Expected final marker: `STEWARD_FULL_PROOF_VALID`. This command asserts live onchain Steward/MiniGovernor state, Somnia's public LLM receipt service for all three YES, NO, and ABSTAIN requests, validator runner quorum, receipt timing, LLM token usage, decoded `inferString` request payloads, transaction-level event logs for the proof txs, and explorer source verification for both project contracts.

```shell
forge fmt --check
forge build
forge test -vvv
npm ci --prefix web
npm run build --prefix web
./scripts/verify-steward-proof.sh
```

## Frontend

The web app is a single proof page in `web/`. It reads live `Steward.voteRequests(...)` and `MiniGovernor.votes(...)` state for the YES, NO, and ABSTAIN examples directly from Somnia Testnet, reads Somnia's public receipt service to display validator receipt quorum, runner count, timing, and token usage for each agent decision, and links both source-verified contracts from the proof strip. The repo verifier handles the deeper payload-level proof.

Live frontend: `https://steward-ashy.vercel.app`

```shell
npm install --prefix web
npm run dev --prefix web
npm run build --prefix web
```

## Live Testnet Proof

| Artifact | Value |
| --- | --- |
| Deployer | `0x56D5f677dBf1988A8744e549E0fD12010C79728f` |
| Hello callback proof | `0xCD03cC93b7635dC50445Bf405462E8B94aFcb203` |
| Hello deploy tx | `0xa397b135960f2a2ddd53b901f2e4b7327b5e62a00444b428a7813d00a51742ee` |
| Hello LLM request tx | `0x702f414dee0b54c51fce6e0d153c39ed3193946c1df4e1682f5d227f161e6ee7` |
| Hello callback tx | `0xf84db0bb528b26dddd227fddf4a7f18c8cd6eee1cdadccd23fdb3d036072c873` |
| Hello request id | `1697263` |
| MiniGovernor | `0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389` |
| MiniGovernor deploy tx | `0x83b77eaad7965c9adf410052c11f0638c488a7a6d7a6b9a8ce5f90169040d62e` |
| Steward | `0x6932C7827E7BFd9f0015Ed93fA120379E0d20541` |
| Steward deploy tx | `0x723f8717b19a48b524858c5f1a1416be2016a2d393427a788e9e7b80af506147` |
| Delegation tx | `0xdf49c68c630deef7a319b8d0f6daaefa392be433343784295c8833f9460fd45b` |
| Source verification | `Steward` and `MiniGovernor` verified on Somnia explorer |

### Steward vote proofs

| Outcome | Proposal | Request id | Proposal tx | Request tx | Callback + vote tx | Final state |
| --- | --- | --- | --- | --- | --- | --- |
| `YES` | `1` | `1698384` | `0xb31236f41cab27998bbf5593a1fbd8eda3f330eaf1c4b6b34523e5161d30852b` | `0x63c34767e59cc6988fd2ab5ecef9d1089e9f4445e1b1e18a9b490b0d0efc77ef` | `0xb74e25845472a2f591aa91eefe84e5e2828b41ac11acc78b41ceb1015500c52b` | `voteRequests(1698384)` is `Cast`, support `1`; `MiniGovernor.votes(1, Steward)` is `1` |
| `NO` | `2` | `1738101` | `0xebc1961f3aa23078bb1d54e99d61fc4e8647caae1bae5e4e9f4ec48f2df53b3d` | `0x6d32b090d9ebacc6dd1dd46c01e0036bff3e684df4a28d3817823cd3747959fc` | `0xe14303e64f6a5db3d74919c94f42d3c14df3183e225f9996cc29cba86cc66dc3` | `voteRequests(1738101)` is `Cast`, support `2`; `MiniGovernor.votes(2, Steward)` is `2` |
| `ABSTAIN` | `3` | `1738108` | `0x758f8dbc8cadf4887b301e33ab55c068ad983a4d507bd6cb9c5caa48b7060e53` | `0xa01f30ee06dbfa66b4a60414469d4f0e6406440f11e625a1197de88d797e851d` | `0xa157564585f473503627c801d6fb5992900dab3d5efcb31d4f15383c16487603` | `voteRequests(1738108)` is `Cast`, support `3`; `MiniGovernor.votes(3, Steward)` is `3` |

Explorer base: `https://shannon-explorer.somnia.network`

### Somnia agent receipt path

The durable judge trail is the SomniaAgents request transaction plus the async callback vote transaction. Each request tx contains the platform `RequestCreated` log with the LLM agent id, encoded `inferString` payload, and selected subcommittee. The verifier decodes that payload and checks the exact governance criteria, proposal text, system prompt, `chainOfThought = false`, and allowed outputs (`YES`, `NO`, `ABSTAIN`). Each callback tx shows SomniaAgents calling `Steward.handleResponse`, after which Steward records the final vote and emits `StewardVoteCast`.

| Outcome | Agent request | Agent execution receipt | Callback vote | Agent surface |
| --- | --- | --- | --- | --- |
| `YES` | [`RequestCreated #1698384`](https://shannon-explorer.somnia.network/tx/0x63c34767e59cc6988fd2ab5ecef9d1089e9f4445e1b1e18a9b490b0d0efc77ef) | [`receipt JSON`](https://receipts.testnet.agents.somnia.host/agent-receipts?requestId=1698384&contractAddress=0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776&type=minimal) | [`StewardVoteCast`](https://shannon-explorer.somnia.network/tx/0xb74e25845472a2f591aa91eefe84e5e2828b41ac11acc78b41ceb1015500c52b) | [`LLM agent`](https://agents.testnet.somnia.network/agent/12847293847561029384) |
| `NO` | [`RequestCreated #1738101`](https://shannon-explorer.somnia.network/tx/0x6d32b090d9ebacc6dd1dd46c01e0036bff3e684df4a28d3817823cd3747959fc) | [`receipt JSON`](https://receipts.testnet.agents.somnia.host/agent-receipts?requestId=1738101&contractAddress=0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776&type=minimal) | [`StewardVoteCast`](https://shannon-explorer.somnia.network/tx/0xe14303e64f6a5db3d74919c94f42d3c14df3183e225f9996cc29cba86cc66dc3) | [`LLM agent`](https://agents.testnet.somnia.network/agent/12847293847561029384) |
| `ABSTAIN` | [`RequestCreated #1738108`](https://shannon-explorer.somnia.network/tx/0xa01f30ee06dbfa66b4a60414469d4f0e6406440f11e625a1197de88d797e851d) | [`receipt JSON`](https://receipts.testnet.agents.somnia.host/agent-receipts?requestId=1738108&contractAddress=0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776&type=minimal) | [`StewardVoteCast`](https://shannon-explorer.somnia.network/tx/0xa157564585f473503627c801d6fb5992900dab3d5efcb31d4f15383c16487603) | [`LLM agent`](https://agents.testnet.somnia.network/agent/12847293847561029384) |

The receipt JSON is served by Somnia's public receipt service. It shows the validator runner receipts, request metadata, token usage, timing, and decoded execution steps such as `request_decoded`, `llm_response`, and `response_encoded`. The proof set currently has at least two runner addresses per request, matching the threshold-2-of-3 receipt model. The deployed Steward contract also stores the platform response receipt field when SomniaAgents returns one. The current live examples finalized with onchain `receipt = 0`, so the public proof uses the receipt service plus transaction-level SomniaAgents request and callback logs rather than inventing a nonzero onchain receipt id.

## Deploy Callback Proof

Somnia testnet contract creation consumed far more gas than local estimates, and `forge script --broadcast` repeatedly under-gassed creation transactions. Use raw create / `forge create` with explicit high gas limits for live deployments.

```shell
cp .env.example .env
# fill PRIVATE_KEY
source .env

BYTECODE=$(node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync("out/HelloSomniaCallback.sol/HelloSomniaCallback.json","utf8")).bytecode.object)')
ARGS=$(cast abi-encode "constructor(address,uint256)" "$SOMNIA_AGENTS" "$LLM_AGENT_ID")
cast send --rpc-url "$SOMNIA_TESTNET_RPC" \
  --private-key "$PRIVATE_KEY" \
  --legacy \
  --gas-limit 20000000 \
  --gas-price 6000000000 \
  --create "${BYTECODE}${ARGS#0x}"
```

After deployment, set `HELLO_CALLBACK` and request one LLM decision:

```shell
cast send "$HELLO_CALLBACK" \
  "requestDecision(string,string,string[])(uint256)" \
  "Proposal: allocate 500K USDC to community grants. Criteria: vote YES for grants under 1M, NO for team token unlocks, ABSTAIN if unclear. Return exactly one allowed value." \
  "You are Steward, a deterministic DAO voting agent. Return only YES, NO, or ABSTAIN." \
  '["YES","NO","ABSTAIN"]' \
  --value 0.24ether \
  --rpc-url "$SOMNIA_TESTNET_RPC" \
  --private-key "$PRIVATE_KEY" \
  --legacy \
  --gas-limit 3000000 \
  --gas-price 6000000000
```

The resulting request should appear on the Somnia Agents explorer. The contract stores the callback response, platform status, and any receipt id returned by the platform when it calls `handleResponse`.

## Deploy Steward MVP

```shell
MINI_BYTECODE=$(node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync("out/MiniGovernor.sol/MiniGovernor.json","utf8")).bytecode.object)')
cast send --rpc-url "$SOMNIA_TESTNET_RPC" \
  --private-key "$PRIVATE_KEY" \
  --legacy \
  --gas-limit 20000000 \
  --gas-price 6000000000 \
  --create "$MINI_BYTECODE"

STEWARD_BYTECODE=$(node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync("out/Steward.sol/Steward.json","utf8")).bytecode.object)')
STEWARD_ARGS=$(cast abi-encode "constructor(address,uint256)" "$SOMNIA_AGENTS" "$LLM_AGENT_ID")
cast send --rpc-url "$SOMNIA_TESTNET_RPC" \
  --private-key "$PRIVATE_KEY" \
  --legacy \
  --gas-limit 35000000 \
  --gas-price 6000000000 \
  --create "${STEWARD_BYTECODE}${STEWARD_ARGS#0x}"
```

Set `MINI_GOVERNOR` and `STEWARD` from the broadcast output, then seed one proposal, create one delegation, and request an agent vote:

```shell
cast send "$MINI_GOVERNOR" \
  "createProposal(string,uint64)(uint256)" \
  "$PROPOSAL_TEXT" \
  "$VOTING_PERIOD" \
  --rpc-url "$SOMNIA_TESTNET_RPC" \
  --private-key "$PRIVATE_KEY" \
  --legacy \
  --gas-limit 3000000 \
  --gas-price 6000000000

VALID_UNTIL=$(($(date +%s) + ${DELEGATION_DURATION:-2592000}))
cast send "$STEWARD" \
  "delegate(address,string,uint64)(uint256)" \
  "$MINI_GOVERNOR" \
  "$CRITERIA_TEXT" \
  "$VALID_UNTIL" \
  --rpc-url "$SOMNIA_TESTNET_RPC" \
  --private-key "$PRIVATE_KEY" \
  --legacy \
  --gas-limit 4000000 \
  --gas-price 6000000000

cast send "$STEWARD" \
  "requestVote(uint256,uint256)(uint256)" \
  1 \
  1 \
  --value 0.24ether \
  --rpc-url "$SOMNIA_TESTNET_RPC" \
  --private-key "$PRIVATE_KEY" \
  --legacy \
  --gas-limit 5000000 \
  --gas-price 6000000000
```

Current execution path:

1. `MiniGovernor.createProposal` creates a proposal.
2. `Steward.delegate` stores the user's criteria hash and criteria text.
3. `Steward.requestVote` calls SomniaAgents `createRequest` with the LLM Inference agent.
4. Somnia calls `Steward.handleResponse`.
5. `Steward` parses `YES`, `NO`, or `ABSTAIN`, calls `MiniGovernor.castVoteWithReason`, and emits `StewardVoteCast`.

## Current Scope

In scope for the current proof set:

- One Somnia LLM agent path.
- One minimal governor.
- Three proposal outcomes: YES, NO, ABSTAIN.
- One frontend route.

Out of scope for this MVP:

- Snapshot/Tally integrations.
- Delegate marketplace.
- Reputation scores.
- Cross-chain governance.

## License

MIT.
