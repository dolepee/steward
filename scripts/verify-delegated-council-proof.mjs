#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

loadEnvFile(process.env.ENV_FILE ?? ".env");

const RPC_URL = env("SOMNIA_TESTNET_RPC", "https://dream-rpc.somnia.network");
const STATE = readState(process.env.WATCHER_STATE_FILE ?? ".steward-watcher-state.json");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const PIPELINE =
  env("STEWARD_COUNCIL_DELEGATION_PIPELINE", STATE?.pipeline) ?? "0xd01f2e924A0846fdC7cEF677e8887CEE589DCa64";
const COUNCIL_PIPELINE =
  env("STEWARD_COUNCIL_PIPELINE", STATE?.councilPipeline) ?? "0xB890e1274eE308cBC8348a7E032394406215fd52";
const MINI_GOVERNOR =
  env("MINI_GOVERNOR", STATE?.miniGovernor) ?? "0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389";
const DELEGATION_ID = env("DELEGATED_COUNCIL_DELEGATION_ID", STATE?.delegationId) ?? "1";
const PROPOSAL_ID = env("DELEGATED_COUNCIL_PROPOSAL_ID", STATE?.proposalId) ?? "9";
const EXECUTION_ID = env("DELEGATED_COUNCIL_EXECUTION_ID", STATE?.executionId) ?? "1";
const COUNCIL_JOB_ID = env("DELEGATED_COUNCIL_COUNCIL_JOB_ID", STATE?.councilJobId) ?? "6";
const EXPECTED_SUPPORT = process.env.DELEGATED_COUNCIL_EXPECTED_SUPPORT;

required("STEWARD_COUNCIL_DELEGATION_PIPELINE", PIPELINE);
required("STEWARD_COUNCIL_PIPELINE", COUNCIL_PIPELINE);
required("MINI_GOVERNOR", MINI_GOVERNOR);
required("DELEGATED_COUNCIL_DELEGATION_ID", DELEGATION_ID);
required("DELEGATED_COUNCIL_PROPOSAL_ID", PROPOSAL_ID);
required("DELEGATED_COUNCIL_EXECUTION_ID", EXECUTION_ID);
required("DELEGATED_COUNCIL_COUNCIL_JOB_ID", COUNCIL_JOB_ID);

const proposalTx =
  env("DELEGATED_COUNCIL_PROPOSAL_TX", STATE?.proposalTx) ??
  "0xf6e7f52f3753fb8de8dc7eae0201fc76910bc4b484705e06d8dbc2a5a1565285";
const startTx =
  env("DELEGATED_COUNCIL_START_TX", STATE?.startTx) ??
  "0xfd8eb6788a53a71ad7dc19239535446f22f807a65beab455a5ffda376e84087e";

console.log("Steward delegated council proof");
console.log(`RPC: ${RPC_URL}`);
console.log(`Delegation pipeline: ${PIPELINE}`);
console.log(`Council pipeline: ${COUNCIL_PIPELINE}`);
console.log(`MiniGovernor: ${MINI_GOVERNOR}`);
console.log(`Delegation: ${DELEGATION_ID}`);
console.log(`Proposal: ${PROPOSAL_ID}`);
console.log(`Execution: ${EXECUTION_ID}`);
console.log(`Council job: ${COUNCIL_JOB_ID}`);
console.log();

if (proposalTx) assertReceiptSuccess(proposalTx, "proposal tx");
if (startTx) assertReceiptSuccess(startTx, "delegated council start tx");

const delegation = call(
  PIPELINE,
  "delegations(uint256)(address,address,bytes32,string,uint64,bool)",
  [DELEGATION_ID],
);
const owner = addressLine(delegation[0]);
const governor = addressLine(delegation[1]);
const criteriaText = stringLine(delegation[3]);
const revoked = boolLine(delegation[5]);

assert(owner !== ZERO_ADDRESS, "delegation owner is zero");
assert(governor.toLowerCase() === MINI_GOVERNOR.toLowerCase(), "delegation governor mismatch");
assert(criteriaText.length > 0, "delegation criteria is empty");
assert(!revoked, "delegation is revoked");

const linkedCouncilJob = callUint(PIPELINE, "councilJobForDelegationProposal(uint256,uint256)(uint256)", [
  DELEGATION_ID,
  PROPOSAL_ID,
]);
assert(
  linkedCouncilJob === BigInt(COUNCIL_JOB_ID),
  `delegation/proposal points to council job ${linkedCouncilJob}, expected ${COUNCIL_JOB_ID}`,
);

const execution = call(
  PIPELINE,
  "jobOverview(uint256)(uint256,uint256,uint256,uint256,address,string)",
  [EXECUTION_ID],
);
assert(callUintLine(execution[0]) === BigInt(DELEGATION_ID), "execution delegation mismatch");
assert(callUintLine(execution[1]) === BigInt(COUNCIL_JOB_ID), "execution council job mismatch");
assert(callUintLine(execution[2]) === BigInt(PROPOSAL_ID), "execution proposal mismatch");
assert(callUintLine(execution[3]) > 0n, "execution parse request missing");

