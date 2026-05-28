# Steward

Verifiable DAO governance proxy on Somnia. A user delegates voting criteria, a proposal appears, a Somnia Agent reasons against the criteria, and the callback path records a YES, NO, or ABSTAIN decision onchain.

The current MVP proves the full loop: `Steward` invokes the live Somnia LLM Inference agent, receives the async callback, casts a MiniGovernor vote, and stores the result onchain.

## Live Somnia Testnet Constants

| Surface | Value |
| --- | --- |
| Chain | Somnia Testnet `50312` |
| RPC | `https://dream-rpc.somnia.network` |
| SomniaAgents requester | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| AgentRegistry | `0x08D1Fc808f1983d2Ea7B63a28ECD4d8C885Cd02A` |
| LLM Inference agent ID | `12847293847561029384` |
| Practical LLM request value | `0.24 STT` |

## MVP Build Order

1. `HelloSomniaCallback`: contract-requested LLM inference, callback auth, decoded response, and callback status storage. Built and tested.
2. `MiniGovernor`: minimal proposal and vote target. Built and tested.
3. `Steward`: delegation criteria, vote request, LLM callback, onchain vote cast, and proof state storage. Built and tested.
4. One-page frontend: delegation card, proposal feed, vote proof timeline.

## Local Verification

```shell
forge fmt --check
forge build
forge test -vvv
npm run build --prefix web
./scripts/verify-live.sh
```

## Frontend

The web app is a single proof page in `web/`. It reads live `Steward.voteRequests(...)` and `MiniGovernor.votes(...)` state for the YES, NO, and ABSTAIN examples directly from Somnia Testnet.

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

### Steward vote proofs

| Outcome | Proposal | Request id | Proposal tx | Request tx | Callback + vote tx | Final state |
| --- | --- | --- | --- | --- | --- | --- |
| `YES` | `1` | `1698384` | `0xb31236f41cab27998bbf5593a1fbd8eda3f330eaf1c4b6b34523e5161d30852b` | `0x63c34767e59cc6988fd2ab5ecef9d1089e9f4445e1b1e18a9b490b0d0efc77ef` | `0xb74e25845472a2f591aa91eefe84e5e2828b41ac11acc78b41ceb1015500c52b` | `voteRequests(1698384)` is `Cast`, support `1`; `MiniGovernor.votes(1, Steward)` is `1` |
| `NO` | `2` | `1738101` | `0xebc1961f3aa23078bb1d54e99d61fc4e8647caae1bae5e4e9f4ec48f2df53b3d` | `0x6d32b090d9ebacc6dd1dd46c01e0036bff3e684df4a28d3817823cd3747959fc` | `0xe14303e64f6a5db3d74919c94f42d3c14df3183e225f9996cc29cba86cc66dc3` | `voteRequests(1738101)` is `Cast`, support `2`; `MiniGovernor.votes(2, Steward)` is `2` |
| `ABSTAIN` | `3` | `1738108` | `0x758f8dbc8cadf4887b301e33ab55c068ad983a4d507bd6cb9c5caa48b7060e53` | `0xa01f30ee06dbfa66b4a60414469d4f0e6406440f11e625a1197de88d797e851d` | `0xa157564585f473503627c801d6fb5992900dab3d5efcb31d4f15383c16487603` | `voteRequests(1738108)` is `Cast`, support `3`; `MiniGovernor.votes(3, Steward)` is `3` |

Explorer base: `https://shannon-explorer.somnia.network`

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

Expected demo path:

1. `MiniGovernor.createProposal` creates a proposal.
2. `Steward.delegate` stores the user's criteria hash and criteria text.
3. `Steward.requestVote` calls SomniaAgents `createRequest` with the LLM Inference agent.
4. Somnia calls `Steward.handleResponse`.
5. `Steward` parses `YES`, `NO`, or `ABSTAIN`, calls `MiniGovernor.castVoteWithReason`, and emits `StewardVoteCast`.

## Current Scope

In scope for the first demo:

- One Somnia LLM agent path.
- One minimal governor.
- Three proposal outcomes: YES, NO, ABSTAIN.
- One frontend route.

Out of scope until the loop is proven:

- Snapshot/Tally integrations.
- Delegate marketplace.
- Reputation scores.
- Cross-chain governance.
