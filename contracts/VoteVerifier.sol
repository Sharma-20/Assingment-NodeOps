// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title VoteVerifier
 * @dev Verifies EIP-712 votes and Merkle proofs on Chain B
 * Handles vote verification, tallying, and proposal passing
 */
contract VoteVerifier is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    
    struct Vote {
        uint256 proposalId;
        address voter;
        uint8 support; // 0 = against, 1 = for, 2 = abstain
        uint256 votingPower;
        uint256 nonce;
        uint256 deadline;
    }
    
    struct ProposalVoting {
        uint256 proposalId;
        bytes32 votingPowerRoot;
        uint256 totalVotingPower;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        bool finalized;
        uint256 createdAt;
    }
    
    // EIP-712 domain separator
    bytes32 public constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    
    // Vote type hash for EIP-712
    bytes32 public constant VOTE_TYPEHASH = keccak256(
        "Vote(uint256 proposalId,address voter,uint8 support,uint256 votingPower,uint256 nonce,uint256 deadline)"
    );
    
    // Domain name and version
    string public constant DOMAIN_NAME = "VoteVerifier";
    string public constant DOMAIN_VERSION = "1";
    
    // Mapping from proposal ID to voting state
    mapping(uint256 => ProposalVoting) public proposals;
    
    // Mapping from proposal ID to voter address to vote hash (for double-voting prevention)
    mapping(uint256 => mapping(address => bytes32)) public voted;
    
    // Mapping from proposal ID to voter address to nonce (for replay protection)
    mapping(uint256 => mapping(address => uint256)) public nonces;
    
    // Events
    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        uint8 support,
        uint256 votingPower,
        bytes32 voteHash
    );
    
    event ProposalPassed(
        uint256 indexed proposalId,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes,
        uint256 totalVotingPower
    );
    
    event VotingPowerRootSet(
        uint256 indexed proposalId,
        bytes32 votingPowerRoot
    );
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @dev Set voting power root for a proposal
     * @param proposalId ID of the proposal
     * @param votingPowerRoot Merkle root of voting power snapshot
     */
    function setVotingPowerRoot(
        uint256 proposalId,
        bytes32 votingPowerRoot
    ) external onlyOwner {
        require(votingPowerRoot != bytes32(0), "Root cannot be zero");
        require(proposals[proposalId].votingPowerRoot == bytes32(0), "Root already set");
        
        proposals[proposalId] = ProposalVoting({
            proposalId: proposalId,
            votingPowerRoot: votingPowerRoot,
            totalVotingPower: 0,
            forVotes: 0,
            againstVotes: 0,
            abstainVotes: 0,
            finalized: false,
            createdAt: block.timestamp
        });
        
        emit VotingPowerRootSet(proposalId, votingPowerRoot);
    }
    
    /**
     * @dev Cast a vote with EIP-712 signature and Merkle proof
     * @param vote Vote struct containing vote data
     * @param signature EIP-712 signature
     * @param merkleProof Merkle proof for voting power verification
     */
    function castVote(
        Vote memory vote,
        bytes memory signature,
        bytes32[] memory merkleProof
    ) external {
        require(proposals[vote.proposalId].votingPowerRoot != bytes32(0), "Proposal not found");
        require(!proposals[vote.proposalId].finalized, "Voting finalized");
        require(block.timestamp <= vote.deadline, "Vote deadline passed");
        require(vote.support <= 2, "Invalid support value");
        
        // Verify EIP-712 signature
        bytes32 voteHash = _hashVote(vote);
        require(voteHash.recover(signature) == vote.voter, "Invalid signature");
        
        // Check for double voting
        require(voted[vote.proposalId][vote.voter] == bytes32(0), "Already voted");
        require(nonces[vote.proposalId][vote.voter] == vote.nonce, "Invalid nonce");
        
        // Verify voting power with Merkle proof
        require(
            _verifyVotingPower(vote.voter, vote.votingPower, merkleProof, proposals[vote.proposalId].votingPowerRoot),
            "Invalid voting power proof"
        );
        
        // Record vote
        voted[vote.proposalId][vote.voter] = voteHash;
        nonces[vote.proposalId][vote.voter] = vote.nonce + 1;
        
        // Update tallies
        proposals[vote.proposalId].totalVotingPower += vote.votingPower;
        
        if (vote.support == 1) {
            proposals[vote.proposalId].forVotes += vote.votingPower;
        } else if (vote.support == 0) {
            proposals[vote.proposalId].againstVotes += vote.votingPower;
        } else if (vote.support == 2) {
            proposals[vote.proposalId].abstainVotes += vote.votingPower;
        }
        
        emit VoteCast(vote.proposalId, vote.voter, vote.support, vote.votingPower, voteHash);
    }
    
    /**
     * @dev Finalize voting and check if proposal passed
     * @param proposalId ID of the proposal
     * @param quorumThreshold Minimum voting power required (in basis points)
     * @param supportThreshold Minimum support required (in basis points)
     */
    function finalizeVoting(
        uint256 proposalId,
        uint256 quorumThreshold,
        uint256 supportThreshold
    ) external onlyOwner {
        require(proposals[proposalId].votingPowerRoot != bytes32(0), "Proposal not found");
        require(!proposals[proposalId].finalized, "Already finalized");
        
        ProposalVoting storage proposal = proposals[proposalId];
        proposal.finalized = true;
        
        // Check quorum
        require(
            proposal.totalVotingPower >= (proposal.totalVotingPower * quorumThreshold) / 10000,
            "Quorum not met"
        );
        
        // Check support threshold
        require(
            proposal.forVotes >= (proposal.totalVotingPower * supportThreshold) / 10000,
            "Support threshold not met"
        );
        
        emit ProposalPassed(
            proposalId,
            proposal.forVotes,
            proposal.againstVotes,
            proposal.abstainVotes,
            proposal.totalVotingPower
        );
    }
    
    /**
     * @dev Get proposal voting state
     * @param proposalId ID of the proposal
     * @return proposal ProposalVoting struct
     */
    function getProposalVoting(uint256 proposalId) external view returns (ProposalVoting memory proposal) {
        require(proposals[proposalId].votingPowerRoot != bytes32(0), "Proposal not found");
        return proposals[proposalId];
    }
    
    /**
     * @dev Check if a voter has voted
     * @param proposalId ID of the proposal
     * @param voter Voter address
     * @return hasVoted True if voter has voted
     */
    function hasVoted(uint256 proposalId, address voter) external view returns (bool) {
        return voted[proposalId][voter] != bytes32(0);
    }
    
    /**
     * @dev Get voter's nonce for a proposal
     * @param proposalId ID of the proposal
     * @param voter Voter address
     * @return nonce Current nonce
     */
    function getNonce(uint256 proposalId, address voter) external view returns (uint256 nonce) {
        return nonces[proposalId][voter];
    }
    
    /**
     * @dev Hash a vote for EIP-712 signature verification
     * @param vote Vote struct
     * @return hash EIP-712 hash
     */
    function _hashVote(Vote memory vote) internal view returns (bytes32 hash) {
        bytes32 structHash = keccak256(
            abi.encode(
                VOTE_TYPEHASH,
                vote.proposalId,
                vote.voter,
                vote.support,
                vote.votingPower,
                vote.nonce,
                vote.deadline
            )
        );
        
        bytes32 domainSeparator = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes(DOMAIN_NAME)),
                keccak256(bytes(DOMAIN_VERSION)),
                block.chainid,
                address(this)
            )
        );
        
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }
    
    /**
     * @dev Verify voting power using Merkle proof
     * @param voter Voter address
     * @param votingPower Claimed voting power
     * @param merkleProof Merkle proof
     * @param root Merkle root
     * @return valid True if proof is valid
     */
    function _verifyVotingPower(
        address voter,
        uint256 votingPower,
        bytes32[] memory merkleProof,
        bytes32 root
    ) internal pure returns (bool valid) {
        bytes32 leaf = keccak256(abi.encodePacked(voter, votingPower));
        return _verifyMerkleProof(leaf, merkleProof, root);
    }
    
    /**
     * @dev Verify Merkle proof
     * @param leaf Leaf hash
     * @param proof Merkle proof
     * @param root Merkle root
     * @return valid True if proof is valid
     */
    function _verifyMerkleProof(
        bytes32 leaf,
        bytes32[] memory proof,
        bytes32 root
    ) internal pure returns (bool valid) {
        bytes32 computedHash = leaf;
        
        for (uint256 i = 0; i < proof.length; i++) {
            if (computedHash < proof[i]) {
                computedHash = keccak256(abi.encodePacked(computedHash, proof[i]));
            } else {
                computedHash = keccak256(abi.encodePacked(proof[i], computedHash));
            }
        }
        
        return computedHash == root;
    }
}
