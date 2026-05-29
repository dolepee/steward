#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const RPC_URL = process.env.SOMNIA_TESTNET_RPC ?? "https://dream-rpc.somnia.network";

const COUNCIL = "0xB890e1274eE308cBC8348a7E032394406215fd52".toLowerCase();
const MINI_GOVERNOR = "0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389".toLowerCase();
const SOMNIA_AGENTS = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776".toLowerCase();

const proof = {
  deployTx: "0x0f9c058cb1d07c2885177e4e104c2115ccf6e87f37eb289a867005def970f1e3",
  proposalTx: "0x0c6e09adac5d7b066e01dc67bf6cf08e202061ad80e87f1e3770a3cdcf497d11",
  startTx: "0xccc228ce881ea9958aafdfdf9825882d23ed32cf52e8b3cdd2f1ff5a4db221fb",
  parseCallbackTx: "0xa07abe08b36a8cff98fa141b26ced8cf6e81ae8afd48786f5338c873cc40d98b",
  budgetCallbackTx: "0x517b19727db1ca8ab76d766b4cb7e35c251bc2acf859619388f776ce3a97b28a",
  riskAndFinalVoteTx: "0x6dc4156b46c96fa4c099aed8092dbbd6927e15ab204b6fbcaafc7121d9f11641",
  participationCallbackTx: "0x6e56187ff56be6eb7819d600750d6405544ad5938af90af7a57501c0c4923d1b",
  proposalId: 4n,
  jobId: 1n,
  parseRequestId: 3085689n,
  reviewerRequestIds: [3085732n, 3085733n, 3085734n],
};

