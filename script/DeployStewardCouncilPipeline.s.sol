// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {StewardCouncilPipeline} from "../src/StewardCouncilPipeline.sol";

contract DeployStewardCouncilPipeline is Script {
    function run() external returns (StewardCouncilPipeline council) {
        address somniaAgents = vm.envAddress("SOMNIA_AGENTS");
        uint256 parseWebsiteAgentId = vm.envUint("PARSE_WEBSITE_AGENT_ID");
        uint256 llmAgentId = vm.envUint("LLM_AGENT_ID");

        vm.startBroadcast();
        council = new StewardCouncilPipeline(somniaAgents, parseWebsiteAgentId, llmAgentId);
        vm.stopBroadcast();
    }
}
