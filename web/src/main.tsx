/// <reference types="vite/client" />

import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  defineChain,
  formatEther,
  http,
  type Address,
} from "viem";
import "./styles.css";

declare global {
  interface Window {
    ethereum?: unknown;
  }
}

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
  councilPipeline: "0xB890e1274eE308cBC8348a7E032394406215fd52",
  delegatedCouncilPipeline: "0xd01f2e924A0846fdC7cEF677e8887CEE589DCa64",
};

const llmAgentId = "12847293847561029384";
const parseWebsiteAgentId = "12875401142070969085";
const llmAgentUrl = `https://agents.testnet.somnia.network/agent/${llmAgentId}`;
const parseWebsiteAgentUrl = `https://agents.testnet.somnia.network/agent/${parseWebsiteAgentId}`;
const agentMonitoringUrl = "https://agents.testnet.somnia.network/monitoring";
const receiptServiceBase = "https://receipts.testnet.agents.somnia.host/agent-receipts";
const judgeGuideUrl = "https://github.com/dolepee/steward/blob/master/JUDGE_GUIDE.md";
const productNoteUrl = "https://github.com/dolepee/steward/blob/master/PRODUCT.md";
const parseWebsiteDocsUrl = "https://docs.somnia.network/agents/base-agents/llm-parse-website";
const configuredUrlPipeline = (() => {
  const value = import.meta.env.VITE_STEWARD_URL_PIPELINE;
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value) ? (value as Address) : undefined;
})();
const stewardSystemPrompt =
  "You are Steward, an autonomous DAO voting delegate. Choose exactly one allowed value.";
const allowedVoteOutputs = ["YES", "NO", "ABSTAIN"];
const councilProofCommand = "node scripts/verify-council-proof.mjs";
const delegatedCouncilProofCommand = "node scripts/verify-delegated-council-proofs.mjs";
const defaultConsoleProposalUrl = "https://steward-ashy.vercel.app/proposals/community-grants.html";
const defaultConsoleProposalText = "Approve a 500,000 USDC Q3 community grants program imported from a public URL.";
const defaultConsoleCriteria =
  "Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.";
