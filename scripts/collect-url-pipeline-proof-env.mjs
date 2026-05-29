#!/usr/bin/env node

const RPC_URL = process.env.SOMNIA_TESTNET_RPC ?? "https://dream-rpc.somnia.network";
const STEWARD_URL_PIPELINE = process.env.STEWARD_URL_PIPELINE?.toLowerCase();
const DEFAULT_SCAN_BLOCKS = BigInt(process.env.URL_PIPELINE_SCAN_BLOCKS ?? "300000");
const CHUNK_SIZE = BigInt(process.env.URL_PIPELINE_LOG_CHUNK ?? "50000");

const topics = {
  proposalCreated: "0x553be4d74bc63ce955614b229c8eaa4ad7f7f1f38840da15f3604b2fca49c6a8",
  urlPipelineStarted: "0xd11b0e3240e2f36523c5c8676f20396141bc151c99de8b488535cc0270853b2c",
  proposalUrlParsed: "0xa8923f0565fe94d1f312d6753eacc6a31c5fa32564188f1b3de09ff19d9a9c35",
  urlVoteDecisionRequested: "0x627de97236fc74bf4fc5ba37f5745dc2b6d08c19c0ddf2673f656c0da7f24afd",
  urlPipelineVoteCast: "0x26c4702b4c00d52b68488639b71a7094649230aef7a824e12c2bbfbaf4255b79",
};

const supportLabels = {
  1: "YES",
  2: "NO",
  3: "ABSTAIN",
};

const knownProofCases = [
  {
    label: "YES",
    expectedSupport: 1n,
    expectedReason: "YES",
    urls: [
      process.env.URL_PIPELINE_YES_PROPOSAL_URL,
      process.env.URL_PIPELINE_YES_URL,
      "https://steward-ashy.vercel.app/proposals/community-grants.html",
    ],
  },
  {
    label: "NO",
    expectedSupport: 2n,
    expectedReason: "NO",
    urls: [
      process.env.URL_PIPELINE_NO_PROPOSAL_URL,
      process.env.URL_PIPELINE_NO_URL,
      "https://steward-ashy.vercel.app/proposals/team-token-unlock.html",
    ],
  },
  {
    label: "ABSTAIN",
    expectedSupport: 3n,
    expectedReason: "ABSTAIN",
    urls: [
      process.env.URL_PIPELINE_ABSTAIN_PROPOSAL_URL,
      process.env.URL_PIPELINE_ABSTAIN_URL,
      "https://steward-ashy.vercel.app/proposals/ecosystem-working-group.html",
    ],
  },
].map((proofCase) => ({
  ...proofCase,
  urls: proofCase.urls.filter(Boolean),
}));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cleanHex(value) {
  return value.replace(/^0x/, "");
}

function hex(value) {
  return `0x${value.toString(16)}`;
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
  const word = wordHexAt(data, byteOffset);
  const value = BigInt(`0x${word}`);
  assert(value <= BigInt(Number.MAX_SAFE_INTEGER) || !label.includes("offset"), `${label} too large`);
  return value;
}

function stringAt(data, byteOffset, label = `string at ${byteOffset}`) {
  const clean = cleanHex(data);
  const length = Number(uintAt(data, byteOffset, `${label} length`));
  const start = (byteOffset + 32) * 2;
  const end = start + length * 2;
  assert(clean.length >= end, `${label} exceeds ABI data bounds`);
  return Buffer.from(clean.slice(start, end), "hex").toString("utf8");
}

function topicNumber(value) {
  return BigInt(value);
}

function topicAddress(topic) {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\"'\"'")}'`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rpc(method, params, attempts = 4) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
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
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(1_500 * attempt);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`RPC ${method} failed after ${attempts} attempts: ${message}`);
}

async function latestBlockNumber() {
  return BigInt(await rpc("eth_blockNumber", []));
}

async function getLogs({ address, topic0, fromBlock, toBlock }) {
  return rpc("eth_getLogs", [
    {
      address,
      fromBlock: hex(fromBlock),
      toBlock: hex(toBlock),
      topics: [topic0],
    },
  ]);
}

async function collectAddressTopicLogs(address, topic0, fromBlock, toBlock) {
  const logs = [];
  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE + 1n) {
    const end = start + CHUNK_SIZE > toBlock ? toBlock : start + CHUNK_SIZE;
    logs.push(...(await getLogs({ address, topic0, fromBlock: start, toBlock: end })));
  }
  return logs;
}

