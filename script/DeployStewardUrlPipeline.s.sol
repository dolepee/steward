// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {StewardUrlPipeline} from "../src/StewardUrlPipeline.sol";

contract DeployStewardUrlPipeline is Script {
    function run() external returns (StewardUrlPipeline pipeline) {
        address somniaAgents = vm.envAddress("SOMNIA_AGENTS");
        uint256 parseWebsiteAgentId = vm.envUint("PARSE_WEBSITE_AGENT_ID");
        uint256 llmAgentId = vm.envUint("LLM_AGENT_ID");

        vm.startBroadcast();
        pipeline = new StewardUrlPipeline(somniaAgents, parseWebsiteAgentId, llmAgentId);
        vm.stopBroadcast();
    }
}
