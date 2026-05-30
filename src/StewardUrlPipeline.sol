// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRequester, Request, Response, ResponseStatus} from "./interfaces/ISomniaAgents.sol";
import {ILLMInferenceAgent} from "./interfaces/ILLMInferenceAgent.sol";
import {IParseWebsiteAgent} from "./interfaces/IParseWebsiteAgent.sol";

interface IUrlPipelineGovernor {
    function castVoteWithReason(uint256 proposalId, uint8 support, string calldata reason) external returns (uint256);
}

contract StewardUrlPipeline {
    uint8 public constant VOTE_YES = 1;
    uint8 public constant VOTE_NO = 2;
    uint8 public constant VOTE_ABSTAIN = 3;

    uint8 public constant PARSE_NUM_PAGES = 3;
    uint8 public constant PARSE_CONFIDENCE_THRESHOLD = 70;
    uint256 public constant SUBCOMMITTEE_SIZE = 3;
    uint256 public constant PARSE_WEBSITE_COST_PER_AGENT = 0.1 ether;
    uint256 public constant LLM_INFERENCE_AGENT_BUDGET = 0.21 ether;

    enum PipelineState {
        None,
        WaitingForParse,
        WaitingForVote,
        Cast,
        Failed
    }

    struct UrlPipelineJob {
        address requester;
        address governor;
        uint256 proposalId;
        uint256 parseRequestId;
        uint256 voteRequestId;
        PipelineState state;
        ResponseStatus parseStatus;
        ResponseStatus voteStatus;
        uint8 support;
        string criteriaText;
        string proposalUrl;
        string extractedSummary;
        string reason;
        uint256 parseReceipt;
        uint256 voteReceipt;
        uint256 voteRequestDeposit;
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

    mapping(uint256 jobId => UrlPipelineJob job) public jobs;
    mapping(uint256 requestId => uint256 jobId) public jobForRequest;
    mapping(address account => uint256 amount) public claimableRefunds;

    event UrlPipelineStarted(
        uint256 indexed jobId,
        uint256 indexed parseRequestId,
        address indexed governor,
        uint256 proposalId,
        string proposalUrl
    );
    event ProposalUrlParsed(
        uint256 indexed jobId,
        uint256 indexed parseRequestId,
        bytes32 summaryHash,
        string extractedSummary,
        uint256 receipt
    );
    event UrlVoteDecisionRequested(
        uint256 indexed jobId, uint256 indexed voteRequestId, bytes32 criteriaHash, bytes32 summaryHash
    );
    event UrlPipelineVoteCast(
        uint256 indexed jobId,
        uint256 indexed voteRequestId,
        uint256 indexed proposalId,
        uint8 support,
        string reason,
        uint256 receipt
    );
    event UrlPipelineFailed(
        uint256 indexed jobId, uint256 indexed requestId, ResponseStatus platformStatus, string reason, uint256 receipt
    );
    event UnusedVoteDepositRecorded(uint256 indexed jobId, address indexed recipient, uint256 amount);
    event SurplusDepositRecorded(uint256 indexed jobId, address indexed recipient, uint256 amount);

    constructor(address somniaAgents_, uint256 parseWebsiteAgentId_, uint256 llmAgentId_) {
        if (somniaAgents_ == address(0) || parseWebsiteAgentId_ == 0 || llmAgentId_ == 0) revert InvalidAddress();
        SOMNIA_AGENTS = IAgentRequester(somniaAgents_);
        PARSE_WEBSITE_AGENT_ID = parseWebsiteAgentId_;
        LLM_AGENT_ID = llmAgentId_;
    }

    function requiredDeposit() public view returns (uint256) {
        (,,,, uint256 totalDeposit) = quoteUrlVote();
        return totalDeposit;
    }

    function voteRequestDeposit() public view returns (uint256) {
        return SOMNIA_AGENTS.getRequestDeposit() + LLM_INFERENCE_AGENT_BUDGET;
    }

    function quoteUrlVote()
        public
        view
        returns (
            uint256 platformDeposit,
            uint256 parseAgentBudget,
            uint256 parseDeposit,
            uint256 voteDeposit,
            uint256 totalDeposit
        )
    {
        platformDeposit = SOMNIA_AGENTS.getRequestDeposit();
        parseAgentBudget = PARSE_WEBSITE_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
        parseDeposit = platformDeposit + parseAgentBudget;
        voteDeposit = voteRequestDeposit();
        totalDeposit = parseDeposit + voteDeposit;
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
            PipelineState state,
            ResponseStatus parseStatus,
            ResponseStatus voteStatus,
            uint256 parseRequestId,
            uint256 voteRequestId,
            uint8 support,
            string memory extractedSummary,
            string memory reason,
            uint256 parseReceipt,
            uint256 voteReceipt
        )
    {
        UrlPipelineJob storage job = jobs[jobId];
        return (
            job.state,
            job.parseStatus,
            job.voteStatus,
            job.parseRequestId,
            job.voteRequestId,
            job.support,
            job.extractedSummary,
            job.reason,
            job.parseReceipt,
            job.voteReceipt
        );
    }

    function startUrlVote(
        address governor,
        uint256 proposalId,
        string calldata criteriaText,
        string calldata proposalUrl,
        bool resolveUrl
    ) external payable returns (uint256 jobId, uint256 parseRequestId) {
        if (governor == address(0)) revert InvalidAddress();
        if (bytes(criteriaText).length == 0 || bytes(proposalUrl).length == 0) revert EmptyInput();

        (,, uint256 parseDeposit,, uint256 expectedDeposit) = quoteUrlVote();
        if (msg.value < expectedDeposit) revert IncorrectDeposit(expectedDeposit, msg.value);
        uint256 quotedVoteRequestDeposit = voteRequestDeposit();

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

        jobs[jobId] = UrlPipelineJob({
            requester: msg.sender,
            governor: governor,
            proposalId: proposalId,
            parseRequestId: parseRequestId,
            voteRequestId: 0,
            state: PipelineState.WaitingForParse,
            parseStatus: ResponseStatus.Pending,
            voteStatus: ResponseStatus.None,
            support: 0,
            criteriaText: criteriaText,
            proposalUrl: proposalUrl,
            extractedSummary: "",
            reason: "",
            parseReceipt: 0,
            voteReceipt: 0,
            voteRequestDeposit: quotedVoteRequestDeposit
        });
        jobForRequest[parseRequestId] = jobId;

        emit UrlPipelineStarted(jobId, parseRequestId, governor, proposalId, proposalUrl);

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
        UrlPipelineJob storage job = jobs[jobId];
        if (job.state == PipelineState.None) revert UnknownRequest(requestId);

        if (requestId == job.parseRequestId) {
            _handleParseResponse(jobId, requestId, job, responses, status);
            return;
        }

        if (requestId == job.voteRequestId) {
            _handleVoteResponse(jobId, requestId, job, responses, status);
            return;
        }

        revert UnknownRequest(requestId);
    }

    function _handleParseResponse(
        uint256 jobId,
        uint256 requestId,
        UrlPipelineJob storage job,
        Response[] memory responses,
        ResponseStatus status
    ) private {
        if (job.state != PipelineState.WaitingForParse) {
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
            _refundUnusedVoteDeposit(jobId, job);
            return;
        }

        (bytes memory result, uint256 receipt) = _firstSuccessfulResult(responses);
        if (result.length == 0) {
            _failJob(
                jobId, requestId, job, ResponseStatus.Failed, "URL proposal extraction returned no summary.", receipt
            );
            _refundUnusedVoteDeposit(jobId, job);
            return;
        }

        string memory summary = abi.decode(result, (string));
        job.extractedSummary = summary;
        job.parseReceipt = receipt;
        job.state = PipelineState.WaitingForVote;

        emit ProposalUrlParsed(jobId, requestId, _hashString(summary), summary, receipt);

        bytes memory votePayload = abi.encodeCall(
            ILLMInferenceAgent.inferString,
            (
                _buildVotePrompt(job.criteriaText, summary, job.proposalUrl),
                _systemPrompt(),
                false,
                _allowedVoteOutputs()
            )
        );

        try SOMNIA_AGENTS.createRequest{value: job.voteRequestDeposit}(
            LLM_AGENT_ID, address(this), this.handleResponse.selector, votePayload
        ) returns (
            uint256 voteRequestId
        ) {
            job.voteRequestId = voteRequestId;
            jobForRequest[voteRequestId] = jobId;

            emit UrlVoteDecisionRequested(jobId, voteRequestId, _hashString(job.criteriaText), _hashString(summary));
        } catch {
            _failJob(jobId, 0, job, ResponseStatus.Failed, "Vote decision request could not be created.", 0);
            claimableRefunds[job.requester] += job.voteRequestDeposit;
            emit UnusedVoteDepositRecorded(jobId, job.requester, job.voteRequestDeposit);
        }
    }

    function _handleVoteResponse(
        uint256 jobId,
        uint256 requestId,
        UrlPipelineJob storage job,
        Response[] memory responses,
        ResponseStatus status
    ) private {
        if (job.state != PipelineState.WaitingForVote) {
            revert RequestAlreadySettled(requestId);
        }
        job.voteStatus = status;

        if (status != ResponseStatus.Success) {
            _failJob(
                jobId,
                requestId,
                job,
                status,
                "Vote decision request did not finalize successfully.",
                _firstReceipt(responses)
            );
            return;
        }

        (bytes memory result, uint256 receipt) = _firstSuccessfulResult(responses);
        if (result.length == 0) {
            _failJob(
                jobId, requestId, job, ResponseStatus.Failed, "Vote decision returned no successful result.", receipt
            );
            return;
        }

        string memory reason = abi.decode(result, (string));
        (bool parsed, uint8 support) = _parseSupport(reason);
        if (!parsed) {
            _failJob(jobId, requestId, job, ResponseStatus.Failed, reason, receipt);
            return;
        }

        try IUrlPipelineGovernor(job.governor).castVoteWithReason(job.proposalId, support, reason) {
            job.state = PipelineState.Cast;
            job.support = support;
            job.reason = reason;
            job.voteReceipt = receipt;

            emit UrlPipelineVoteCast(jobId, requestId, job.proposalId, support, reason, receipt);
        } catch {
            _failJob(jobId, requestId, job, ResponseStatus.Failed, "Governor rejected URL-derived vote.", receipt);
        }
    }

    function _buildParsePrompt() private pure returns (string memory) {
        return "Read the linked DAO proposal page. Extract the actual proposal title, requested action, funding amount or token amount if any, and any decision-relevant facts. Return a concise factual summary only.";
    }

    function _buildVotePrompt(string memory criteriaText, string memory summary, string memory proposalUrl)
        private
        pure
        returns (string memory)
    {
        return string.concat(
            "Delegated voting criteria: ",
            criteriaText,
            "\n\nProposal URL: ",
            proposalUrl,
            "\n\nExtracted proposal facts: ",
            summary,
            "\n\nChoose exactly one allowed value. Return the whole allowed value string."
        );
    }

    function _systemPrompt() private pure returns (string memory) {
        return "You are Steward, an autonomous DAO voting delegate. Choose exactly one allowed value.";
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
        UrlPipelineJob storage job,
        ResponseStatus platformStatus,
        string memory reason,
        uint256 receipt
    ) private {
        job.state = PipelineState.Failed;
        job.reason = reason;
        if (requestId == job.parseRequestId) {
            job.parseStatus = platformStatus;
            job.parseReceipt = receipt;
        } else {
            job.voteStatus = platformStatus;
            job.voteReceipt = receipt;
        }

        emit UrlPipelineFailed(jobId, requestId, platformStatus, reason, receipt);
    }

    function _refundUnusedVoteDeposit(uint256 jobId, UrlPipelineJob storage job) private {
        claimableRefunds[job.requester] += job.voteRequestDeposit;
        emit UnusedVoteDepositRecorded(jobId, job.requester, job.voteRequestDeposit);
    }

    receive() external payable {}
}
