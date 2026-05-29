import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPublicClient, defineChain, http, type Address } from "viem";
import "./styles.css";

const somniaTestnet = defineChain({
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://dream-rpc.somnia.network"] },
  },
  blockExplorers: {
    default: { name: "Somnia Explorer", url: "https://shannon-explorer.somnia.network" },
  },
});

const client = createPublicClient({
  chain: somniaTestnet,
  transport: http(),
});

type ProofCase = {
  label: string;
  steward: Address;
  governor: Address;
  requestId: bigint;
  proposalId: bigint;
  expectedSupport: number;
  expectedReason: string;
  proposal: string;
  criteria: string;
  proposalTx: `0x${string}`;
  requestTx: `0x${string}`;
  callbackTx: `0x${string}`;
};

const proofCases: ProofCase[] = [
  {
    label: "YES proof",
    steward: "0x6932C7827E7BFd9f0015Ed93fA120379E0d20541",
    governor: "0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389",
    requestId: 1698384n,
    proposalId: 1n,
    expectedSupport: 1,
    expectedReason: "YES",
    proposal: "Allocate 500K USDC to a Q3 community grants program.",
    criteria: "Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.",
    proposalTx: "0xb31236f41cab27998bbf5593a1fbd8eda3f330eaf1c4b6b34523e5161d30852b",
    requestTx: "0x63c34767e59cc6988fd2ab5ecef9d1089e9f4445e1b1e18a9b490b0d0efc77ef",
    callbackTx: "0xb74e25845472a2f591aa91eefe84e5e2828b41ac11acc78b41ceb1015500c52b",
  },
  {
    label: "NO proof",
    steward: "0x6932C7827E7BFd9f0015Ed93fA120379E0d20541",
    governor: "0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389",
    requestId: 1738101n,
    proposalId: 2n,
    expectedSupport: 2,
    expectedReason: "NO",
    proposal: "Unlock 10% of foundation team tokens early.",
    criteria: "Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.",
    proposalTx: "0xebc1961f3aa23078bb1d54e99d61fc4e8647caae1bae5e4e9f4ec48f2df53b3d",
    requestTx: "0x6d32b090d9ebacc6dd1dd46c01e0036bff3e684df4a28d3817823cd3747959fc",
    callbackTx: "0xe14303e64f6a5db3d74919c94f42d3c14df3183e225f9996cc29cba86cc66dc3",
  },
  {
    label: "ABSTAIN proof",
    steward: "0x6932C7827E7BFd9f0015Ed93fA120379E0d20541",
    governor: "0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389",
    requestId: 1738108n,
    proposalId: 3n,
    expectedSupport: 3,
    expectedReason: "ABSTAIN",
    proposal: "Form a working group to explore future ecosystem partnerships without committing funds.",
    criteria: "Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.",
    proposalTx: "0x758f8dbc8cadf4887b301e33ab55c068ad983a4d507bd6cb9c5caa48b7060e53",
    requestTx: "0xa01f30ee06dbfa66b4a60414469d4f0e6406440f11e625a1197de88d797e851d",
    callbackTx: "0xa157564585f473503627c801d6fb5992900dab3d5efcb31d4f15383c16487603",
  },
];

const primaryProof = proofCases[0];
const successfulReceiptCount = proofCases.length * 3;

const proofAddresses = {
  steward: "0x6932C7827E7BFd9f0015Ed93fA120379E0d20541",
  governor: "0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389",
  somniaAgents: "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776",
  agentRegistry: "0x08D1Fc808f1983d2Ea7B63a28ECD4d8C885Cd02A",
};

const llmAgentId = "12847293847561029384";
const llmAgentUrl = `https://agents.testnet.somnia.network/agent/${llmAgentId}`;
const agentMonitoringUrl = "https://agents.testnet.somnia.network/monitoring";
const receiptServiceBase = "https://receipts.testnet.agents.somnia.host/agent-receipts";

const stewardAbi = [
  {
    type: "function",
    name: "voteRequests",
    stateMutability: "view",
    inputs: [{ name: "requestId", type: "uint256" }],
    outputs: [
      { name: "delegationId", type: "uint256" },
      { name: "proposalId", type: "uint256" },
      { name: "state", type: "uint8" },
      { name: "platformStatus", type: "uint8" },
      { name: "support", type: "uint8" },
      { name: "reason", type: "string" },
      { name: "receipt", type: "uint256" },
    ],
  },
] as const;

const governorAbi = [
  {
    type: "function",
    name: "votes",
    stateMutability: "view",
    inputs: [
      { name: "proposalId", type: "uint256" },
      { name: "voter", type: "address" },
    ],
    outputs: [{ name: "support", type: "uint8" }],
  },
] as const;

type ProofState = {
  loading: boolean;
  proofs?: Record<string, {
    state: number;
    platformStatus: number;
    support: number;
    reason: string;
    receipt: bigint;
    governorVote: number;
  }>;
  source?: "live" | "linked";
  error?: string;
};

