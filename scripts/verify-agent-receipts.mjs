#!/usr/bin/env node

const RECEIPT_BASE = "https://receipts.testnet.agents.somnia.host/agent-receipts";
const SOMNIA_AGENTS = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776".toLowerCase();
const STEWARD = "0x6932C7827E7BFd9f0015Ed93fA120379E0d20541".toLowerCase();
const LLM_AGENT_ID = "12847293847561029384";

const cases = [
  { label: "YES", requestId: "1698384", expected: "YES" },
  { label: "NO", requestId: "1738101", expected: "NO" },
  { label: "ABSTAIN", requestId: "1738108", expected: "ABSTAIN" },
];

function receiptUrl(requestId) {
  const params = new URLSearchParams({
    requestId,
    contractAddress: SOMNIA_AGENTS,
    type: "minimal",
  });
  return `${RECEIPT_BASE}?${params.toString()}`;
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
      assert(response.ok, `${label}: receipt service returned ${response.status}`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(1_500 * attempt);
    }
  }

  throw lastError;
}

function receiptContent(receipt) {
  return receipt?.agentReceipt?.steps?.find((step) => step.name === "llm_response")?.content;
}

for (const proof of cases) {
  const body = await fetchJsonWithRetry(receiptUrl(proof.requestId), proof.label);
  assert(body.requestId === proof.requestId, `${proof.label}: request id mismatch`);
  assert(body.contractAddress?.toLowerCase() === SOMNIA_AGENTS, `${proof.label}: contract mismatch`);
  assert(body.requestDetails?.callbackAddress?.toLowerCase() === STEWARD, `${proof.label}: callback address mismatch`);
  assert(body.requestDetails?.requester?.toLowerCase() === STEWARD, `${proof.label}: requester mismatch`);
  assert(body.requestDetails?.subcommitteeSize === 3, `${proof.label}: unexpected subcommittee size`);
  assert(body.requestDetails?.threshold === 2, `${proof.label}: unexpected threshold`);

  const receipts = body.receipts ?? [];
  assert(receipts.length >= 2, `${proof.label}: expected at least two validator receipts`);

  const successful = receipts.filter((receipt) => receipt.status === "success");
  assert(successful.length >= 2, `${proof.label}: expected at least two successful receipts`);

  for (const receipt of successful) {
    assert(receipt.agentId === LLM_AGENT_ID, `${proof.label}: agent id mismatch`);
    assert(receiptContent(receipt) === proof.expected, `${proof.label}: unexpected LLM response`);
    assert(receipt.agentReceipt?.llmUsage?.requests === 1, `${proof.label}: missing LLM usage`);
  }

  console.log(
    `${proof.label}: request ${proof.requestId}, ${successful.length} successful receipts, response ${proof.expected}`,
  );
}

console.log("STEWARD_AGENT_RECEIPTS_VALID");
