// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MiniGovernor} from "../src/MiniGovernor.sol";
import {StewardUrlPipeline} from "../src/StewardUrlPipeline.sol";

contract SeedUrlPipelineProofs is Script {
    struct ProofSeed {
        string label;
        string proposalText;
        string proposalUrl;
        bool resolveUrl;
    }

    function run() external {
        MiniGovernor governor = MiniGovernor(vm.envAddress("MINI_GOVERNOR"));
        StewardUrlPipeline pipeline = StewardUrlPipeline(payable(vm.envAddress("STEWARD_URL_PIPELINE")));
        uint64 votingPeriod = uint64(vm.envOr("VOTING_PERIOD", uint256(7 days)));
        string memory criteriaText = vm.envOr(
            "CRITERIA_TEXT",
            string("Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.")
        );
        uint256 requiredDeposit = pipeline.requiredDeposit();

        ProofSeed[3] memory seeds = [
            ProofSeed({
                label: "YES",
                proposalText: vm.envOr(
                    "URL_PIPELINE_YES_PROPOSAL_TEXT", string("Approve a 500,000 USDC Q3 community grants program.")
                ),
                proposalUrl: vm.envOr(
                    "URL_PIPELINE_YES_URL", string("https://steward-ashy.vercel.app/proposals/community-grants.html")
                ),
                resolveUrl: vm.envOr("URL_PIPELINE_YES_RESOLVE_URL", false)
            }),
            ProofSeed({
                label: "NO",
                proposalText: vm.envOr(
                    "URL_PIPELINE_NO_PROPOSAL_TEXT",
                    string("Unlock 10 percent of foundation team tokens six months early.")
                ),
                proposalUrl: vm.envOr(
                    "URL_PIPELINE_NO_URL", string("https://steward-ashy.vercel.app/proposals/team-token-unlock.html")
                ),
                resolveUrl: vm.envOr("URL_PIPELINE_NO_RESOLVE_URL", false)
            }),
            ProofSeed({
                label: "ABSTAIN",
                proposalText: vm.envOr(
                    "URL_PIPELINE_ABSTAIN_PROPOSAL_TEXT",
                    string("Form a working group to explore future ecosystem partnerships without committing funds.")
                ),
                proposalUrl: vm.envOr(
                    "URL_PIPELINE_ABSTAIN_URL",
                    string("https://steward-ashy.vercel.app/proposals/ecosystem-working-group.html")
                ),
                resolveUrl: vm.envOr("URL_PIPELINE_ABSTAIN_RESOLVE_URL", false)
            })
        ];

        console2.log("requiredDepositEach", requiredDeposit);

        vm.startBroadcast();
        for (uint256 i = 0; i < seeds.length; i++) {
            uint256 proposalId = governor.createProposal(seeds[i].proposalText, votingPeriod);
            (uint256 jobId, uint256 parseRequestId) = pipeline.startUrlVote{value: requiredDeposit}(
                address(governor), proposalId, criteriaText, seeds[i].proposalUrl, seeds[i].resolveUrl
            );

            console2.log("label", seeds[i].label);
            console2.log("proposalId", proposalId);
            console2.log("jobId", jobId);
            console2.log("parseRequestId", parseRequestId);
            console2.log("proposalUrl", seeds[i].proposalUrl);
        }
        vm.stopBroadcast();
    }
}
