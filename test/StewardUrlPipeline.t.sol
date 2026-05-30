// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MiniGovernor} from "../src/MiniGovernor.sol";
import {StewardUrlPipeline} from "../src/StewardUrlPipeline.sol";
import {ILLMInferenceAgent} from "../src/interfaces/ILLMInferenceAgent.sol";
import {IParseWebsiteAgent} from "../src/interfaces/IParseWebsiteAgent.sol";
import {Request, Response, ResponseStatus} from "../src/interfaces/ISomniaAgents.sol";
import {MockSomniaAgents} from "./mocks/MockSomniaAgents.sol";

contract StewardUrlPipelineTest is Test {
    uint256 internal constant PARSE_WEBSITE_AGENT_ID = 12875401142070969085;
    uint256 internal constant LLM_AGENT_ID = 12847293847561029384;

    MockSomniaAgents internal platform;
    MiniGovernor internal governor;
    StewardUrlPipeline internal pipeline;

    function setUp() public {
        platform = new MockSomniaAgents();
        governor = new MiniGovernor();
        pipeline = new StewardUrlPipeline(address(platform), PARSE_WEBSITE_AGENT_ID, LLM_AGENT_ID);
    }

    function testStartUrlVoteCreatesParseWebsiteRequest() public {
        uint256 proposalId = governor.createProposal("Imported proposal from forum URL.", 7 days);
        uint256 requiredDeposit = pipeline.requiredDeposit();

        (uint256 jobId, uint256 parseRequestId) = pipeline.startUrlVote{value: requiredDeposit}(
            address(governor),
            proposalId,
            "Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.",
            "https://forum.example/proposals/community-grants",
            false
        );

        assertEq(requiredDeposit, 0.57 ether);
        assertEq(jobId, 1);
        assertEq(parseRequestId, 1);
        assertEq(platform.lastAgentId(), PARSE_WEBSITE_AGENT_ID);
        assertEq(platform.lastCallbackAddress(), address(pipeline));
        assertEq(platform.lastCallbackSelector(), pipeline.handleResponse.selector);
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
        assertGt(bytes(prompt).length, 0);
        assertEq(url, "https://forum.example/proposals/community-grants");
        assertFalse(resolveUrl);
        assertEq(numPages, 3);
        assertEq(confidenceThreshold, 70);
    }

    function testQuoteUrlVoteBreaksDownDeposit() public view {
        (
            uint256 platformDeposit,
            uint256 parseAgentBudget,
            uint256 parseDeposit,
            uint256 voteDeposit,
            uint256 totalDeposit
        ) = pipeline.quoteUrlVote();

        assertEq(platformDeposit, 0.03 ether);
        assertEq(parseAgentBudget, 0.3 ether);
        assertEq(parseDeposit, 0.33 ether);
        assertEq(voteDeposit, 0.24 ether);
        assertEq(totalDeposit, 0.57 ether);
        assertEq(pipeline.requiredDeposit(), totalDeposit);
        assertEq(pipeline.voteRequestDeposit(), 0.24 ether);
    }

    function testQuoteUrlVoteUsesDynamicVotePlatformDeposit() public {
        platform.setRequestDeposit(0.05 ether);

        (
            uint256 platformDeposit,
            uint256 parseAgentBudget,
            uint256 parseDeposit,
            uint256 voteDeposit,
            uint256 totalDeposit
        ) = pipeline.quoteUrlVote();

        assertEq(platformDeposit, 0.05 ether);
        assertEq(parseAgentBudget, 0.3 ether);
        assertEq(parseDeposit, 0.35 ether);
        assertEq(voteDeposit, 0.26 ether);
        assertEq(totalDeposit, 0.61 ether);
        assertEq(pipeline.voteRequestDeposit(), 0.26 ether);
    }

    function testParseCallbackCreatesLlmVoteRequest() public {
        (uint256 jobId, uint256 parseRequestId, uint256 proposalId) = _startPipeline();

        platform.finalizeString(parseRequestId, "Proposal asks for 500K USDC for a Q3 community grants program.", 501);

        assertEq(platform.lastAgentId(), LLM_AGENT_ID);
        assertEq(platform.lastCallbackAddress(), address(pipeline));
        assertEq(platform.lastCallbackSelector(), pipeline.handleResponse.selector);
        assertEq(platform.lastValue(), pipeline.voteRequestDeposit());
        assertEq(_selector(platform.lastPayload()), ILLMInferenceAgent.inferString.selector);

        (string memory prompt, string memory system, bool chainOfThought, string[] memory allowedValues) =
            abi.decode(_payloadBody(platform.lastPayload()), (string, string, bool, string[]));

        assertTrue(_contains(prompt, "500K USDC"));
        assertTrue(_contains(prompt, "community grants"));
        assertEq(system, "You are Steward, an autonomous DAO voting delegate. Choose exactly one allowed value.");
        assertFalse(chainOfThought);
        assertEq(allowedValues.length, 3);
        assertEq(allowedValues[0], "YES");
        assertEq(allowedValues[1], "NO");
        assertEq(allowedValues[2], "ABSTAIN");

        (
            StewardUrlPipeline.PipelineState state,
            ResponseStatus parseStatus,
            ResponseStatus voteStatus,
            uint256 parseRequestFromOverview,
            uint256 voteRequestId,
            uint8 support,
            string memory summary,,
            uint256 parseReceipt,
            uint256 voteReceipt
        ) = pipeline.jobOverview(jobId);

        assertEq(proposalId, 1);
        assertEq(uint8(parseStatus), uint8(ResponseStatus.Success));
        assertEq(uint8(voteStatus), uint8(ResponseStatus.None));
        assertEq(parseRequestFromOverview, parseRequestId);
        assertEq(voteRequestId, 2);
        assertEq(support, 0);
        assertEq(uint8(state), uint8(StewardUrlPipeline.PipelineState.WaitingForVote));
        assertEq(summary, "Proposal asks for 500K USDC for a Q3 community grants program.");
        assertEq(parseReceipt, 501);
        assertEq(voteReceipt, 0);
    }

    function testTwoAgentPipelineCastsVote() public {
        (, uint256 parseRequestId, uint256 proposalId) = _startPipeline();

        platform.finalizeString(parseRequestId, "Proposal asks for 500K USDC for a Q3 community grants program.", 601);
        platform.finalizeString(2, "YES", 602);

        assertEq(governor.votes(proposalId, address(pipeline)), governor.VOTE_YES());

        (StewardUrlPipeline.PipelineState state,,,,, uint8 support,, string memory reason,, uint256 voteReceipt) =
            pipeline.jobOverview(1);

        assertEq(uint8(state), uint8(StewardUrlPipeline.PipelineState.Cast));
        assertEq(support, governor.VOTE_YES());
        assertEq(reason, "YES");
        assertEq(voteReceipt, 602);
    }

    function testParseFailureFailsAndRefundsUnusedVoteDeposit() public {
        address requester = address(0xCAFE);
        vm.deal(requester, 1 ether);
        (, uint256 parseRequestId,) = _startPipelineFor(requester);

        uint256 balanceBefore = requester.balance;
        platform.fail(parseRequestId, ResponseStatus.Failed, 701);

        uint256 expectedRefund = 0.24 ether;
        assertEq(requester.balance, balanceBefore);
        assertEq(pipeline.claimableRefunds(requester), expectedRefund);

        vm.prank(requester);
        pipeline.claimRefund();

        assertEq(requester.balance, balanceBefore + expectedRefund);
        assertEq(pipeline.claimableRefunds(requester), 0);
        assertEq(platform.nextRequestId(), 2);
        (StewardUrlPipeline.PipelineState state, ResponseStatus parseStatus,,,,,,,,) = pipeline.jobOverview(1);
        assertEq(uint8(state), uint8(StewardUrlPipeline.PipelineState.Failed));
        assertEq(uint8(parseStatus), uint8(ResponseStatus.Failed));
    }

    function testUnsentRefundBecomesClaimable() public {
        NonPayableRequester requester = new NonPayableRequester();
        uint256 proposalId = governor.createProposal("Imported proposal from forum URL.", 7 days);
        uint256 deposit = pipeline.requiredDeposit();

        (, uint256 parseRequestId) = requester.start{value: deposit}(
            pipeline,
            address(governor),
            proposalId,
            "Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.",
            "https://forum.example/proposals/community-grants",
            false
        );

        platform.fail(parseRequestId, ResponseStatus.Failed, 707);

        assertEq(pipeline.claimableRefunds(address(requester)), 0.24 ether);
    }

    function testVoteRequestCreationFailureFailsAndRefundsWithoutReverting() public {
        platform.setEnforceRequestDeposit(true);
        (uint256 jobId, uint256 parseRequestId, uint256 proposalId) = _startPipeline();
        platform.setRequestDeposit(0.3 ether);

        platform.finalizeString(parseRequestId, "Proposal asks for 500K USDC for a Q3 community grants program.", 709);

        assertEq(governor.votes(proposalId, address(pipeline)), 0);
        assertEq(platform.nextRequestId(), 2);
        assertEq(pipeline.claimableRefunds(address(this)), 0.24 ether);

        (
            StewardUrlPipeline.PipelineState state,
            ResponseStatus parseStatus,
            ResponseStatus voteStatus,,
            uint256 voteRequestId,
            uint8 support,
            string memory summary,
            string memory reason,
            uint256 parseReceipt,
            uint256 voteReceipt
        ) = pipeline.jobOverview(jobId);

        assertEq(uint8(state), uint8(StewardUrlPipeline.PipelineState.Failed));
        assertEq(uint8(parseStatus), uint8(ResponseStatus.Success));
        assertEq(uint8(voteStatus), uint8(ResponseStatus.Failed));
        assertEq(voteRequestId, 0);
        assertEq(support, 0);
        assertEq(summary, "Proposal asks for 500K USDC for a Q3 community grants program.");
        assertEq(reason, "Vote decision request could not be created.");
        assertEq(parseReceipt, 709);
        assertEq(voteReceipt, 0);
    }

    function testInvalidVoteOutputFailsWithoutVoting() public {
        (, uint256 parseRequestId, uint256 proposalId) = _startPipeline();

        platform.finalizeString(parseRequestId, "Proposal forms a working group with unclear funding.", 801);
        platform.finalizeString(2, "MAYBE", 802);

        assertEq(governor.votes(proposalId, address(pipeline)), 0);
        (StewardUrlPipeline.PipelineState state,,,,,,, string memory reason,,) = pipeline.jobOverview(1);
        assertEq(uint8(state), uint8(StewardUrlPipeline.PipelineState.Failed));
        assertEq(reason, "MAYBE");
    }

    function testIncorrectDepositReverts() public {
        uint256 proposalId = governor.createProposal("Imported proposal from forum URL.", 7 days);
        uint256 expectedDeposit = pipeline.requiredDeposit();

        vm.expectRevert(
            abi.encodeWithSelector(StewardUrlPipeline.IncorrectDeposit.selector, expectedDeposit, 0.1 ether)
        );
        pipeline.startUrlVote{value: 0.1 ether}(
            address(governor),
            proposalId,
            "Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.",
            "https://forum.example/proposals/community-grants",
            false
        );
    }

    function testOverpaymentBecomesClaimableRefund() public {
        address requester = address(0xCAFE);
        vm.deal(requester, 2 ether);
        uint256 proposalId = governor.createProposal("Imported proposal from forum URL.", 7 days);
        uint256 deposit = pipeline.requiredDeposit();
        uint256 surplus = 0.05 ether;

        vm.prank(requester);
        (uint256 jobId,) = pipeline.startUrlVote{value: deposit + surplus}(
            address(governor),
            proposalId,
            "Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.",
            "https://forum.example/proposals/community-grants",
            false
        );

        assertEq(jobId, 1);
        assertEq(platform.lastValue(), 0.33 ether);
        assertEq(pipeline.claimableRefunds(requester), surplus);
        assertEq(address(pipeline).balance, pipeline.voteRequestDeposit() + surplus);

        uint256 balanceBefore = requester.balance;
        vm.prank(requester);
        pipeline.claimRefund();

        assertEq(requester.balance, balanceBefore + surplus);
        assertEq(pipeline.claimableRefunds(requester), 0);
    }

    function testUnauthorizedCallbackReverts() public {
        Response[] memory responses = new Response[](0);
        Request memory details;

        vm.expectRevert(abi.encodeWithSelector(StewardUrlPipeline.UnauthorizedCallback.selector, address(this)));
        pipeline.handleResponse(1, responses, ResponseStatus.Success, details);
    }

    function _startPipeline() internal returns (uint256 jobId, uint256 parseRequestId, uint256 proposalId) {
        return _startPipelineFor(address(this));
    }

    function _startPipelineFor(address requester)
        internal
        returns (uint256 jobId, uint256 parseRequestId, uint256 proposalId)
    {
        proposalId = governor.createProposal("Imported proposal from forum URL.", 7 days);
        uint256 requiredDeposit = pipeline.requiredDeposit();
        vm.prank(requester);
        (jobId, parseRequestId) = pipeline.startUrlVote{value: requiredDeposit}(
            address(governor),
            proposalId,
            "Vote YES for community grants under 1M, NO for team token unlocks, ABSTAIN if unclear.",
            "https://forum.example/proposals/community-grants",
            false
        );
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

contract NonPayableRequester {
    function start(
        StewardUrlPipeline pipeline,
        address governor,
        uint256 proposalId,
        string calldata criteriaText,
        string calldata proposalUrl,
        bool resolveUrl
    ) external payable returns (uint256 jobId, uint256 parseRequestId) {
        return pipeline.startUrlVote{value: msg.value}(governor, proposalId, criteriaText, proposalUrl, resolveUrl);
    }
}
