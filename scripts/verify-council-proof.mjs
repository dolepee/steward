#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const RPC_URL = process.env.SOMNIA_TESTNET_RPC ?? "https://dream-rpc.somnia.network";

const DEPLOYER = "0x56D5f677dBf1988A8744e549E0fD12010C79728f".toLowerCase();
const COUNCIL = "0xB890e1274eE308cBC8348a7E032394406215fd52".toLowerCase();
const MINI_GOVERNOR = "0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389".toLowerCase();
const SOMNIA_AGENTS = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776".toLowerCase();
const PARSE_WEBSITE_AGENT_ID = 12875401142070969085n;
const LLM_AGENT_ID = 12847293847561029384n;

const deployTx = "0x0f9c058cb1d07c2885177e4e104c2115ccf6e87f37eb289a867005def970f1e3";

const proofCases = [
  {
    label: "YES",
    proposalTx: "0x0c6e09adac5d7b066e01dc67bf6cf08e202061ad80e87f1e3770a3cdcf497d11",
    startTx: "0xccc228ce881ea9958aafdfdf9825882d23ed32cf52e8b3cdd2f1ff5a4db221fb",
    parseCallbackTx: "0xa07abe08b36a8cff98fa141b26ced8cf6e81ae8afd48786f5338c873cc40d98b",
    reviewerCallbackTxs: [
      "0x517b19727db1ca8ab76d766b4cb7e35c251bc2acf859619388f776ce3a97b28a",
      "0x6dc4156b46c96fa4c099aed8092dbbd6927e15ab204b6fbcaafc7121d9f11641",
      "0x6e56187ff56be6eb7819d600750d6405544ad5938af90af7a57501c0c4923d1b",
    ],
    finalVoteTx: "0x6dc4156b46c96fa4c099aed8092dbbd6927e15ab204b6fbcaafc7121d9f11641",
    proposalId: 4n,
    jobId: 1n,
    parseRequestId: 3085689n,
    reviewerRequestIds: [3085732n, 3085733n, 3085734n],
    expectedSupport: 1n,
    expectedCounts: { yes: 3n, no: 0n, abstain: 0n },
    expectedReviewerReason: "YES",
    expectedSummary: "500,000 USDC",
    expectedFinalReason: "YES: Steward council majority: YES=3, NO=0, ABSTAIN=0.",
  },
  {
    label: "NO",
    proposalTx: "0xb1229dd4f8371ee935ec05d64fc68ad1e37463b51672bcc28c54d8f2e83de0aa",
    startTx: "0xb4fed6c8eecba1bfa8e75fc8b0a50d9702a05da16a793e6cbdb6a6fe6b6061da",
    parseCallbackTx: "0x20c677ee2dfc13b3f6a2c5744aa3e1dfc91dc83f0f59a723cf4d86940de1e788",
    reviewerCallbackTxs: [
      "0xe4c9dc53ca612d09a6af84e9e45b48fb51ee4506b0b5a839f90d81bd2fe08686",
      "0x47db717c3e0054352a365278c0508d3444ee50bc720c60e0a68f3c6d3af61638",
      "0x00b8b355d505a431a9d63295e83547ea23e629f203b93ca03fa998d38e43f475",
    ],
    finalVoteTx: "0xe4c9dc53ca612d09a6af84e9e45b48fb51ee4506b0b5a839f90d81bd2fe08686",
    proposalId: 5n,
    jobId: 2n,
    parseRequestId: 3090443n,
    reviewerRequestIds: [3090480n, 3090481n, 3090482n],
    expectedSupport: 2n,
    expectedCounts: { yes: 0n, no: 3n, abstain: 0n },
    expectedReviewerReason: "NO",
    expectedSummary: "team token",
    expectedFinalReason: "NO: Steward council majority: YES=0, NO=3, ABSTAIN=0.",
  },
  {
    label: "ABSTAIN",
    proposalTx: "0xe2e9fdbf23afa1afc48c07de474b3e2f34a1ad96ca09cb83fc47c6fecde106e5",
    startTx: "0x5e0055456664f73ac566f47207b89dcbed86f25d17f03f20c7989bb8e0003b35",
    parseCallbackTx: "0x6daa36d4058ae08f27794cebef265539bf0bf1714c6ac867386a3185bc90afdc",
    reviewerCallbackTxs: [
      "0x12ed8607444b7d99440e964f5e8802734a15b9572542cc4786d2d16eccbb00aa",
      "0x8b0d32cc0dfb88e21d23ea9417b7fc90fe4968ab803f4138b6e604a79ce5d2ea",
      "0x213018aff710f18c220950d325f3dba25ae33eaf3210c968462af91bd11c99c7",
    ],
    finalVoteTx: "0x12ed8607444b7d99440e964f5e8802734a15b9572542cc4786d2d16eccbb00aa",
    proposalId: 6n,
    jobId: 3n,
    parseRequestId: 3090879n,
    reviewerRequestIds: [3090907n, 3090908n, 3090909n],
    expectedSupport: 3n,
    expectedCounts: { yes: 0n, no: 0n, abstain: 3n },
    expectedReviewerReason: "ABSTAIN",
    expectedSummary: "Working Group",
    expectedFinalReason: "ABSTAIN: Steward council majority: YES=0, NO=0, ABSTAIN=3.",
  },
];

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

