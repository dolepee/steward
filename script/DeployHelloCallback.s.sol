// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {HelloSomniaCallback} from "../src/HelloSomniaCallback.sol";

contract DeployHelloCallback is Script {
    function run() external returns (HelloSomniaCallback callback) {
        address somniaAgents = vm.envAddress("SOMNIA_AGENTS");
        uint256 llmAgentId = vm.envUint("LLM_AGENT_ID");

        vm.startBroadcast();
        callback = new HelloSomniaCallback(somniaAgents, llmAgentId);
        vm.stopBroadcast();
    }
}
