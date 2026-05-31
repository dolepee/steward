#!/usr/bin/env node

const EXPLORER_API = "https://somnia.w3us.site/api/v2/addresses";

const contracts = [
  {
    label: "Steward",
    address: "0x6932C7827E7BFd9f0015Ed93fA120379E0d20541",
    expectedName: "Steward",
  },
  {
    label: "MiniGovernor",
    address: "0xa3773Ff7B2008bAb2E553E13e1E0ADE08a15f389",
    expectedName: "MiniGovernor",
  },
  {
    label: "StewardCouncilPipeline",
    address: "0xB890e1274eE308cBC8348a7E032394406215fd52",
    expectedName: "StewardCouncilPipeline",
  },
  {
    label: "StewardCouncilDelegationPipeline",
    address: "0xd01f2e924A0846fdC7cEF677e8887CEE589DCa64",
    expectedName: "StewardCouncilDelegationPipeline",
  },
];

if (process.env.STEWARD_URL_PIPELINE) {
  contracts.push({
    label: "StewardUrlPipeline",
    address: process.env.STEWARD_URL_PIPELINE,
    expectedName: "StewardUrlPipeline",
  });
}

if (process.env.STEWARD_COUNCIL_PIPELINE) {
  contracts.push({
    label: "StewardCouncilPipeline",
    address: process.env.STEWARD_COUNCIL_PIPELINE,
    expectedName: "StewardCouncilPipeline",
  });
}

if (process.env.STEWARD_COUNCIL_DELEGATION_PIPELINE) {
  contracts.push({
    label: "StewardCouncilDelegationPipeline",
    address: process.env.STEWARD_COUNCIL_DELEGATION_PIPELINE,
    expectedName: "StewardCouncilDelegationPipeline",
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, label, attempts = 4) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      assert(response.ok, `${label}: explorer API returned ${response.status}`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(1_500 * attempt);
    }
  }

  throw lastError;
}

for (const contract of contracts) {
  const body = await fetchJsonWithRetry(`${EXPLORER_API}/${contract.address}`, contract.label);
  assert(body.hash?.toLowerCase() === contract.address.toLowerCase(), `${contract.label}: address mismatch`);
  assert(body.is_contract === true, `${contract.label}: explorer does not mark address as a contract`);
  assert(body.is_verified === true, `${contract.label}: source is not verified`);
  assert(body.name === contract.expectedName, `${contract.label}: expected source name ${contract.expectedName}`);

  console.log(`${contract.label}: ${contract.address}, source verified as ${body.name}`);
}

console.log("STEWARD_SOURCE_VERIFICATION_VALID");
