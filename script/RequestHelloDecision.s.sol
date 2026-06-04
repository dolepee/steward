// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {HelloSomniaCallback} from "../src/HelloSomniaCallback.sol";

contract RequestHelloDecision is Script {
    function run() external returns (uint256 requestId) {
        HelloSomniaCallback callback = HelloSomniaCallback(payable(vm.envAddress("HELLO_CALLBACK")));
        uint256 requestValue = vm.envOr("REQUEST_VALUE", uint256(0.24 ether));

        string[] memory allowedValues = new string[](3);
        allowedValues[0] = "YES";
        allowedValues[1] = "NO";
        allowedValues[2] = "ABSTAIN";

        string memory prompt =
            "Proposal: allocate 500K USDC to community grants. Criteria: vote YES for grants under 1M, NO for token unlocks, ABSTAIN if unclear. Return exactly one allowed value.";
        string memory system = "You are Steward, a constrained DAO voting agent. Return only YES, NO, or ABSTAIN.";

        vm.startBroadcast();
        requestId = callback.requestDecision{value: requestValue}(prompt, system, allowedValues);
        vm.stopBroadcast();
    }
}
