// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {StewardUrlPipeline} from "../src/StewardUrlPipeline.sol";

contract RequestUrlProposalVote is Script {
    function run() external returns (uint256 jobId, uint256 parseRequestId) {
        StewardUrlPipeline pipeline = StewardUrlPipeline(payable(vm.envAddress("STEWARD_URL_PIPELINE")));
        address governor = vm.envAddress("MINI_GOVERNOR");
        uint256 proposalId = vm.envUint("PROPOSAL_ID");
        string memory criteriaText = vm.envString("CRITERIA_TEXT");
        string memory proposalUrl = vm.envString("PROPOSAL_URL");
        bool resolveUrl = vm.envBool("RESOLVE_URL");
        uint256 requiredDeposit = pipeline.requiredDeposit();

        vm.startBroadcast();
        (jobId, parseRequestId) =
            pipeline.startUrlVote{value: requiredDeposit}(governor, proposalId, criteriaText, proposalUrl, resolveUrl);
        vm.stopBroadcast();

        console2.log("jobId", jobId);
        console2.log("parseRequestId", parseRequestId);
        console2.log("requiredDeposit", requiredDeposit);
    }
}
