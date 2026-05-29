# Steward Product Note

Steward is not trying to replace DAO governance. It turns proposal URLs into auditable Somnia agent council votes.

The core product claim is:

```text
Delegate criteria once. Give Steward a proposal URL. Verify the Parse Website result, reviewer votes, majority callback, and final governor vote.
```

## Who Uses It

| User | Problem | Steward fit |
| --- | --- | --- |
| Passive DAO voters | They delegate to humans or ignore most proposals. | They can delegate explicit criteria and inspect how the agent applied them. |
| Protocol treasury councils | Routine grants, renewals, and budget votes need consistency. | Steward provides a repeatable vote path with receipt-backed reasoning and onchain finality. |
| Governance service providers | They need a transparent way to automate low-risk votes without hiding behind a private bot. | Steward makes the agent request and callback path public by default. |
| Agent developers | Autonomous agents need proof that they did something consequential, not just a chat transcript. | Steward turns an LLM response into a binding governance action with a reproducible audit trail. |

## Why This Is Not Just A Bot

A normal governance bot can read a proposal, call an LLM, and submit a vote, but observers must trust the operator's server logs. Steward moves the load-bearing step into the Somnia agent flow:

- The contract stores the mandate before a proposal is evaluated.
- The vote request is created through SomniaAgents, not a private backend.
- The LLM agent response is tied to a request id and public receipt path.
- The final vote is written by the callback path, not by a frontend-supplied vote button.
- The verifier checks the onchain state, transaction logs, receipt service, and source-verified contracts.
- The live council proof shows the product path: Parse Website extracts proposal facts from public URLs and three LLM reviewers vote by role before the majority outcome reaches the governor. The proof set covers approve, reject, and abstain outcomes.

## Why Somnia Matters

Steward needs low-latency agent execution and a native agent receipt layer. Without Somnia, the project collapses into a centralized automation script with a governance transaction at the end.

Somnia gives Steward three things that are hard to fake in a demo:

1. Contract-invoked agent requests.
2. Async callback execution into the voting contract.
3. Public receipt evidence for the agent execution path.

That is why the live proof focuses on the full loop: `proposal URL -> Parse Website -> reviewer council -> receipt trail -> callback vote`.

## Market Wedge

The first realistic wedge is not high-stakes treasury control. It is low-risk governance automation where voters already delegate, abstain, or skim proposal pages too late:

- Grant renewals under a fixed budget.
- Routine parameter votes with clear policy thresholds.
- Contributor working-group approvals.
- Ecosystem temperature checks mirrored into onchain votes.

These are valuable because the cost of non-participation is real, but the cost of manual review is also high. Steward makes routine participation inspectable instead of invisible.

## Production Direction

The hackathon MVP proves one delegate, one governor target, three direct outcomes, and four live council majority votes spanning YES, NO, and ABSTAIN. A production Steward would add:

- More proposal-source adapters around Somnia's `LLM Parse Website` agent.
- A production council mode where parsed proposals are reviewed by independent budget, risk, and participation LLM reviewers before the majority outcome is cast onchain.
- Real Governor/Tally/Snapshot adapters.
- Prompt and policy version pinning.
- Multiple-agent quorum for higher-value proposals.
- Delegate reputation and slashing for repeated bad outcomes.
- UI for humans to approve or revoke criteria before expiry.

The current proof is intentionally narrow: live Somnia contracts, three direct agent requests, nine validator receipts, four four-agent council jobs, transaction-level event verification, callback-cast votes, source verification for the base contracts and council pipeline, and one reproducible proof command.
