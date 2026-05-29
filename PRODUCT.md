# Steward Product Note

Steward is not trying to replace DAO governance. It turns delegated governance into an auditable agent action.

The core product claim is:

```text
Delegate criteria once. Let a Somnia agent evaluate proposals. Verify every final vote from the request, receipt, and callback trail.
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

## Why Somnia Matters

Steward needs low-latency agent execution and a native agent receipt layer. Without Somnia, the project collapses into a centralized automation script with a governance transaction at the end.

Somnia gives Steward three things that are hard to fake in a demo:

1. Contract-invoked agent requests.
2. Async callback execution into the voting contract.
3. Public receipt evidence for the agent execution path.

That is why the live proof focuses on the full loop: `criteria -> LLM request -> receipt trail -> callback vote`.

## Market Wedge

The first realistic wedge is not high-stakes treasury control. It is low-risk governance automation where voters already delegate or abstain:

- Grant renewals under a fixed budget.
- Routine parameter votes with clear policy thresholds.
- Contributor working-group approvals.
- Ecosystem temperature checks mirrored into onchain votes.

These are valuable because the cost of non-participation is real, but the cost of manual review is also high. Steward makes routine participation inspectable instead of invisible.

## Production Direction

The hackathon MVP proves one delegate, one governor target, and three outcomes. A production Steward would add:

- Real Governor/Tally/Snapshot adapters.
- Prompt and policy version pinning.
- Multiple-agent quorum for higher-value proposals.
- Delegate reputation and slashing for repeated bad outcomes.
- UI for humans to approve or revoke criteria before expiry.

The current proof is intentionally smaller: live Somnia contracts, three agent requests, nine validator receipts, transaction-level event verification, three callback-cast votes, source verification, and one reproducible proof command.
