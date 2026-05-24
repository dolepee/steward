// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {MiniGovernor} from "../src/MiniGovernor.sol";
import {Steward} from "../src/Steward.sol";

contract SeedAndRequestVote is Script {
    function run() external returns (uint256 delegationId, uint256 proposalId, uint256 requestId) {
        MiniGovernor governor = MiniGovernor(vm.envAddress("MINI_GOVERNOR"));
        Steward steward = Steward(payable(vm.envAddress("STEWARD")));
        uint256 requestValue = vm.envOr("REQUEST_VALUE", uint256(0.24 ether));
        uint64 votingPeriod = uint64(vm.envOr("VOTING_PERIOD", uint256(7 days)));
        uint64 delegationDuration = uint64(vm.envOr("DELEGATION_DURATION", uint256(30 days)));
        string memory criteriaText = vm.envOr(
            "CRITERIA_TEXT",
            string("Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.")
        );
        string memory proposalText =
            vm.envOr("PROPOSAL_TEXT", string("Allocate 500K USDC to a Q3 community grants program."));

        vm.startBroadcast();
        proposalId = governor.createProposal(proposalText, votingPeriod);
        delegationId = steward.delegate(address(governor), criteriaText, uint64(block.timestamp) + delegationDuration);
        requestId = steward.requestVote{value: requestValue}(delegationId, proposalId);
        vm.stopBroadcast();
    }
}
