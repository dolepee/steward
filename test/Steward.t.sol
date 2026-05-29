// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MiniGovernor} from "../src/MiniGovernor.sol";
import {Steward} from "../src/Steward.sol";
import {Request, Response, ResponseStatus} from "../src/interfaces/ISomniaAgents.sol";
import {MockSomniaAgents} from "./mocks/MockSomniaAgents.sol";

contract StewardTest is Test {
    uint256 internal constant LLM_AGENT_ID = 12847293847561029384;

    MockSomniaAgents internal platform;
    MiniGovernor internal governor;
    Steward internal steward;

    function setUp() public {
        platform = new MockSomniaAgents();
        governor = new MiniGovernor();
        steward = new Steward(address(platform), LLM_AGENT_ID);
    }

    function testRequestVoteCreatesSomniaRequest() public {
        uint256 proposalId = governor.createProposal("Allocate 500K to community grants.", 7 days);
        uint256 delegationId = steward.delegate(
            address(governor),
            "Vote YES for grants under 1M, NO for token unlocks, ABSTAIN if unclear.",
            uint64(block.timestamp + 30 days)
        );

        uint256 requestId = steward.requestVote{value: 0.24 ether}(delegationId, proposalId);

        assertEq(requestId, 1);
        assertEq(platform.lastAgentId(), LLM_AGENT_ID);
        assertEq(platform.lastCallbackAddress(), address(steward));
        assertEq(platform.lastCallbackSelector(), steward.handleResponse.selector);
        assertEq(platform.lastValue(), 0.24 ether);
    }

    function testYesCallbackCastsVote() public {
        (uint256 requestId, uint256 proposalId) = _requestVote("Allocate 500K to community grants.");

        platform.finalizeString(requestId, "YES", 101);

        assertEq(governor.votes(proposalId, address(steward)), governor.VOTE_YES());
        (,, Steward.RequestState state,, uint8 support, string memory reason, uint256 receipt) =
            steward.voteRequests(requestId);
        assertEq(uint8(state), uint8(Steward.RequestState.Cast));
        assertEq(support, governor.VOTE_YES());
        assertEq(reason, "YES");
        assertEq(receipt, 101);
    }

    function testNoCallbackCastsVote() public {
        (uint256 requestId, uint256 proposalId) = _requestVote("Unlock 10 percent of team tokens early.");

        platform.finalizeString(requestId, "NO", 102);

        assertEq(governor.votes(proposalId, address(steward)), governor.VOTE_NO());
    }

    function testAbstainCallbackCastsVote() public {
        (uint256 requestId, uint256 proposalId) = _requestVote("Create a working group to explore partnerships.");

        platform.finalizeString(requestId, "ABSTAIN", 103);

        assertEq(governor.votes(proposalId, address(steward)), governor.VOTE_ABSTAIN());
    }

    function testInvalidAgentOutputFailsWithoutVoting() public {
        (uint256 requestId, uint256 proposalId) = _requestVote("Create a working group to explore partnerships.");

        platform.finalizeString(requestId, "MAYBE", 104);

        assertEq(governor.votes(proposalId, address(steward)), 0);
        (,, Steward.RequestState state,,,,) = steward.voteRequests(requestId);
        assertEq(uint8(state), uint8(Steward.RequestState.Failed));
    }

    function testPlatformFailureFailsWithoutVoting() public {
        (uint256 requestId, uint256 proposalId) = _requestVote("Allocate 500K to community grants.");

        platform.fail(requestId, ResponseStatus.Failed, 105);

        assertEq(governor.votes(proposalId, address(steward)), 0);
        (,, Steward.RequestState state, ResponseStatus platformStatus,, string memory reason, uint256 receipt) =
            steward.voteRequests(requestId);
        assertEq(uint8(state), uint8(Steward.RequestState.Failed));
        assertEq(uint8(platformStatus), uint8(ResponseStatus.Failed));
        assertEq(reason, "Somnia agent request did not finalize successfully.");
        assertEq(receipt, 105);
    }

    function testGovernorRejectionFailsRequestWithoutPretendingVoteCast() public {
        (uint256 requestId, uint256 proposalId) = _requestVote("Allocate 500K to community grants.");
        vm.warp(block.timestamp + 8 days);

        platform.finalizeString(requestId, "YES", 106);

        assertEq(governor.votes(proposalId, address(steward)), 0);
        (,, Steward.RequestState state, ResponseStatus platformStatus,, string memory reason, uint256 receipt) =
            steward.voteRequests(requestId);
        assertEq(uint8(state), uint8(Steward.RequestState.Failed));
        assertEq(uint8(platformStatus), uint8(ResponseStatus.Failed));
        assertEq(reason, "Governor rejected Steward vote.");
        assertEq(receipt, 106);
    }

    function testDuplicateRequestForProposalReverts() public {
        uint256 proposalId = governor.createProposal("Allocate 500K to community grants.", 7 days);
        uint256 delegationId = steward.delegate(
            address(governor),
            "Vote YES for grants under 1M, NO for token unlocks, ABSTAIN if unclear.",
            uint64(block.timestamp + 30 days)
        );
        uint256 requestId = steward.requestVote(delegationId, proposalId);

        vm.expectRevert(
            abi.encodeWithSelector(Steward.ExistingVoteRequest.selector, delegationId, proposalId, requestId)
        );
        steward.requestVote(delegationId, proposalId);
    }

    function testExpiredDelegationCannotRequestVote() public {
        uint256 proposalId = governor.createProposal("Allocate 500K to community grants.", 7 days);
        uint256 delegationId = steward.delegate(
            address(governor),
            "Vote YES for grants under 1M, NO for token unlocks, ABSTAIN if unclear.",
            uint64(block.timestamp + 1)
        );
        vm.warp(block.timestamp + 2);

        vm.expectRevert(abi.encodeWithSelector(Steward.DelegationExpired.selector, delegationId));
        steward.requestVote(delegationId, proposalId);
    }

    function testRevokedDelegationCannotRequestVote() public {
        uint256 proposalId = governor.createProposal("Allocate 500K to community grants.", 7 days);
        uint256 delegationId = steward.delegate(
            address(governor),
            "Vote YES for grants under 1M, NO for token unlocks, ABSTAIN if unclear.",
            uint64(block.timestamp + 30 days)
        );

        steward.revokeDelegation(delegationId);

        vm.expectRevert(abi.encodeWithSelector(Steward.DelegationIsRevoked.selector, delegationId));
        steward.requestVote(delegationId, proposalId);
    }

    function testOnlyDelegationOwnerCanRevoke() public {
        uint256 delegationId = steward.delegate(
            address(governor),
            "Vote YES for grants under 1M, NO for token unlocks, ABSTAIN if unclear.",
            uint64(block.timestamp + 30 days)
        );

        address attacker = address(0xA11CE);
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Steward.NotDelegationOwner.selector, delegationId, attacker));
        steward.revokeDelegation(delegationId);
    }

    function testUnauthorizedCallbackReverts() public {
        Response[] memory responses = new Response[](0);
        Request memory details;

        vm.expectRevert(abi.encodeWithSelector(Steward.UnauthorizedCallback.selector, address(this)));
        steward.handleResponse(1, responses, ResponseStatus.Success, details);
    }

    function testUnknownRequestCallbackReverts() public {
        Response[] memory responses = new Response[](0);
        Request memory details;

        vm.prank(address(platform));
        vm.expectRevert(abi.encodeWithSelector(Steward.UnknownRequest.selector, 404));
        steward.handleResponse(404, responses, ResponseStatus.Success, details);
    }

    function testMismatchedRequestDetailsReverts() public {
        (uint256 requestId,) = _requestVote("Allocate 500K to community grants.");
        Response[] memory responses = new Response[](0);
        Request memory details;
        details.id = requestId + 1;

        vm.prank(address(platform));
        vm.expectRevert(abi.encodeWithSelector(Steward.RequestMismatch.selector, requestId, details.id));
        steward.handleResponse(requestId, responses, ResponseStatus.Success, details);
    }

    function testDuplicateCallbackReverts() public {
        (uint256 requestId,) = _requestVote("Allocate 500K to community grants.");

        platform.finalizeString(requestId, "YES", 107);

        vm.expectRevert(abi.encodeWithSelector(Steward.RequestAlreadySettled.selector, requestId));
        platform.finalizeString(requestId, "YES", 108);
    }

    function _requestVote(string memory proposalText) internal returns (uint256 requestId, uint256 proposalId) {
        proposalId = governor.createProposal(proposalText, 7 days);
        uint256 delegationId = steward.delegate(
            address(governor),
            "Vote YES for grants under 1M, NO for token unlocks, ABSTAIN if unclear.",
            uint64(block.timestamp + 30 days)
        );
        requestId = steward.requestVote(delegationId, proposalId);
    }
}
