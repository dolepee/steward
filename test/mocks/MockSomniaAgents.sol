// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    ConsensusType,
    IAgentRequester,
    Request,
    Response,
    ResponseStatus
} from "../../src/interfaces/ISomniaAgents.sol";

interface IHelloSomniaCallback {
    function handleResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external;
}

contract MockSomniaAgents is IAgentRequester {
    uint256 public nextRequestId = 1;
    uint256 public lastAgentId;
    address public lastCallbackAddress;
    bytes4 public lastCallbackSelector;
    bytes public lastPayload;
    uint256 public lastValue;

    mapping(uint256 requestId => Request request) internal requests;
    mapping(uint256 requestId => uint256 agentId) public requestAgentIds;
    mapping(uint256 requestId => bytes payload) public requestPayloads;
    mapping(uint256 requestId => uint256 value) public requestValues;

    function createRequest(uint256 agentId, address callbackAddress, bytes4 callbackSelector, bytes calldata payload)
        external
        payable
        returns (uint256 requestId)
    {
        requestId = nextRequestId++;
        lastAgentId = agentId;
        lastCallbackAddress = callbackAddress;
        lastCallbackSelector = callbackSelector;
        lastPayload = payload;
        lastValue = msg.value;
        requestAgentIds[requestId] = agentId;
        requestPayloads[requestId] = payload;
        requestValues[requestId] = msg.value;

        Request storage stored = requests[requestId];
        stored.id = requestId;
        stored.requester = msg.sender;
        stored.callbackAddress = callbackAddress;
        stored.callbackSelector = callbackSelector;
        stored.status = ResponseStatus.Pending;
        stored.consensusType = ConsensusType.Majority;
        stored.threshold = 2;
        stored.createdAt = block.timestamp;
        stored.deadline = block.timestamp + 10 minutes;
        stored.remainingBudget = msg.value;
    }

    function finalizeString(uint256 requestId, string calldata result, uint256 receipt) external {
        Response[] memory responses = new Response[](1);
        responses[0] = Response({
            validator: address(0xBEEF),
            result: abi.encode(result),
            status: ResponseStatus.Success,
            receipt: receipt,
            timestamp: block.timestamp,
            executionCost: 1
        });

        Request memory details = requests[requestId];
        details.status = ResponseStatus.Success;
        details.responses = responses;
        details.responseCount = 1;

        IHelloSomniaCallback(details.callbackAddress)
            .handleResponse(requestId, responses, ResponseStatus.Success, details);
    }

    function fail(uint256 requestId, ResponseStatus status, uint256 receipt) external {
        Response[] memory responses = new Response[](1);
        responses[0] = Response({
            validator: address(0xBEEF),
            result: "",
            status: status,
            receipt: receipt,
            timestamp: block.timestamp,
            executionCost: 1
        });

        Request memory details = requests[requestId];
        details.status = status;
        details.responses = responses;
        details.failureCount = 1;

        IHelloSomniaCallback(details.callbackAddress).handleResponse(requestId, responses, status, details);
    }

    function createAdvancedRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload,
        uint256,
        uint256,
        ConsensusType,
        uint256
    ) external payable returns (uint256 requestId) {
        return this.createRequest{value: msg.value}(agentId, callbackAddress, callbackSelector, payload);
    }

    function getRequest(uint256 requestId) external view returns (Request memory) {
        return requests[requestId];
    }

    function hasRequest(uint256 requestId) external view returns (bool) {
        return requests[requestId].id != 0;
    }

    function getRequestDeposit() external pure returns (uint256) {
        return 0.03 ether;
    }

    function getAdvancedRequestDeposit(uint256) external pure returns (uint256) {
        return 0.03 ether;
    }
}
