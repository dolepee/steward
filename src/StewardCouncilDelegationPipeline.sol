// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICouncilPipeline {
    function requiredDeposit() external view returns (uint256);
    function startCouncilVote(
        address governor,
        uint256 proposalId,
        string calldata criteriaText,
        string calldata proposalUrl,
        bool resolveUrl
    ) external payable returns (uint256 jobId, uint256 parseRequestId);

    function claimRefund() external;
}

contract StewardCouncilDelegationPipeline {
    struct CouncilDelegation {
        address owner;
        address governor;
        bytes32 criteriaHash;
        string criteriaText;
        uint64 validUntil;
        bool revoked;
    }

    struct DelegatedCouncilExecution {
        uint256 delegationId;
        uint256 councilJobId;
        uint256 proposalId;
        uint256 parseRequestId;
        address executor;
        string proposalUrl;
    }

    error InvalidAddress();
    error EmptyInput();
    error InvalidDelegation(uint256 delegationId);
    error DelegationExpired(uint256 delegationId);
    error DelegationIsRevoked(uint256 delegationId);
    error NotDelegationOwner(uint256 delegationId, address caller);
    error ExistingDelegatedCouncilVote(uint256 delegationId, uint256 proposalId, uint256 councilJobId);
    error IncorrectDeposit(uint256 expected, uint256 actual);
    error NoRefund(address account);

    event CouncilDelegationCreated(
        uint256 indexed delegationId,
        address indexed owner,
        address indexed governor,
        bytes32 criteriaHash,
        uint64 validUntil
    );
    event CouncilDelegationRevoked(uint256 indexed delegationId);
    event DelegatedCouncilVoteStarted(
        uint256 indexed delegationId,
        uint256 indexed executionId,
        uint256 indexed councilJobId,
        uint256 proposalId,
        uint256 parseRequestId,
        address executor,
        string proposalUrl
    );
    event CouncilRefundRecorded(uint256 indexed councilJobId, address indexed recipient, uint256 amount);

    ICouncilPipeline public immutable COUNCIL_PIPELINE;

    uint256 public nextDelegationId = 1;
    uint256 public nextExecutionId = 1;

    mapping(uint256 delegationId => CouncilDelegation delegation) public delegations;
    mapping(uint256 delegationId => mapping(uint256 proposalId => uint256 councilJobId)) public
        councilJobForDelegationProposal;
    mapping(uint256 executionId => DelegatedCouncilExecution execution) public executions;
    mapping(uint256 councilJobId => address recipient) public refundRecipientForCouncilJob;
    mapping(address account => uint256 amount) public claimableRefunds;

    constructor(address councilPipeline) {
        if (councilPipeline == address(0)) revert InvalidAddress();
        COUNCIL_PIPELINE = ICouncilPipeline(councilPipeline);
    }

    receive() external payable {}

    function createCouncilDelegation(address governor, string calldata criteriaText, uint64 validUntil)
        external
        returns (uint256 delegationId)
    {
        if (governor == address(0)) revert InvalidAddress();
        if (bytes(criteriaText).length == 0) revert EmptyInput();
        if (validUntil != 0 && validUntil <= block.timestamp) revert DelegationExpired(0);

        delegationId = nextDelegationId++;
        bytes32 criteriaHash = _hashString(criteriaText);

        delegations[delegationId] = CouncilDelegation({
            owner: msg.sender,
            governor: governor,
            criteriaHash: criteriaHash,
            criteriaText: criteriaText,
            validUntil: validUntil,
            revoked: false
        });

        emit CouncilDelegationCreated(delegationId, msg.sender, governor, criteriaHash, validUntil);
    }

    function revokeCouncilDelegation(uint256 delegationId) external {
        CouncilDelegation storage delegation = _activeDelegation(delegationId);
        if (delegation.owner != msg.sender) revert NotDelegationOwner(delegationId, msg.sender);
        delegation.revoked = true;
        emit CouncilDelegationRevoked(delegationId);
    }

    function requiredDeposit() public view returns (uint256) {
        return COUNCIL_PIPELINE.requiredDeposit();
    }

    function executeDelegatedCouncilVote(
        uint256 delegationId,
        uint256 proposalId,
        string calldata proposalUrl,
        bool resolveUrl
    ) external payable returns (uint256 executionId, uint256 councilJobId, uint256 parseRequestId) {
        CouncilDelegation storage delegation = _activeDelegation(delegationId);
        if (bytes(proposalUrl).length == 0) revert EmptyInput();

        uint256 existingJobId = councilJobForDelegationProposal[delegationId][proposalId];
        if (existingJobId != 0) revert ExistingDelegatedCouncilVote(delegationId, proposalId, existingJobId);

        uint256 expectedDeposit = requiredDeposit();
        if (msg.value != expectedDeposit) revert IncorrectDeposit(expectedDeposit, msg.value);

        executionId = nextExecutionId++;
        (councilJobId, parseRequestId) = COUNCIL_PIPELINE.startCouncilVote{value: msg.value}(
            delegation.governor, proposalId, delegation.criteriaText, proposalUrl, resolveUrl
        );

        councilJobForDelegationProposal[delegationId][proposalId] = councilJobId;
        executions[executionId] = DelegatedCouncilExecution({
            delegationId: delegationId,
            councilJobId: councilJobId,
            proposalId: proposalId,
            parseRequestId: parseRequestId,
            executor: msg.sender,
            proposalUrl: proposalUrl
        });
        refundRecipientForCouncilJob[councilJobId] = msg.sender;

        emit DelegatedCouncilVoteStarted(
            delegationId, executionId, councilJobId, proposalId, parseRequestId, msg.sender, proposalUrl
        );
    }

    function claimCouncilRefund(uint256 councilJobId) external {
        address recipient = refundRecipientForCouncilJob[councilJobId];
        if (recipient == address(0)) revert InvalidDelegation(councilJobId);

        uint256 balanceBefore = address(this).balance;
        COUNCIL_PIPELINE.claimRefund();
        uint256 amount = address(this).balance - balanceBefore;
        if (amount == 0) revert NoRefund(address(this));

        claimableRefunds[recipient] += amount;
        emit CouncilRefundRecorded(councilJobId, recipient, amount);
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

    function jobOverview(uint256 executionId)
        external
        view
        returns (
            uint256 delegationId,
            uint256 councilJobId,
            uint256 proposalId,
            uint256 parseRequestId,
            address executor,
            string memory proposalUrl
        )
    {
        DelegatedCouncilExecution storage execution = executions[executionId];
        return (
            execution.delegationId,
            execution.councilJobId,
            execution.proposalId,
            execution.parseRequestId,
            execution.executor,
            execution.proposalUrl
        );
    }

    function _activeDelegation(uint256 delegationId) private view returns (CouncilDelegation storage delegation) {
        delegation = delegations[delegationId];
        if (delegation.owner == address(0)) revert InvalidDelegation(delegationId);
        if (delegation.revoked) revert DelegationIsRevoked(delegationId);
        if (delegation.validUntil != 0 && block.timestamp > delegation.validUntil) {
            revert DelegationExpired(delegationId);
        }
    }

    function _hashString(string memory value) private pure returns (bytes32 digest) {
        digest = keccak256(bytes(value));
    }
}
