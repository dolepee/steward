import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPublicClient, defineChain, http, type Address } from "viem";
import "./styles.css";

const somniaTestnet = defineChain({
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://api.infra.testnet.somnia.network"] },
  },
  blockExplorers: {
    default: { name: "Somnia Explorer", url: "https://shannon-explorer.somnia.network" },
  },
});

const client = createPublicClient({
  chain: somniaTestnet,
  transport: http(),
});

const proof: {
  steward: Address;
  governor: Address;
  requestId: bigint;
  proposalId: bigint;
  proposal: string;
  criteria: string;
  requestTx: `0x${string}`;
  callbackTx: `0x${string}`;
} = {
  steward: "0x6932C7827E7BFd9f0015Ed93fA120379E0d20541",
  governor: "0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389",
  requestId: 1698384n,
  proposalId: 1n,
  proposal: "Allocate 500K USDC to a Q3 community grants program.",
  criteria: "Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.",
  requestTx: "0x63c34767e59cc6988fd2ab5ecef9d1089e9f4445e1b1e18a9b490b0d0efc77ef",
  callbackTx: "0xb74e25845472a2f591aa91eefe84e5e2828b41ac11acc78b41ceb1015500c52b",
};

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
  state?: number;
  platformStatus?: number;
  support?: number;
  reason?: string;
  receipt?: bigint;
  governorVote?: number;
  error?: string;
};

function explorerTx(hash: string) {
  return `https://shannon-explorer.somnia.network/tx/${hash}`;
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function App() {
  const [live, setLive] = useState<ProofState>({ loading: true });

  useEffect(() => {
    let active = true;

    async function load() {
      try {
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

        if (!active) return;

        setLive({
          loading: false,
          state: voteRequest[2],
          platformStatus: voteRequest[3],
          support: voteRequest[4],
          reason: voteRequest[5],
          receipt: voteRequest[6],
          governorVote,
        });
      } catch (error) {
        if (!active) return;
        setLive({
          loading: false,
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

  const cast = live.state === 2 && live.support === 1 && live.governorVote === 1;

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
            <a href={explorerTx(proof.callbackTx)} target="_blank" rel="noreferrer">
              Open vote tx
            </a>
            <a className="secondary" href={explorerTx(proof.requestTx)} target="_blank" rel="noreferrer">
              Open request tx
            </a>
          </div>
        </div>

        <div className="receipt" id="proof">
          <div className="receiptTop">
            <span>Onchain vote proof</span>
            <strong>{live.loading ? "reading..." : cast ? "VOTED YES" : "CHECK STATE"}</strong>
          </div>
          <div className="proposal">
            <span>Proposal</span>
            <p>{proof.proposal}</p>
          </div>
          <div className="criteria">
            <span>Delegated criteria</span>
            <p>{proof.criteria}</p>
          </div>
          <div className="decision">
            <span>Somnia Agent output</span>
            <strong>{live.loading ? "..." : live.reason ?? "unavailable"}</strong>
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
          <p>Steward calls SomniaAgents with proposal text, criteria, and allowed votes.</p>
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

      <section className="live">
        <div>
          <span>Steward</span>
          <strong>{shortAddress(proof.steward)}</strong>
        </div>
        <div>
          <span>Request ID</span>
          <strong>{proof.requestId.toString()}</strong>
        </div>
        <div>
          <span>Request state</span>
          <strong>{live.loading ? "..." : live.state}</strong>
        </div>
        <div>
          <span>Governor vote</span>
          <strong>{live.loading ? "..." : live.governorVote}</strong>
        </div>
      </section>

      {live.error ? <p className="error">{live.error}</p> : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
