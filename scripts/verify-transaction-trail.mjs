#!/usr/bin/env node

const RPC_URL = process.env.SOMNIA_TESTNET_RPC ?? "https://dream-rpc.somnia.network";

const STEWARD = "0x6932C7827E7BFd9f0015Ed93fA120379E0d20541".toLowerCase();
const MINI_GOVERNOR = "0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389".toLowerCase();
const SOMNIA_AGENTS = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776".toLowerCase();
const LLM_AGENT_ID = 12847293847561029384n;

const topics = {
  proposalCreated: "0x553be4d74bc63ce955614b229c8eaa4ad7f7f1f38840da15f3604b2fca49c6a8",
  requestCreated: "0xb62339927ed9948fd837358a55f5b9a824f7b047043faece66965593ed726889",
  requestFinalized: "0x65db1ef5b3bcd84fe4fb8dbbe1cadc9fe6643bb261ab2e01d65c281c3d466af2",
  voteRequested: "0x686839e71eb8af8f67870b820a03f371e159966c616c8b0dcea2e7d45a439041",
  stewardVoteCast: "0x312f06241f44004d37efa770dc220aa0adff0de4ca7ee83220dd124565b11611",
  governorVoteCast: "0xb22128b716f82627c9618521dd7de1615285e71c832093d2666d965f91ae9dd9",
};

const cases = [
  {
    label: "YES",
    proposalId: 1n,
    requestId: 1698384n,
    delegationId: 1n,
    support: 1n,
    proposalTx: "0xb31236f41cab27998bbf5593a1fbd8eda3f330eaf1c4b6b34523e5161d30852b",
    requestTx: "0x63c34767e59cc6988fd2ab5ecef9d1089e9f4445e1b1e18a9b490b0d0efc77ef",
    callbackTx: "0xb74e25845472a2f591aa91eefe84e5e2828b41ac11acc78b41ceb1015500c52b",
  },
  {
    label: "NO",
    proposalId: 2n,
    requestId: 1738101n,
    delegationId: 1n,
    support: 2n,
    proposalTx: "0xebc1961f3aa23078bb1d54e99d61fc4e8647caae1bae5e4e9f4ec48f2df53b3d",
    requestTx: "0x6d32b090d9ebacc6dd1dd46c01e0036bff3e684df4a28d3817823cd3747959fc",
    callbackTx: "0xe14303e64f6a5db3d74919c94f42d3c14df3183e225f9996cc29cba86cc66dc3",
  },
  {
    label: "ABSTAIN",
    proposalId: 3n,
    requestId: 1738108n,
    delegationId: 1n,
    support: 3n,
    proposalTx: "0x758f8dbc8cadf4887b301e33ab55c068ad983a4d507bd6cb9c5caa48b7060e53",
    requestTx: "0xa01f30ee06dbfa66b4a60414469d4f0e6406440f11e625a1197de88d797e851d",
    callbackTx: "0xa157564585f473503627c801d6fb5992900dab3d5efcb31d4f15383c16487603",
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function topicOf(value) {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function topicAddress(address) {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function wordAt(data, index) {
  const clean = data.replace(/^0x/, "");
  const word = clean.slice(index * 64, (index + 1) * 64);
  assert(word.length === 64, `missing data word ${index}`);
  return BigInt(`0x${word}`);
}

function matchingLog(receipt, { address, topic0, topics: expectedTopics = [], dataWords = [] }) {
  return (receipt.logs ?? []).find((log) => {
    if (address && log.address?.toLowerCase() !== address) return false;
    if (topic0 && log.topics?.[0]?.toLowerCase() !== topic0) return false;

    for (const [index, expected] of expectedTopics) {
      if (log.topics?.[index]?.toLowerCase() !== expected.toLowerCase()) return false;
    }

    for (const [index, expected] of dataWords) {
      if (wordAt(log.data, index) !== expected) return false;
    }

    return true;
  });
}

async function rpc(method, params) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  assert(response.ok, `RPC ${method} returned HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`RPC ${method} error: ${body.error.message ?? JSON.stringify(body.error)}`);
  return body.result;
}

async function receiptWithRetry(txHash, label, attempts = 4) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
      assert(receipt, `${label}: missing receipt ${txHash}`);
      assert(receipt.status === "0x1", `${label}: receipt did not succeed ${txHash}`);
      return receipt;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(1_500 * attempt);
    }
  }

  throw lastError;
}

for (const proof of cases) {
  const proposal = await receiptWithRetry(proof.proposalTx, `${proof.label} proposal`);
  assert(
    matchingLog(proposal, {
      address: MINI_GOVERNOR,
      topic0: topics.proposalCreated,
      topics: [[1, topicOf(proof.proposalId)]],
    }),
    `${proof.label}: missing MiniGovernor ProposalCreated log`,
  );

  const request = await receiptWithRetry(proof.requestTx, `${proof.label} request`);
  assert(
    matchingLog(request, {
      address: SOMNIA_AGENTS,
      topic0: topics.requestCreated,
      topics: [
        [1, topicOf(proof.requestId)],
        [2, topicOf(LLM_AGENT_ID)],
      ],
    }),
    `${proof.label}: missing SomniaAgents RequestCreated log`,
  );
  assert(
    matchingLog(request, {
      address: STEWARD,
      topic0: topics.voteRequested,
      topics: [
        [1, topicOf(proof.requestId)],
        [2, topicOf(proof.delegationId)],
        [3, topicOf(proof.proposalId)],
      ],
    }),
    `${proof.label}: missing Steward VoteRequested log`,
  );

  const callback = await receiptWithRetry(proof.callbackTx, `${proof.label} callback`);
  assert(
    matchingLog(callback, {
      address: MINI_GOVERNOR,
      topic0: topics.governorVoteCast,
      topics: [
        [1, topicOf(proof.proposalId)],
        [2, topicAddress(STEWARD)],
      ],
      dataWords: [[0, proof.support]],
    }),
    `${proof.label}: missing MiniGovernor VoteCast log`,
  );
  assert(
    matchingLog(callback, {
      address: STEWARD,
      topic0: topics.stewardVoteCast,
      topics: [
        [1, topicOf(proof.requestId)],
        [2, topicOf(proof.delegationId)],
        [3, topicOf(proof.proposalId)],
      ],
      dataWords: [[0, proof.support]],
    }),
    `${proof.label}: missing StewardVoteCast log`,
  );
  assert(
    matchingLog(callback, {
      address: SOMNIA_AGENTS,
      topic0: topics.requestFinalized,
      topics: [[1, topicOf(proof.requestId)]],
      dataWords: [[0, 2n]],
    }),
    `${proof.label}: missing SomniaAgents RequestFinalized success log`,
  );

  console.log(
    `${proof.label}: tx trail valid (proposal ${proof.proposalId}, request ${proof.requestId}, support ${proof.support})`,
  );
}

console.log("STEWARD_TX_TRAIL_VALID");
