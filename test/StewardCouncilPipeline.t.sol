// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MiniGovernor} from "../src/MiniGovernor.sol";
import {StewardCouncilPipeline} from "../src/StewardCouncilPipeline.sol";
import {ILLMInferenceAgent} from "../src/interfaces/ILLMInferenceAgent.sol";
import {IParseWebsiteAgent} from "../src/interfaces/IParseWebsiteAgent.sol";
import {Request, Response, ResponseStatus} from "../src/interfaces/ISomniaAgents.sol";
import {MockSomniaAgents} from "./mocks/MockSomniaAgents.sol";

contract StewardCouncilPipelineTest is Test {
    uint256 internal constant PARSE_WEBSITE_AGENT_ID = 12875401142070969085;
    uint256 internal constant LLM_AGENT_ID = 12847293847561029384;

    MockSomniaAgents internal platform;
    MiniGovernor internal governor;
    StewardCouncilPipeline internal council;

    function setUp() public {
        platform = new MockSomniaAgents();
        governor = new MiniGovernor();
        council = new StewardCouncilPipeline(address(platform), PARSE_WEBSITE_AGENT_ID, LLM_AGENT_ID);
    }

    function testQuoteCouncilVoteBreaksDownDeposit() public view {
        (
            uint256 platformDeposit,
            uint256 parseAgentBudget,
            uint256 parseDeposit,
            uint256 reviewDeposit,
            uint256 totalDeposit
        ) = council.quoteCouncilVote();

        assertEq(platformDeposit, 0.03 ether);
        assertEq(parseAgentBudget, 0.3 ether);
        assertEq(parseDeposit, 0.33 ether);
        assertEq(reviewDeposit, 0.72 ether);
        assertEq(totalDeposit, 1.05 ether);
        assertEq(council.requiredDeposit(), totalDeposit);
    }

    function testStartCouncilVoteCreatesParseWebsiteRequest() public {
        uint256 proposalId = governor.createProposal("Imported proposal from forum URL.", 7 days);
        uint256 requiredDeposit = council.requiredDeposit();

        (uint256 jobId, uint256 parseRequestId) = council.startCouncilVote{value: requiredDeposit}(
            address(governor),
            proposalId,
            "Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.",
            "https://forum.example/proposals/community-grants",
            false
        );

        assertEq(jobId, 1);
        assertEq(parseRequestId, 1);
        assertEq(platform.lastAgentId(), PARSE_WEBSITE_AGENT_ID);
        assertEq(platform.lastCallbackAddress(), address(council));
        assertEq(platform.lastCallbackSelector(), council.handleResponse.selector);
        assertEq(platform.lastValue(), 0.33 ether);
        assertEq(_selector(platform.lastPayload()), IParseWebsiteAgent.ExtractString.selector);

        (
            string memory key,
            string memory description,
            string[] memory options,
            string memory prompt,
            string memory url,
            bool resolveUrl,
            uint8 numPages,
            uint8 confidenceThreshold
        ) = abi.decode(
            _payloadBody(platform.lastPayload()), (string, string, string[], string, string, bool, uint8, uint8)
        );

        assertEq(key, "proposal_summary");
        assertGt(bytes(description).length, 0);
        assertEq(options.length, 0);
        assertTrue(_contains(prompt, "decision-critical facts"));
        assertEq(url, "https://forum.example/proposals/community-grants");
        assertFalse(resolveUrl);
        assertEq(numPages, 3);
        assertEq(confidenceThreshold, 70);
    }

    function testParseCallbackCreatesThreeReviewerRequests() public {
        (uint256 jobId, uint256 parseRequestId,) = _startCouncil();

        platform.finalizeString(parseRequestId, "Proposal asks for 500K USDC for a Q3 community grants program.", 501);

        (
            StewardCouncilPipeline.CouncilState state,
            ResponseStatus parseStatus,
            uint256 parseRequestFromOverview,
            uint8 finalSupport,
            uint8 yesCount,
            uint8 noCount,
            uint8 abstainCount,
            uint8 completedReviews,
            string memory summary,,
            uint256 parseReceipt
        ) = council.jobOverview(jobId);

        assertEq(uint8(state), uint8(StewardCouncilPipeline.CouncilState.WaitingForReviews));
        assertEq(uint8(parseStatus), uint8(ResponseStatus.Success));
        assertEq(parseRequestFromOverview, parseRequestId);
        assertEq(finalSupport, 0);
        assertEq(yesCount, 0);
        assertEq(noCount, 0);
        assertEq(abstainCount, 0);
        assertEq(completedReviews, 0);
        assertEq(summary, "Proposal asks for 500K USDC for a Q3 community grants program.");
        assertEq(parseReceipt, 501);
        assertEq(platform.nextRequestId(), 5);

        _assertReviewerPayload(2, "budget");
        _assertReviewerPayload(3, "risk");
        _assertReviewerPayload(4, "participation");
    }

    function testCouncilMajorityCastsYesVote() public {
        (, uint256 parseRequestId, uint256 proposalId) = _startCouncil();

        platform.finalizeString(parseRequestId, "Proposal asks for 500K USDC for a Q3 community grants program.", 601);
        platform.finalizeString(2, "YES: grant budget is under mandate.", 602);
        platform.finalizeString(3, "YES: risk is bounded by the cap.", 603);
        platform.finalizeString(4, "ABSTAIN: participation impact is unclear.", 604);

        assertEq(governor.votes(proposalId, address(council)), governor.VOTE_YES());

        (
            StewardCouncilPipeline.CouncilState state,,,
            uint8 finalSupport,
            uint8 yesCount,
            uint8 noCount,
            uint8 abstainCount,
            uint8 completedReviews,,
            string memory finalReason,
        ) = council.jobOverview(1);

        assertEq(uint8(state), uint8(StewardCouncilPipeline.CouncilState.Cast));
        assertEq(finalSupport, governor.VOTE_YES());
        assertEq(yesCount, 2);
        assertEq(noCount, 0);
        assertEq(abstainCount, 1);
        assertEq(completedReviews, 3);
        assertEq(finalReason, "YES: Steward council majority: YES=2, NO=0, ABSTAIN=1.");
    }

    function testCouncilThreeWaySplitAbstains() public {
        (, uint256 parseRequestId, uint256 proposalId) = _startCouncil();

        platform.finalizeString(parseRequestId, "Proposal forms a working group with unclear funding.", 701);
        platform.finalizeString(2, "YES: small research group could help.", 702);
        platform.finalizeString(3, "NO: scope and accountability are weak.", 703);
        platform.finalizeString(4, "ABSTAIN: participation evidence is inconclusive.", 704);

        assertEq(governor.votes(proposalId, address(council)), governor.VOTE_ABSTAIN());

        (
            StewardCouncilPipeline.CouncilState state,,,
            uint8 finalSupport,
            uint8 yesCount,
            uint8 noCount,
            uint8 abstainCount,,,,
        ) = council.jobOverview(1);

        assertEq(uint8(state), uint8(StewardCouncilPipeline.CouncilState.Cast));
        assertEq(finalSupport, governor.VOTE_ABSTAIN());
        assertEq(yesCount, 1);
        assertEq(noCount, 1);
        assertEq(abstainCount, 1);
    }

    function testOneReviewerFailureDoesNotBlockCouncil() public {
        (, uint256 parseRequestId, uint256 proposalId) = _startCouncil();

        platform.finalizeString(parseRequestId, "Proposal unlocks 10 percent of team tokens six months early.", 801);
        platform.finalizeString(2, "NO: team unlock violates mandate.", 802);
        platform.fail(3, ResponseStatus.Failed, 803);
        platform.finalizeString(4, "NO: participation impact favors token holders over voters.", 804);

        assertEq(governor.votes(proposalId, address(council)), governor.VOTE_NO());

        (
            StewardCouncilPipeline.CouncilState state,,,
            uint8 finalSupport,
            uint8 yesCount,
            uint8 noCount,
            uint8 abstainCount,
            uint8 completedReviews,,,
        ) = council.jobOverview(1);
        (,, uint8 failedSupport,, string memory failedReason,, bool failedCompleted) = council.reviewerDecisions(1, 1);

        assertEq(uint8(state), uint8(StewardCouncilPipeline.CouncilState.Cast));
        assertEq(finalSupport, governor.VOTE_NO());
        assertEq(yesCount, 0);
        assertEq(noCount, 2);
        assertEq(abstainCount, 1);
        assertEq(completedReviews, 3);
        assertEq(failedSupport, governor.VOTE_ABSTAIN());
        assertTrue(failedCompleted);
        assertEq(failedReason, "ABSTAIN: risk reviewer failed or returned an invalid vote.");
    }

    function testParseFailureFailsAndRefundsAllReviewDeposits() public {
        address requester = address(0xCAFE);
        vm.deal(requester, 2 ether);
        (, uint256 parseRequestId,) = _startCouncilFor(requester);

        uint256 balanceBefore = requester.balance;
        platform.fail(parseRequestId, ResponseStatus.Failed, 901);

        assertEq(requester.balance, balanceBefore + council.LLM_INFERENCE_DEPOSIT() * council.REVIEWER_COUNT());
        assertEq(platform.nextRequestId(), 2);

        (StewardCouncilPipeline.CouncilState state, ResponseStatus parseStatus,,,,,,,,, uint256 parseReceipt) =
            council.jobOverview(1);

        assertEq(uint8(state), uint8(StewardCouncilPipeline.CouncilState.Failed));
        assertEq(uint8(parseStatus), uint8(ResponseStatus.Failed));
        assertEq(parseReceipt, 901);
    }

    function testIncorrectDepositReverts() public {
        uint256 proposalId = governor.createProposal("Imported proposal from forum URL.", 7 days);
        uint256 expectedDeposit = council.requiredDeposit();

        vm.expectRevert(
            abi.encodeWithSelector(StewardCouncilPipeline.IncorrectDeposit.selector, expectedDeposit, 0.57 ether)
        );
        council.startCouncilVote{value: 0.57 ether}(
            address(governor),
            proposalId,
            "Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.",
            "https://forum.example/proposals/community-grants",
            false
        );
    }

    function testUnauthorizedCallbackReverts() public {
        Response[] memory responses = new Response[](0);
        Request memory details;

        vm.expectRevert(abi.encodeWithSelector(StewardCouncilPipeline.UnauthorizedCallback.selector, address(this)));
        council.handleResponse(1, responses, ResponseStatus.Success, details);
    }

    function _startCouncil() internal returns (uint256 jobId, uint256 parseRequestId, uint256 proposalId) {
        return _startCouncilFor(address(this));
    }

    function _startCouncilFor(address requester)
        internal
        returns (uint256 jobId, uint256 parseRequestId, uint256 proposalId)
    {
        proposalId = governor.createProposal("Imported proposal from forum URL.", 7 days);
        uint256 requiredDeposit = council.requiredDeposit();
        vm.prank(requester);
        (jobId, parseRequestId) = council.startCouncilVote{value: requiredDeposit}(
            address(governor),
            proposalId,
            "Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.",
            "https://forum.example/proposals/community-grants",
            false
        );
    }

    function _assertReviewerPayload(uint256 requestId, string memory role) internal view {
        assertEq(platform.requestAgentIds(requestId), LLM_AGENT_ID);
        assertEq(platform.requestValues(requestId), 0.24 ether);
        assertEq(_selector(platform.requestPayloads(requestId)), ILLMInferenceAgent.inferString.selector);

        (string memory prompt, string memory system, bool chainOfThought, string[] memory allowedValues) =
            abi.decode(_payloadBody(platform.requestPayloads(requestId)), (string, string, bool, string[]));

        assertTrue(_contains(prompt, role));
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
