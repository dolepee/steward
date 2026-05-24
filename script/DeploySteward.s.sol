// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {MiniGovernor} from "../src/MiniGovernor.sol";
import {Steward} from "../src/Steward.sol";

contract DeploySteward is Script {
    function run() external returns (MiniGovernor governor, Steward steward) {
        address somniaAgents = vm.envAddress("SOMNIA_AGENTS");
        uint256 llmAgentId = vm.envUint("LLM_AGENT_ID");

        vm.startBroadcast();
        governor = new MiniGovernor();
        steward = new Steward(somniaAgents, llmAgentId);
        vm.stopBroadcast();
    }
}
