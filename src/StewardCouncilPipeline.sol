// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRequester, Request, Response, ResponseStatus} from "./interfaces/ISomniaAgents.sol";
import {ILLMInferenceAgent} from "./interfaces/ILLMInferenceAgent.sol";
import {IParseWebsiteAgent} from "./interfaces/IParseWebsiteAgent.sol";

interface ICouncilGovernor {
    function castVoteWithReason(uint256 proposalId, uint8 support, string calldata reason) external returns (uint256);
}

contract StewardCouncilPipeline {
    uint8 public constant VOTE_YES = 1;
    uint8 public constant VOTE_NO = 2;
    uint8 public constant VOTE_ABSTAIN = 3;

    uint8 public constant PARSE_NUM_PAGES = 3;
    uint8 public constant PARSE_CONFIDENCE_THRESHOLD = 70;
    uint256 public constant SUBCOMMITTEE_SIZE = 3;
    uint256 public constant REVIEWER_COUNT = 3;
    uint256 public constant PARSE_WEBSITE_COST_PER_AGENT = 0.1 ether;
    uint256 public constant LLM_INFERENCE_AGENT_BUDGET = 0.21 ether;

    enum CouncilState {
        None,
        WaitingForParse,
        WaitingForReviews,
        Cast,
        Failed
    }

    struct CouncilJob {
        address requester;
        address governor;
        uint256 proposalId;
        uint256 parseRequestId;
        CouncilState state;
        ResponseStatus parseStatus;
        uint8 finalSupport;
        uint8 yesCount;
        uint8 noCount;
        uint8 abstainCount;
        uint8 completedReviews;
        string criteriaText;
        string proposalUrl;
        string extractedSummary;
        string finalReason;
        uint256 parseReceipt;
        uint256 reviewerRequestDeposit;
    }

    struct ReviewerDecision {
        uint256 requestId;
        ResponseStatus status;
        uint8 support;
        string role;
        string reason;
        uint256 receipt;
        bool completed;
    }

    error InvalidAddress();
    error EmptyInput();
    error IncorrectDeposit(uint256 expected, uint256 actual);
    error UnauthorizedCallback(address caller);
    error UnknownRequest(uint256 requestId);
    error RequestAlreadySettled(uint256 requestId);
    error RequestMismatch(uint256 requestId, uint256 detailsId);
    error NoRefund(address account);

    IAgentRequester public immutable SOMNIA_AGENTS;
    uint256 public immutable PARSE_WEBSITE_AGENT_ID;
    uint256 public immutable LLM_AGENT_ID;

    uint256 public nextJobId = 1;

    mapping(uint256 jobId => CouncilJob job) public jobs;
    mapping(uint256 jobId => mapping(uint8 reviewerIndex => ReviewerDecision decision)) public reviewerDecisions;
    mapping(uint256 requestId => uint256 jobId) public jobForRequest;
    mapping(uint256 requestId => uint8 reviewerIndex) public reviewerForRequest;
    mapping(address account => uint256 amount) public claimableRefunds;

    event CouncilPipelineStarted(
        uint256 indexed jobId,
        uint256 indexed parseRequestId,
        address indexed governor,
        uint256 proposalId,
        string proposalUrl
    );
    event CouncilProposalParsed(
        uint256 indexed jobId,
        uint256 indexed parseRequestId,
        bytes32 summaryHash,
        string extractedSummary,
        uint256 receipt
    );
    event CouncilReviewerRequested(
        uint256 indexed jobId, uint256 indexed requestId, uint8 indexed reviewerIndex, string role, bytes32 summaryHash
    );
    event CouncilReviewerDecided(
        uint256 indexed jobId,
        uint256 indexed requestId,
        uint8 indexed reviewerIndex,
        uint8 support,
        string role,
        string reason,
        uint256 receipt
    );
    event CouncilVoteCast(
        uint256 indexed jobId,
        uint256 indexed proposalId,
        uint8 support,
        string finalReason,
        uint8 yesCount,
        uint8 noCount,
        uint8 abstainCount
    );
    event CouncilPipelineFailed(
        uint256 indexed jobId, uint256 indexed requestId, ResponseStatus platformStatus, string reason, uint256 receipt
    );
    event UnusedReviewDepositRecorded(uint256 indexed jobId, address indexed recipient, uint256 amount);
    event SurplusDepositRecorded(uint256 indexed jobId, address indexed recipient, uint256 amount);

    constructor(address somniaAgents_, uint256 parseWebsiteAgentId_, uint256 llmAgentId_) {
        if (somniaAgents_ == address(0) || parseWebsiteAgentId_ == 0 || llmAgentId_ == 0) revert InvalidAddress();
        SOMNIA_AGENTS = IAgentRequester(somniaAgents_);
        PARSE_WEBSITE_AGENT_ID = parseWebsiteAgentId_;
        LLM_AGENT_ID = llmAgentId_;
    }

    function requiredDeposit() public view returns (uint256) {
        (,,,, uint256 totalDeposit) = quoteCouncilVote();
        return totalDeposit;
    }

    function reviewerRequestDeposit() public view returns (uint256) {
        return SOMNIA_AGENTS.getRequestDeposit() + LLM_INFERENCE_AGENT_BUDGET;
    }

    function quoteCouncilVote()
        public
        view
        returns (
            uint256 platformDeposit,
            uint256 parseAgentBudget,
            uint256 parseDeposit,
            uint256 reviewDeposit,
            uint256 totalDeposit
        )
    {
        platformDeposit = SOMNIA_AGENTS.getRequestDeposit();
        parseAgentBudget = PARSE_WEBSITE_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
        parseDeposit = platformDeposit + parseAgentBudget;
        reviewDeposit = reviewerRequestDeposit() * REVIEWER_COUNT;
        totalDeposit = parseDeposit + reviewDeposit;
    }

    function claimRefund() external {
        uint256 amount = claimableRefunds[msg.sender];
        if (amount == 0) revert NoRefund(msg.sender);
        claimableRefunds[msg.sender] = 0;

        (bool success,) = msg.sender.call{value: amount}("");
        if (!success) {
            claimableRefunds[msg.sender] = amount;
            revert NoRefund(msg.sender);
        }
    }

    function jobOverview(uint256 jobId)
        external
        view
        returns (
            CouncilState state,
            ResponseStatus parseStatus,
            uint256 parseRequestId,
            uint8 finalSupport,
            uint8 yesCount,
            uint8 noCount,
            uint8 abstainCount,
            uint8 completedReviews,
            string memory extractedSummary,
            string memory finalReason,
            uint256 parseReceipt
        )
    {
        CouncilJob storage job = jobs[jobId];
        return (
            job.state,
            job.parseStatus,
            job.parseRequestId,
            job.finalSupport,
            job.yesCount,
            job.noCount,
            job.abstainCount,
            job.completedReviews,
            job.extractedSummary,
            job.finalReason,
            job.parseReceipt
        );
    }

    function startCouncilVote(
        address governor,
        uint256 proposalId,
        string calldata criteriaText,
        string calldata proposalUrl,
        bool resolveUrl
    ) external payable returns (uint256 jobId, uint256 parseRequestId) {
        if (governor == address(0)) revert InvalidAddress();
        if (bytes(criteriaText).length == 0 || bytes(proposalUrl).length == 0) revert EmptyInput();

        (,, uint256 parseDeposit,, uint256 expectedDeposit) = quoteCouncilVote();
        if (msg.value < expectedDeposit) revert IncorrectDeposit(expectedDeposit, msg.value);
        uint256 perReviewerDeposit = reviewerRequestDeposit();

        jobId = nextJobId++;
        bytes memory parsePayload = abi.encodeCall(
            IParseWebsiteAgent.ExtractString,
            (
                "proposal_summary",
                "A concise factual summary of the DAO proposal, including requested action and numeric amounts.",
                new string[](0),
                _buildParsePrompt(),
                proposalUrl,
                resolveUrl,
                PARSE_NUM_PAGES,
                PARSE_CONFIDENCE_THRESHOLD
            )
        );

        parseRequestId = SOMNIA_AGENTS.createRequest{value: parseDeposit}(
            PARSE_WEBSITE_AGENT_ID, address(this), this.handleResponse.selector, parsePayload
        );

        jobs[jobId] = CouncilJob({
            requester: msg.sender,
            governor: governor,
            proposalId: proposalId,
            parseRequestId: parseRequestId,
            state: CouncilState.WaitingForParse,
            parseStatus: ResponseStatus.Pending,
            finalSupport: 0,
            yesCount: 0,
            noCount: 0,
            abstainCount: 0,
            completedReviews: 0,
            criteriaText: criteriaText,
            proposalUrl: proposalUrl,
            extractedSummary: "",
            finalReason: "",
            parseReceipt: 0,
            reviewerRequestDeposit: perReviewerDeposit
        });
        jobForRequest[parseRequestId] = jobId;

        emit CouncilPipelineStarted(jobId, parseRequestId, governor, proposalId, proposalUrl);

        uint256 surplus = msg.value - expectedDeposit;
        if (surplus > 0) {
            claimableRefunds[msg.sender] += surplus;
            emit SurplusDepositRecorded(jobId, msg.sender, surplus);
        }
    }

    function handleResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external {
        if (msg.sender != address(SOMNIA_AGENTS)) revert UnauthorizedCallback(msg.sender);
        if (details.id != 0 && details.id != requestId) revert RequestMismatch(requestId, details.id);

        uint256 jobId = jobForRequest[requestId];
        CouncilJob storage job = jobs[jobId];
        if (job.state == CouncilState.None) revert UnknownRequest(requestId);

        if (requestId == job.parseRequestId) {
            _handleParseResponse(jobId, requestId, job, responses, status);
            return;
        }

        uint8 reviewerIndex = reviewerForRequest[requestId];
        if (reviewerIndex < REVIEWER_COUNT && reviewerDecisions[jobId][reviewerIndex].requestId == requestId) {
            _handleReviewerResponse(jobId, requestId, reviewerIndex, job, responses, status);
            return;
        }

        revert UnknownRequest(requestId);
    }

    function _handleParseResponse(
        uint256 jobId,
        uint256 requestId,
        CouncilJob storage job,
        Response[] memory responses,
        ResponseStatus status
    ) private {
        if (job.state != CouncilState.WaitingForParse) {
            revert RequestAlreadySettled(requestId);
        }
        job.parseStatus = status;

        if (status != ResponseStatus.Success) {
            _failJob(
                jobId,
                requestId,
                job,
                status,
                "URL proposal extraction did not finalize successfully.",
                _firstReceipt(responses)
            );
            _refundUnusedReviewDeposit(jobId, job);
            return;
        }

        (bytes memory result, uint256 receipt) = _firstSuccessfulResult(responses);
        if (result.length == 0) {
            _failJob(
                jobId, requestId, job, ResponseStatus.Failed, "URL proposal extraction returned no summary.", receipt
            );
            _refundUnusedReviewDeposit(jobId, job);
            return;
        }

        string memory summary = abi.decode(result, (string));
        job.extractedSummary = summary;
        job.parseReceipt = receipt;
        job.state = CouncilState.WaitingForReviews;

        emit CouncilProposalParsed(jobId, requestId, _hashString(summary), summary, receipt);

        for (uint8 i = 0; i < REVIEWER_COUNT; i++) {
            _requestReviewer(jobId, i, job, summary);
        }
    }

    function _requestReviewer(uint256 jobId, uint8 reviewerIndex, CouncilJob storage job, string memory summary)
        private
    {
        string memory role = _reviewerRole(reviewerIndex);
        bytes memory payload = abi.encodeCall(
            ILLMInferenceAgent.inferString,
            (
                _buildReviewerPrompt(role, job.criteriaText, summary, job.proposalUrl),
                _reviewerSystemPrompt(role),
                false,
                _allowedVoteOutputs()
            )
        );

        try SOMNIA_AGENTS.createRequest{value: job.reviewerRequestDeposit}(
            LLM_AGENT_ID, address(this), this.handleResponse.selector, payload
        ) returns (
            uint256 reviewRequestId
        ) {
            reviewerDecisions[jobId][reviewerIndex] = ReviewerDecision({
                requestId: reviewRequestId,
                status: ResponseStatus.Pending,
                support: 0,
                role: role,
                reason: "",
                receipt: 0,
                completed: false
            });
            jobForRequest[reviewRequestId] = jobId;
            reviewerForRequest[reviewRequestId] = reviewerIndex;

            emit CouncilReviewerRequested(jobId, reviewRequestId, reviewerIndex, role, _hashString(summary));
        } catch {
            _recordReviewerCreationFailure(jobId, reviewerIndex, job, role);
        }
    }

    function _handleReviewerResponse(
        uint256 jobId,
        uint256 requestId,
        uint8 reviewerIndex,
        CouncilJob storage job,
        Response[] memory responses,
        ResponseStatus status
    ) private {
        if (job.state != CouncilState.WaitingForReviews) {
            revert RequestAlreadySettled(requestId);
        }

        ReviewerDecision storage decision = reviewerDecisions[jobId][reviewerIndex];
        if (decision.completed) revert RequestAlreadySettled(requestId);

        decision.status = status;
        uint256 receipt = _firstReceipt(responses);
        string memory reason;
        uint8 support = VOTE_ABSTAIN;

        if (status == ResponseStatus.Success) {
            (bytes memory result, uint256 resultReceipt) = _firstSuccessfulResult(responses);
            if (resultReceipt != 0) receipt = resultReceipt;
            if (result.length > 0) {
                reason = abi.decode(result, (string));
                (bool parsed, uint8 parsedSupport) = _parseSupport(reason);
                if (parsed) support = parsedSupport;
            }
        }

        if (bytes(reason).length == 0) {
            reason = string.concat("ABSTAIN: ", decision.role, " reviewer failed or returned an invalid vote.");
            decision.status = status == ResponseStatus.Success ? ResponseStatus.Failed : status;
        }

        decision.support = support;
        decision.reason = reason;
        decision.receipt = receipt;
        decision.completed = true;

        if (support == VOTE_YES) {
            job.yesCount += 1;
        } else if (support == VOTE_NO) {
            job.noCount += 1;
        } else {
            job.abstainCount += 1;
        }
        job.completedReviews += 1;

        emit CouncilReviewerDecided(jobId, requestId, reviewerIndex, support, decision.role, reason, receipt);

        if (job.completedReviews == REVIEWER_COUNT) {
            _finalizeCouncil(jobId, job);
        }
    }

    function _recordReviewerCreationFailure(
        uint256 jobId,
        uint8 reviewerIndex,
        CouncilJob storage job,
        string memory role
    ) private {
        string memory reason = string.concat("ABSTAIN: ", role, " reviewer request could not be created.");

        reviewerDecisions[jobId][reviewerIndex] = ReviewerDecision({
            requestId: 0,
            status: ResponseStatus.Failed,
            support: VOTE_ABSTAIN,
            role: role,
            reason: reason,
            receipt: 0,
            completed: true
        });
        job.abstainCount += 1;
        job.completedReviews += 1;
        claimableRefunds[job.requester] += job.reviewerRequestDeposit;

        emit CouncilReviewerDecided(jobId, 0, reviewerIndex, VOTE_ABSTAIN, role, reason, 0);
        emit UnusedReviewDepositRecorded(jobId, job.requester, job.reviewerRequestDeposit);

        if (job.completedReviews == REVIEWER_COUNT) {
            _finalizeCouncil(jobId, job);
        }
    }

    function _finalizeCouncil(uint256 jobId, CouncilJob storage job) private {
        uint8 finalSupport = _majoritySupport(job.yesCount, job.noCount, job.abstainCount);
        string memory finalReason = _buildFinalReason(job.yesCount, job.noCount, job.abstainCount, finalSupport);

        try ICouncilGovernor(job.governor).castVoteWithReason(job.proposalId, finalSupport, finalReason) {
            job.state = CouncilState.Cast;
            job.finalSupport = finalSupport;
            job.finalReason = finalReason;

            emit CouncilVoteCast(
                jobId, job.proposalId, finalSupport, finalReason, job.yesCount, job.noCount, job.abstainCount
            );
        } catch {
            _failJob(jobId, 0, job, ResponseStatus.Failed, "Governor rejected council vote.", 0);
        }
    }

    function _majoritySupport(uint8 yesCount, uint8 noCount, uint8 abstainCount) private pure returns (uint8) {
        if (yesCount > noCount && yesCount > abstainCount) return VOTE_YES;
        if (noCount > yesCount && noCount > abstainCount) return VOTE_NO;
        if (abstainCount > yesCount && abstainCount > noCount) return VOTE_ABSTAIN;
        return VOTE_ABSTAIN;
    }

    function _buildParsePrompt() private pure returns (string memory) {
        return "Read the linked DAO proposal page. Extract the proposal title, requested action, funding amount or token amount if any, relevant dates, constraints, and decision-critical facts. Return a concise factual summary only.";
    }

    function _buildReviewerPrompt(
        string memory role,
        string memory criteriaText,
        string memory summary,
        string memory proposalUrl
    ) private pure returns (string memory) {
        return string.concat(
            "Reviewer role: ",
            role,
            "\n\nDelegated voting criteria: ",
            criteriaText,
            "\n\nProposal URL: ",
            proposalUrl,
            "\n\nExtracted proposal facts: ",
            summary,
            "\n\nChoose exactly one allowed value. Return the whole allowed value string, optionally followed by a short reason."
        );
    }

    function _reviewerSystemPrompt(string memory role) private pure returns (string memory) {
        return string.concat(
            "You are Steward's ",
            role,
            " reviewer in a DAO voting council. Apply only the delegate mandate and return YES, NO, or ABSTAIN."
        );
    }

    function _reviewerRole(uint8 index) private pure returns (string memory) {
        if (index == 0) return "budget";
        if (index == 1) return "risk";
        return "participation";
    }

    function _buildFinalReason(uint8 yesCount, uint8 noCount, uint8 abstainCount, uint8 support)
        private
        pure
        returns (string memory)
    {
        return string.concat(
            _supportText(support),
            ": Steward council majority: YES=",
            _uintToString(yesCount),
            ", NO=",
            _uintToString(noCount),
            ", ABSTAIN=",
            _uintToString(abstainCount),
            "."
        );
    }

    function _supportText(uint8 support) private pure returns (string memory) {
        if (support == VOTE_YES) return "YES";
        if (support == VOTE_NO) return "NO";
        return "ABSTAIN";
    }

    function _allowedVoteOutputs() private pure returns (string[] memory allowedValues) {
        allowedValues = new string[](3);
        allowedValues[0] = "YES";
        allowedValues[1] = "NO";
        allowedValues[2] = "ABSTAIN";
    }

    function _hashString(string memory value) private pure returns (bytes32 digest) {
        bytes memory data = bytes(value);
        assembly ("memory-safe") {
            digest := keccak256(add(data, 0x20), mload(data))
        }
    }

    function _parseSupport(string memory reason) private pure returns (bool parsed, uint8 support) {
        bytes memory data = bytes(reason);
        if (_startsWith(data, "YES")) return (true, VOTE_YES);
        if (_startsWith(data, "NO")) return (true, VOTE_NO);
        if (_startsWith(data, "ABSTAIN")) return (true, VOTE_ABSTAIN);
        return (false, 0);
    }

    function _startsWith(bytes memory data, bytes memory prefix) private pure returns (bool) {
        if (data.length < prefix.length) return false;
        for (uint256 i = 0; i < prefix.length; i++) {
            if (data[i] != prefix[i]) return false;
        }
        return true;
    }

    function _firstSuccessfulResult(Response[] memory responses)
        private
        pure
        returns (bytes memory result, uint256 receipt)
    {
        for (uint256 i = 0; i < responses.length; i++) {
            if (responses[i].status == ResponseStatus.Success && responses[i].result.length > 0) {
                return (responses[i].result, responses[i].receipt);
            }
        }
        return ("", 0);
    }

    function _firstReceipt(Response[] memory responses) private pure returns (uint256 receipt) {
        for (uint256 i = 0; i < responses.length; i++) {
            if (responses[i].receipt != 0) return responses[i].receipt;
        }
        return 0;
    }

    function _failJob(
        uint256 jobId,
        uint256 requestId,
        CouncilJob storage job,
        ResponseStatus platformStatus,
        string memory reason,
        uint256 receipt
    ) private {
        job.state = CouncilState.Failed;
        job.finalReason = reason;
        if (requestId == job.parseRequestId) {
            job.parseStatus = platformStatus;
            job.parseReceipt = receipt;
        }

        emit CouncilPipelineFailed(jobId, requestId, platformStatus, reason, receipt);
    }

    function _refundUnusedReviewDeposit(uint256 jobId, CouncilJob storage job) private {
        uint256 amount = job.reviewerRequestDeposit * REVIEWER_COUNT;
        claimableRefunds[job.requester] += amount;
        emit UnusedReviewDepositRecorded(jobId, job.requester, amount);
    }

    function _uintToString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";

        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            // Cast is safe: value % 10 is always in [0, 9], then shifted into ASCII digit range [48, 57].
            // forge-lint: disable-next-line(unsafe-typecast)
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }

        return string(buffer);
    }

    receive() external payable {}
}
