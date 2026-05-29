#!/usr/bin/env node

const RPC_URL = process.env.SOMNIA_TESTNET_RPC ?? "https://dream-rpc.somnia.network";

const STEWARD = "0x6932C7827E7BFd9f0015Ed93fA120379E0d20541".toLowerCase();
const MINI_GOVERNOR = "0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389".toLowerCase();
const SOMNIA_AGENTS = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776".toLowerCase();
const LLM_AGENT_ID = 12847293847561029384n;
const INFER_STRING_SELECTOR = "0xfe7ca098";
const EXPECTED_SYSTEM =
  "You are Steward, an autonomous DAO voting delegate. Choose exactly one allowed value.";
const EXPECTED_CRITERIA =
  "Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.";
const EXPECTED_ALLOWED_VALUES = ["YES", "NO", "ABSTAIN"];

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
    criteriaText: EXPECTED_CRITERIA,
    proposalText: "Allocate 500K USDC to a Q3 community grants program.",
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
    criteriaText: EXPECTED_CRITERIA,
    proposalText: "Unlock 10% of foundation team tokens early.",
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
    criteriaText: EXPECTED_CRITERIA,
    proposalText: "Form a working group to explore future ecosystem partnerships without committing funds.",
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

function cleanHex(value) {
  return value.replace(/^0x/, "");
}

function wordAt(data, index) {
  const clean = cleanHex(data);
  const word = clean.slice(index * 64, (index + 1) * 64);
  assert(word.length === 64, `missing data word ${index}`);
  return BigInt(`0x${word}`);
}

function toSafeNumber(value, label) {
  assert(value <= BigInt(Number.MAX_SAFE_INTEGER), `${label} too large`);
  return Number(value);
}

function wordHexAt(data, byteOffset) {
  assert(byteOffset % 32 === 0, `unaligned ABI word offset ${byteOffset}`);
  const clean = cleanHex(data);
  const start = byteOffset * 2;
  const word = clean.slice(start, start + 64);
  assert(word.length === 64, `missing ABI word at byte offset ${byteOffset}`);
  return word;
}

function uintAt(data, byteOffset, label = `uint at ${byteOffset}`) {
  return BigInt(`0x${wordHexAt(data, byteOffset) || "0"}`);
}

function bytesAt(data, byteOffset, label = `bytes at ${byteOffset}`) {
  const clean = cleanHex(data);
  const length = toSafeNumber(uintAt(clean, byteOffset, `${label} length`), `${label} length`);
  const start = (byteOffset + 32) * 2;
  const end = start + length * 2;
  assert(clean.length >= end, `${label} exceeds ABI data bounds`);
  return `0x${clean.slice(start, end)}`;
}

function stringAt(data, byteOffset, label = `string at ${byteOffset}`) {
  return Buffer.from(cleanHex(bytesAt(data, byteOffset, label)), "hex").toString("utf8");
}

function addressArrayAt(data, byteOffset, label = `address array at ${byteOffset}`) {
  const length = toSafeNumber(uintAt(data, byteOffset, `${label} length`), `${label} length`);
  const addresses = [];

  for (let index = 0; index < length; index++) {
    const word = wordHexAt(data, byteOffset + 32 + index * 32);
    addresses.push(`0x${word.slice(24)}`.toLowerCase());
  }

  return addresses;
}

function stringArrayAt(data, byteOffset, label = `string array at ${byteOffset}`) {
  const length = toSafeNumber(uintAt(data, byteOffset, `${label} length`), `${label} length`);
  const itemDataStart = byteOffset + 32;
  const values = [];

  for (let index = 0; index < length; index++) {
    const relativeOffset = toSafeNumber(
      uintAt(data, byteOffset + 32 + index * 32, `${label} item ${index} offset`),
      `${label} item ${index} offset`,
    );
    values.push(stringAt(data, itemDataStart + relativeOffset, `${label} item ${index}`));
  }

  return values;
}

function arrayEquals(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function expectedPrompt(proof) {
  return [
    `Delegated voting criteria: ${proof.criteriaText}`,
    "",
    `Proposal: ${proof.proposalText}`,
    "",
    "Choose exactly one allowed value. Return the whole allowed value string.",
  ].join("\n");
}

function decodeRequestCreatedData(data) {
  const payloadOffset = toSafeNumber(uintAt(data, 32, "payload offset"), "payload offset");
  const subcommitteeOffset = toSafeNumber(uintAt(data, 64, "subcommittee offset"), "subcommittee offset");

  return {
    perAgentBudget: uintAt(data, 0, "per-agent budget"),
    payload: bytesAt(data, payloadOffset, "request payload"),
    subcommittee: addressArrayAt(data, subcommitteeOffset, "request subcommittee"),
  };
}

function decodeInferStringPayload(payload) {
  const clean = cleanHex(payload);
  assert(
    clean.startsWith(cleanHex(INFER_STRING_SELECTOR)),
    `LLM payload selector mismatch: expected ${INFER_STRING_SELECTOR}`,
  );

  const args = clean.slice(8);
  const promptOffset = toSafeNumber(uintAt(args, 0, "prompt offset"), "prompt offset");
  const systemOffset = toSafeNumber(uintAt(args, 32, "system offset"), "system offset");
  const allowedValuesOffset = toSafeNumber(uintAt(args, 96, "allowed values offset"), "allowed values offset");

  return {
    selector: `0x${clean.slice(0, 8)}`,
    prompt: stringAt(args, promptOffset, "prompt"),
    system: stringAt(args, systemOffset, "system"),
    chainOfThought: uintAt(args, 64, "chainOfThought") !== 0n,
    allowedValues: stringArrayAt(args, allowedValuesOffset, "allowed values"),
  };
}

function verifyRequestPayload(proof, log) {
  const decoded = decodeRequestCreatedData(log.data);
  assert(decoded.perAgentBudget > 0n, `${proof.label}: empty per-agent budget`);
  assert(decoded.subcommittee.length === 3, `${proof.label}: expected three LLM validators`);

  const payload = decodeInferStringPayload(decoded.payload);
  assert(payload.prompt === expectedPrompt(proof), `${proof.label}: unexpected LLM prompt`);
  assert(payload.system === EXPECTED_SYSTEM, `${proof.label}: unexpected LLM system prompt`);
  assert(payload.chainOfThought === false, `${proof.label}: chain-of-thought flag should be false`);
  assert(
    arrayEquals(payload.allowedValues, EXPECTED_ALLOWED_VALUES),
    `${proof.label}: unexpected allowed LLM outputs ${payload.allowedValues.join(", ")}`,
  );
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
  const requestCreatedLog = matchingLog(request, {
    address: SOMNIA_AGENTS,
    topic0: topics.requestCreated,
    topics: [
      [1, topicOf(proof.requestId)],
      [2, topicOf(LLM_AGENT_ID)],
    ],
  });
  assert(requestCreatedLog, `${proof.label}: missing SomniaAgents RequestCreated log`);
  verifyRequestPayload(proof, requestCreatedLog);

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
    `${proof.label}: tx trail valid (proposal ${proof.proposalId}, request ${proof.requestId}, support ${proof.support}, LLM payload verified)`,
  );
}

console.log("STEWARD_TX_TRAIL_VALID");