async function collectTopicLogs(topic0, fromBlock, toBlock) {
  return collectAddressTopicLogs(STEWARD_URL_PIPELINE, topic0, fromBlock, toBlock);
}

function decodeStarted(log) {
  const proposalId = uintAt(log.data, 0, "proposal id");
  const urlOffset = Number(uintAt(log.data, 32, "proposal URL offset"));
  return {
    jobId: topicNumber(log.topics[1]),
    parseRequestId: topicNumber(log.topics[2]),
    governor: topicAddress(log.topics[3]),
    proposalId,
    proposalUrl: stringAt(log.data, urlOffset, "proposal URL"),
    startTx: log.transactionHash,
    blockNumber: BigInt(log.blockNumber),
  };
}

function decodeProposalCreated(log) {
  return {
    proposalId: topicNumber(log.topics[1]),
    proposer: topicAddress(log.topics[2]),
    txHash: log.transactionHash,
  };
}

function decodeParsed(log) {
  const summaryOffset = Number(uintAt(log.data, 32, "summary offset"));
  const receipt = uintAt(log.data, 64, "parse receipt");
  return {
    jobId: topicNumber(log.topics[1]),
    parseRequestId: topicNumber(log.topics[2]),
    summaryHash: `0x${wordHexAt(log.data, 0)}`,
    summary: stringAt(log.data, summaryOffset, "extracted summary"),
    receipt,
    parseCallbackTx: log.transactionHash,
  };
}

function decodeVoteRequested(log) {
  return {
    jobId: topicNumber(log.topics[1]),
    voteRequestId: topicNumber(log.topics[2]),
    criteriaHash: `0x${wordHexAt(log.data, 0)}`,
    summaryHash: `0x${wordHexAt(log.data, 32)}`,
    parseCallbackTx: log.transactionHash,
  };
}

function decodeVoteCast(log) {
  const support = uintAt(log.data, 0, "support");
  const reasonOffset = Number(uintAt(log.data, 32, "reason offset"));
  const receipt = uintAt(log.data, 64, "vote receipt");
  return {
    jobId: topicNumber(log.topics[1]),
    voteRequestId: topicNumber(log.topics[2]),
    proposalId: topicNumber(log.topics[3]),
    support,
    reason: stringAt(log.data, reasonOffset, "vote reason"),
    receipt,
    voteCallbackTx: log.transactionHash,
  };
}

function mergeJob(jobs, jobId, patch) {
  const key = jobId.toString();
  jobs.set(key, { ...(jobs.get(key) ?? {}), ...patch });
}

function completeJobs(jobs) {
  return [...jobs.values()]
    .filter(
      (job) =>
        job.jobId &&
        job.proposalId &&
        job.parseRequestId &&
        job.voteRequestId &&
        job.proposalUrl &&
        job.summary &&
        job.startTx &&
        job.parseCallbackTx &&
        job.voteCallbackTx &&
        job.support,
    )
    .sort((a, b) => Number(a.jobId - b.jobId));
}

function proofCaseFor(job) {
  return knownProofCases.find((proofCase) => proofCase.urls.includes(job.proposalUrl));
}

function uniqueLabel(baseLabel, job, usedLabels) {
  const defaultLabel = baseLabel ?? supportLabels[Number(job.support)] ?? `JOB_${job.jobId.toString()}`;
  if (!usedLabels.has(defaultLabel)) return defaultLabel;
  return `${defaultLabel}_${job.jobId.toString()}`;
}

if (!STEWARD_URL_PIPELINE) {
  console.error("ERROR: missing STEWARD_URL_PIPELINE");
  console.error("Set it after deploying StewardUrlPipeline.");
  process.exit(1);
}

const latestBlock = process.env.URL_PIPELINE_TO_BLOCK ? BigInt(process.env.URL_PIPELINE_TO_BLOCK) : await latestBlockNumber();
const fromBlock = process.env.URL_PIPELINE_FROM_BLOCK
  ? BigInt(process.env.URL_PIPELINE_FROM_BLOCK)
  : latestBlock > DEFAULT_SCAN_BLOCKS
    ? latestBlock - DEFAULT_SCAN_BLOCKS
    : 0n;

const startedLogs = await collectTopicLogs(topics.urlPipelineStarted, fromBlock, latestBlock);
const parsedLogs = await collectTopicLogs(topics.proposalUrlParsed, fromBlock, latestBlock);
const voteRequestedLogs = await collectTopicLogs(topics.urlVoteDecisionRequested, fromBlock, latestBlock);
const voteCastLogs = await collectTopicLogs(topics.urlPipelineVoteCast, fromBlock, latestBlock);

