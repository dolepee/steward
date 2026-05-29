// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MiniGovernor} from "../src/MiniGovernor.sol";
import {StewardCouncilPipeline} from "../src/StewardCouncilPipeline.sol";

contract SeedSingleCouncilProof is Script {
    function run() external {
        MiniGovernor governor = MiniGovernor(vm.envAddress("MINI_GOVERNOR"));
        StewardCouncilPipeline council = StewardCouncilPipeline(payable(vm.envAddress("STEWARD_COUNCIL_PIPELINE")));
        uint64 votingPeriod = uint64(vm.envOr("VOTING_PERIOD", uint256(7 days)));
        string memory criteriaText = vm.envOr(
            "CRITERIA_TEXT",
            string("Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.")
        );
        string memory label = vm.envOr("COUNCIL_SINGLE_LABEL", string("SECURITY"));
        string memory proposalText = vm.envOr(
            "COUNCIL_SINGLE_PROPOSAL_TEXT",
            string("Approve a 750,000 USDC community security grants and audit bounty program.")
        );
        string memory proposalUrl =
            vm.envOr("COUNCIL_SINGLE_URL", string("https://steward-ashy.vercel.app/proposals/security-grants.html"));
        bool resolveUrl = vm.envOr("COUNCIL_SINGLE_RESOLVE_URL", false);
        uint256 buffer = vm.envOr("COUNCIL_DEPOSIT_BUFFER", uint256(0));
        (
            uint256 platformDeposit,
            uint256 parseAgentBudget,
            uint256 parseDeposit,
            uint256 reviewDeposit,
            uint256 requiredDeposit
        ) = council.quoteCouncilVote();

        console2.log("label", label);
        console2.log("platformDeposit", platformDeposit);
        console2.log("parseAgentBudget", parseAgentBudget);
        console2.log("parseDeposit", parseDeposit);
        console2.log("reviewDeposit", reviewDeposit);
        console2.log("requiredDeposit", requiredDeposit);
        console2.log("depositBuffer", buffer);

        vm.startBroadcast();
        uint256 proposalId = governor.createProposal(proposalText, votingPeriod);
        (uint256 jobId, uint256 parseRequestId) = council.startCouncilVote{value: requiredDeposit + buffer}(
            address(governor), proposalId, criteriaText, proposalUrl, resolveUrl
        );
        vm.stopBroadcast();

        console2.log("proposalId", proposalId);
        console2.log("jobId", jobId);
        console2.log("parseRequestId", parseRequestId);
        console2.log("proposalUrl", proposalUrl);
    }
}
