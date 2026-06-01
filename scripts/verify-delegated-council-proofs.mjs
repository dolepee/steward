#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const cases = [
  {
    label: "YES",
    expectedSupport: "1",
    proposalId: "9",
    executionId: "1",
    councilJobId: "6",
    proposalUrl: "https://steward-ashy.vercel.app/proposals/community-grants.html",
    proposalTx: "0xf6e7f52f3753fb8de8dc7eae0201fc76910bc4b484705e06d8dbc2a5a1565285",
    startTx: "0xfd8eb6788a53a71ad7dc19239535446f22f807a65beab455a5ffda376e84087e",
    parseCallbackTx: "0x4bd3e9eacc09d57f6fef12daa88d0e1707c2cf287ea3ffd312e1f92e8f9aae85",
    finalVoteTx: "0xb47bf7b3cca5f28aa1cb80b6c7b96c6c6d8ae0def215fe4e719a58381991f166",
  },
  {
    label: "NO",
    expectedSupport: "2",
    proposalId: "10",
    executionId: "2",
    councilJobId: "7",
    proposalUrl: "https://steward-ashy.vercel.app/proposals/team-token-unlock.html",
    proposalTx: "0x5e8713927c427ab2e9b69bcd98aef308258257f2fa7d18592dc355e728642cbc",
    startTx: "0x8ae266600d7db6047cb92cf8e9b0d273bc9e928895eb0f03754e08f0900180fa",
    parseCallbackTx: "0xc076e8cdf1947d1c1af63cf30984dbc81e6b9a923aed6c5d403f63b4144f2c63",
    finalVoteTx: "0xa813db445a7e67097f813f990e83109392ff6693560af72ba78fb80c704245df",
  },
  {
    label: "ABSTAIN",
    expectedSupport: "3",
    proposalId: "11",
    executionId: "3",
    councilJobId: "8",
    proposalUrl: "https://steward-ashy.vercel.app/proposals/ecosystem-working-group.html",
    proposalTx: "0x292e9234e73b362ed3267be76d1b0402c41c8b85de6a843457ff27957fe4e44a",
    startTx: "0x6b5c981ef7aea55842f4d64b11ebf61778e8836e2819eebfc901cf5821bf202a",
    parseCallbackTx: "0x7b0c790854290a7c1b8d006cb21444a5a173f7e9ad17ab2f31fb5a5ce4d69e6e",
    finalVoteTx: "0x30266873508326a2f15b057da398998ecaad3b94a493cde4756f7c548250a4e8",
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
          DELEGATED_COUNCIL_EXPECTED_PROPOSAL_URL: proofCase.proposalUrl,
          DELEGATED_COUNCIL_PROPOSAL_TX: proofCase.proposalTx,
          DELEGATED_COUNCIL_START_TX: proofCase.startTx,
          DELEGATED_COUNCIL_PARSE_CALLBACK_TX: proofCase.parseCallbackTx,
          DELEGATED_COUNCIL_FINAL_VOTE_TX: proofCase.finalVoteTx,
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