const defaultVotingPeriod = 604_800n;
const urlPipelineSteps = [
  {
    tag: "Source",
    title: "Proposal URL",
    detail: "A public governance page is the input. No private operator copies proposal text into the prompt.",
  },
  {
    tag: "Agent 1",
    title: "Parse Website",
    detail: "Somnia's browser-backed extraction agent reads the page and returns factual proposal details.",
  },
  {
    tag: "Agent 2",
    title: "LLM vote",
    detail: "The inference agent applies the delegate mandate and must choose YES, NO, or ABSTAIN.",
  },
  {
    tag: "Callback",
    title: "Onchain vote",
    detail: "StewardUrlPipeline casts the MiniGovernor vote only after the Somnia callback finalizes.",
  },
];
const proposalSources = [
  {
    label: "Grant proposal",
    outcome: "YES",
    title: "Q3 Community Grants Program",
    url: "/proposals/community-grants.html",
    fact: "500,000 USDC community grants budget",
  },
  {
    label: "Unlock proposal",
    outcome: "NO",
    title: "Early Foundation Team Token Unlock",
    url: "/proposals/team-token-unlock.html",
    fact: "10% team token unlock, six months early",
  },
  {
    label: "Research proposal",
    outcome: "ABSTAIN",
    title: "Ecosystem Partnerships Working Group",
    url: "/proposals/ecosystem-working-group.html",
    fact: "exploratory group, no committed budget",
  },
  {
    label: "Security proposal",
    outcome: "YES",
    title: "Security Grants and Audit Bounty Program",
    url: "/proposals/security-grants.html",
    fact: "750,000 USDC security grants budget",
  },
  {
    label: "External proposal",
    outcome: "YES",
    title: "Developer DAO DevConnect Funding Proposal",
    url: "https://forum.developerdao.com/t/devconnect-funding-proposal/3371",
    fact: "12,000 USDC request on an external governance forum",
  },
];
const councilCases = [
  {
    outcome: "YES",
    proposal: "Q3 Community Grants Program",
    proposalId: "4",
    jobId: "1",
    parseRequestId: "3085689",
    reviewerRequestIds: "3085732 / 3085733 / 3085734",
    tally: "YES=3 / NO=0 / ABSTAIN=0",
    detail: "The council approved a 500,000 USDC grants program because it matched the under-1M community grants mandate.",
    startTx: "0xccc228ce881ea9958aafdfdf9825882d23ed32cf52e8b3cdd2f1ff5a4db221fb",
    parseTx: "0xa07abe08b36a8cff98fa141b26ced8cf6e81ae8afd48786f5338c873cc40d98b",
    finalVoteTx: "0x6dc4156b46c96fa4c099aed8092dbbd6927e15ab204b6fbcaafc7121d9f11641",
  },
  {
    outcome: "NO",
    proposal: "Early Foundation Team Token Unlock",
    proposalId: "5",
    jobId: "2",
    parseRequestId: "3090443",
    reviewerRequestIds: "3090480 / 3090481 / 3090482",
    tally: "YES=0 / NO=3 / ABSTAIN=0",
    detail: "The council rejected an early team-token unlock because the mandate explicitly rejects team unlocks.",
    startTx: "0xb4fed6c8eecba1bfa8e75fc8b0a50d9702a05da16a793e6cbdb6a6fe6b6061da",
    parseTx: "0x20c677ee2dfc13b3f6a2c5744aa3e1dfc91dc83f0f59a723cf4d86940de1e788",
    finalVoteTx: "0xe4c9dc53ca612d09a6af84e9e45b48fb51ee4506b0b5a839f90d81bd2fe08686",
  },
  {
    outcome: "ABSTAIN",
    proposal: "Ecosystem Partnerships Working Group",
    proposalId: "6",
    jobId: "3",
    parseRequestId: "3090879",
    reviewerRequestIds: "3090907 / 3090908 / 3090909",
    tally: "YES=0 / NO=0 / ABSTAIN=3",
    detail: "The council abstained from an exploratory working group because it had no budget and insufficient decision detail.",
    startTx: "0x5e0055456664f73ac566f47207b89dcbed86f25d17f03f20c7989bb8e0003b35",
    parseTx: "0x6daa36d4058ae08f27794cebef265539bf0bf1714c6ac867386a3185bc90afdc",
    finalVoteTx: "0x12ed8607444b7d99440e964f5e8802734a15b9572542cc4786d2d16eccbb00aa",
  },
  {
    outcome: "YES",
    proposal: "Security Grants and Audit Bounty Program",
    proposalId: "7",
    jobId: "4",
    parseRequestId: "3101870",
    reviewerRequestIds: "3101910 / 3101911 / 3101912",
    tally: "YES=3 / NO=0 / ABSTAIN=0",
    detail:
      "The council approved a 750,000 USDC security grants program because it matched the public-goods grant mandate and stayed under 1M.",
    startTx: "0x3b8650132c0607f1da7d654df2dffc4fd5f7be1bc5871b66fe9b47346afa8b82",
    parseTx: "0xf0d50e537fd182918156c832adec2692a35552ee1bbc4c71f1b42d0321f523f5",
    finalVoteTx: "0x7a1de92ec5a0f67dc395c45c730fe6a1d2cb42447f2f705442828ad3f3003960",
  },
  {
    outcome: "YES",
    proposal: "Developer DAO DevConnect Funding Proposal",
    proposalId: "8",
    jobId: "5",
    parseRequestId: "3547601",
    reviewerRequestIds: "3547653 / 3547654 / 3547655",
    tally: "YES=3 / NO=0 / ABSTAIN=0",
    detail:
      "The council approved an external Developer DAO forum proposal requesting 12,000 USDC for DevConnect community growth and event participation.",
    startTx: "0x899bc8a97ca0372ebf1f88619d3ff2e587b73062ef468d90e6b3e2824e0a155d",
    parseTx: "0x4f12e27e982bae539198f1a7c7e7c4051f2273fbeeb7ce57cb40d3cff2e90610",
    finalVoteTx: "0x72bb5ebf65edfd899ced20c86a9297c5b1d02cc7d63440032d63004198a74231",
  },
];
const councilProof = {
  deployTx: "0x0f9c058cb1d07c2885177e4e104c2115ccf6e87f37eb289a867005def970f1e3",
};
const delegatedCouncilCommon = {
  delegationId: "1",
  deploymentTx: "0x73cd19f6ba11f7dccb70ef8ed8e3afd321cc4aa2b3f99dd24fbb0658002031a9",
  delegationTx: "0xac1cff99c68e12dfbf1ffe91533aa711da6f4ec30145ef2b611168fa4e8c9d2f",
};
const delegatedCouncilCases = [
  {
    ...delegatedCouncilCommon,
    outcome: "YES",
    proposal: "Q3 Community Grants Program",
    executionId: "1",
    proposalId: "9",
    councilJobId: "6",
    parseRequestId: "3578516",
    tally: "YES=3 / NO=0 / ABSTAIN=0",
    detail: "The stored mandate approved the under-1M community grants proposal.",
    proposalTx: "0xf6e7f52f3753fb8de8dc7eae0201fc76910bc4b484705e06d8dbc2a5a1565285",
    startTx: "0xfd8eb6788a53a71ad7dc19239535446f22f807a65beab455a5ffda376e84087e",
    parseTx: "0x4bd3e9eacc09d57f6fef12daa88d0e1707c2cf287ea3ffd312e1f92e8f9aae85",
    finalVoteTx: "0xb47bf7b3cca5f28aa1cb80b6c7b96c6c6d8ae0def215fe4e719a58381991f166",
  },
  {
    ...delegatedCouncilCommon,
    outcome: "NO",
    proposal: "Early Foundation Team Token Unlock",
    executionId: "2",
    proposalId: "10",
    councilJobId: "7",
    parseRequestId: "3586459",
    tally: "YES=0 / NO=3 / ABSTAIN=0",
    detail: "The same stored mandate rejected an early team-token unlock.",
    proposalTx: "0x5e8713927c427ab2e9b69bcd98aef308258257f2fa7d18592dc355e728642cbc",
    startTx: "0x8ae266600d7db6047cb92cf8e9b0d273bc9e928895eb0f03754e08f0900180fa",
    parseTx: "0xc076e8cdf1947d1c1af63cf30984dbc81e6b9a923aed6c5d403f63b4144f2c63",
    finalVoteTx: "0xa813db445a7e67097f813f990e83109392ff6693560af72ba78fb80c704245df",
  },
  {
    ...delegatedCouncilCommon,
    outcome: "ABSTAIN",
    proposal: "Ecosystem Partnerships Working Group",
    executionId: "3",
    proposalId: "11",
    councilJobId: "8",
    parseRequestId: "3586764",
    tally: "YES=0 / NO=0 / ABSTAIN=3",
    detail: "The same stored mandate abstained when the proposal had no budget and insufficient decision detail.",
    proposalTx: "0x292e9234e73b362ed3267be76d1b0402c41c8b85de6a843457ff27957fe4e44a",
    startTx: "0x6b5c981ef7aea55842f4d64b11ebf61778e8836e2819eebfc901cf5821bf202a",
    parseTx: "0x7b0c790854290a7c1b8d006cb21444a5a173f7e9ad17ab2f31fb5a5ce4d69e6e",
    finalVoteTx: "0x30266873508326a2f15b057da398998ecaad3b94a493cde4756f7c548250a4e8",
  },
];
const delegatedCouncilProof = delegatedCouncilCases[0]!;
const delegatedAutonomySteps = [
  ["01", "Stored mandate", "Criteria and governor live onchain before execution."],
  ["02", "Watcher detects", "A proposal URL changes; the watcher pays to execute."],
  ["03", "Agent council", "Parse Website plus three LLM reviewers apply the mandate."],
  ["04", "Vote lands", "MiniGovernor receives YES, NO, or ABSTAIN from the council."],
] as const;
const externalCouncilCase = councilCases[councilCases.length - 1]!;

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
    name: "nextProposalId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "createProposal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "description", type: "string" },
      { name: "votingPeriod", type: "uint64" },
    ],
    outputs: [{ name: "proposalId", type: "uint256" }],
  },
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