const topics = {
  proposalCreated: "0x553be4d74bc63ce955614b229c8eaa4ad7f7f1f38840da15f3604b2fca49c6a8",
  requestCreated: "0xb62339927ed9948fd837358a55f5b9a824f7b047043faece66965593ed726889",
  councilPipelineStarted: "0xc3788851a454480c871a406aae4ad72d8abb890810537634d628768607e2365c",
  councilProposalParsed: "0x31e2812e2ae4f082d0d234efba2cef2469310c4b4392b0262df17fcecc945d7c",
  councilReviewerRequested: "0x2922eb32d1079d81e92a3d82dfae6e7b7cdcd1edac988dfbb07aa077da8fa23d",
  councilReviewerDecided: "0xe791970aa12d43206749e520096eebbd4736c0a1ebb296168984ca48aba00d37",
  councilVoteCast: "0x22b1e42e95da5cd430c00e324827175f1a4b5b5d298ce74525e290b16d213e81",
  governorVoteCast: "0xb22128b716f82627c9618521dd7de1615285e71c832093d2666d965f91ae9dd9",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cast(args, label) {
  try {
    return execFileSync("cast", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    const stderr = error.stderr?.toString()?.trim();
    throw new Error(`${label} failed${stderr ? `: ${stderr}` : ""}`);
  }
}

function call(address, signature, ...args) {
  return cast(["call", address, signature, ...args.map(String), "--rpc-url", RPC_URL], signature)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function receipt(txHash, label) {
  const body = JSON.parse(cast(["receipt", txHash, "--rpc-url", RPC_URL, "--json"], label));
  assert(body.status === "0x1", `${label}: transaction did not succeed`);
  return body;
}

function topicOf(value) {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function topicAddress(address) {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function bigIntLine(line) {
  return BigInt(line.split(/\s+/)[0]);
}

function stringLine(line) {
  return JSON.parse(line);
}

function matchingLog(txReceipt, { address, topic0, expectedTopics = [] }) {
  return (txReceipt.logs ?? []).find((log) => {
    if (address && log.address?.toLowerCase() !== address.toLowerCase()) return false;
    if (topic0 && log.topics?.[0]?.toLowerCase() !== topic0.toLowerCase()) return false;

    for (const [index, expected] of expectedTopics) {
      if (log.topics?.[index]?.toLowerCase() !== expected.toLowerCase()) return false;
    }

    return true;
  });
}

const deployReceipt = receipt(proof.deployTx, "Council deploy tx");
assert(deployReceipt.contractAddress?.toLowerCase() === COUNCIL, "Council deploy tx created unexpected address");

const code = cast(["code", COUNCIL, "--rpc-url", RPC_URL], "Council bytecode");
assert(code !== "0x", "Council contract has no bytecode");

const proposalReceipt = receipt(proof.proposalTx, "Council proposal tx");
assert(
  matchingLog(proposalReceipt, {
    address: MINI_GOVERNOR,
    topic0: topics.proposalCreated,
    expectedTopics: [
      [1, topicOf(proof.proposalId)],
      [2, topicAddress("0x56D5f677dBf1988A8744e549E0fD12010C79728f")],
    ],
  }),
  "Missing MiniGovernor ProposalCreated log for council proof proposal",
);

const startReceipt = receipt(proof.startTx, "Council start tx");
assert(
  matchingLog(startReceipt, {
    address: COUNCIL,
    topic0: topics.councilPipelineStarted,
    expectedTopics: [
      [1, topicOf(proof.jobId)],
      [2, topicOf(proof.parseRequestId)],
      [3, topicAddress(MINI_GOVERNOR)],
    ],
  }),
  "Missing CouncilPipelineStarted log",
);
assert(
  matchingLog(startReceipt, {
    address: SOMNIA_AGENTS,
    topic0: topics.requestCreated,
    expectedTopics: [
      [1, topicOf(proof.parseRequestId)],
      [2, topicOf(12875401142070969085n)],
    ],
  }),
  "Missing Parse Website RequestCreated log",
);

const parseReceipt = receipt(proof.parseCallbackTx, "Council parse callback tx");
assert(
  matchingLog(parseReceipt, {
    address: COUNCIL,
    topic0: topics.councilProposalParsed,
    expectedTopics: [
      [1, topicOf(proof.jobId)],
      [2, topicOf(proof.parseRequestId)],
    ],
  }),
  "Missing CouncilProposalParsed log",
);

for (const [reviewerIndex, requestId] of proof.reviewerRequestIds.entries()) {
  assert(
    matchingLog(parseReceipt, {
      address: COUNCIL,
      topic0: topics.councilReviewerRequested,
      expectedTopics: [
        [1, topicOf(proof.jobId)],
        [2, topicOf(requestId)],
        [3, topicOf(BigInt(reviewerIndex))],
      ],
    }),
    `Missing CouncilReviewerRequested log for reviewer ${reviewerIndex}`,
  );
  assert(
    matchingLog(parseReceipt, {
      address: SOMNIA_AGENTS,
      topic0: topics.requestCreated,
      expectedTopics: [
        [1, topicOf(requestId)],
        [2, topicOf(12847293847561029384n)],
      ],
    }),
    `Missing LLM reviewer RequestCreated log for reviewer ${reviewerIndex}`,
  );
}

const callbackReceipts = [
  receipt(proof.budgetCallbackTx, "Budget reviewer callback tx"),
  receipt(proof.riskAndFinalVoteTx, "Risk reviewer callback and final vote tx"),
  receipt(proof.participationCallbackTx, "Participation reviewer callback tx"),
];

for (const [reviewerIndex, requestId] of proof.reviewerRequestIds.entries()) {
  assert(
    callbackReceipts.some((txReceipt) =>
      matchingLog(txReceipt, {
        address: COUNCIL,
        topic0: topics.councilReviewerDecided,
        expectedTopics: [
          [1, topicOf(proof.jobId)],
          [2, topicOf(requestId)],
          [3, topicOf(BigInt(reviewerIndex))],
        ],
      }),
    ),
    `Missing CouncilReviewerDecided log for reviewer ${reviewerIndex}`,
  );
}

assert(
  matchingLog(callbackReceipts[1], {
    address: COUNCIL,
    topic0: topics.councilVoteCast,
    expectedTopics: [
      [1, topicOf(proof.jobId)],
      [2, topicOf(proof.proposalId)],
    ],
  }),
  "Missing CouncilVoteCast final log",
);
assert(
  matchingLog(callbackReceipts[1], {
    address: MINI_GOVERNOR,
    topic0: topics.governorVoteCast,
    expectedTopics: [
      [1, topicOf(proof.proposalId)],
      [2, topicAddress(COUNCIL)],
    ],
  }),
  "Missing MiniGovernor VoteCast from council contract",
);

const overview = call(
  COUNCIL,
  "jobOverview(uint256)(uint8,uint8,uint256,uint8,uint8,uint8,uint8,uint8,string,string,uint256)",
  proof.jobId,
);
assert(bigIntLine(overview[0]) === 3n, "Council job state is not Cast");
assert(bigIntLine(overview[1]) === 2n, "Council parse status is not Success");
assert(bigIntLine(overview[2]) === proof.parseRequestId, "Council parse request id mismatch");
assert(bigIntLine(overview[3]) === 1n, "Council final support is not YES");
assert(bigIntLine(overview[4]) === 3n, "Council yes count mismatch");
assert(bigIntLine(overview[5]) === 0n, "Council no count mismatch");
assert(bigIntLine(overview[6]) === 0n, "Council abstain count mismatch");
assert(bigIntLine(overview[7]) === 3n, "Council completed review count mismatch");
assert(stringLine(overview[8]).includes("500,000 USDC"), "Council parsed summary missing expected amount");
assert(
  stringLine(overview[9]) === "YES: Steward council majority: YES=3, NO=0, ABSTAIN=0.",
  "Council final reason mismatch",
);

for (let reviewerIndex = 0; reviewerIndex < 3; reviewerIndex++) {
  const decision = call(
    COUNCIL,
    "reviewerDecisions(uint256,uint8)(uint256,uint8,uint8,string,string,uint256,bool)",
    proof.jobId,
    reviewerIndex,
  );
  assert(bigIntLine(decision[0]) === proof.reviewerRequestIds[reviewerIndex], `Reviewer ${reviewerIndex} request mismatch`);
  assert(bigIntLine(decision[1]) === 2n, `Reviewer ${reviewerIndex} status is not Success`);
  assert(bigIntLine(decision[2]) === 1n, `Reviewer ${reviewerIndex} support is not YES`);
  assert(stringLine(decision[4]) === "YES", `Reviewer ${reviewerIndex} reason is not YES`);
  assert(decision[6] === "true", `Reviewer ${reviewerIndex} is not marked complete`);
}

const governorVote = bigIntLine(call(MINI_GOVERNOR, "votes(uint256,address)(uint8)", proof.proposalId, COUNCIL)[0]);
assert(governorVote === 1n, "MiniGovernor did not record YES vote from council contract");

console.log(`Council pipeline: ${COUNCIL}`);
console.log(`Proposal ${proof.proposalId}, job ${proof.jobId}, parse request ${proof.parseRequestId}`);
console.log(`Reviewers: ${proof.reviewerRequestIds.join(", ")} -> YES/YES/YES`);
console.log(`Final vote: YES into MiniGovernor proposal ${proof.proposalId}`);
console.log("STEWARD_COUNCIL_PROOF_VALID");
