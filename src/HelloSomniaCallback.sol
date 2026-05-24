// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRequester, Request, Response, ResponseStatus} from "./interfaces/ISomniaAgents.sol";
import {ILLMInferenceAgent} from "./interfaces/ILLMInferenceAgent.sol";

contract HelloSomniaCallback {
    enum LocalStatus {
        None,
        Pending,
        Resolved,
        Failed
    }

    struct Decision {
        bytes32 promptHash;
        address requester;
        LocalStatus status;
        ResponseStatus platformStatus;
        string response;
        uint256 receipt;
    }

    error InvalidAddress();
    error UnauthorizedCallback(address caller);
    error UnknownRequest(uint256 requestId);
    error RequestAlreadySettled(uint256 requestId);
    error RequestMismatch(uint256 requestId, uint256 detailsId);

    IAgentRequester public immutable SOMNIA_AGENTS;
    uint256 public immutable LLM_AGENT_ID;

    mapping(uint256 requestId => Decision decision) public decisions;

    event DecisionRequested(uint256 indexed requestId, address indexed requester, bytes32 promptHash, uint256 value);
    event DecisionResolved(uint256 indexed requestId, string response, uint256 receipt);
    event DecisionFailed(uint256 indexed requestId, ResponseStatus platformStatus, uint256 receipt);

    constructor(address somniaAgents_, uint256 llmAgentId_) {
        if (somniaAgents_ == address(0) || llmAgentId_ == 0) revert InvalidAddress();
        SOMNIA_AGENTS = IAgentRequester(somniaAgents_);
        LLM_AGENT_ID = llmAgentId_;
    }

    function requestDecision(string calldata prompt, string calldata system, string[] calldata allowedValues)
        external
        payable
        returns (uint256 requestId)
    {
        bytes memory payload = abi.encodeCall(ILLMInferenceAgent.inferString, (prompt, system, false, allowedValues));

        requestId = SOMNIA_AGENTS.createRequest{value: msg.value}(
            LLM_AGENT_ID, address(this), this.handleResponse.selector, payload
        );

        decisions[requestId] = Decision({
            promptHash: keccak256(bytes(prompt)),
            requester: msg.sender,
            status: LocalStatus.Pending,
            platformStatus: ResponseStatus.Pending,
            response: "",
            receipt: 0
        });

        emit DecisionRequested(requestId, msg.sender, keccak256(bytes(prompt)), msg.value);
    }

    function handleResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external {
        if (msg.sender != address(SOMNIA_AGENTS)) revert UnauthorizedCallback(msg.sender);
        if (details.id != 0 && details.id != requestId) revert RequestMismatch(requestId, details.id);

        Decision storage decision = decisions[requestId];
        if (decision.status == LocalStatus.None) revert UnknownRequest(requestId);
        if (decision.status != LocalStatus.Pending) revert RequestAlreadySettled(requestId);

        decision.platformStatus = status;

        if (status != ResponseStatus.Success) {
            decision.status = LocalStatus.Failed;
            emit DecisionFailed(requestId, status, _firstReceipt(responses));
            return;
        }

        (bytes memory result, uint256 receipt) = _firstSuccessfulResult(responses);
        if (result.length == 0) {
            decision.status = LocalStatus.Failed;
            emit DecisionFailed(requestId, ResponseStatus.Failed, receipt);
            return;
        }

        string memory response = abi.decode(result, (string));
        decision.status = LocalStatus.Resolved;
        decision.response = response;
        decision.receipt = receipt;

        emit DecisionResolved(requestId, response, receipt);
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

    receive() external payable {}
}
