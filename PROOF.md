# Steward Proof Guide

Steward's strongest claim is simple: one stored onchain delegation was executed by a watcher for three proposal sources, then Somnia's Parse Website and LLM council path produced live onchain YES, NO, and ABSTAIN votes. The fallback proof also shows five public proposal URLs producing five autonomous onchain council votes across YES, NO, and ABSTAIN. One URL is an external Developer DAO governance forum page. The repo also keeps the lower-level single-agent YES, NO, and ABSTAIN receipt trail.

## What This Proves

| Claim | Evidence |
| --- | --- |
| Proposal URL ingestion | Each council proof starts from a public proposal page and a Somnia Parse Website request. |
| Stored delegation autonomy | The delegated V2 proof stores criteria once, then the watcher starts proposals `9`, `10`, and `11` without resupplying the mandate. |
| Reviewer council | Each parsed proposal fans out to budget, risk, and participation LLM reviewer requests. |
| Agent-first governance action | Steward does not cast a council vote until the reviewer callbacks produce a majority `YES`, `NO`, or `ABSTAIN`. |
| Async callback execution | Each final vote is written by the council pipeline after SomniaAgents callbacks. |
| Public agent receipt trail | Somnia's receipt service returns threshold-2-of-3 request metadata, validator runner receipts, timing, token usage, and decoded LLM steps for each request. |
| Transaction-level event trail | The council verifier checks `ProposalCreated`, `RequestCreated`, `CouncilPipelineStarted`, `CouncilProposalParsed`, `CouncilReviewerRequested`, `CouncilReviewerDecided`, `CouncilVoteCast`, and `VoteCast` logs for all five council jobs. |
| Verifiable final state | `MiniGovernor.votes(proposalId, StewardCouncilPipeline)` matches the majority support value. |
| Council proof | `StewardCouncilPipeline` parsed five public proposal URLs, requested fifteen LLM reviewer decisions, and cast live YES, NO, and ABSTAIN majority votes into MiniGovernor. |
| Delegated V2 proof | `StewardCouncilDelegationPipeline` executions `1`, `2`, and `3` forward stored delegation `1` into council jobs `6`, `7`, and `8`; final MiniGovernor votes are YES, NO, and ABSTAIN. |

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
STEWARD_COUNCIL_PROOF_VALID
STEWARD_DELEGATED_COUNCIL_PROOF_VALID
STEWARD_DELEGATED_COUNCIL_PROOFS_VALID
STEWARD_SOURCE_VERIFICATION_VALID
STEWARD_FULL_PROOF_VALID
```

## Delegated Council V2 Proof

| Artifact | Value |
| --- | --- |
| Delegated wrapper | [`0xd01f2e924A0846fdC7cEF677e8887CEE589DCa64`](https://shannon-explorer.somnia.network/address/0xd01f2e924A0846fdC7cEF677e8887CEE589DCa64) |
| Stored delegation tx | [`0xac1cff99c68e12dfbf1ffe91533aa711da6f4ec30145ef2b611168fa4e8c9d2f`](https://shannon-explorer.somnia.network/tx/0xac1cff99c68e12dfbf1ffe91533aa711da6f4ec30145ef2b611168fa4e8c9d2f) |

| Outcome | Proposal / execution / job | Parse request | Watcher execution tx | Parse callback tx | Final vote tx | Tally |
| --- | --- | --- | --- | --- | --- | --- |
| `YES` | `9` / `1` / `6` | `3578516` | [`tx`](https://shannon-explorer.somnia.network/tx/0xfd8eb6788a53a71ad7dc19239535446f22f807a65beab455a5ffda376e84087e) | [`tx`](https://shannon-explorer.somnia.network/tx/0x4bd3e9eacc09d57f6fef12daa88d0e1707c2cf287ea3ffd312e1f92e8f9aae85) | [`tx`](https://shannon-explorer.somnia.network/tx/0xb47bf7b3cca5f28aa1cb80b6c7b96c6c6d8ae0def215fe4e719a58381991f166) | `YES=3`, `NO=0`, `ABSTAIN=0` |
| `NO` | `10` / `2` / `7` | `3586459` | [`tx`](https://shannon-explorer.somnia.network/tx/0x8ae266600d7db6047cb92cf8e9b0d273bc9e928895eb0f03754e08f0900180fa) | [`tx`](https://shannon-explorer.somnia.network/tx/0xc076e8cdf1947d1c1af63cf30984dbc81e6b9a923aed6c5d403f63b4144f2c63) | [`tx`](https://shannon-explorer.somnia.network/tx/0xa813db445a7e67097f813f990e83109392ff6693560af72ba78fb80c704245df) | `YES=0`, `NO=3`, `ABSTAIN=0` |
| `ABSTAIN` | `11` / `3` / `8` | `3586764` | [`tx`](https://shannon-explorer.somnia.network/tx/0x6b5c981ef7aea55842f4d64b11ebf61778e8836e2819eebfc901cf5821bf202a) | [`tx`](https://shannon-explorer.somnia.network/tx/0x7b0c790854290a7c1b8d006cb21444a5a173f7e9ad17ab2f31fb5a5ce4d69e6e) | [`tx`](https://shannon-explorer.somnia.network/tx/0x30266873508326a2f15b057da398998ecaad3b94a493cde4756f7c548250a4e8) | `YES=0`, `NO=0`, `ABSTAIN=3` |

Run:

```shell
node scripts/verify-delegated-council-proofs.mjs
```

Expected marker:

```text
STEWARD_DELEGATED_COUNCIL_PROOFS_VALID
```

## Optional URL Pipeline Proof Verifier

`StewardUrlPipeline` is implemented and locally tested, but it is intentionally
not included in the current live proof until it has its own deployed contract
and three live transactions: pipeline start, Parse Website callback, and LLM vote
callback.

After those transactions exist, set the `URL_PIPELINE_*` values from
`.env.example` and run:

```shell
node scripts/verify-url-pipeline-trail.mjs
```

Expected final marker:

```text
STEWARD_URL_PIPELINE_TRAIL_VALID
```

For a public proof artifact, use the
[`URL Pipeline Proof`](https://github.com/dolepee/steward/actions/workflows/url-pipeline-proof.yml)
GitHub Actions workflow after deployment. It takes the deployed pipeline address
and `from_block`, collects the proof environment from live logs, verifies the
expected cases, and runs the same strict verifier in CI.

To avoid manually copying event fields from the explorer, collect the verifier
environment from the deployed pipeline logs:

```shell
URL_PIPELINE_FROM_BLOCK=<deploy-or-seed-block> node scripts/collect-url-pipeline-proof-env.mjs
```

The collector prints a shell `export ...` block for the completed pipeline jobs.
Paste that block into the terminal, then run `node scripts/verify-url-pipeline-trail.mjs`.

For a full proof run, use the operator script after setting `STEWARD_URL_PIPELINE`,
`MINI_GOVERNOR`, and a funded `PRIVATE_KEY` in `.env`:

```shell
./scripts/run-url-pipeline-proof.sh
```

It seeds the three source URLs, polls until all YES, NO, and ABSTAIN URL jobs are
complete, sources the collector output, then runs the strict verifier. The final
marker is:

```text
STEWARD_URL_PIPELINE_PROOF_RUN_VALID
```

The collector labels seeded jobs by their source URL, not by whatever vote the
agent returned. If the community-grants URL does not produce `YES`, the token
unlock URL does not produce `NO`, or the working-group URL does not produce
`ABSTAIN`, the batch verifier fails.

For the stronger three-outcome proof generated by `SeedUrlPipelineProofs.s.sol`,
set `URL_PIPELINE_CASES=YES,NO,ABSTAIN` plus the prefixed
`URL_PIPELINE_YES_*`, `URL_PIPELINE_NO_*`, and `URL_PIPELINE_ABSTAIN_*`
transaction fields. The same verifier then checks all three URL-derived votes
and exits with:

```text
STEWARD_URL_PIPELINE_BATCH_VALID
```

That verifier checks the full two-agent trail: the start transaction must create
a Somnia `LLM Parse Website` request with the expected URL extraction payload,
the parse callback must create the second `LLM Inference` vote request with the
extracted proposal facts, and the final callback must cast the MiniGovernor vote
from `StewardUrlPipeline`. It also fetches Somnia's public receipt service for
both the Parse Website request and the LLM vote request, then checks threshold,
runner quorum, agent id, decoded step evidence, timing, and the final LLM vote
output.

## Council Pipeline Proof

`StewardCouncilPipeline` is now deployed with a three-outcome live proof. Each
case uses one Parse Website request followed by three independent LLM reviewer
requests: `budget`, `risk`, and `participation`. The contract records each
reviewer request id, role, response, support value, and receipt before casting
the majority outcome.

| Artifact | Value |
| --- | --- |
| Council pipeline | [`0xB890e1274eE308cBC8348a7E032394406215fd52`](https://shannon-explorer.somnia.network/address/0xB890e1274eE308cBC8348a7E032394406215fd52) |
| Deploy tx | [`0x0f9c058cb1d07c2885177e4e104c2115ccf6e87f37eb289a867005def970f1e3`](https://shannon-explorer.somnia.network/tx/0x0f9c058cb1d07c2885177e4e104c2115ccf6e87f37eb289a867005def970f1e3) |

| Outcome | Proposal / job | Parse request | Reviewer requests | Start tx | Parse tx | Final vote tx | Tally |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `YES` | `4` / `1` | `3085689` | `3085732`, `3085733`, `3085734` | [`tx`](https://shannon-explorer.somnia.network/tx/0xccc228ce881ea9958aafdfdf9825882d23ed32cf52e8b3cdd2f1ff5a4db221fb) | [`tx`](https://shannon-explorer.somnia.network/tx/0xa07abe08b36a8cff98fa141b26ced8cf6e81ae8afd48786f5338c873cc40d98b) | [`tx`](https://shannon-explorer.somnia.network/tx/0x6dc4156b46c96fa4c099aed8092dbbd6927e15ab204b6fbcaafc7121d9f11641) | `YES=3, NO=0, ABSTAIN=0` |
| `NO` | `5` / `2` | `3090443` | `3090480`, `3090481`, `3090482` | [`tx`](https://shannon-explorer.somnia.network/tx/0xb4fed6c8eecba1bfa8e75fc8b0a50d9702a05da16a793e6cbdb6a6fe6b6061da) | [`tx`](https://shannon-explorer.somnia.network/tx/0x20c677ee2dfc13b3f6a2c5744aa3e1dfc91dc83f0f59a723cf4d86940de1e788) | [`tx`](https://shannon-explorer.somnia.network/tx/0xe4c9dc53ca612d09a6af84e9e45b48fb51ee4506b0b5a839f90d81bd2fe08686) | `YES=0, NO=3, ABSTAIN=0` |
| `ABSTAIN` | `6` / `3` | `3090879` | `3090907`, `3090908`, `3090909` | [`tx`](https://shannon-explorer.somnia.network/tx/0x5e0055456664f73ac566f47207b89dcbed86f25d17f03f20c7989bb8e0003b35) | [`tx`](https://shannon-explorer.somnia.network/tx/0x6daa36d4058ae08f27794cebef265539bf0bf1714c6ac867386a3185bc90afdc) | [`tx`](https://shannon-explorer.somnia.network/tx/0x12ed8607444b7d99440e964f5e8802734a15b9572542cc4786d2d16eccbb00aa) | `YES=0, NO=0, ABSTAIN=3` |
| `YES` | `7` / `4` | `3101870` | `3101910`, `3101911`, `3101912` | [`tx`](https://shannon-explorer.somnia.network/tx/0x3b8650132c0607f1da7d654df2dffc4fd5f7be1bc5871b66fe9b47346afa8b82) | [`tx`](https://shannon-explorer.somnia.network/tx/0xf0d50e537fd182918156c832adec2692a35552ee1bbc4c71f1b42d0321f523f5) | [`tx`](https://shannon-explorer.somnia.network/tx/0x7a1de92ec5a0f67dc395c45c730fe6a1d2cb42447f2f705442828ad3f3003960) | `YES=3, NO=0, ABSTAIN=0` |
| `YES` external | `8` / `5` | `3547601` | `3547653`, `3547654`, `3547655` | [`tx`](https://shannon-explorer.somnia.network/tx/0x899bc8a97ca0372ebf1f88619d3ff2e587b73062ef468d90e6b3e2824e0a155d) | [`tx`](https://shannon-explorer.somnia.network/tx/0x4f12e27e982bae539198f1a7c7e7c4051f2273fbeeb7ce57cb40d3cff2e90610) | [`tx`](https://shannon-explorer.somnia.network/tx/0x72bb5ebf65edfd899ced20c86a9297c5b1d02cc7d63440032d63004198a74231) | `YES=3, NO=0, ABSTAIN=0` |

Local verifier:

```shell
forge test --match-contract StewardCouncilPipelineTest -vvv
```

Live verifier:

```shell
node scripts/verify-council-proof.mjs
```

The council verifier checks deployed bytecode, five proposal creation txs, five
pipeline start txs, five Parse Website requests, fifteen reviewer request ids,
reviewer callback txs, final `CouncilVoteCast` events, and
`MiniGovernor.votes(proposalId, council)` for proposals `4`, `5`, `6`, `7`, and `8`.

## Proof Set

| Outcome | Request ID | Agent request | Receipt JSON | Callback vote |
| --- | --- | --- | --- | --- |
| `YES` | `1698384` | [`tx`](https://shannon-explorer.somnia.network/tx/0x63c34767e59cc6988fd2ab5ecef9d1089e9f4445e1b1e18a9b490b0d0efc77ef) | [`receipt`](https://receipts.testnet.agents.somnia.host/agent-receipts?requestId=1698384&contractAddress=0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776&type=minimal) | [`tx`](https://shannon-explorer.somnia.network/tx/0xb74e25845472a2f591aa91eefe84e5e2828b41ac11acc78b41ceb1015500c52b) |
| `NO` | `1738101` | [`tx`](https://shannon-explorer.somnia.network/tx/0x6d32b090d9ebacc6dd1dd46c01e0036bff3e684df4a28d3817823cd3747959fc) | [`receipt`](https://receipts.testnet.agents.somnia.host/agent-receipts?requestId=1738101&contractAddress=0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776&type=minimal) | [`tx`](https://shannon-explorer.somnia.network/tx/0xe14303e64f6a5db3d74919c94f42d3c14df3183e225f9996cc29cba86cc66dc3) |
| `ABSTAIN` | `1738108` | [`tx`](https://shannon-explorer.somnia.network/tx/0xa01f30ee06dbfa66b4a60414469d4f0e6406440f11e625a1197de88d797e851d) | [`receipt`](https://receipts.testnet.agents.somnia.host/agent-receipts?requestId=1738108&contractAddress=0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776&type=minimal) | [`tx`](https://shannon-explorer.somnia.network/tx/0xa157564585f473503627c801d6fb5992900dab3d5efcb31d4f15383c16487603) |

## Receipt Quorum Details

| Outcome | Successful receipts | Runner addresses | Max elapsed | LLM tokens |
| --- | --- | --- | --- | --- |
| `YES` | `3/3` | `3` | `254ms` | `136` |
| `NO` | `3/3` | `3` | `247ms` | `131` |
| `ABSTAIN` | `3/3` | `2` | `233ms` | `135` |

The verifier intentionally requires at least two runner addresses per request, not three, because the public ABSTAIN receipt currently contains three successful receipts but omits one `agentRunnerAddress`. That still matches the live threshold-2-of-3 subcommittee model.

## Contracts

| Contract | Address |
| --- | --- |
| Steward | [`0x6932C7827E7BFd9f0015Ed93fA120379E0d20541`](https://shannon-explorer.somnia.network/address/0x6932C7827E7BFd9f0015Ed93fA120379E0d20541) |
| MiniGovernor | [`0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389`](https://shannon-explorer.somnia.network/address/0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389) |
| StewardCouncilPipeline | [`0xB890e1274eE308cBC8348a7E032394406215fd52`](https://shannon-explorer.somnia.network/address/0xB890e1274eE308cBC8348a7E032394406215fd52) |
| SomniaAgents requester | [`0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776`](https://shannon-explorer.somnia.network/address/0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776) |
| LLM Inference agent | [`12847293847561029384`](https://agents.testnet.somnia.network/agent/12847293847561029384) |
| LLM Parse Website agent | [`12875401142070969085`](https://agents.testnet.somnia.network/agent/12875401142070969085) |

`Steward`, `MiniGovernor`, and `StewardCouncilPipeline` are source-verified on
the Somnia explorer. After `StewardUrlPipeline` is deployed, setting
`STEWARD_URL_PIPELINE` makes `scripts/verify-source.mjs` check that source
verification too.

## Important Limitation

The deployed Steward contract stores the receipt id returned by the SomniaAgents callback. The current live examples finalized with `receipt = 0`, so this proof uses Somnia's public receipt service plus the transaction-level request and callback logs. The project does not claim a nonzero onchain receipt id for these three examples.
