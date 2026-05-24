// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRequester, Request, Response, ResponseStatus} from "./interfaces/ISomniaAgents.sol";
import {ILLMInferenceAgent} from "./interfaces/ILLMInferenceAgent.sol";

interface IStewardGovernor {
    function proposalDescription(uint256 proposalId) external view returns (string memory description);
    function castVoteWithReason(uint256 proposalId, uint8 support, string calldata reason) external returns (uint256);
}

contract Steward {
    uint8 public constant VOTE_YES = 1;
    uint8 public constant VOTE_NO = 2;
    uint8 public constant VOTE_ABSTAIN = 3;

    enum RequestState {
        None,
        Pending,
        Cast,
        Failed
    }

    struct Delegation {
        address owner;
        address governor;
        bytes32 criteriaHash;
        string criteriaText;
        uint64 validUntil;
        bool revoked;
    }

    struct VoteRequest {
        uint256 delegationId;
        uint256 proposalId;
        RequestState state;
        ResponseStatus platformStatus;
        uint8 support;
        string reason;
        uint256 receipt;
    }

    error InvalidAddress();
    error InvalidDelegation(uint256 delegationId);
    error DelegationExpired(uint256 delegationId);
    error DelegationIsRevoked(uint256 delegationId);
    error NotDelegationOwner(uint256 delegationId, address caller);
    error ExistingVoteRequest(uint256 delegationId, uint256 proposalId, uint256 requestId);
    error UnauthorizedCallback(address caller);
    error UnknownRequest(uint256 requestId);
    error RequestAlreadySettled(uint256 requestId);
    error RequestMismatch(uint256 requestId, uint256 detailsId);

    IAgentRequester public immutable SOMNIA_AGENTS;
    uint256 public immutable LLM_AGENT_ID;

    uint256 public nextDelegationId = 1;

    mapping(uint256 delegationId => Delegation delegation) public delegations;
    mapping(uint256 requestId => VoteRequest voteRequest) public voteRequests;
    mapping(uint256 delegationId => mapping(uint256 proposalId => uint256 requestId)) public requestForProposal;

    event DelegationCreated(
        uint256 indexed delegationId,
        address indexed owner,
        address indexed governor,
        bytes32 criteriaHash,
        uint64 validUntil
    );
    event DelegationRevoked(uint256 indexed delegationId);
    event VoteRequested(
        uint256 indexed requestId,
        uint256 indexed delegationId,
        uint256 indexed proposalId,
        bytes32 proposalHash,
        uint256 value
    );
    event StewardVoteCast(
        uint256 indexed requestId,
        uint256 indexed delegationId,
        uint256 indexed proposalId,
        uint8 support,
        string reason,
        uint256 receipt
    );
    event StewardVoteFailed(
        uint256 indexed requestId,
        uint256 indexed delegationId,
        uint256 indexed proposalId,
        ResponseStatus platformStatus,
        string reason,
        uint256 receipt
    );

    constructor(address somniaAgents_, uint256 llmAgentId_) {
        if (somniaAgents_ == address(0) || llmAgentId_ == 0) revert InvalidAddress();
        SOMNIA_AGENTS = IAgentRequester(somniaAgents_);
        LLM_AGENT_ID = llmAgentId_;
    }

    function delegate(address governor, string calldata criteriaText, uint64 validUntil)
        external
        returns (uint256 delegationId)
    {
        if (governor == address(0)) revert InvalidAddress();
        if (validUntil != 0 && validUntil <= block.timestamp) revert DelegationExpired(0);

        delegationId = nextDelegationId++;
        bytes32 criteriaHash = _hashString(criteriaText);

        delegations[delegationId] = Delegation({
            owner: msg.sender,
            governor: governor,
            criteriaHash: criteriaHash,
            criteriaText: criteriaText,
            validUntil: validUntil,
            revoked: false
        });

        emit DelegationCreated(delegationId, msg.sender, governor, criteriaHash, validUntil);
    }

    function revokeDelegation(uint256 delegationId) external {
        Delegation storage delegation = _activeDelegation(delegationId);
        if (delegation.owner != msg.sender) revert NotDelegationOwner(delegationId, msg.sender);
        delegation.revoked = true;
        emit DelegationRevoked(delegationId);
    }

    function requestVote(uint256 delegationId, uint256 proposalId) external payable returns (uint256 requestId) {
        Delegation storage delegation = _activeDelegation(delegationId);

        uint256 existingRequestId = requestForProposal[delegationId][proposalId];
        if (existingRequestId != 0) revert ExistingVoteRequest(delegationId, proposalId, existingRequestId);

        string memory proposalText = IStewardGovernor(delegation.governor).proposalDescription(proposalId);
        string memory prompt = _buildPrompt(delegation.criteriaText, proposalText);
        string memory system = "You are Steward, an autonomous DAO voting delegate. Choose exactly one allowed value.";
        string[] memory allowedValues = _allowedVoteOutputs();

        bytes memory payload = abi.encodeCall(ILLMInferenceAgent.inferString, (prompt, system, false, allowedValues));

        requestId = SOMNIA_AGENTS.createRequest{value: msg.value}(
            LLM_AGENT_ID, address(this), this.handleResponse.selector, payload
        );

        requestForProposal[delegationId][proposalId] = requestId;
        voteRequests[requestId] = VoteRequest({
            delegationId: delegationId,
            proposalId: proposalId,
            state: RequestState.Pending,
            platformStatus: ResponseStatus.Pending,
            support: 0,
            reason: "",
            receipt: 0
        });

        emit VoteRequested(requestId, delegationId, proposalId, _hashString(proposalText), msg.value);
    }

    function handleResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external {
        if (msg.sender != address(SOMNIA_AGENTS)) revert UnauthorizedCallback(msg.sender);
        if (details.id != 0 && details.id != requestId) revert RequestMismatch(requestId, details.id);

        VoteRequest storage voteRequest = voteRequests[requestId];
        if (voteRequest.state == RequestState.None) revert UnknownRequest(requestId);
        if (voteRequest.state != RequestState.Pending) revert RequestAlreadySettled(requestId);

        voteRequest.platformStatus = status;

        if (status != ResponseStatus.Success) {
            _failVoteRequest(
                voteRequest,
                requestId,
                status,
                "Somnia agent request did not finalize successfully.",
                _firstReceipt(responses)
            );
            return;
        }

        (bytes memory result, uint256 receipt) = _firstSuccessfulResult(responses);
        if (result.length == 0) {
            _failVoteRequest(
                voteRequest, requestId, ResponseStatus.Failed, "Somnia agent returned no successful result.", receipt
            );
            return;
        }

        string memory reason = abi.decode(result, (string));
        (bool parsed, uint8 support) = _parseSupport(reason);
        if (!parsed) {
            _failVoteRequest(voteRequest, requestId, ResponseStatus.Failed, reason, receipt);
            return;
        }

        Delegation storage delegation = delegations[voteRequest.delegationId];
        try IStewardGovernor(delegation.governor).castVoteWithReason(voteRequest.proposalId, support, reason) {
            voteRequest.state = RequestState.Cast;
            voteRequest.support = support;
            voteRequest.reason = reason;
            voteRequest.receipt = receipt;

            emit StewardVoteCast(requestId, voteRequest.delegationId, voteRequest.proposalId, support, reason, receipt);
        } catch {
            _failVoteRequest(voteRequest, requestId, ResponseStatus.Failed, "Governor rejected Steward vote.", receipt);
        }
    }

    function _activeDelegation(uint256 delegationId) private view returns (Delegation storage delegation) {
        delegation = delegations[delegationId];
        if (delegation.owner == address(0)) revert InvalidDelegation(delegationId);
        if (delegation.revoked) revert DelegationIsRevoked(delegationId);
        if (delegation.validUntil != 0 && delegation.validUntil <= block.timestamp) {
            revert DelegationExpired(delegationId);
        }
    }

    function _buildPrompt(string memory criteriaText, string memory proposalText) private pure returns (string memory) {
        return string.concat(
            "Delegated voting criteria: ",
            criteriaText,
            "\n\nProposal: ",
            proposalText,
            "\n\nChoose exactly one allowed value. Return the whole allowed value string."
        );
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

    function _failVoteRequest(
        VoteRequest storage voteRequest,
        uint256 requestId,
        ResponseStatus platformStatus,
        string memory reason,
        uint256 receipt
    ) private {
        voteRequest.state = RequestState.Failed;
        voteRequest.platformStatus = platformStatus;
        voteRequest.reason = reason;
        voteRequest.receipt = receipt;

        emit StewardVoteFailed(
            requestId, voteRequest.delegationId, voteRequest.proposalId, platformStatus, reason, receipt
        );
    }

    receive() external payable {}
}
