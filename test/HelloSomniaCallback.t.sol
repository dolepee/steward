// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {HelloSomniaCallback} from "../src/HelloSomniaCallback.sol";
import {Request, Response, ResponseStatus} from "../src/interfaces/ISomniaAgents.sol";
import {MockSomniaAgents} from "./mocks/MockSomniaAgents.sol";

contract HelloSomniaCallbackTest is Test {
    uint256 internal constant LLM_AGENT_ID = 12847293847561029384;

    MockSomniaAgents internal platform;
    HelloSomniaCallback internal callback;

    function setUp() public {
        platform = new MockSomniaAgents();
        callback = new HelloSomniaCallback(address(platform), LLM_AGENT_ID);
    }

    function testRequestDecisionCreatesSomniaRequest() public {
        string[] memory allowedValues = _allowedVotes();

        uint256 requestId = callback.requestDecision{value: 0.24 ether}(
            "Vote YES if this is a grants proposal.", "Return only YES, NO, or ABSTAIN.", allowedValues
        );

        assertEq(requestId, 1);
        assertEq(platform.lastAgentId(), LLM_AGENT_ID);
        assertEq(platform.lastCallbackAddress(), address(callback));
        assertEq(platform.lastCallbackSelector(), callback.handleResponse.selector);
        assertEq(platform.lastValue(), 0.24 ether);

        (, address requester, HelloSomniaCallback.LocalStatus status,,,) = callback.decisions(requestId);
        assertEq(requester, address(this));
        assertEq(uint8(status), uint8(HelloSomniaCallback.LocalStatus.Pending));
    }

    function testSuccessfulCallbackStoresDecodedResponseAndReceipt() public {
        uint256 requestId = callback.requestDecision(
            "Proposal: allocate 500K to community grants.", "Return only YES, NO, or ABSTAIN.", _allowedVotes()
        );

        platform.finalizeString(requestId, "YES", 42);

        (,, HelloSomniaCallback.LocalStatus status,, string memory response, uint256 receipt) =
            callback.decisions(requestId);
        assertEq(uint8(status), uint8(HelloSomniaCallback.LocalStatus.Resolved));
        assertEq(response, "YES");
        assertEq(receipt, 42);
    }

    function testPlatformFailureMarksDecisionFailed() public {
        uint256 requestId = callback.requestDecision(
            "Proposal: unlock team tokens early.", "Return only YES, NO, or ABSTAIN.", _allowedVotes()
        );

        platform.fail(requestId, ResponseStatus.Failed, 99);

        (,, HelloSomniaCallback.LocalStatus status, ResponseStatus platformStatus,,) = callback.decisions(requestId);
        assertEq(uint8(status), uint8(HelloSomniaCallback.LocalStatus.Failed));
        assertEq(uint8(platformStatus), uint8(ResponseStatus.Failed));
    }

    function testUnauthorizedCallbackReverts() public {
        Response[] memory responses = new Response[](0);
        Request memory details;

        vm.expectRevert(abi.encodeWithSelector(HelloSomniaCallback.UnauthorizedCallback.selector, address(this)));
        callback.handleResponse(1, responses, ResponseStatus.Success, details);
    }

    function testDuplicateCallbackReverts() public {
        uint256 requestId = callback.requestDecision(
            "Proposal: allocate 500K to community grants.", "Return only YES, NO, or ABSTAIN.", _allowedVotes()
        );

        platform.finalizeString(requestId, "YES", 42);

        vm.expectRevert(abi.encodeWithSelector(HelloSomniaCallback.RequestAlreadySettled.selector, requestId));
        platform.finalizeString(requestId, "YES", 43);
    }

    function _allowedVotes() internal pure returns (string[] memory allowedValues) {
        allowedValues = new string[](3);
        allowedValues[0] = "YES";
        allowedValues[1] = "NO";
        allowedValues[2] = "ABSTAIN";
    }
}
