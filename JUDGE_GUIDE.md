# Steward Judge Guide

Steward is a verifiable autonomous DAO governance proxy on Somnia. A user stores voting criteria onchain once, watchers detect proposal URLs, Steward asks Somnia's Parse Website agent to read each source, three LLM reviewers evaluate the extracted facts, and the majority YES, NO, or ABSTAIN vote is cast onchain. The direct single-agent proof remains in the repo as the lower-level receipt trail.

## First 60 Seconds

1. Open `https://steward-ashy.vercel.app/council`.
2. Start with the delegated V2 proof: delegation `1`, watcher-created proposals `9`, `10`, and `11`, wrapper executions `1`, `2`, and `3`, downstream council jobs `6`, `7`, and `8`, final YES/NO/ABSTAIN votes.
3. Open the final vote transaction and confirm `StewardCouncilPipeline` casts into `MiniGovernor`.
4. Run `node scripts/verify-delegated-council-proofs.mjs`. The marker should be `STEWARD_DELEGATED_COUNCIL_PROOFS_VALID`.
5. Check the fallback Council section: five proposal URLs, three reviewer roles each, three final outcomes, including one external Developer DAO governance forum URL.
6. Run `./scripts/verify-steward-proof.sh` for the full proof packet. The final marker should be `STEWARD_FULL_PROOF_VALID`.

## Why It Matters

DAO delegation usually ends at a static delegate address or an offchain voting bot. Steward moves the decision path into an auditable agent loop:

- The user delegates criteria once onchain, not a hardcoded vote.
- The watcher can execute the stored mandate without resupplying criteria.
- The council path invokes Somnia's Parse Website agent with public proposal URLs, then asks three LLM reviewer roles to decide from the parsed facts and stored criteria.
- The verifier checks each parse request, reviewer request id, majority tally, parsed summary, final reason, and governor vote.
- The contract only casts after SomniaAgents calls back with a valid `YES`, `NO`, or `ABSTAIN`.
- The final governor vote and the agent receipt trail, including runner quorum, timing, and token usage, are publicly reproducible.
- The live council path avoids a single-model decision by parsing public proposal URLs, asking three reviewer roles, and casting only the majority outcome.

## Live Proof Anchors

| Surface | Value |
| --- | --- |
| Chain | Somnia Testnet `50312` |
| Steward | `0x6932C7827E7BFd9f0015Ed93fA120379E0d20541` |
| MiniGovernor | `0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389` |
| StewardCouncilDelegationPipeline | `0xd01f2e924A0846fdC7cEF677e8887CEE589DCa64` |
| StewardCouncilPipeline | `0xB890e1274eE308cBC8348a7E032394406215fd52` |
| SomniaAgents requester | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| LLM Inference agent | `12847293847561029384` |
| LLM Parse Website agent | `12875401142070969085` |

| Outcome | Request ID | Callback result |
| --- | --- | --- |
| `YES` | `1698384` | Steward cast support `1` into MiniGovernor proposal `1`. |
| `NO` | `1738101` | Steward cast support `2` into MiniGovernor proposal `2`. |
| `ABSTAIN` | `1738108` | Steward cast support `3` into MiniGovernor proposal `3`. |

| Council outcome | Proposal / job | Parse request | Reviewer requests | Result |
| --- | --- | --- | --- | --- |
| `YES` | `4` / `1` | `3085689` | `3085732`, `3085733`, `3085734` | `YES=3`, `NO=0`, `ABSTAIN=0` |
| `NO` | `5` / `2` | `3090443` | `3090480`, `3090481`, `3090482` | `YES=0`, `NO=3`, `ABSTAIN=0` |
| `ABSTAIN` | `6` / `3` | `3090879` | `3090907`, `3090908`, `3090909` | `YES=0`, `NO=0`, `ABSTAIN=3` |
| `YES` | `7` / `4` | `3101870` | `3101910`, `3101911`, `3101912` | `YES=3`, `NO=0`, `ABSTAIN=0` |
| `YES external` | `8` / `5` | `3547601` | `3547653`, `3547654`, `3547655` | `YES=3`, `NO=0`, `ABSTAIN=0` |

| Delegated V2 outcome | Proposal / execution / job | Parse request | Watcher execution tx | Final vote tx | Result |
| --- | --- | --- | --- | --- | --- |
| `YES` | `9` / `1` / `6` | `3578516` | `0xfd8eb6788a53a71ad7dc19239535446f22f807a65beab455a5ffda376e84087e` | `0xb47bf7b3cca5f28aa1cb80b6c7b96c6c6d8ae0def215fe4e719a58381991f166` | `YES=3`, `NO=0`, `ABSTAIN=0` |
| `NO` | `10` / `2` / `7` | `3586459` | `0x8ae266600d7db6047cb92cf8e9b0d273bc9e928895eb0f03754e08f0900180fa` | `0xa813db445a7e67097f813f990e83109392ff6693560af72ba78fb80c704245df` | `YES=0`, `NO=3`, `ABSTAIN=0` |
| `ABSTAIN` | `11` / `3` / `8` | `3586764` | `0x6b5c981ef7aea55842f4d64b11ebf61778e8836e2819eebfc901cf5821bf202a` | `0x30266873508326a2f15b057da398998ecaad3b94a493cde4756f7c548250a4e8` | `YES=0`, `NO=0`, `ABSTAIN=3` |

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
STEWARD_TX_TRAIL_VALID
STEWARD_COUNCIL_PROOF_VALID
STEWARD_DELEGATED_COUNCIL_PROOF_VALID
STEWARD_DELEGATED_COUNCIL_PROOFS_VALID
STEWARD_SOURCE_VERIFICATION_VALID
STEWARD_FULL_PROOF_VALID
```

The command checks live onchain state, Somnia's public agent receipt service, validator receipt steps, runner quorum, token usage, transaction-level event logs for the proof txs, decoded `inferString` request payloads, the delegated watcher YES/NO/ABSTAIN proof set, the live council majority trail, and explorer source verification for `Steward`, `MiniGovernor`, and `StewardCouncilPipeline`.

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

The current live examples finalized with onchain `receipt = 0`, so the proof uses Somnia's public receipt service plus the request and callback transaction logs. The repo does not claim a nonzero onchain receipt id for these three examples. One public receipt omits the third runner address, so the project claims the stricter proof that matters here: threshold-2-of-3 receipt metadata with at least two runner addresses per request.

## Supporting Docs

- [`PROOF.md`](./PROOF.md): direct proof links and verifier markers.
- [`PRODUCT.md`](./PRODUCT.md): who uses Steward, why Somnia matters, and the production wedge.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md): contract and callback flow.
- [`THREAT_MODEL.md`](./THREAT_MODEL.md): trust assumptions, failure modes, and production hardening path.