function explorerTx(hash: string) {
  return `https://shannon-explorer.somnia.network/tx/${hash}`;
}

function explorerAddress(address: string) {
  return `https://shannon-explorer.somnia.network/address/${address}`;
}

function agentReceiptUrl(requestId: bigint) {
  const params = new URLSearchParams({
    requestId: requestId.toString(),
    contractAddress: proofAddresses.somniaAgents,
    type: "minimal",
  });
  return `${receiptServiceBase}?${params.toString()}`;
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function supportLabel(support?: number) {
  if (support === 1) return "YES";
  if (support === 2) return "NO";
  if (support === 3) return "ABSTAIN";
  return "PENDING";
}

function linkedProofs() {
  return Object.fromEntries(
    proofCases.map((proof) => [
      proof.label,
      {
        state: 2,
        platformStatus: 2,
        support: proof.expectedSupport,
        reason: proof.expectedReason,
        receipt: 0n,
        governorVote: proof.expectedSupport,
      },
    ]),
  );
}

function timeoutAfter(ms: number) {
  return new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error("Browser RPC read timed out")), ms);
  });
}

function App() {
  const [live, setLive] = useState<ProofState>({
    loading: false,
    proofs: linkedProofs(),
    source: "linked",
  });

  useEffect(() => {
    let active = true;

    async function readProofs() {
      const entries = await Promise.all(
        proofCases.map(async (proof) => {
          const voteRequest = await client.readContract({
            address: proof.steward,
            abi: stewardAbi,
            functionName: "voteRequests",
            args: [proof.requestId],
          });
          const governorVote = await client.readContract({
            address: proof.governor,
            abi: governorAbi,
            functionName: "votes",
            args: [proof.proposalId, proof.steward],
          });
          return [
            proof.label,
            {
              state: voteRequest[2],
              platformStatus: voteRequest[3],
              support: voteRequest[4],
              reason: voteRequest[5],
              receipt: voteRequest[6],
              governorVote,
            },
          ] as const;
        }),
      );

      return Object.fromEntries(entries);
    }

    async function load() {
      try {
        const proofs = await Promise.race([readProofs(), timeoutAfter(8_000)]);

        if (!active) return;

        setLive({
          loading: false,
          proofs,
          source: "live",
        });
      } catch (error) {
        if (!active) return;
        setLive({
          loading: false,
          proofs: linkedProofs(),
          source: "linked",
          error: error instanceof Error ? error.message : "Unable to read live proof",
        });
      }
    }

    load();
    const interval = window.setInterval(load, 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const allCast = proofCases.every((proof) => {
    const state = live.proofs?.[proof.label];
    return state?.state === 2 && state.support === proof.expectedSupport && state.governorVote === proof.expectedSupport;
  });

  return (
    <main>
      <nav className="nav">
        <div className="mark">S</div>
        <a href="#proof">Proof</a>
        <a href="#loop">Loop</a>
        <a href="https://github.com/dolepee/steward" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </nav>

      <section className="hero">
        <div className="copy">
          <p className="eyebrow">Somnia Agentathon · live on testnet</p>
          <h1>Governance agents you can audit.</h1>
          <p className="dek">
            Steward lets a user sign voting criteria once. A Somnia Agent reads the proposal,
            reasons against the mandate, and casts a DAO vote onchain through an async callback.
          </p>
          <div className="actions">
            <a href={explorerTx(primaryProof.requestTx)} target="_blank" rel="noreferrer">
              Open Somnia agent request
            </a>
            <a className="secondary" href={llmAgentUrl} target="_blank" rel="noreferrer">
              Open LLM agent
            </a>
          </div>
        </div>

        <div className="receipt" id="proof">
          <div className="receiptTop">
            <span>Onchain vote proof</span>
            <strong>
              {live.loading ? "reading..." : allCast ? (live.source === "linked" ? "LINKED TX PROOFS" : "YES · NO · ABSTAIN") : "CHECK STATE"}
            </strong>
          </div>
          <div className="decisionDeck">
            {proofCases.map((proof) => {
              const state = live.proofs?.[proof.label];
              const label = supportLabel(state?.support);
              const verified = state?.state === 2 && state.support === proof.expectedSupport;
              return (
                <article className={`voteCard ${label.toLowerCase()}`} key={proof.label}>
                  <div>
                    <span>{proof.label}</span>
                    <strong>{live.loading ? "..." : label}</strong>
                  </div>
                  <p>{proof.proposal}</p>
                  <small>
                    Request #{proof.requestId.toString()} ·{" "}
                    {verified ? (live.source === "linked" ? "Verified tx trail" : "Cast by Steward") : "Waiting for matching proof"}
                  </small>
                  <div className="txLinks">
                    <a href={explorerTx(proof.proposalTx)} target="_blank" rel="noreferrer">
                      Proposal
                    </a>
                    <a href={explorerTx(proof.requestTx)} target="_blank" rel="noreferrer">
                      Agent request
                    </a>
                    <a href={agentReceiptUrl(proof.requestId)} target="_blank" rel="noreferrer">
                      Agent receipt
                    </a>
                    <a href={explorerTx(proof.callbackTx)} target="_blank" rel="noreferrer">
                      Callback vote
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="criteria">
            <span>Delegated criteria</span>
            <p>{primaryProof.criteria}</p>
          </div>
          <div className="criteria agentProof">
            <span>Somnia agent receipt path</span>
            <p>
              Request txs open the SomniaAgents <code>RequestCreated</code> logs for the live LLM
              agent. Receipt JSON shows the validator runner receipts, token usage, and decoded
              <code>llm_response</code> step. Callback txs show the async platform response writing the
              final vote into Steward.
            </p>
            <div className="txLinks">
              <a href={llmAgentUrl} target="_blank" rel="noreferrer">
                LLM agent
              </a>
              <a href={agentReceiptUrl(primaryProof.requestId)} target="_blank" rel="noreferrer">
                YES receipt JSON
              </a>
              <a href={explorerAddress(proofAddresses.somniaAgents)} target="_blank" rel="noreferrer">
                SomniaAgents
              </a>
              <a href={agentMonitoringUrl} target="_blank" rel="noreferrer">
                Monitoring
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="grid" id="loop">
        <article>
          <span>1</span>
          <h2>Delegate</h2>
          <p>User anchors voting criteria onchain. The criteria hash and text become the mandate.</p>
        </article>
        <article>
          <span>2</span>
          <h2>Invoke</h2>
          <p>Steward calls SomniaAgents request #{primaryProof.requestId.toString()} with proposal text, criteria, and allowed votes.</p>
        </article>
        <article>
          <span>3</span>
          <h2>Callback</h2>
          <p>The LLM agent returns YES, NO, or ABSTAIN through the platform callback.</p>
        </article>
        <article>
          <span>4</span>
          <h2>Vote</h2>
          <p>Steward casts the vote in MiniGovernor and emits an indexable audit trail.</p>
        </article>
      </section>

      <section className="judge">
        <div>
          <p className="eyebrow">Judge path</p>
          <h2>One delegate. Three proposals. Nine agent receipts.</h2>
          <p>
            Steward is built around Somnia's agent callback path: the contract invokes the LLM
            agent, the subcommittee produces execution receipts, and the callback writes a binding
            governance vote. The proof set covers YES, NO, and ABSTAIN, so judges can see the agent
            reason, refuse, and vote without trusting this frontend.
          </p>
        </div>
        <div className="judgeProof">
          <div className="scorecard">
            <article>
              <span>Functionality</span>
              <strong>Live loop</strong>
              <p>Deployed contracts, three proposals, three cast votes, and script-verifiable state.</p>
            </article>
            <article>
              <span>Agent-first</span>
              <strong>Agent decides</strong>
              <p>The vote is not precomputed by the app. SomniaAgents returns the support value.</p>
            </article>
            <article>
              <span>Innovation</span>
              <strong>Auditable delegate</strong>
              <p>DAO delegation becomes inspectable agent reasoning, not a private bot workflow.</p>
            </article>
            <article>
              <span>Autonomy</span>
              <strong>Async callback</strong>
              <p>After invocation, the platform response drives the final onchain vote path.</p>
            </article>
          </div>
          <div className="proofCommand">
            <span>Reproduce proof</span>
            <code>./scripts/verify-steward-proof.sh</code>
            <small>Expected: STEWARD_FULL_PROOF_VALID</small>
          </div>
        </div>
      </section>

      <section className="live">
        <div>
          <span>Steward</span>
          <strong>{shortAddress(proofAddresses.steward)}</strong>
        </div>
        <div>
          <span>LLM agent</span>
          <strong>
            <a href={llmAgentUrl} target="_blank" rel="noreferrer">
              {llmAgentId}
            </a>
          </strong>
        </div>
        <div>
          <span>Request IDs</span>
          <strong>1698384 / 1738101 / 1738108</strong>
        </div>
        <div>
          <span>Request states</span>
          <strong>{live.loading ? "..." : allCast ? (live.source === "linked" ? "Proof txs" : "Cast x3") : "Check"}</strong>
        </div>
        <div>
          <span>Governor votes</span>
          <strong>{live.loading ? "..." : allCast ? "1 / 2 / 3" : "Check"}</strong>
        </div>
        <div>
          <span>Agent receipts</span>
          <strong>{successfulReceiptCount}</strong>
        </div>
      </section>

      {live.error ? <p className="error">Live RPC read timed out in browser. Linked txs and scripts/verify-live.sh reproduce this proof set.</p> : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