function verifyProofCase(proof) {
  const proposalReceipt = receipt(proof.proposalTx, `${proof.label} council proposal tx`);
  assert(
    matchingLog(proposalReceipt, {
      address: MINI_GOVERNOR,
      topic0: topics.proposalCreated,
      expectedTopics: [
        [1, topicOf(proof.proposalId)],
        [2, topicAddress(DEPLOYER)],
      ],
    }),
    `${proof.label}: missing MiniGovernor ProposalCreated log`,
  );

  const startReceipt = receipt(proof.startTx, `${proof.label} council start tx`);
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
    `${proof.label}: missing CouncilPipelineStarted log`,
  );
  assert(
    matchingLog(startReceipt, {
      address: SOMNIA_AGENTS,
      topic0: topics.requestCreated,
      expectedTopics: [
        [1, topicOf(proof.parseRequestId)],
        [2, topicOf(PARSE_WEBSITE_AGENT_ID)],
      ],
    }),
    `${proof.label}: missing Parse Website RequestCreated log`,
  );

  const parseReceipt = receipt(proof.parseCallbackTx, `${proof.label} council parse callback tx`);
  assert(
    matchingLog(parseReceipt, {
      address: COUNCIL,
      topic0: topics.councilProposalParsed,
      expectedTopics: [
        [1, topicOf(proof.jobId)],
        [2, topicOf(proof.parseRequestId)],
      ],
    }),
    `${proof.label}: missing CouncilProposalParsed log`,
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
      `${proof.label}: missing CouncilReviewerRequested log for reviewer ${reviewerIndex}`,
    );
    assert(
      matchingLog(parseReceipt, {
        address: SOMNIA_AGENTS,
        topic0: topics.requestCreated,
        expectedTopics: [
          [1, topicOf(requestId)],
          [2, topicOf(LLM_AGENT_ID)],
        ],
      }),
      `${proof.label}: missing LLM RequestCreated log for reviewer ${reviewerIndex}`,
    );
  }

  const callbackReceipts = proof.reviewerCallbackTxs.map((txHash, index) =>
    receipt(txHash, `${proof.label} reviewer ${index} callback tx`),
  );
  const finalVoteReceipt = receipt(proof.finalVoteTx, `${proof.label} final council vote tx`);

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
      `${proof.label}: missing CouncilReviewerDecided log for reviewer ${reviewerIndex}`,
    );
  }

  assert(
    matchingLog(finalVoteReceipt, {
      address: COUNCIL,
      topic0: topics.councilVoteCast,
      expectedTopics: [
        [1, topicOf(proof.jobId)],
        [2, topicOf(proof.proposalId)],
      ],
    }),
    `${proof.label}: missing CouncilVoteCast final log`,
  );
  assert(
    matchingLog(finalVoteReceipt, {
      address: MINI_GOVERNOR,
      topic0: topics.governorVoteCast,
      expectedTopics: [
        [1, topicOf(proof.proposalId)],
        [2, topicAddress(COUNCIL)],
      ],
    }),
    `${proof.label}: missing MiniGovernor VoteCast from council contract`,
  );

  const overview = call(
    COUNCIL,
    "jobOverview(uint256)(uint8,uint8,uint256,uint8,uint8,uint8,uint8,uint8,string,string,uint256)",
    proof.jobId,
  );
  assert(bigIntLine(overview[0]) === 3n, `${proof.label}: council job state is not Cast`);
  assert(bigIntLine(overview[1]) === 2n, `${proof.label}: council parse status is not Success`);
  assert(bigIntLine(overview[2]) === proof.parseRequestId, `${proof.label}: parse request id mismatch`);
  assert(bigIntLine(overview[3]) === proof.expectedSupport, `${proof.label}: final support mismatch`);
  assert(bigIntLine(overview[4]) === proof.expectedCounts.yes, `${proof.label}: yes count mismatch`);
  assert(bigIntLine(overview[5]) === proof.expectedCounts.no, `${proof.label}: no count mismatch`);
  assert(bigIntLine(overview[6]) === proof.expectedCounts.abstain, `${proof.label}: abstain count mismatch`);
  assert(bigIntLine(overview[7]) === 3n, `${proof.label}: completed review count mismatch`);
  assert(
    stringLine(overview[8]).toLowerCase().includes(proof.expectedSummary.toLowerCase()),
    `${proof.label}: parsed summary missing expected phrase`,
  );
  assert(stringLine(overview[9]) === proof.expectedFinalReason, `${proof.label}: final reason mismatch`);

  for (let reviewerIndex = 0; reviewerIndex < 3; reviewerIndex++) {
    const decision = call(
      COUNCIL,
      "reviewerDecisions(uint256,uint8)(uint256,uint8,uint8,string,string,uint256,bool)",
      proof.jobId,
      reviewerIndex,
    );
    assert(
      bigIntLine(decision[0]) === proof.reviewerRequestIds[reviewerIndex],
      `${proof.label}: reviewer ${reviewerIndex} request mismatch`,
    );
    assert(bigIntLine(decision[1]) === 2n, `${proof.label}: reviewer ${reviewerIndex} status is not Success`);
    assert(
      bigIntLine(decision[2]) === proof.expectedSupport,
      `${proof.label}: reviewer ${reviewerIndex} support mismatch`,
    );
    assert(
      stringLine(decision[4]) === proof.expectedReviewerReason,
      `${proof.label}: reviewer ${reviewerIndex} reason mismatch`,
    );
    assert(decision[6] === "true", `${proof.label}: reviewer ${reviewerIndex} is not marked complete`);
  }

  const governorVote = bigIntLine(call(MINI_GOVERNOR, "votes(uint256,address)(uint8)", proof.proposalId, COUNCIL)[0]);
  assert(governorVote === proof.expectedSupport, `${proof.label}: MiniGovernor vote mismatch`);

  console.log(
    `${proof.label}: proposal ${proof.proposalId}, job ${proof.jobId}, parse ${proof.parseRequestId}, reviewers ${proof.reviewerRequestIds.join(
      ", ",
    )}, final support ${proof.expectedSupport}`,
  );
}

const deployReceipt = receipt(deployTx, "Council deploy tx");
assert(deployReceipt.contractAddress?.toLowerCase() === COUNCIL, "Council deploy tx created unexpected address");

const code = cast(["code", COUNCIL, "--rpc-url", RPC_URL], "Council bytecode");
assert(code !== "0x", "Council contract has no bytecode");

for (const proof of proofCases) {
  verifyProofCase(proof);
}

console.log(`Council pipeline: ${COUNCIL}`);
console.log("Council outcomes: YES / NO / ABSTAIN");
console.log("STEWARD_COUNCIL_PROOF_VALID");
