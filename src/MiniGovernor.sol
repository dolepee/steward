// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MiniGovernor {
    uint8 public constant VOTE_YES = 1;
    uint8 public constant VOTE_NO = 2;
    uint8 public constant VOTE_ABSTAIN = 3;

    struct Proposal {
        address proposer;
        string description;
        uint64 createdAt;
        uint64 deadline;
        uint256 yesVotes;
        uint256 noVotes;
        uint256 abstainVotes;
    }

    error UnknownProposal(uint256 proposalId);
    error VotingClosed(uint256 proposalId);
    error AlreadyVoted(uint256 proposalId, address voter);
    error InvalidSupport(uint8 support);

    uint256 public nextProposalId = 1;

    mapping(uint256 proposalId => Proposal proposal) public proposals;
    mapping(uint256 proposalId => mapping(address voter => uint8 support)) public votes;

    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, string description, uint64 deadline);
    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        uint8 support,
        string reason,
        uint256 yesVotes,
        uint256 noVotes,
        uint256 abstainVotes
    );

    function createProposal(string calldata description, uint64 votingPeriod) external returns (uint256 proposalId) {
        proposalId = nextProposalId++;
        uint64 deadline = uint64(block.timestamp) + votingPeriod;

        proposals[proposalId] = Proposal({
            proposer: msg.sender,
            description: description,
            createdAt: uint64(block.timestamp),
            deadline: deadline,
            yesVotes: 0,
            noVotes: 0,
            abstainVotes: 0
        });

        emit ProposalCreated(proposalId, msg.sender, description, deadline);
    }

    function castVoteWithReason(uint256 proposalId, uint8 support, string calldata reason)
        external
        returns (uint256 weight)
    {
        Proposal storage proposal = proposals[proposalId];
        if (proposal.proposer == address(0)) revert UnknownProposal(proposalId);
        if (block.timestamp > proposal.deadline) revert VotingClosed(proposalId);
        if (votes[proposalId][msg.sender] != 0) revert AlreadyVoted(proposalId, msg.sender);
        if (support != VOTE_YES && support != VOTE_NO && support != VOTE_ABSTAIN) revert InvalidSupport(support);

        votes[proposalId][msg.sender] = support;
        weight = 1;

        if (support == VOTE_YES) {
            proposal.yesVotes += weight;
        } else if (support == VOTE_NO) {
            proposal.noVotes += weight;
        } else {
            proposal.abstainVotes += weight;
        }

        emit VoteCast(
            proposalId, msg.sender, support, reason, proposal.yesVotes, proposal.noVotes, proposal.abstainVotes
        );
    }

    function proposalDescription(uint256 proposalId) external view returns (string memory description) {
        Proposal storage proposal = proposals[proposalId];
        if (proposal.proposer == address(0)) revert UnknownProposal(proposalId);
        return proposal.description;
    }
}
