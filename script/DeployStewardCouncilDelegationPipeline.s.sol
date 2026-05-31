// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {StewardCouncilDelegationPipeline} from "../src/StewardCouncilDelegationPipeline.sol";

contract DeployStewardCouncilDelegationPipeline is Script {
    function run() external returns (StewardCouncilDelegationPipeline delegatedCouncil) {
        address councilPipeline = vm.envAddress("STEWARD_COUNCIL_PIPELINE");

        vm.startBroadcast();
        delegatedCouncil = new StewardCouncilDelegationPipeline(councilPipeline);
        vm.stopBroadcast();
    }
}
