# Steward

Delegate DAO voting criteria once onchain; Steward's Somnia agent council watches proposal URLs, reasons against the mandate, and casts YES, NO, or ABSTAIN with public receipts.

[![CI](https://github.com/dolepee/steward/actions/workflows/test.yml/badge.svg)](https://github.com/dolepee/steward/actions/workflows/test.yml)
[![Live Proof](https://github.com/dolepee/steward/actions/workflows/live-proof.yml/badge.svg)](https://github.com/dolepee/steward/actions/workflows/live-proof.yml)
[![Live app](https://img.shields.io/badge/live-steward--ashy.vercel.app-6bff7d)](https://steward-ashy.vercel.app)
[![Somnia Testnet](https://img.shields.io/badge/Somnia-Testnet%2050312-10120d)](https://shannon-explorer.somnia.network/address/0x6932C7827E7BFd9f0015Ed93fA120379E0d20541)

Steward is autonomous governance delegation for DAOs, built on Somnia. A member writes their values once as an onchain mandate. From then on, Steward's execution layer watches proposal sources, Somnia's Parse Website agent reads each proposal, three reviewer agents reason against the mandate, and an authenticated callback casts a verifiable YES, NO, or ABSTAIN vote onchain.

The strongest live proof is now the delegated council V2: `StewardCouncilDelegationPipeline` stores the mandate, `scripts/watch-delegated-council.mjs` detects changed proposal sources, and the wrapper forwards the stored criteria into the already-live `StewardCouncilPipeline`. The council asks Somnia's `LLM Parse Website` agent to read each proposal page, sends the parsed facts to three independent LLM reviewers (`budget`, `risk`, and `participation`), and casts the majority outcome into `MiniGovernor`, a minimal proof governor used to demonstrate the vote target without claiming production DAO governance. The V2 proof shows the same stored delegation producing live watcher-triggered `YES`, `NO`, and `ABSTAIN` votes.

Execution is permissionless on purpose. A delegation owner controls the mandate text, governor, expiry, and revocation; any executor or watcher can pay the Somnia request deposit to trigger evaluation for an active delegation. In the delegated V2 path, the executor cannot replace the stored criteria, governor, downstream council contract, authorized callback sender, agent ids, or final vote target. The executor does supply the proposal id and proposal URL for that run, so the proof model is best read as permissionless proposal-source execution against a stored mandate, not owner-only private automation.

The base `Steward` proof remains as a lower-level receipt trail: it invokes the live Somnia LLM Inference agent, receives the async callback, casts a MiniGovernor vote, and stores the result onchain. The verifier decodes each live `inferString` request payload and checks the exact proposal text, voting criteria, system prompt, allowed vote outputs, validator receipt steps, runner quorum, timing, and token usage. The base proof contracts, delegated wrapper, and live council pipeline are source-verified on the Somnia explorer.

## Demo-First Review Path

1. Open the live product path: `https://steward-ashy.vercel.app/council`.
2. Start with the stored mandate: delegation `1` was written onchain once, then watcher executions `1`, `2`, and `3` produced `YES`, `NO`, and `ABSTAIN`.
3. Show the agent council: Parse Website reads the proposal source, three reviewer agents reason against the mandate, and the majority result becomes the final vote.
4. Open any V2 final-vote tx and confirm the council contract, not the frontend, cast into the minimal `MiniGovernor` proof target.
5. Then verify the proof: `node scripts/verify-delegated-council-proofs.mjs` should print `STEWARD_DELEGATED_COUNCIL_PROOFS_VALID`; `./scripts/verify-steward-proof.sh` should print `STEWARD_FULL_PROOF_VALID`.

For the fastest review path, see [`JUDGE_GUIDE.md`](./JUDGE_GUIDE.md). For product/market framing, see [`PRODUCT.md`](./PRODUCT.md). For the direct receipt map, see [`PROOF.md`](./PROOF.md). For the contract and callback flow, see [`ARCHITECTURE.md`](./ARCHITECTURE.md). For trust assumptions and failure behavior, see [`THREAT_MODEL.md`](./THREAT_MODEL.md).

## Why This Is Somnia-Native

Steward depends on Somnia's agent primitive as the load-bearing action path. The contract does not call an offchain bot controlled by the app. It calls SomniaAgents, passes proposal text and delegation criteria into the live LLM Inference agent, then waits for the platform callback before casting the vote.

Removing Somnia removes the product: there is no auditable agent request, no validator execution receipt, and no trust-minimized callback that binds the reasoning result to the final governance state. The value is not just automation; it is an onchain vote whose agent decision trail can be inspected after the fact.

## Judge-Facing Scorecard

| Criterion | Steward proof |
| --- | --- |
| Functionality | Live contracts on Somnia Testnet, watcher-triggered stored delegation with YES/NO/ABSTAIN outcomes, five fallback council URL votes, three direct proposal votes, Somnia agent requests, callback-cast votes, and reproducible verifier scripts. |
| Agent-first design | Steward invokes Somnia's Parse Website and LLM Inference agents, then waits for authenticated platform callbacks before changing governance state. |
| Innovation and technical creativity | DAO delegation becomes auditable agent reasoning. V2 separates stored mandate execution from the multi-agent council, and the council composes Parse Website plus three independent LLM reviewers before casting a majority vote. |
| Autonomous performance | The watcher executes a stored delegation when proposal source content changes; after that, Somnia's async agent callbacks drive each final vote without a human reviewer approving the decision. |
| Verifiability | The full proof command checks stored delegation state, watcher-created proposals, downstream council jobs, reviewer decisions, callback logs, final governor votes, and source verification for the stable live contracts. |

## Live Somnia Testnet Constants

| Surface | Value |
| --- | --- |
| Chain | Somnia Testnet `50312` |
| RPC | `https://dream-rpc.somnia.network` |
| SomniaAgents requester | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| AgentRegistry | `0x08D1Fc808f1983d2Ea7B63a28ECD4d8C885Cd02A` |
| LLM Inference agent ID | [`12847293847561029384`](https://agents.testnet.somnia.network/agent/12847293847561029384) |
| LLM Parse Website agent ID | [`12875401142070969085`](https://agents.testnet.somnia.network/agent/12875401142070969085) |
| Delegated council wrapper | [`0xd01f2e924A0846fdC7cEF677e8887CEE589DCa64`](https://shannon-explorer.somnia.network/address/0xd01f2e924A0846fdC7cEF677e8887CEE589DCa64) |
| Council pipeline | [`0xB890e1274eE308cBC8348a7E032394406215fd52`](https://shannon-explorer.somnia.network/address/0xB890e1274eE308cBC8348a7E032394406215fd52) |
| Practical LLM request value | Current deployment used `0.24 STT`; current source quotes `SomniaAgents.getRequestDeposit() + 0.21 STT` per LLM vote/reviewer request. |

## Implemented Proof Surfaces

1. `HelloSomniaCallback`: contract-requested LLM inference, callback auth, decoded response, and callback status storage.
2. `MiniGovernor`: minimal proposal and vote target used for repeatable live proof without Snapshot/Tally integration risk.
3. `Steward`: stored delegation criteria, direct LLM callback, onchain vote cast, and proof state storage.
4. `StewardCouncilPipeline`: proposal URL parsing, three LLM reviewer roles, majority vote, and refund-safe callback handling.
5. `StewardCouncilDelegationPipeline`: stored council delegation plus watcher-triggered execution into the live council.
6. Live frontend: `/council` for the V2 delegated proof, `/proof` for the lower-level receipt trail, and proposal source pages used by the watcher.

## Proposal URL Source Layer

The product direction is not a private bot that copies proposal text into a prompt. Steward starts from public proposal source pages and makes the agent trail auditable.

The live council path uses this source model:

1. `StewardCouncilPipeline` asks Somnia's [`LLM Parse Website`](https://docs.somnia.network/agents/base-agents/llm-parse-website) agent to read a proposal URL and extract decision-critical facts.
2. Three reviewer roles receive the parsed facts and delegated criteria.
3. The contract casts only the majority `YES`, `NO`, or `ABSTAIN` result into `MiniGovernor`.

The repo also includes an optional two-agent `StewardUrlPipeline` implementation for a simpler single-reviewer path:

1. `StewardUrlPipeline` asks Somnia's [`LLM Parse Website`](https://docs.somnia.network/agents/base-agents/llm-parse-website) agent to read a proposal URL and extract a factual proposal summary.
2. The same contract sends that extracted summary plus the delegate criteria to the `LLM Inference` agent.
3. The callback from the vote decision casts `YES`, `NO`, or `ABSTAIN` into `MiniGovernor`.

This single-reviewer path is additive and does not replace the live council proof above.

The frontend publishes four plain-HTML proposal source pages for stable proof coverage, and the live council proof also includes one external governance forum page:

| Expected vote | Source URL |
| --- | --- |
| `YES` | `https://steward-ashy.vercel.app/proposals/community-grants.html` |
| `NO` | `https://steward-ashy.vercel.app/proposals/team-token-unlock.html` |
| `ABSTAIN` | `https://steward-ashy.vercel.app/proposals/ecosystem-working-group.html` |
| `YES` | `https://steward-ashy.vercel.app/proposals/security-grants.html` |
| `YES` | `https://forum.developerdao.com/t/devconnect-funding-proposal/3371` |

## Live Delegated Council V2

`StewardCouncilDelegationPipeline` is the autonomy upgrade. It stores the owner mandate onchain and lets a watcher execute that mandate when a proposal source changes. The wrapper does not take new criteria at execution time; it reads the stored criteria and calls the live `StewardCouncilPipeline`, which runs the Parse Website plus three-reviewer council flow.

Live delegated proof set:

| Artifact | Value |
| --- | --- |
| Delegated wrapper | [`0xd01f2e924A0846fdC7cEF677e8887CEE589DCa64`](https://shannon-explorer.somnia.network/address/0xd01f2e924A0846fdC7cEF677e8887CEE589DCa64) |
| Wrapper deploy tx | [`0x73cd19f6ba11f7dccb70ef8ed8e3afd321cc4aa2b3f99dd24fbb0658002031a9`](https://shannon-explorer.somnia.network/tx/0x73cd19f6ba11f7dccb70ef8ed8e3afd321cc4aa2b3f99dd24fbb0658002031a9) |
| Stored delegation tx | [`0xac1cff99c68e12dfbf1ffe91533aa711da6f4ec30145ef2b611168fa4e8c9d2f`](https://shannon-explorer.somnia.network/tx/0xac1cff99c68e12dfbf1ffe91533aa711da6f4ec30145ef2b611168fa4e8c9d2f) |

| Outcome | Proposal / execution / job | Parse request | Watcher execution tx | Parse callback tx | Final vote tx | Tally |
| --- | --- | --- | --- | --- | --- | --- |
| `YES` | `9` / `1` / `6` | `3578516` | [`tx`](https://shannon-explorer.somnia.network/tx/0xfd8eb6788a53a71ad7dc19239535446f22f807a65beab455a5ffda376e84087e) | [`tx`](https://shannon-explorer.somnia.network/tx/0x4bd3e9eacc09d57f6fef12daa88d0e1707c2cf287ea3ffd312e1f92e8f9aae85) | [`tx`](https://shannon-explorer.somnia.network/tx/0xb47bf7b3cca5f28aa1cb80b6c7b96c6c6d8ae0def215fe4e719a58381991f166) | `YES=3, NO=0, ABSTAIN=0` |
| `NO` | `10` / `2` / `7` | `3586459` | [`tx`](https://shannon-explorer.somnia.network/tx/0x8ae266600d7db6047cb92cf8e9b0d273bc9e928895eb0f03754e08f0900180fa) | [`tx`](https://shannon-explorer.somnia.network/tx/0xc076e8cdf1947d1c1af63cf30984dbc81e6b9a923aed6c5d403f63b4144f2c63) | [`tx`](https://shannon-explorer.somnia.network/tx/0xa813db445a7e67097f813f990e83109392ff6693560af72ba78fb80c704245df) | `YES=0, NO=3, ABSTAIN=0` |
| `ABSTAIN` | `11` / `3` / `8` | `3586764` | [`tx`](https://shannon-explorer.somnia.network/tx/0x6b5c981ef7aea55842f4d64b11ebf61778e8836e2819eebfc901cf5821bf202a) | [`tx`](https://shannon-explorer.somnia.network/tx/0x7b0c790854290a7c1b8d006cb21444a5a173f7e9ad17ab2f31fb5a5ce4d69e6e) | [`tx`](https://shannon-explorer.somnia.network/tx/0x30266873508326a2f15b057da398998ecaad3b94a493cde4756f7c548250a4e8) | `YES=0, NO=0, ABSTAIN=3` |

Local verification:

```shell
node scripts/verify-delegated-council-proofs.mjs
```

Expected marker: `STEWARD_DELEGATED_COUNCIL_PROOFS_VALID`.

## Live Council Pipeline

`StewardCouncilPipeline` is the stronger Agentathon path. It avoids a single-model vote by composing four Somnia agent calls:

1. `LLM Parse Website` reads the public proposal URL and extracts decision-critical facts.
2. A budget reviewer evaluates the extracted facts against the delegate mandate.
3. A risk reviewer evaluates downside, unlocks, and ambiguity.
4. A participation reviewer evaluates whether the proposal merits action or abstention.

The contract records each reviewer request and decision, then casts only the majority outcome into `MiniGovernor`. If the three reviewers split `YES/NO/ABSTAIN`, the final vote is `ABSTAIN`. If one reviewer fails or returns an invalid vote, that reviewer is counted as `ABSTAIN` so one bad callback cannot stall the council. Parse failure fails closed and refunds the unused review deposits.

Live council proof set:

| Artifact | Value |
| --- | --- |
| Council pipeline | [`0xB890e1274eE308cBC8348a7E032394406215fd52`](https://shannon-explorer.somnia.network/address/0xB890e1274eE308cBC8348a7E032394406215fd52) |
| Deploy tx | [`0x0f9c058cb1d07c2885177e4e104c2115ccf6e87f37eb289a867005def970f1e3`](https://shannon-explorer.somnia.network/tx/0x0f9c058cb1d07c2885177e4e104c2115ccf6e87f37eb289a867005def970f1e3) |

| Outcome | Proposal / job | Parse request | Reviewer requests | Final vote tx | Tally |
| --- | --- | --- | --- | --- | --- |
| `YES` | `4` / `1` | `3085689` | `3085732`, `3085733`, `3085734` | [`tx`](https://shannon-explorer.somnia.network/tx/0x6dc4156b46c96fa4c099aed8092dbbd6927e15ab204b6fbcaafc7121d9f11641) | `YES=3, NO=0, ABSTAIN=0` |
| `NO` | `5` / `2` | `3090443` | `3090480`, `3090481`, `3090482` | [`tx`](https://shannon-explorer.somnia.network/tx/0xe4c9dc53ca612d09a6af84e9e45b48fb51ee4506b0b5a839f90d81bd2fe08686) | `YES=0, NO=3, ABSTAIN=0` |
| `ABSTAIN` | `6` / `3` | `3090879` | `3090907`, `3090908`, `3090909` | [`tx`](https://shannon-explorer.somnia.network/tx/0x12ed8607444b7d99440e964f5e8802734a15b9572542cc4786d2d16eccbb00aa) | `YES=0, NO=0, ABSTAIN=3` |
| `YES` | `7` / `4` | `3101870` | `3101910`, `3101911`, `3101912` | [`tx`](https://shannon-explorer.somnia.network/tx/0x7a1de92ec5a0f67dc395c45c730fe6a1d2cb42447f2f705442828ad3f3003960) | `YES=3, NO=0, ABSTAIN=0` |
| `YES` | `8` / `5` | `3547601` | `3547653`, `3547654`, `3547655` | [`tx`](https://shannon-explorer.somnia.network/tx/0x72bb5ebf65edfd899ced20c86a9297c5b1d02cc7d63440032d63004198a74231) | `YES=3, NO=0, ABSTAIN=0` |

Local verification:

```shell
forge test --match-contract StewardCouncilPipelineTest -vvv
```

Live proof verification:

```shell
node scripts/verify-council-proof.mjs
```

## Local Verification

Prerequisites:

- Foundry, for `forge` and `cast`.
- Node.js 22+.

Fastest judge path:

```shell
./scripts/verify-steward-proof.sh
```

Expected final marker: `STEWARD_FULL_PROOF_VALID`. This command asserts live onchain Steward/MiniGovernor state, Somnia's public LLM receipt service for all three YES, NO, and ABSTAIN requests, validator runner quorum, receipt timing, LLM token usage, decoded `inferString` request payloads, transaction-level event logs for the proof txs, the delegated council V2 YES/NO/ABSTAIN proof set, the five-case live council fallback proof set, and explorer source verification for `Steward`, `MiniGovernor`, `StewardCouncilPipeline`, and `StewardCouncilDelegationPipeline`. If `STEWARD_URL_PIPELINE` is set, the source verifier also checks that deployed URL pipeline contract.

```shell
forge fmt --check
forge build
forge test -vvv
npm ci --prefix web
npm run build --prefix web
./scripts/verify-steward-proof.sh
```

Optional single-reviewer URL pipeline local test:

```shell
forge test --match-contract StewardUrlPipelineTest -vvv
```

Optional single-reviewer URL pipeline live proof, after deploying `StewardUrlPipeline` and filling the `URL_PIPELINE_*` values in `.env`:

```shell
node scripts/verify-url-pipeline-trail.mjs
```

Public GitHub verifier path after deployment: open the
[`URL Pipeline Proof`](https://github.com/dolepee/steward/actions/workflows/url-pipeline-proof.yml)
workflow, provide the deployed `StewardUrlPipeline` address and the deploy or
seed `from_block`, then run it. The workflow collects the URL pipeline logs,
exports the proof environment, checks that the seeded URLs produced the expected
`YES`, `NO`, and `ABSTAIN` cases, then runs
`node scripts/verify-url-pipeline-trail.mjs`. The verifier checks transaction
logs, decoded Parse Website and LLM payloads, final governor votes, and public
Somnia receipt quorum for both agent calls.

Seed three URL-pipeline proof jobs against the public proposal source pages:

```shell
forge script script/SeedUrlPipelineProofs.s.sol --rpc-url "$SOMNIA_TESTNET_RPC" --broadcast --legacy
```

`StewardUrlPipeline.quoteUrlVote()` breaks the required value into platform
deposit, Parse Website budget, and LLM vote deposit. The request scripts use
that quote and optionally accept `URL_PIPELINE_DEPOSIT_BUFFER`; any overpayment
is recorded as a claimable refund instead of reverting the demo transaction.

After the three parse callbacks and three vote callbacks finalize, set
`URL_PIPELINE_CASES=YES,NO,ABSTAIN` and the prefixed `URL_PIPELINE_YES_*`,
`URL_PIPELINE_NO_*`, and `URL_PIPELINE_ABSTAIN_*` tx fields. The expected final
marker becomes `STEWARD_URL_PIPELINE_BATCH_VALID`.

One-command proof operator path, after `STEWARD_URL_PIPELINE`, `MINI_GOVERNOR`,
and a funded `PRIVATE_KEY` are set:

```shell
./scripts/run-url-pipeline-proof.sh
```

It seeds the three URL proposal jobs, waits for Somnia's Parse Website and LLM
Inference callbacks, collects the proof environment, and only runs the verifier
after the YES, NO, and ABSTAIN cases are all complete. Expected final markers:
`STEWARD_URL_PIPELINE_BATCH_VALID` and `STEWARD_URL_PIPELINE_PROOF_RUN_VALID`.
The collector labels known proof jobs by source URL rather than by returned vote,
so the verifier fails if a seeded URL produces the wrong governance outcome.
The verifier also fetches Somnia's public receipt service for each Parse Website
and LLM vote request, then checks threshold, runner evidence, agent id, timing,
and the LLM vote output.

Collector-only path, to avoid manual explorer copying after callbacks land:

```shell
URL_PIPELINE_FROM_BLOCK=<deploy-or-seed-block> node scripts/collect-url-pipeline-proof-env.mjs
node scripts/verify-url-pipeline-trail.mjs
```

## Frontend

The web app in `web/` is a multi-route proof surface: `/council` leads with the delegated V2 watcher proof set, `/proof` shows the lower-level receipt trail, `/sources` shows the public proposal inputs, `/guide` explains the review path, and `/console` is reserved for optional live execution. It reads live `Steward.voteRequests(...)` and `MiniGovernor.votes(...)` state for the YES, NO, and ABSTAIN examples directly from Somnia Testnet, reads Somnia's public receipt service to display validator receipt quorum, runner count, timing, and token usage for each agent decision, and links the delegated V2 plus five-case council proof set. The repo verifier handles the deeper payload-level proof.

After `StewardUrlPipeline` is deployed, set `VITE_STEWARD_URL_PIPELINE` before building the frontend. That exposes the browser console for the single-reviewer path: create a MiniGovernor proposal, quote the Somnia agent deposit, and start the Parse Website -> LLM vote pipeline from the page. Without that env value, the console is hidden so the public site does not advertise an inactive path.

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
| Source verification | `Steward`, `MiniGovernor`, `StewardCouncilPipeline`, and `StewardCouncilDelegationPipeline` verified on Somnia explorer |

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
# fill PRIVATE_KEY, then export only the values used by the raw commands below.
# Do not source .env blindly if you add unquoted values containing spaces.
export SOMNIA_TESTNET_RPC=https://dream-rpc.somnia.network
export SOMNIA_AGENTS=0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776
export LLM_AGENT_ID=12847293847561029384
export PRIVATE_KEY=<funded-testnet-private-key>

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
  "You are Steward, a schema-constrained DAO voting agent. Return only YES, NO, or ABSTAIN." \
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

- Stored delegated council execution through `StewardCouncilDelegationPipeline`.
- Somnia `LLM Parse Website` plus three LLM reviewer callbacks through `StewardCouncilPipeline`.
- Lower-level direct `Steward` LLM callback proof.
- Minimal source-verified `MiniGovernor` target.
- Live YES, NO, and ABSTAIN examples for the delegated council path.
- Public frontend routes for the council proof, direct proof, source pages, and explainer surfaces.

Out of scope for this MVP:

- Monitoring a production Snapshot/Tally/Governor Bravo feed directly.
- Snapshot/Tally integrations.
- Delegate marketplace.
- Reputation scores.
- Cross-chain governance.

## License

MIT.