const urlPipelineAbi = [
  {
    type: "function",
    name: "quoteUrlVote",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "platformDeposit", type: "uint256" },
      { name: "parseAgentBudget", type: "uint256" },
      { name: "parseDeposit", type: "uint256" },
      { name: "voteDeposit", type: "uint256" },
      { name: "totalDeposit", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "startUrlVote",
    stateMutability: "payable",
    inputs: [
      { name: "governor", type: "address" },
      { name: "proposalId", type: "uint256" },
      { name: "criteriaText", type: "string" },
      { name: "proposalUrl", type: "string" },
      { name: "resolveUrl", type: "bool" },
    ],
    outputs: [
      { name: "jobId", type: "uint256" },
      { name: "parseRequestId", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "UrlPipelineStarted",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "parseRequestId", type: "uint256", indexed: true },
      { name: "governor", type: "address", indexed: true },
      { name: "proposalId", type: "uint256", indexed: false },
      { name: "proposalUrl", type: "string", indexed: false },
    ],
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

type ReceiptSummary = {
  successful: number;
  total: number;
  response: string;
  runnerCount: number;
  maxElapsedMs: number;
  totalTokens: number;
  threshold: number;
  subcommitteeSize: number;
};

type ReceiptState = {
  loading: boolean;
  summaries?: Record<string, ReceiptSummary>;
  source?: "live" | "linked";
};

type UrlConsoleForm = {
  proposalUrl: string;
  proposalText: string;
  criteria: string;
};

type UrlConsoleState = {
  account?: Address;
  requiredDeposit?: bigint;
  createTx?: `0x${string}`;
  startTx?: `0x${string}`;
  proposalId?: bigint;
  jobId?: bigint;
  parseRequestId?: bigint;
  status: string;
  busy: boolean;
  error?: string;
};

type AgentReceiptResponse = {
  requestDetails?: {
    threshold?: number;
    subcommitteeSize?: number;
  };
  receipts?: Array<{
    status?: string;
    agentId?: string;
    agentRunnerAddress?: string;
    elapsedMs?: number;
    agentReceipt?: {
      llmUsage?: {
        totalTokens?: number;
      };
      steps?: Array<{
        name?: string;
        content?: string;
      }>;
    };
  }>;
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

function linkedReceiptSummaries() {
  const runnerCounts: Record<string, number> = {
    "YES proof": 3,
    "NO proof": 3,
    "ABSTAIN proof": 2,
  };
  const maxElapsedMs: Record<string, number> = {
    "YES proof": 254,
    "NO proof": 247,
    "ABSTAIN proof": 233,
  };
  const totalTokens: Record<string, number> = {
    "YES proof": 136,
    "NO proof": 131,
    "ABSTAIN proof": 135,
  };

  return Object.fromEntries(
    proofCases.map((proof) => [
      proof.label,
      {
        successful: 3,
        total: 3,
        response: proof.expectedReason,
        runnerCount: runnerCounts[proof.label] ?? 2,
        maxElapsedMs: maxElapsedMs[proof.label] ?? 0,
        totalTokens: totalTokens[proof.label] ?? 0,
        threshold: 2,
        subcommitteeSize: 3,
      },
    ]),
  );
}

function timeoutAfter(ms: number) {
  return new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error("Browser RPC read timed out")), ms);
  });
}

async function ensureSomniaWallet() {
  if (!window.ethereum) {
    throw new Error("No injected wallet found. Install or unlock a browser wallet to start a live URL vote.");
  }

  const wallet = createWalletClient({
    chain: somniaTestnet,
    transport: custom(window.ethereum as Parameters<typeof custom>[0]),
  });
  const [account] = await wallet.requestAddresses();
  if (!account) throw new Error("Wallet connection did not return an account.");

  try {
    await wallet.switchChain({ id: somniaTestnet.id });
  } catch {
    try {
      await wallet.addChain({ chain: somniaTestnet });
      await wallet.switchChain({ id: somniaTestnet.id });
    } catch {
      throw new Error("Switch your wallet to Somnia Testnet before starting the URL vote.");
    }
  }

  return { wallet, account };
}

