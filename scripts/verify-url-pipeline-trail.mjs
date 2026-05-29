#!/usr/bin/env node

const RPC_URL = process.env.SOMNIA_TESTNET_RPC ?? "https://dream-rpc.somnia.network";

const SOMNIA_AGENTS = (process.env.SOMNIA_AGENTS ?? "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776").toLowerCase();
const STEWARD_URL_PIPELINE = process.env.STEWARD_URL_PIPELINE?.toLowerCase();
const MINI_GOVERNOR = process.env.MINI_GOVERNOR?.toLowerCase();
const PARSE_WEBSITE_AGENT_ID = BigInt(process.env.PARSE_WEBSITE_AGENT_ID ?? "12875401142070969085");
const LLM_AGENT_ID = BigInt(process.env.LLM_AGENT_ID ?? "12847293847561029384");

const EXTRACT_STRING_SELECTOR = "0xc2dd1a7a";
const INFER_STRING_SELECTOR = "0xfe7ca098";
const EXPECTED_SYSTEM = "You are Steward, an autonomous DAO voting delegate. Choose exactly one allowed value.";
const EXPECTED_ALLOWED_VALUES = ["YES", "NO", "ABSTAIN"];
const EXPECTED_PARSE_KEY = "proposal_summary";
const EXPECTED_PARSE_DESCRIPTION =
  "A concise factual summary of the DAO proposal, including requested action and numeric amounts.";
const EXPECTED_PARSE_PROMPT =
  "Read the linked DAO proposal page. Extract the actual proposal title, requested action, funding amount or token amount if any, and any decision-relevant facts. Return a concise factual summary only.";

const topics = {
  proposalCreated: "0x553be4d74bc63ce955614b229c8eaa4ad7f7f1f38840da15f3604b2fca49c6a8",
  requestCreated: "0xb62339927ed9948fd837358a55f5b9a824f7b047043faece66965593ed726889",
  requestFinalized: "0x65db1ef5b3bcd84fe4fb8dbbe1cadc9fe6643bb261ab2e01d65c281c3d466af2",
  governorVoteCast: "0xb22128b716f82627c9618521dd7de1615285e71c832093d2666d965f91ae9dd9",
  urlPipelineStarted: "0xd11b0e3240e2f36523c5c8676f20396141bc151c99de8b488535cc0270853b2c",
  proposalUrlParsed: "0xa8923f0565fe94d1f312d6753eacc6a31c5fa32564188f1b3de09ff19d9a9c35",
  urlVoteDecisionRequested: "0x627de97236fc74bf4fc5ba37f5745dc2b6d08c19c0ddf2673f656c0da7f24afd",
  urlPipelineVoteCast: "0x26c4702b4c00d52b68488639b71a7094649230aef7a824e12c2bbfbaf4255b79",
};

const supportDefaults = {
  YES: 1n,
  NO: 2n,
  ABSTAIN: 3n,
};

function envName(prefix, key) {
  return prefix ? `URL_PIPELINE_${prefix}_${key}` : `URL_PIPELINE_${key}`;
}

function envString(prefix, key, fallback) {
  return process.env[envName(prefix, key)] ?? fallback;
}

function envBigInt(prefix, key, fallback) {
  const value = envString(prefix, key, fallback);
  return value === undefined || value === "" ? undefined : BigInt(value);
}

function readProofCase(prefix) {
  const normalized = prefix.toUpperCase();
  return {
    label: normalized || "URL",
    jobId: envBigInt(normalized, "JOB_ID"),
    proposalId: envBigInt(normalized, "PROPOSAL_ID"),
    expectedSupport: envBigInt(normalized, "EXPECTED_SUPPORT", supportDefaults[normalized]?.toString()),
    expectedReason: envString(normalized, "EXPECTED_REASON", normalized || undefined),
    criteria: envString(normalized, "CRITERIA", process.env.URL_PIPELINE_CRITERIA ?? process.env.CRITERIA_TEXT),
    proposalUrl: envString(normalized, "PROPOSAL_URL", process.env.URL_PIPELINE_PROPOSAL_URL),
    expectedSummary: envString(normalized, "SUMMARY", process.env.URL_PIPELINE_SUMMARY),
    proposalTx: envString(normalized, "PROPOSAL_TX"),
    startTx: envString(normalized, "START_TX"),
    parseCallbackTx: envString(normalized, "PARSE_CALLBACK_TX"),
    voteCallbackTx: envString(normalized, "VOTE_CALLBACK_TX"),
  };
}