const jobs = new Map();
for (const log of startedLogs) {
  const started = decodeStarted(log);
  mergeJob(jobs, started.jobId, started);
}
for (const log of parsedLogs) {
  const parsed = decodeParsed(log);
  mergeJob(jobs, parsed.jobId, parsed);
}
for (const log of voteRequestedLogs) {
  const voteRequest = decodeVoteRequested(log);
  mergeJob(jobs, voteRequest.jobId, voteRequest);
}
for (const log of voteCastLogs) {
  const voteCast = decodeVoteCast(log);
  mergeJob(jobs, voteCast.jobId, voteCast);
}

const governors = new Set([...jobs.values()].map((job) => job.governor).filter(Boolean));
const proposalTxs = new Map();
for (const governor of governors) {
  const proposalLogs = await collectAddressTopicLogs(governor, topics.proposalCreated, fromBlock, latestBlock);
  for (const log of proposalLogs) {
    const proposal = decodeProposalCreated(log);
    proposalTxs.set(`${governor}:${proposal.proposalId.toString()}`, proposal.txHash);
  }
}

const complete = completeJobs(jobs);
if (complete.length === 0) {
  console.error(
    `ERROR: found no complete URL pipeline jobs for ${STEWARD_URL_PIPELINE} from block ${fromBlock} to ${latestBlock}`,
  );
  console.error("If the jobs are older, set URL_PIPELINE_FROM_BLOCK to the deployment or seeding block.");
  process.exit(1);
}

const usedLabels = new Set();
const labeledJobs = complete.map((job) => {
  const proofCase = proofCaseFor(job);
  const label = uniqueLabel(proofCase?.label, job, usedLabels);
  usedLabels.add(label);
  return {
    ...job,
    label,
    expectedSupport: proofCase?.expectedSupport ?? job.support,
    expectedReason: proofCase?.expectedReason ?? job.reason,
  };
});

const criteriaText = process.env.URL_PIPELINE_CRITERIA ?? process.env.CRITERIA_TEXT;
const caseLabels = labeledJobs.map((job) => job.label).join(",");
const governor = process.env.MINI_GOVERNOR ?? labeledJobs[0].governor;

console.error(
  `Collected ${labeledJobs.length} complete URL pipeline job(s) from ${STEWARD_URL_PIPELINE} between blocks ${fromBlock} and ${latestBlock}.`,
);
console.error("Paste the env block below, then run: node scripts/verify-url-pipeline-trail.mjs");

console.log(`export STEWARD_URL_PIPELINE=${STEWARD_URL_PIPELINE}`);
console.log(`export MINI_GOVERNOR=${governor}`);
console.log(`export URL_PIPELINE_CASES=${caseLabels}`);
if (criteriaText) {
  console.log(`export URL_PIPELINE_CRITERIA=${shellQuote(criteriaText)}`);
} else {
  console.log("# export URL_PIPELINE_CRITERIA='Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.'");
}

for (const job of labeledJobs) {
  const prefix = `URL_PIPELINE_${job.label}`;
  console.log(`export ${prefix}_JOB_ID=${job.jobId}`);
  console.log(`export ${prefix}_PROPOSAL_ID=${job.proposalId}`);
  console.log(`export ${prefix}_EXPECTED_SUPPORT=${job.expectedSupport}`);
  console.log(`export ${prefix}_EXPECTED_REASON=${shellQuote(job.expectedReason)}`);
  console.log(`export ${prefix}_PROPOSAL_URL=${shellQuote(job.proposalUrl)}`);
  console.log(`export ${prefix}_SUMMARY=${shellQuote(job.summary)}`);
  const proposalTx = proposalTxs.get(`${job.governor}:${job.proposalId.toString()}`);
  if (proposalTx) {
    console.log(`export ${prefix}_PROPOSAL_TX=${proposalTx}`);
  } else {
    console.log(`# export ${prefix}_PROPOSAL_TX= # optional: matching ProposalCreated tx not found in scan window`);
  }
  console.log(`export ${prefix}_START_TX=${job.startTx}`);
  console.log(`export ${prefix}_PARSE_CALLBACK_TX=${job.parseCallbackTx}`);
  console.log(`export ${prefix}_VOTE_CALLBACK_TX=${job.voteCallbackTx}`);
}