const overview = call(
  COUNCIL_PIPELINE,
  "jobOverview(uint256)(uint8,uint8,uint256,uint8,uint8,uint8,uint8,uint8,string,string,uint256)",
  [COUNCIL_JOB_ID],
);
const state = numberLine(overview[0]);
const parseStatus = numberLine(overview[1]);
const parseRequestId = callUintLine(overview[2]);
const support = numberLine(overview[3]);
const yesCount = numberLine(overview[4]);
const noCount = numberLine(overview[5]);
const abstainCount = numberLine(overview[6]);
const completedReviews = numberLine(overview[7]);
const summary = stringLine(overview[8]);
const finalReason = stringLine(overview[9]);

assert(state === 3, `job state must be Cast(3), got ${state}`);
assert(parseStatus === 2, `parse status must be Success(2), got ${parseStatus}`);
assert(parseRequestId > 0n, "missing parse request id");
assert([1, 2, 3].includes(support), `invalid final support ${support}`);
assert(completedReviews === 3, `completed reviews must be 3, got ${completedReviews}`);
assert(yesCount + noCount + abstainCount === 3, "review count does not sum to 3");
assert(summary.length > 0, "proposal summary is empty");
assert(finalReason.length > 0, "final reason is empty");
if (EXPECTED_SUPPORT) assert(support === Number(EXPECTED_SUPPORT), `support expected ${EXPECTED_SUPPORT}, got ${support}`);

for (let reviewerIndex = 0; reviewerIndex < 3; reviewerIndex++) {
  const reviewer = call(
    COUNCIL_PIPELINE,
    "reviewerDecisions(uint256,uint8)(uint256,uint8,uint8,string,string,uint256,bool)",
    [COUNCIL_JOB_ID, reviewerIndex],
  );
  const requestId = callUintLine(reviewer[0]);
  const reviewerStatus = numberLine(reviewer[1]);
  const reviewerSupport = numberLine(reviewer[2]);
  const role = stringLine(reviewer[3]);
  const reason = stringLine(reviewer[4]);
  const completed = boolLine(reviewer[6]);

  assert(requestId > 0n, `reviewer ${reviewerIndex} missing request id`);
  assert(reviewerStatus === 2, `reviewer ${reviewerIndex} status must be Success(2), got ${reviewerStatus}`);
  assert([1, 2, 3].includes(reviewerSupport), `reviewer ${reviewerIndex} invalid support ${reviewerSupport}`);
  assert(role.length > 0, `reviewer ${reviewerIndex} missing role`);
  assert(reason.length > 0, `reviewer ${reviewerIndex} missing reason`);
  assert(completed, `reviewer ${reviewerIndex} is not completed`);
}

const governorVote =
  numberLine(call(MINI_GOVERNOR, "votes(uint256,address)(uint8)", [PROPOSAL_ID, COUNCIL_PIPELINE])[0]);
assert(governorVote === support, `governor vote ${governorVote} does not match support ${support}`);

console.log(`Delegation owner: ${owner}`);
console.log(`Stored criteria: ${criteriaText}`);
console.log(`Parse request: ${parseRequestId}`);
console.log(`Final support: ${support} (${supportText(support)})`);
console.log(`Reviewer counts: YES=${yesCount}, NO=${noCount}, ABSTAIN=${abstainCount}`);
console.log(`Summary: ${summary}`);
console.log(`Final reason: ${finalReason}`);
console.log();
console.log("STEWARD_DELEGATED_COUNCIL_PROOF_VALID");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function readState(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function env(name, fallback) {
  return process.env[name] && process.env[name].length > 0 ? process.env[name] : fallback;
}

function required(name, value) {
  if (!value) throw new Error(`Missing required env ${name}`);
}

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

function call(address, signature, args = []) {
  return cast(["call", address, signature, ...args.map(String), "--rpc-url", RPC_URL], signature)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function callUint(address, signature, args = []) {
  return callUintLine(call(address, signature, args)[0]);
}

function callUintLine(line) {
  return BigInt(line.split(/\s+/)[0]);
}

function numberLine(line) {
  return Number(callUintLine(line));
}

function boolLine(line) {
  return line.trim() === "true";
}

function addressLine(line) {
  return line.trim().toLowerCase();
}

function stringLine(line) {
  return JSON.parse(line);
}

function assertReceiptSuccess(txHash, label) {
  const receipt = JSON.parse(cast(["receipt", txHash, "--rpc-url", RPC_URL, "--json"], label));
  assert(receipt.status === "0x1", `${label} did not succeed`);
}

function supportText(support) {
  if (support === 1) return "YES";
  if (support === 2) return "NO";
  return "ABSTAIN";
}
