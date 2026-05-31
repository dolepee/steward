#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const cases = [
  {
    label: "YES",
    expectedSupport: "1",
    proposalId: "9",
    executionId: "1",
    councilJobId: "6",
    proposalTx: "0xf6e7f52f3753fb8de8dc7eae0201fc76910bc4b484705e06d8dbc2a5a1565285",
    startTx: "0xfd8eb6788a53a71ad7dc19239535446f22f807a65beab455a5ffda376e84087e",
  },
  {
    label: "NO",
    expectedSupport: "2",
    proposalId: "10",
    executionId: "2",
    councilJobId: "7",
    proposalTx: "0x5e8713927c427ab2e9b69bcd98aef308258257f2fa7d18592dc355e728642cbc",
    startTx: "0x8ae266600d7db6047cb92cf8e9b0d273bc9e928895eb0f03754e08f0900180fa",
  },
  {
    label: "ABSTAIN",
    expectedSupport: "3",
    proposalId: "11",
    executionId: "3",
    councilJobId: "8",
    proposalTx: "0x292e9234e73b362ed3267be76d1b0402c41c8b85de6a843457ff27957fe4e44a",
    startTx: "0x6b5c981ef7aea55842f4d64b11ebf61778e8836e2819eebfc901cf5821bf202a",
  },
];

for (const proofCase of cases) {
  console.log(`\n=== Delegated council ${proofCase.label} proof ===`);
  runWithRetry(proofCase);
}

console.log("\nSTEWARD_DELEGATED_COUNCIL_PROOFS_VALID");

function runWithRetry(proofCase) {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      execFileSync("node", ["scripts/verify-delegated-council-proof.mjs"], {
        stdio: "inherit",
        env: {
          ...process.env,
          DELEGATED_COUNCIL_DELEGATION_ID: "1",
          DELEGATED_COUNCIL_PROPOSAL_ID: proofCase.proposalId,
          DELEGATED_COUNCIL_EXECUTION_ID: proofCase.executionId,
          DELEGATED_COUNCIL_COUNCIL_JOB_ID: proofCase.councilJobId,
          DELEGATED_COUNCIL_EXPECTED_SUPPORT: proofCase.expectedSupport,
          DELEGATED_COUNCIL_PROPOSAL_TX: proofCase.proposalTx,
          DELEGATED_COUNCIL_START_TX: proofCase.startTx,
        },
      });
      return;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      console.warn(`Delegated ${proofCase.label} verifier failed on attempt ${attempt}; retrying...`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_500 * attempt);
    }
  }
}
