#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

loadEnvFile(process.env.ENV_FILE ?? ".env");

const RPC_URL = env("SOMNIA_TESTNET_RPC", "https://dream-rpc.somnia.network");
const PRIVATE_KEY = requiredEnv("PRIVATE_KEY");
const PIPELINE = requiredEnv("STEWARD_COUNCIL_DELEGATION_PIPELINE");
const COUNCIL_PIPELINE = requiredEnv("STEWARD_COUNCIL_PIPELINE");
const MINI_GOVERNOR = requiredEnv("MINI_GOVERNOR");
const DELEGATION_ID = requiredEnv("WATCHER_DELEGATION_ID");
const PROPOSAL_URL = env("WATCHER_PROPOSAL_URL", "https://steward-ashy.vercel.app/proposals/community-grants.html");
const PROPOSAL_TEXT = env("WATCHER_PROPOSAL_TEXT", "Autonomously imported governance proposal from configured URL.");
const RESOLVE_URL = env("WATCHER_RESOLVE_URL", "false");
const VOTING_PERIOD = env("VOTING_PERIOD", "604800");
const STATE_FILE = resolve(env("WATCHER_STATE_FILE", ".steward-watcher-state.json"));
const FORCE = truthy(env("WATCHER_FORCE", "false"));

const actor = cast(["wallet", "address", "--private-key", PRIVATE_KEY], "wallet address").toLowerCase();
const source = await readProposalSource(PROPOSAL_URL);
const fingerprint = sha256(`${PROPOSAL_URL}\n${source}`);
const previous = readState();

console.log("Steward delegated council watcher");
console.log(`RPC: ${RPC_URL}`);
console.log(`Pipeline: ${PIPELINE}`);
console.log(`Council pipeline: ${COUNCIL_PIPELINE}`);
console.log(`Governor: ${MINI_GOVERNOR}`);
console.log(`Executor: ${actor}`);
console.log(`Delegation: ${DELEGATION_ID}`);
console.log(`Proposal URL: ${PROPOSAL_URL}`);
console.log(`Source fingerprint: ${fingerprint}`);

if (!FORCE && previous?.fingerprint === fingerprint) {
  console.log(`No new proposal source detected. Last council job: ${previous.councilJobId ?? "n/a"}`);
  console.log("Set WATCHER_FORCE=true to trigger again intentionally.");
  process.exit(0);
}

const proposalId = callUint(MINI_GOVERNOR, "nextProposalId()(uint256)");
const executionId = callUint(PIPELINE, "nextExecutionId()(uint256)");
const requiredDeposit = callUint(PIPELINE, "requiredDeposit()(uint256)");

console.log(`Next proposalId: ${proposalId}`);
console.log(`Next executionId: ${executionId}`);
console.log(`Required deposit: ${requiredDeposit} wei`);

const proposalTx = send(
  MINI_GOVERNOR,
  "createProposal(string,uint64)",
  [PROPOSAL_TEXT, VOTING_PERIOD],
  "create MiniGovernor proposal",
);
console.log(`Proposal tx: ${proposalTx}`);

const startTx = send(
  PIPELINE,
  "executeDelegatedCouncilVote(uint256,uint256,string,bool)",
  [DELEGATION_ID, proposalId, PROPOSAL_URL, RESOLVE_URL],
  "execute delegated council vote",
  requiredDeposit,
);
console.log(`Delegated council start tx: ${startTx}`);

const overview = call(
  PIPELINE,
  "jobOverview(uint256)(uint256,uint256,uint256,uint256,address,string)",
  [executionId],
);
const councilJobId = overview[1]?.split(/\s+/)[0];
const parseRequestId = overview[3]?.split(/\s+/)[0];

const state = {
  pipeline: PIPELINE,
  councilPipeline: COUNCIL_PIPELINE,
  miniGovernor: MINI_GOVERNOR,
  executor: actor,
  delegationId: DELEGATION_ID,
  proposalId,
  executionId,
  councilJobId,
  parseRequestId,
  proposalUrl: PROPOSAL_URL,
  proposalText: PROPOSAL_TEXT,
  resolveUrl: RESOLVE_URL,
  fingerprint,
  proposalTx,
  startTx,
  createdAt: new Date().toISOString(),
};

writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);

console.log(`Watcher state written: ${STATE_FILE}`);
console.log();
console.log("Verifier env:");
console.log(`STEWARD_COUNCIL_DELEGATION_PIPELINE=${PIPELINE}`);
console.log(`STEWARD_COUNCIL_PIPELINE=${COUNCIL_PIPELINE}`);
console.log(`DELEGATED_COUNCIL_DELEGATION_ID=${DELEGATION_ID}`);
console.log(`DELEGATED_COUNCIL_PROPOSAL_ID=${proposalId}`);
console.log(`DELEGATED_COUNCIL_EXECUTION_ID=${executionId}`);
console.log(`DELEGATED_COUNCIL_COUNCIL_JOB_ID=${councilJobId}`);
console.log(`DELEGATED_COUNCIL_PARSE_REQUEST_ID=${parseRequestId}`);
console.log(`DELEGATED_COUNCIL_PROPOSAL_TX=${proposalTx}`);
console.log(`DELEGATED_COUNCIL_START_TX=${startTx}`);

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

function env(name, fallback) {
  return process.env[name] && process.env[name].length > 0 ? process.env[name] : fallback;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env ${name}`);
  return value;
}

function truthy(value) {
  return ["1", "true", "yes", "y"].includes(String(value).toLowerCase());
}

async function readProposalSource(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Proposal source fetch failed: HTTP ${response.status}`);
  return await response.text();
}

function readState() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function sha256(value) {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
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
  const [line] = call(address, signature, args);
  return line.split(/\s+/)[0];
}

function send(address, signature, args, label, value = "0") {
  const command = [
    "send",
    address,
    signature,
    ...args.map(String),
    "--rpc-url",
    RPC_URL,
    "--private-key",
    PRIVATE_KEY,
    "--value",
    String(value),
    "--legacy",
    "--json",
  ];
  const output = JSON.parse(cast(command, label));
  if (output.status && output.status !== "0x1") {
    throw new Error(`${label} reverted`);
  }
  return output.transactionHash ?? output.transaction_hash ?? output.hash;
}
