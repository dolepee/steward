// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MiniGovernor} from "../src/MiniGovernor.sol";
import {StewardCouncilDelegationPipeline} from "../src/StewardCouncilDelegationPipeline.sol";
import {StewardCouncilPipeline} from "../src/StewardCouncilPipeline.sol";
import {ILLMInferenceAgent} from "../src/interfaces/ILLMInferenceAgent.sol";
import {IParseWebsiteAgent} from "../src/interfaces/IParseWebsiteAgent.sol";
import {ResponseStatus} from "../src/interfaces/ISomniaAgents.sol";
import {MockSomniaAgents} from "./mocks/MockSomniaAgents.sol";

contract StewardCouncilDelegationPipelineTest is Test {
    uint256 internal constant PARSE_WEBSITE_AGENT_ID = 12875401142070969085;
    uint256 internal constant LLM_AGENT_ID = 12847293847561029384;

    string internal constant CRITERIA =
        "Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.";
    string internal constant PROPOSAL_URL = "https://forum.example/proposals/community-grants";

    MockSomniaAgents internal platform;
    MiniGovernor internal governor;
    StewardCouncilPipeline internal council;
    StewardCouncilDelegationPipeline internal pipeline;

    address internal owner = address(0xA11CE);
    address internal executor = address(0xB0B);

    function setUp() public {
        platform = new MockSomniaAgents();
        governor = new MiniGovernor();
        council = new StewardCouncilPipeline(address(platform), PARSE_WEBSITE_AGENT_ID, LLM_AGENT_ID);
        pipeline = new StewardCouncilDelegationPipeline(address(council));
        vm.deal(owner, 10 ether);
        vm.deal(executor, 10 ether);
    }

    function testCreateDelegationStoresMandate() public {
        uint64 validUntil = uint64(block.timestamp + 30 days);

        vm.prank(owner);
        uint256 delegationId = pipeline.createCouncilDelegation(address(governor), CRITERIA, validUntil);

        (
            address storedOwner,
            address storedGovernor,
            bytes32 criteriaHash,
            string memory criteriaText,
            uint64 storedValidUntil,
            bool revoked
        ) = pipeline.delegations(delegationId);

        assertEq(storedOwner, owner);
        assertEq(storedGovernor, address(governor));
        assertEq(criteriaHash, keccak256(bytes(CRITERIA)));
        assertEq(criteriaText, CRITERIA);
        assertEq(storedValidUntil, validUntil);
        assertFalse(revoked);
    }

    function testPermissionlessExecutorStartsVoteFromStoredCriteria() public {
        (uint256 delegationId, uint256 proposalId) = _createDelegationAndProposal();
        uint256 deposit = pipeline.requiredDeposit();

        vm.prank(executor);
        (uint256 executionId, uint256 councilJobId, uint256 parseRequestId) =
            pipeline.executeDelegatedCouncilVote{value: deposit}(delegationId, proposalId, PROPOSAL_URL, false);

        assertEq(executionId, 1);
        assertEq(councilJobId, 1);
        assertEq(parseRequestId, 1);
        assertEq(platform.lastAgentId(), PARSE_WEBSITE_AGENT_ID);
        assertEq(platform.lastCallbackAddress(), address(council));
        assertEq(platform.lastCallbackSelector(), council.handleResponse.selector);
        assertEq(_selector(platform.lastPayload()), IParseWebsiteAgent.ExtractString.selector);
        assertEq(pipeline.councilJobForDelegationProposal(delegationId, proposalId), councilJobId);

        platform.finalizeString(parseRequestId, "Proposal asks for 500K USDC for a Q3 community grants program.", 501);

        _assertReviewerPayload(2, "budget", CRITERIA);
        _assertReviewerPayload(3, "risk", CRITERIA);
        _assertReviewerPayload(4, "participation", CRITERIA);
    }

    function testDelegatedCouncilMajorityCastsYesVote() public {
        (uint256 delegationId, uint256 proposalId) = _createDelegationAndProposal();
        (, uint256 councilJobId, uint256 parseRequestId) = _executeDelegation(delegationId, proposalId);

        platform.finalizeString(parseRequestId, "Proposal asks for 500K USDC for a Q3 community grants program.", 601);
        platform.finalizeString(2, "YES: grant budget is under mandate.", 602);
        platform.finalizeString(3, "YES: risk is bounded by the cap.", 603);
        platform.finalizeString(4, "ABSTAIN: participation impact is unclear.", 604);

        assertEq(governor.votes(proposalId, address(council)), governor.VOTE_YES());

        (
            StewardCouncilPipeline.CouncilState state,,
            uint256 returnedParseRequestId,
            uint8 finalSupport,
            uint8 yesCount,
            uint8 noCount,
            uint8 abstainCount,
            uint8 completedReviews,,
            string memory finalReason,
        ) = council.jobOverview(councilJobId);

        assertEq(uint8(state), uint8(StewardCouncilPipeline.CouncilState.Cast));
        assertEq(returnedParseRequestId, parseRequestId);
        assertEq(finalSupport, governor.VOTE_YES());
        assertEq(yesCount, 2);
        assertEq(noCount, 0);
        assertEq(abstainCount, 1);
        assertEq(completedReviews, 3);
        assertEq(finalReason, "YES: Steward council majority: YES=2, NO=0, ABSTAIN=1.");
    }

    function testDelegatedCouncilThreeWaySplitAbstains() public {
        (uint256 delegationId, uint256 proposalId) = _createDelegationAndProposal();
        (,, uint256 parseRequestId) = _executeDelegation(delegationId, proposalId);

        platform.finalizeString(parseRequestId, "Proposal forms a working group with unclear funding.", 701);
        platform.finalizeString(2, "YES: small research group could help.", 702);
        platform.finalizeString(3, "NO: scope and accountability are weak.", 703);
        platform.finalizeString(4, "ABSTAIN: participation evidence is inconclusive.", 704);

        assertEq(governor.votes(proposalId, address(council)), governor.VOTE_ABSTAIN());
    }

    function testOneReviewerFailureDoesNotBlockDelegatedCouncil() public {
        (uint256 delegationId, uint256 proposalId) = _createDelegationAndProposal();
        (,, uint256 parseRequestId) = _executeDelegation(delegationId, proposalId);

        platform.finalizeString(parseRequestId, "Proposal unlocks 10 percent of team tokens six months early.", 801);
        platform.finalizeString(2, "NO: team unlock violates mandate.", 802);
        platform.fail(3, ResponseStatus.Failed, 803);
        platform.finalizeString(4, "NO: participation impact favors token holders over voters.", 804);

        assertEq(governor.votes(proposalId, address(council)), governor.VOTE_NO());
    }

    function testRevokedDelegationCannotStartNewVote() public {
        (uint256 delegationId, uint256 proposalId) = _createDelegationAndProposal();

        vm.prank(owner);
        pipeline.revokeCouncilDelegation(delegationId);

        uint256 deposit = pipeline.requiredDeposit();
        vm.expectRevert(
            abi.encodeWithSelector(StewardCouncilDelegationPipeline.DelegationIsRevoked.selector, delegationId)
        );
        vm.prank(executor);
        pipeline.executeDelegatedCouncilVote{value: deposit}(delegationId, proposalId, PROPOSAL_URL, false);
    }

    function testExpiredDelegationCannotStartNewVote() public {
        vm.prank(owner);
        uint256 delegationId =
            pipeline.createCouncilDelegation(address(governor), CRITERIA, uint64(block.timestamp + 1));
        uint256 proposalId = governor.createProposal("Imported proposal from forum URL.", 7 days);
        vm.warp(block.timestamp + 2);
        uint256 deposit = pipeline.requiredDeposit();

        vm.expectRevert(
            abi.encodeWithSelector(StewardCouncilDelegationPipeline.DelegationExpired.selector, delegationId)
        );
        vm.prank(executor);
        pipeline.executeDelegatedCouncilVote{value: deposit}(delegationId, proposalId, PROPOSAL_URL, false);
    }

    function testOnlyOwnerCanRevokeDelegation() public {
        (uint256 delegationId,) = _createDelegationAndProposal();

        vm.prank(executor);
        vm.expectRevert(
            abi.encodeWithSelector(StewardCouncilDelegationPipeline.NotDelegationOwner.selector, delegationId, executor)
        );
        pipeline.revokeCouncilDelegation(delegationId);
    }

    function testDuplicateDelegatedVoteReverts() public {
        (uint256 delegationId, uint256 proposalId) = _createDelegationAndProposal();
        (, uint256 councilJobId,) = _executeDelegation(delegationId, proposalId);
        uint256 deposit = pipeline.requiredDeposit();

        vm.expectRevert(
            abi.encodeWithSelector(
                StewardCouncilDelegationPipeline.ExistingDelegatedCouncilVote.selector,
                delegationId,
                proposalId,
                councilJobId
            )
        );
        vm.prank(executor);
        pipeline.executeDelegatedCouncilVote{value: deposit}(delegationId, proposalId, PROPOSAL_URL, false);
    }

    function testIncorrectDepositReverts() public {
        (uint256 delegationId, uint256 proposalId) = _createDelegationAndProposal();
        uint256 deposit = pipeline.requiredDeposit() - 1;

        vm.expectRevert(
            abi.encodeWithSelector(StewardCouncilDelegationPipeline.IncorrectDeposit.selector, deposit + 1, deposit)
        );
        vm.prank(executor);
        pipeline.executeDelegatedCouncilVote{value: deposit}(delegationId, proposalId, PROPOSAL_URL, false);
    }

    function testParseFailureRefundCanBePulledThroughWrapper() public {
        (uint256 delegationId, uint256 proposalId) = _createDelegationAndProposal();
        (, uint256 councilJobId, uint256 parseRequestId) = _executeDelegation(delegationId, proposalId);

        platform.fail(parseRequestId, ResponseStatus.Failed, 1001);
        assertEq(council.claimableRefunds(address(pipeline)), 0.72 ether);

        uint256 balanceBefore = executor.balance;
        pipeline.claimCouncilRefund(councilJobId);
        assertEq(pipeline.claimableRefunds(executor), 0.72 ether);

        vm.prank(executor);
        pipeline.claimRefund();
        assertEq(executor.balance, balanceBefore + 0.72 ether);
    }

    function testRequiredDepositForwardsCouncilQuote() public {
        platform.setRequestDeposit(0.05 ether);
        assertEq(pipeline.requiredDeposit(), council.requiredDeposit());
    }

    function _createDelegationAndProposal() internal returns (uint256 delegationId, uint256 proposalId) {
        vm.prank(owner);
        delegationId = pipeline.createCouncilDelegation(address(governor), CRITERIA, uint64(block.timestamp + 30 days));
        proposalId = governor.createProposal("Imported proposal from forum URL.", 7 days);
    }

    function _executeDelegation(uint256 delegationId, uint256 proposalId)
        internal
        returns (uint256 executionId, uint256 councilJobId, uint256 parseRequestId)
    {
        uint256 deposit = pipeline.requiredDeposit();
        vm.prank(executor);
        (executionId, councilJobId, parseRequestId) =
            pipeline.executeDelegatedCouncilVote{value: deposit}(delegationId, proposalId, PROPOSAL_URL, false);
    }

    function _assertReviewerPayload(uint256 requestId, string memory role, string memory expectedCriteria)
        internal
        view
    {
        assertEq(platform.requestAgentIds(requestId), LLM_AGENT_ID);
        assertEq(platform.requestValues(requestId), council.reviewerRequestDeposit());
        assertEq(_selector(platform.requestPayloads(requestId)), ILLMInferenceAgent.inferString.selector);

        (string memory prompt, string memory system, bool chainOfThought, string[] memory allowedValues) =
            abi.decode(_payloadBody(platform.requestPayloads(requestId)), (string, string, bool, string[]));

        assertTrue(_contains(prompt, role));
        assertTrue(_contains(prompt, expectedCriteria));
        assertTrue(_contains(prompt, "500K USDC"));
        assertTrue(_contains(system, role));
        assertFalse(chainOfThought);
        assertEq(allowedValues.length, 3);
        assertEq(allowedValues[0], "YES");
        assertEq(allowedValues[1], "NO");
        assertEq(allowedValues[2], "ABSTAIN");
    }

    function _selector(bytes memory payload) internal pure returns (bytes4 selector) {
        assembly ("memory-safe") {
            selector := mload(add(payload, 0x20))
        }
    }

    function _payloadBody(bytes memory payload) internal pure returns (bytes memory body) {
        body = new bytes(payload.length - 4);
        for (uint256 i = 4; i < payload.length; i++) {
            body[i - 4] = payload[i];
        }
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory haystackBytes = bytes(haystack);
        bytes memory needleBytes = bytes(needle);
        if (needleBytes.length == 0 || haystackBytes.length < needleBytes.length) return false;

        for (uint256 i = 0; i <= haystackBytes.length - needleBytes.length; i++) {
            bool matched = true;
            for (uint256 j = 0; j < needleBytes.length; j++) {
                if (haystackBytes[i + j] != needleBytes[j]) {
                    matched = false;
                    break;
                }
            }
            if (matched) return true;
        }
        return false;
    }
}