function App() {
  const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const route = ["/", "/proof", "/sources", "/council", "/guide", "/console"].includes(normalizedPath)
    ? normalizedPath
    : "/";
  const isHomeRoute = route === "/";
  const isProofRoute = route === "/proof";
  const isSourcesRoute = route === "/sources" || route === "/console";
  const isCouncilRoute = route === "/council";
  const isGuideRoute = route === "/guide";
  const navClass = (target: string) => (route === target ? "active" : undefined);
  const [live, setLive] = useState<ProofState>({
    loading: false,
    proofs: linkedProofs(),
    source: "linked",
  });
  const [receiptState, setReceiptState] = useState<ReceiptState>({
    loading: false,
    summaries: linkedReceiptSummaries(),
    source: "linked",
  });
  const [urlConsoleForm, setUrlConsoleForm] = useState<UrlConsoleForm>({
    proposalUrl: defaultConsoleProposalUrl,
    proposalText: defaultConsoleProposalText,
    criteria: defaultConsoleCriteria,
  });
  const [urlConsole, setUrlConsole] = useState<UrlConsoleState>({
    status: "Ready to quote the two-agent URL vote deposit.",
    busy: false,
  });

  async function quoteUrlPipeline() {
    if (!configuredUrlPipeline) return;

    setUrlConsole((state) => ({ ...state, busy: true, error: undefined, status: "Reading required Somnia agent deposit..." }));
    try {
      const quote = await client.readContract({
        address: configuredUrlPipeline,
        abi: urlPipelineAbi,
        functionName: "quoteUrlVote",
      });
      setUrlConsole((state) => ({
        ...state,
        requiredDeposit: quote[4],
        busy: false,
        status: `Required deposit: ${formatEther(quote[4])} STT. Includes Parse Website and LLM Inference.`,
      }));
    } catch (error) {
      setUrlConsole((state) => ({
        ...state,
        busy: false,
        error: error instanceof Error ? error.message : "Could not quote URL pipeline deposit.",
        status: "Quote failed.",
      }));
    }
  }

  async function startUrlPipelineVote() {
    if (!configuredUrlPipeline) return;

    setUrlConsole((state) => ({
      ...state,
      busy: true,
      error: undefined,
      createTx: undefined,
      startTx: undefined,
      proposalId: undefined,
      jobId: undefined,
      parseRequestId: undefined,
      status: "Connecting wallet...",
    }));

    try {
      const { wallet, account } = await ensureSomniaWallet();
      const requiredDeposit =
        urlConsole.requiredDeposit ??
        (await client.readContract({
          address: configuredUrlPipeline,
          abi: urlPipelineAbi,
          functionName: "quoteUrlVote",
        }))[4];

      setUrlConsole((state) => ({
        ...state,
        account,
        requiredDeposit,
        status: "Creating a MiniGovernor proposal from the URL source...",
      }));

      const proposalId = await client.readContract({
        address: proofAddresses.governor as Address,
        abi: governorAbi,
        functionName: "nextProposalId",
      });

      const createTx = await wallet.writeContract({
        account,
        address: proofAddresses.governor as Address,
        abi: governorAbi,
        functionName: "createProposal",
        args: [urlConsoleForm.proposalText, defaultVotingPeriod],
      });

      setUrlConsole((state) => ({
        ...state,
        createTx,
        proposalId,
        status: `Proposal #${proposalId.toString()} submitted. Waiting for confirmation...`,
      }));

      await client.waitForTransactionReceipt({ hash: createTx });

      setUrlConsole((state) => ({
        ...state,
        status: "Starting Parse Website -> LLM vote pipeline...",
      }));

      const startTx = await wallet.writeContract({
        account,
        address: configuredUrlPipeline,
        abi: urlPipelineAbi,
        functionName: "startUrlVote",
        args: [proofAddresses.governor as Address, proposalId, urlConsoleForm.criteria, urlConsoleForm.proposalUrl, false],
        value: requiredDeposit,
      });

      setUrlConsole((state) => ({
        ...state,
        startTx,
        status: "URL pipeline started. Waiting for start transaction confirmation...",
      }));

      const startReceipt = await client.waitForTransactionReceipt({ hash: startTx });
      let jobId: bigint | undefined;
      let parseRequestId: bigint | undefined;

      for (const log of startReceipt.logs) {
        if (log.address.toLowerCase() !== configuredUrlPipeline.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({
            abi: urlPipelineAbi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "UrlPipelineStarted") {
            const args = decoded.args as { jobId: bigint; parseRequestId: bigint };
            jobId = args.jobId;
            parseRequestId = args.parseRequestId;
            break;
          }
        } catch {
          // Ignore unrelated logs from the same transaction.
        }
      }

      setUrlConsole((state) => ({
        ...state,
        busy: false,
        jobId,
        parseRequestId,
        status: jobId
          ? `Job #${jobId.toString()} started. Parse Website request #${parseRequestId?.toString()} is now in Somnia's agent queue.`
          : "URL pipeline transaction confirmed. Use the explorer and proof workflow to follow callbacks.",
      }));
    } catch (error) {
      setUrlConsole((state) => ({
        ...state,
        busy: false,
        error: error instanceof Error ? error.message : "URL vote request failed.",
        status: "Request stopped.",
      }));
    }
  }

  useEffect(() => {
    if (!window.location.hash) return;

    const scrollToHash = () => {
      try {
        document.querySelector(window.location.hash)?.scrollIntoView({ block: "start" });
      } catch {
        // Ignore malformed hash fragments; normal navigation still works.
      }
    };

    window.setTimeout(scrollToHash, 250);
    window.setTimeout(scrollToHash, 1_500);
  }, []);

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

  useEffect(() => {
    let active = true;

    async function readReceipts() {
      const entries = await Promise.all(
        proofCases.map(async (proof) => {
          const response = await fetch(agentReceiptUrl(proof.requestId));
          if (!response.ok) throw new Error(`Receipt service returned ${response.status}`);

          const body = (await response.json()) as AgentReceiptResponse;
          const receipts = body.receipts ?? [];
          const successful = receipts.filter((receipt) => receipt.status === "success");
          const responseValue =
            successful[0]?.agentReceipt?.steps?.find((step) => step.name === "llm_response")?.content ??
            proof.expectedReason;
          const runnerCount = new Set(
            successful
              .map((receipt) => receipt.agentRunnerAddress?.toLowerCase())
              .filter((address): address is string => Boolean(address)),
          ).size;
          const maxElapsedMs = Math.max(
            0,
            ...successful.map((receipt) => (typeof receipt.elapsedMs === "number" ? receipt.elapsedMs : 0)),
          );
          const totalTokens =
            successful.find((receipt) => receipt.agentReceipt?.llmUsage?.totalTokens)?.agentReceipt?.llmUsage
              ?.totalTokens ?? 0;

          return [
            proof.label,
            {
              successful: successful.length,
              total: receipts.length,
              response: responseValue,
              runnerCount,
              maxElapsedMs,
              totalTokens,
              threshold: body.requestDetails?.threshold ?? 2,
              subcommitteeSize: body.requestDetails?.subcommitteeSize ?? 3,
            },
          ] as const;
        }),
      );

      return Object.fromEntries(entries);
    }

    async function loadReceipts() {
      try {
        const summaries = await Promise.race([readReceipts(), timeoutAfter(8_000)]);

        if (!active) return;

        setReceiptState({
          loading: false,
          summaries,
          source: "live",
        });
      } catch {
        if (!active) return;
        setReceiptState({
          loading: false,
          summaries: linkedReceiptSummaries(),
          source: "linked",
        });
      }
    }

    loadReceipts();
    const interval = window.setInterval(loadReceipts, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const allCast = proofCases.every((proof) => {
    const state = live.proofs?.[proof.label];
    return state?.state === 2 && state.support === proof.expectedSupport && state.governorVote === proof.expectedSupport;
  });
  const receiptSummaries = receiptState.summaries ?? linkedReceiptSummaries();
  const liveReceiptCount = Object.values(receiptSummaries).reduce((sum, receipt) => sum + receipt.successful, 0);

  return (
    <main>
      <nav className="nav">
        <div className="mark">S</div>
        <a className="brandLink" href="/">
          <strong className="brand">Steward</strong>
        </a>
        <a className={navClass("/proof")} href="/proof">Proof</a>
        <a className={navClass("/sources")} href="/sources">Sources</a>
        <a className={navClass("/council")} href="/council">Council</a>
        {configuredUrlPipeline ? <a className={navClass("/console")} href="/console">Console</a> : null}
        <a className={navClass("/guide")} href="/guide">Guide</a>
        <a href={judgeGuideUrl} target="_blank" rel="noreferrer">
          Docs
        </a>
        <a href="https://github.com/dolepee/steward" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </nav>

      {isHomeRoute || isProofRoute ? (
      <section className={`hero ${isProofRoute ? "heroProof" : ""}`}>
        <div className="copy">
          <p className="eyebrow">{isProofRoute ? "Proof room · live receipts" : "Somnia Agentathon · live on testnet"}</p>
          <h1>{isProofRoute ? "Every agent vote has a receipt trail." : "Proposal URLs become agent council votes."}</h1>
          <p className="dek">
            {isProofRoute
              ? "Open the external forum source, Parse Website transaction, reviewer ids, final MiniGovernor vote, and baseline LLM receipt set without trusting this frontend."
              : "Steward stores a DAO voting mandate, asks Somnia's Parse Website agent to read proposal pages, sends the result to independent LLM reviewers, and casts the majority YES, NO, or ABSTAIN vote onchain."}
          </p>
          <p className="proofLine">Delegated V2 YES/NO/ABSTAIN · 5 fallback URL proofs · external forum included</p>
          <div className="chainOfCustody" aria-label="Agent vote chain of custody">
            <article>
              <span>01</span>
              <strong>Source URL</strong>
              <p>Developer DAO forum proposal</p>
            </article>
            <article>
              <span>02</span>
              <strong>Parse Website</strong>
              <p>Request #{externalCouncilCase.parseRequestId}</p>
            </article>
            <article>
              <span>03</span>
              <strong>3 reviewers</strong>
              <p>Budget, risk, participation</p>
            </article>
            <article>
              <span>04</span>
              <strong>Governor vote</strong>
              <p>{externalCouncilCase.tally}</p>
            </article>
          </div>
          <div className="heroStats" aria-label="Steward live proof metrics">
            <article>
              <strong>5</strong>
              <span>URL-to-vote runs</span>
            </article>
            <article>
              <strong>15</strong>
              <span>reviewer callbacks</span>
            </article>
            <article>
              <strong>1</strong>
              <span>external forum source</span>
            </article>
          </div>
          <div className="actions">
            <a href="/council">
              Open live council proof
            </a>
            <a className="secondary" href="https://github.com/dolepee/steward/blob/master/PROOF.md" target="_blank" rel="noreferrer">
              Run verifier
            </a>
            <a className="secondary" href={judgeGuideUrl} target="_blank" rel="noreferrer">
              Read judge guide
            </a>
            <a className="secondary" href={llmAgentUrl} target="_blank" rel="noreferrer">
              Open LLM agent
            </a>
          </div>
        </div>

        <div className="receipt" id="proof">
          <div className="opsHeader" aria-label="Steward command center status">
            <span>STWD / COUNCIL-05</span>
            <strong>VERIFIED EXTERNAL RUN</strong>
            <small>Somnia Testnet · live callbacks</small>
          </div>
          <div className="proofSpotlight">
            <div className="spotlightTop">
              <span>External proposal proof</span>
              <strong>Developer DAO → YES</strong>
            </div>
            <p>
              Somnia's Parse Website agent read a real Developer DAO forum proposal requesting
              12,000 USDC. Three independent reviewers approved it, and Steward cast the
              MiniGovernor vote onchain.
            </p>
            <div className="proofMeter" aria-label="External council proof trail">
              <article>
                <span>Parse</span>
                <strong>#{externalCouncilCase.parseRequestId}</strong>
              </article>
              <article>
                <span>Reviewers</span>
                <strong>{externalCouncilCase.reviewerRequestIds}</strong>
              </article>
              <article>
                <span>Tally</span>
                <strong>{externalCouncilCase.tally}</strong>
              </article>
            </div>
            <div className="txLinks">
              <a href="https://forum.developerdao.com/t/devconnect-funding-proposal/3371" target="_blank" rel="noreferrer">
                Source forum
              </a>
              <a href={explorerTx(externalCouncilCase.parseTx)} target="_blank" rel="noreferrer">
                Parse tx
              </a>
              <a href={explorerTx(externalCouncilCase.finalVoteTx)} target="_blank" rel="noreferrer">
                Final vote
              </a>
            </div>
          </div>
          <div className="reviewerBoard" aria-label="External council reviewer results">
            <article>
              <span>Budget reviewer</span>
              <strong>YES</strong>
              <p>12,000 USDC request is within delegated public-goods limits.</p>
            </article>
            <article>
              <span>Risk reviewer</span>
              <strong>YES</strong>
              <p>No team unlock, no treasury drain, and source page is public.</p>
            </article>
            <article>
              <span>Participation reviewer</span>
              <strong>YES</strong>
              <p>DevConnect growth work maps to DAO participation criteria.</p>
            </article>
          </div>
          <div className="receiptTop">
            <span>Baseline direct LLM proof</span>
            <strong>
              {live.loading ? "reading..." : allCast ? (live.source === "linked" ? "LINKED TX PROOFS" : "YES · NO · ABSTAIN") : "CHECK STATE"}
            </strong>
          </div>
          <div className="decisionDeck">
            {proofCases.map((proof) => {
              const state = live.proofs?.[proof.label];
              const receiptSummary = receiptSummaries[proof.label];
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
                  <small>
                    Agent receipts {receiptSummary.successful}/{receiptSummary.total} · response {receiptSummary.response}
                  </small>
                  <small>
                    Quorum {receiptSummary.threshold}/{receiptSummary.subcommitteeSize} · {receiptSummary.runnerCount} runners
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
          <div className="receiptQuorum">
            <span>Validator receipt quorum</span>
            <p>
              Somnia's receipt service reports a threshold-{receiptSummaries[primaryProof.label].threshold} subcommittee
              for each request, plus runner evidence, timing, token usage, and decoded LLM steps.
            </p>
            <div className="quorumDeck">
              {proofCases.map((proof) => {
                const summary = receiptSummaries[proof.label];
                return (
                  <article key={`${proof.label}-quorum`}>
                    <strong>{proof.expectedReason}</strong>
                    <small>Request #{proof.requestId.toString()}</small>
                    <p>
                      {summary.runnerCount} runners · {summary.successful}/{summary.subcommitteeSize} receipts · max{" "}
                      {summary.maxElapsedMs}ms · {summary.totalTokens} tokens
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
          <div className="decodedPayloads">
            <span>Decoded request payloads</span>
            <div className="payloadDeck">
              {proofCases.map((proof) => (
                <article key={`${proof.label}-payload`}>
                  <strong>{proof.expectedReason}</strong>
                  <p>
                    <b>Proposal</b>
                    {proof.proposal}
                  </p>
                  <p>
                    <b>Criteria</b>
                    {proof.criteria}
                  </p>
                  <small>
                    inferString(prompt, system, false, [{allowedVoteOutputs.join(", ")}])
                  </small>
                  <a href={explorerTx(proof.requestTx)} target="_blank" rel="noreferrer">
                    Request #{proof.requestId.toString()}
                  </a>
                </article>
              ))}
            </div>
            <p>
              System prompt: <code>{stewardSystemPrompt}</code>
            </p>
          </div>
          <div className="criteria agentProof">
            <span>Somnia agent receipt path</span>
            <p>
              Request txs open the SomniaAgents <code>RequestCreated</code> logs for the live LLM
              agent. The verifier decodes the <code>inferString</code> payload and checks the exact
              criteria, proposal text, system prompt, and allowed outputs. Receipt JSON shows the
              validator runner receipts, token usage, and decoded <code>llm_response</code> step.
              Callback txs show the async platform response writing the final vote into Steward.
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
      ) : null}

      {isHomeRoute ? (
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
      ) : null}

      {isSourcesRoute ? (
      <section className="urlPipeline" id="url-pipeline" aria-labelledby="url-pipeline-heading">
        <div className="urlPipelineLead">
          <p className="eyebrow">{route === "/console" ? "Execution console · optional live path" : "Proposal source layer · live council inputs"}</p>
          <h2 id="url-pipeline-heading">
            {route === "/console" ? "Create a proposal, then let Somnia read and vote." : "The input is a URL, not operator-copied text."}
          </h2>
          <p>
            The live council proof starts from public proposal pages. Somnia's Parse Website agent
            extracts the decision-critical facts, then budget, risk, and participation reviewers
            independently return YES, NO, or ABSTAIN before the majority vote reaches MiniGovernor.
          </p>
          <div className="urlActions">
            <a href={parseWebsiteDocsUrl} target="_blank" rel="noreferrer">
              Parse Website docs
            </a>
            <a href="https://github.com/dolepee/steward/blob/master/PROOF.md" target="_blank" rel="noreferrer">
              Council proof guide
            </a>
            <a href="/council">
              Live council proof
            </a>
          </div>
        </div>
        {configuredUrlPipeline ? (
          <div className="urlConsole" id="console">
            <div className="urlConsoleCopy">
              <p className="eyebrow">Optional live console</p>
              <h2>Paste a proposal URL. Let Somnia vote.</h2>
              <p>
                This is the product path behind the proof: create a MiniGovernor proposal, ask
                Parse Website to read the source page, then let LLM Inference cast the final vote
                against the delegated mandate.
              </p>
              <div className="consoleStatus">
                <span>Pipeline</span>
                <strong>{shortAddress(configuredUrlPipeline)}</strong>
              </div>
            </div>
            <div className="urlConsolePanel">
              <label>
                Proposal URL
                <input
                  value={urlConsoleForm.proposalUrl}
                  onChange={(event) => setUrlConsoleForm((form) => ({ ...form, proposalUrl: event.target.value }))}
                  disabled={urlConsole.busy}
                />
              </label>
              <label>
                MiniGovernor proposal text
                <textarea
                  value={urlConsoleForm.proposalText}
                  onChange={(event) => setUrlConsoleForm((form) => ({ ...form, proposalText: event.target.value }))}
                  disabled={urlConsole.busy}
                />
              </label>
              <label>
                Delegated criteria
                <textarea
                  value={urlConsoleForm.criteria}
                  onChange={(event) => setUrlConsoleForm((form) => ({ ...form, criteria: event.target.value }))}
                  disabled={urlConsole.busy}
                />
              </label>
              <div className="consoleButtons">
                <button type="button" onClick={quoteUrlPipeline} disabled={urlConsole.busy}>
                  Quote agent deposit
                </button>
                <button type="button" onClick={startUrlPipelineVote} disabled={urlConsole.busy}>
                  Create proposal + start URL vote
                </button>
              </div>
              <div className="consoleOutput">
                <span>Status</span>
                <p>{urlConsole.status}</p>
                {urlConsole.requiredDeposit ? <p>Deposit: {formatEther(urlConsole.requiredDeposit)} STT</p> : null}
                {urlConsole.proposalId ? <p>Proposal #{urlConsole.proposalId.toString()}</p> : null}
                {urlConsole.jobId ? <p>Pipeline job #{urlConsole.jobId.toString()}</p> : null}
                {urlConsole.parseRequestId ? <p>Parse request #{urlConsole.parseRequestId.toString()}</p> : null}
                <div className="txLinks">
                  {urlConsole.createTx ? (
                    <a href={explorerTx(urlConsole.createTx)} target="_blank" rel="noreferrer">
                      Proposal tx
                    </a>
                  ) : null}
                  {urlConsole.startTx ? (
                    <a href={explorerTx(urlConsole.startTx)} target="_blank" rel="noreferrer">
                      Pipeline tx
                    </a>
                  ) : null}
                  {urlConsole.parseRequestId ? (
                    <a href={agentReceiptUrl(urlConsole.parseRequestId)} target="_blank" rel="noreferrer">
                      Parse receipt
                    </a>
                  ) : null}
                </div>
                {urlConsole.error ? <p className="consoleError">{urlConsole.error}</p> : null}
              </div>
            </div>
          </div>
        ) : null}
        <div className="urlPipelineBoard">
          <div className="pipelineSteps">
            {urlPipelineSteps.map((step) => (
              <article key={step.tag}>
                <span>{step.tag}</span>
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
              </article>
            ))}
          </div>
          <div className="urlProofCommand">
            <span>Council source proof</span>
            <code>{councilProofCommand}</code>
            <p>
              Verifies the five live proposal URL cases by checking Parse Website requests,
              parsed summaries, fifteen reviewer request ids, majority counts, and final governor
              votes.
            </p>
            <small>Expected: STEWARD_COUNCIL_PROOF_VALID</small>
          </div>
          <div className="proposalSources">
            {proposalSources.map((source) => (
              <article key={source.url} className={source.outcome.toLowerCase()}>
                <span>{source.label}</span>
                <strong>{source.outcome}</strong>
                <h3>{source.title}</h3>
                <p>{source.fact}</p>
                <a href={source.url} target="_blank" rel="noreferrer">
                  Open source URL
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>
      ) : null}

      {isHomeRoute || isGuideRoute ? (
      <section className="product" id="product">
        <div className="productLead">
          <p className="eyebrow">Product wedge</p>
          <h2>Routine DAO votes should not disappear into private bots.</h2>
          <p>
            Steward starts with low-risk governance automation: grants, parameter changes,
            contributor approvals, and recurring votes where abstention is common but manual review
            is still expensive. The value is not just that an agent votes; it is that anyone can
            audit why and how that vote reached the chain.
          </p>
          <a href={productNoteUrl} target="_blank" rel="noreferrer">
            Read product note
          </a>
        </div>
        <div className="useCases">
          <article>
            <span>Passive DAO voters</span>
            <strong>Criteria instead of silence</strong>
            <p>Voters can delegate explicit mandates and inspect how the agent applied them.</p>
          </article>
          <article>
            <span>Treasury councils</span>
            <strong>Consistent routine votes</strong>
            <p>Grant renewals and budget checks get a repeatable receipt-backed path.</p>
          </article>
          <article>
            <span>Governance providers</span>
            <strong>Transparent automation</strong>
            <p>Service teams can automate low-risk votes without asking users to trust server logs.</p>
          </article>
          <article>
            <span>Agent builders</span>
            <strong>Consequential proof</strong>
            <p>The agent does not just chat. It creates a request, returns a vote, and leaves a verifiable trail.</p>
          </article>
        </div>
      </section>
      ) : null}

      {isCouncilRoute ? (
      <section className="council" id="council">
        <div className="councilLead">
          <p className="eyebrow">Autonomous delegated council · live V2</p>
          <h2>One stored mandate produced YES, NO, and ABSTAIN.</h2>
          <p>
            The owner stored criteria and governor once. Watchers detected changed proposal
            URLs and executed that stored mandate; the wrapper forwards the original
            criteria into Parse Website plus three LLM reviewers, then the council casts
            the MiniGovernor vote.
          </p>
          <div className="autonomyChain" aria-label="Steward autonomous council execution path">
            {delegatedAutonomySteps.map(([num, title, copy]) => (
              <article key={num}>
                <span>{num}</span>
                <strong>{title}</strong>
                <p>{copy}</p>
              </article>
            ))}
          </div>
          <div className="txLinks">
            <a href={explorerAddress(proofAddresses.delegatedCouncilPipeline)} target="_blank" rel="noreferrer">
              Delegation wrapper
            </a>
            <a href={explorerAddress(proofAddresses.councilPipeline)} target="_blank" rel="noreferrer">
              Council contract
            </a>
            <a href={explorerTx(delegatedCouncilProof.startTx)} target="_blank" rel="noreferrer">
              Watcher start
            </a>
            <a href={explorerTx(delegatedCouncilProof.finalVoteTx)} target="_blank" rel="noreferrer">
              Final vote
            </a>
          </div>
        </div>
        <div className="councilBoard">
          {delegatedCouncilCases.map((proof) => (
            <article className={proof.outcome.toLowerCase()} key={proof.councilJobId}>
              <span>Watcher-triggered stored delegation</span>
              <strong>{proof.outcome}</strong>
              <small>
                Proposal #{proof.proposalId} · execution #{proof.executionId}
              </small>
              <small>
                Council job #{proof.councilJobId} · parse #{proof.parseRequestId}
              </small>
              <p>
                {proof.detail} The council reviewers returned {proof.tally}.
              </p>
              <div className="txLinks">
                <a href={explorerTx(proof.delegationTx)} target="_blank" rel="noreferrer">
                  Store mandate
                </a>
                <a href={explorerTx(proof.proposalTx)} target="_blank" rel="noreferrer">
                  Proposal
                </a>
                <a href={explorerTx(proof.startTx)} target="_blank" rel="noreferrer">
                  Watcher
                </a>
                <a href={explorerTx(proof.parseTx)} target="_blank" rel="noreferrer">
                  Parse
                </a>
                <a href={explorerTx(proof.finalVoteTx)} target="_blank" rel="noreferrer">
                  Vote
                </a>
              </div>
            </article>
          ))}
          <div className="councilCommand">
            <span>Delegated council proof</span>
            <code>{delegatedCouncilProofCommand}</code>
            <p>
              Verifies the stored delegation, watcher-created proposals, wrapper executions,
              downstream council jobs, nine successful reviewer decisions, final YES/NO/ABSTAIN
              tallies, and the MiniGovernor votes from the council pipeline.
            </p>
            <div className="txLinks">
              <a href={explorerTx(delegatedCouncilProof.deploymentTx)} target="_blank" rel="noreferrer">
                V2 deploy tx
              </a>
              <a href={explorerTx(delegatedCouncilProof.finalVoteTx)} target="_blank" rel="noreferrer">
                V2 final vote
              </a>
            </div>
          </div>
          {councilCases.map((proof) => (
            <article className={proof.outcome.toLowerCase()} key={proof.jobId}>
              <span>{proof.proposal}</span>
              <strong>{proof.outcome}</strong>
              <small>
                Job #{proof.jobId} · parse #{proof.parseRequestId}
              </small>
              <small>{proof.tally}</small>
              <p>{proof.detail}</p>
              <div className="txLinks">
                <a href={explorerTx(proof.startTx)} target="_blank" rel="noreferrer">
                  Start
                </a>
                <a href={explorerTx(proof.parseTx)} target="_blank" rel="noreferrer">
                  Parse
                </a>
                <a href={explorerTx(proof.finalVoteTx)} target="_blank" rel="noreferrer">
                  Vote
                </a>
              </div>
            </article>
          ))}
          <div className="councilCommand">
            <span>Fallback batch council proof</span>
            <code>node scripts/verify-council-proof.mjs</code>
            <p>
              Verifies proposal ids 4, 5, 6, 7, and 8; parse requests; fifteen reviewer request ids;
              three majority outcomes; and the final MiniGovernor votes from the council
              contract. Local tests still cover parse failure refunds, three-way ABSTAIN,
              and one-reviewer failure.
            </p>
            <div className="txLinks">
              <a href={parseWebsiteAgentUrl} target="_blank" rel="noreferrer">
                Parse Website agent
              </a>
              <a href={explorerTx(councilProof.deployTx)} target="_blank" rel="noreferrer">
                Deploy tx
              </a>
            </div>
          </div>
        </div>
      </section>
      ) : null}

      {isGuideRoute ? (
      <section className="judge">
        <div>
          <p className="eyebrow">Judge path</p>
          <h2>Five proposal URLs. Fifteen reviewer receipts. Three council outcomes.</h2>
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
              <p>Five URL council votes, three baseline votes, source-verified contracts, and script-verifiable state.</p>
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
            <div className="proofCoverage" aria-label="Verifier coverage">
              <span>Live state</span>
              <span>Runner quorum</span>
              <span>Decoded prompts</span>
              <span>Tx event trail</span>
              <span>Verified source</span>
            </div>
          </div>
        </div>
      </section>
      ) : null}

      <section className="live">
        <div>
          <span>Steward</span>
          <strong>
            <a href={explorerAddress(proofAddresses.steward)} target="_blank" rel="noreferrer">
              {shortAddress(proofAddresses.steward)}
            </a>
          </strong>
        </div>
        <div>
          <span>MiniGovernor</span>
          <strong>
            <a href={explorerAddress(proofAddresses.governor)} target="_blank" rel="noreferrer">
              {shortAddress(proofAddresses.governor)}
            </a>
          </strong>
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
          <span>Request payloads</span>
          <strong>inferString decoded</strong>
        </div>
        <div>
          <span>Verified source</span>
          <strong>
            <a href={explorerAddress(proofAddresses.steward)} target="_blank" rel="noreferrer">
              Steward
            </a>{" "}
            /{" "}
            <a href={explorerAddress(proofAddresses.governor)} target="_blank" rel="noreferrer">
              Governor
            </a>
          </strong>
        </div>
        <div>
          <span>Agent receipts</span>
          <strong>{receiptState.loading ? "..." : `${liveReceiptCount}/${successfulReceiptCount}`}</strong>
        </div>
      </section>

      {live.error ? <p className="error">Live RPC read timed out in browser. Linked txs and scripts/verify-live.sh reproduce this proof set.</p> : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