function configuredProofCases() {
  const labels = (process.env.URL_PIPELINE_CASES ?? "")
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);

  if (labels.length > 0) return labels.map(readProofCase);
  return [readProofCase("")];
}

const proofCases = configuredProofCases();

const missing = [];
if (!STEWARD_URL_PIPELINE) missing.push("STEWARD_URL_PIPELINE");
if (!MINI_GOVERNOR) missing.push("MINI_GOVERNOR");

for (const proof of proofCases) {
  const prefix = proof.label === "URL" ? "" : `${proof.label}_`;
  const required = {
    JOB_ID: proof.jobId,
    PROPOSAL_ID: proof.proposalId,
    EXPECTED_SUPPORT: proof.expectedSupport,
    EXPECTED_REASON: proof.expectedReason,
    CRITERIA: proof.criteria,
    PROPOSAL_URL: proof.proposalUrl,
    SUMMARY: proof.expectedSummary,
    START_TX: proof.startTx,
    PARSE_CALLBACK_TX: proof.parseCallbackTx,
    VOTE_CALLBACK_TX: proof.voteCallbackTx,
  };

  for (const [key, value] of Object.entries(required)) {
    if (value === undefined || value === "") missing.push(envName(prefix.replace(/_$/, ""), key));
  }
}

if (missing.length > 0) {
  console.error(`ERROR: missing URL pipeline proof env: ${missing.join(", ")}`);
  console.error("Set these after deploying StewardUrlPipeline and generating one live URL proposal vote.");
  console.error("For batch verification, set URL_PIPELINE_CASES=YES,NO,ABSTAIN and prefixed case env values.");
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanHex(value) {
  return value.replace(/^0x/, "");
}

function topicOf(value) {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function topicAddress(address) {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
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

function decodeRequestCreatedData(data) {
  const payloadOffset = toSafeNumber(uintAt(data, 32, "payload offset"), "payload offset");
  const subcommitteeOffset = toSafeNumber(uintAt(data, 64, "subcommittee offset"), "subcommittee offset");

  return {
    perAgentBudget: uintAt(data, 0, "per-agent budget"),
    payload: bytesAt(data, payloadOffset, "request payload"),
    subcommittee: addressArrayAt(data, subcommitteeOffset, "request subcommittee"),
  };
}

function decodeExtractStringPayload(payload) {
  const clean = cleanHex(payload);
  assert(
    clean.startsWith(cleanHex(EXTRACT_STRING_SELECTOR)),
    `Parse Website selector mismatch: expected ${EXTRACT_STRING_SELECTOR}`,
  );

  const args = clean.slice(8);
  const keyOffset = toSafeNumber(uintAt(args, 0, "key offset"), "key offset");
  const descriptionOffset = toSafeNumber(uintAt(args, 32, "description offset"), "description offset");
  const optionsOffset = toSafeNumber(uintAt(args, 64, "options offset"), "options offset");
  const promptOffset = toSafeNumber(uintAt(args, 96, "prompt offset"), "prompt offset");
  const urlOffset = toSafeNumber(uintAt(args, 128, "url offset"), "url offset");

  return {
    selector: `0x${clean.slice(0, 8)}`,
    key: stringAt(args, keyOffset, "key"),
    description: stringAt(args, descriptionOffset, "description"),
    options: stringArrayAt(args, optionsOffset, "options"),
    prompt: stringAt(args, promptOffset, "prompt"),
    url: stringAt(args, urlOffset, "url"),
    resolveUrl: uintAt(args, 160, "resolveUrl") !== 0n,
    numPages: uintAt(args, 192, "numPages"),
    confidenceThreshold: uintAt(args, 224, "confidenceThreshold"),
  };
}

function decodeInferStringPayload(payload) {
  const clean = cleanHex(payload);
  assert(clean.startsWith(cleanHex(INFER_STRING_SELECTOR)), `LLM selector mismatch: expected ${INFER_STRING_SELECTOR}`);

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

function expectedVotePrompt(proof) {
  return [
    `Delegated voting criteria: ${proof.criteria}`,
    "",
    `Proposal URL: ${proof.proposalUrl}`,
    "",
    `Extracted proposal facts: ${proof.expectedSummary}`,
    "",
    "Choose exactly one allowed value. Return the whole allowed value string.",
  ].join("\n");
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

async function verifyProof(proof) {
  if (proof.proposalTx) {
    const proposalReceipt = await receiptWithRetry(proof.proposalTx, `${proof.label} URL proposal`);
    assert(
      matchingLog(proposalReceipt, {
        address: MINI_GOVERNOR,
        topic0: topics.proposalCreated,
        topics: [[1, topicOf(proof.proposalId)]],
      }),
      `${proof.label}: missing MiniGovernor ProposalCreated log`,
    );
  }

  const startReceipt = await receiptWithRetry(proof.startTx, `${proof.label} URL pipeline start`);
  const startLog = matchingLog(startReceipt, {
    address: STEWARD_URL_PIPELINE,
    topic0: topics.urlPipelineStarted,
    topics: [
      [1, topicOf(proof.jobId)],
      [3, topicAddress(MINI_GOVERNOR)],
    ],
    dataWords: [[0, proof.proposalId]],
  });
  assert(startLog, `${proof.label}: missing UrlPipelineStarted log`);
  const parseRequestId = BigInt(startLog.topics[2]);

  const parseRequestCreated = matchingLog(startReceipt, {
    address: SOMNIA_AGENTS,
    topic0: topics.requestCreated,
    topics: [
      [1, topicOf(parseRequestId)],
      [2, topicOf(PARSE_WEBSITE_AGENT_ID)],
    ],
  });
  assert(parseRequestCreated, `${proof.label}: missing Parse Website RequestCreated log`);

  const parseRequest = decodeRequestCreatedData(parseRequestCreated.data);
  assert(parseRequest.perAgentBudget > 0n, `${proof.label}: empty parse per-agent budget`);
  assert(parseRequest.subcommittee.length === 3, `${proof.label}: expected three parse validators`);

  const parsePayload = decodeExtractStringPayload(parseRequest.payload);
  assert(parsePayload.key === EXPECTED_PARSE_KEY, `${proof.label}: unexpected parse key`);
  assert(parsePayload.description === EXPECTED_PARSE_DESCRIPTION, `${proof.label}: unexpected parse description`);
  assert(parsePayload.options.length === 0, `${proof.label}: parse options should be empty`);
  assert(parsePayload.prompt === EXPECTED_PARSE_PROMPT, `${proof.label}: unexpected parse prompt`);
  assert(parsePayload.url === proof.proposalUrl, `${proof.label}: unexpected proposal URL`);
  assert(parsePayload.numPages === 3n, `${proof.label}: unexpected parse numPages`);
  assert(parsePayload.confidenceThreshold === 70n, `${proof.label}: unexpected parse confidence threshold`);

  const parseCallbackReceipt = await receiptWithRetry(proof.parseCallbackTx, `${proof.label} URL parse callback`);
  assert(
    matchingLog(parseCallbackReceipt, {
      address: SOMNIA_AGENTS,
      topic0: topics.requestFinalized,
      topics: [[1, topicOf(parseRequestId)]],
      dataWords: [[0, 2n]],
    }),
    `${proof.label}: missing parse RequestFinalized success log`,
  );
  assert(
    matchingLog(parseCallbackReceipt, {
      address: STEWARD_URL_PIPELINE,
      topic0: topics.proposalUrlParsed,
      topics: [
        [1, topicOf(proof.jobId)],
        [2, topicOf(parseRequestId)],
      ],
    }),
    `${proof.label}: missing ProposalUrlParsed log`,
  );

  const voteRequestLog = matchingLog(parseCallbackReceipt, {
    address: STEWARD_URL_PIPELINE,
    topic0: topics.urlVoteDecisionRequested,
    topics: [[1, topicOf(proof.jobId)]],
  });
  assert(voteRequestLog, `${proof.label}: missing UrlVoteDecisionRequested log`);
  const voteRequestId = BigInt(voteRequestLog.topics[2]);

  const voteRequestCreated = matchingLog(parseCallbackReceipt, {
    address: SOMNIA_AGENTS,
    topic0: topics.requestCreated,
    topics: [
      [1, topicOf(voteRequestId)],
      [2, topicOf(LLM_AGENT_ID)],
    ],
  });
  assert(voteRequestCreated, `${proof.label}: missing LLM vote RequestCreated log`);

  const voteRequest = decodeRequestCreatedData(voteRequestCreated.data);
  assert(voteRequest.perAgentBudget > 0n, `${proof.label}: empty vote per-agent budget`);
  assert(voteRequest.subcommittee.length === 3, `${proof.label}: expected three vote validators`);

  const votePayload = decodeInferStringPayload(voteRequest.payload);
  assert(votePayload.prompt === expectedVotePrompt(proof), `${proof.label}: unexpected vote prompt`);
  assert(votePayload.system === EXPECTED_SYSTEM, `${proof.label}: unexpected vote system prompt`);
  assert(votePayload.chainOfThought === false, `${proof.label}: vote chain-of-thought flag should be false`);
  assert(
    arrayEquals(votePayload.allowedValues, EXPECTED_ALLOWED_VALUES),
    `${proof.label}: unexpected vote allowed values ${votePayload.allowedValues.join(", ")}`,
  );

  const voteCallbackReceipt = await receiptWithRetry(proof.voteCallbackTx, `${proof.label} URL vote callback`);
  assert(
    matchingLog(voteCallbackReceipt, {
      address: MINI_GOVERNOR,
      topic0: topics.governorVoteCast,
      topics: [
        [1, topicOf(proof.proposalId)],
        [2, topicAddress(STEWARD_URL_PIPELINE)],
      ],
      dataWords: [[0, proof.expectedSupport]],
    }),
    `${proof.label}: missing MiniGovernor URL pipeline vote`,
  );
  assert(
    matchingLog(voteCallbackReceipt, {
      address: STEWARD_URL_PIPELINE,
      topic0: topics.urlPipelineVoteCast,
      topics: [
        [1, topicOf(proof.jobId)],
        [2, topicOf(voteRequestId)],
        [3, topicOf(proof.proposalId)],
      ],
      dataWords: [[0, proof.expectedSupport]],
    }),
    `${proof.label}: missing UrlPipelineVoteCast log`,
  );
  assert(
    matchingLog(voteCallbackReceipt, {
      address: SOMNIA_AGENTS,
      topic0: topics.requestFinalized,
      topics: [[1, topicOf(voteRequestId)]],
      dataWords: [[0, 2n]],
    }),
    `${proof.label}: missing vote RequestFinalized success log`,
  );

  console.log(
    `${proof.label}: URL pipeline valid (job ${proof.jobId}, parse request ${parseRequestId}, vote request ${voteRequestId}, support ${proof.expectedSupport}, reason ${proof.expectedReason})`,
  );
}

for (const proof of proofCases) {
  await verifyProof(proof);
}

if (proofCases.length > 1) {
  console.log(`Verified ${proofCases.length} URL pipeline cases: ${proofCases.map((proof) => proof.label).join(", ")}`);
  console.log("STEWARD_URL_PIPELINE_BATCH_VALID");
} else {
  console.log("STEWARD_URL_PIPELINE_TRAIL_VALID");
}
