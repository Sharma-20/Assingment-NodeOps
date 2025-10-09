// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./LiquidStakingVault.sol";

/**
 * @title GovernanceRootPublisher
 * @dev Creates governance proposals and publishes voting power snapshots
 * Handles proposal creation, snapshot taking, and root publishing for cross-chain voting
 */
contract GovernanceRootPublisher is Ownable {
    
    struct Proposal {
        uint256 id;
        string description;
        bytes actionData;
        bytes32 actionDataHash;
        uint256 snapshotBlock;
        uint256 exchangeRateSnapshot;
        bytes32 votingPowerRoot;
        bool rootPublished;
        bool executed;
        uint256 createdAt;
    }
    
    // Mapping from proposal ID to proposal
    mapping(uint256 => Proposal) public proposals;
    
    // Counter for proposal IDs
    uint256 private _nextProposalId = 1;
    
    // Reference to the liquid staking vault
    LiquidStakingVault public immutable vault;
    
    // Events
    event ProposalCreated(
        uint256 indexed proposalId,
        string description,
        bytes actionData,
        bytes32 actionDataHash,
        uint256 snapshotBlock,
        uint256 exchangeRateSnapshot
    );
    
    event VotingPowerRootPublished(
        uint256 indexed proposalId,
        bytes32 votingPowerRoot
    );
    
    event ProposalExecuted(
        uint256 indexed proposalId,
        bytes actionData
    );
    
    constructor(address _vault) Ownable(msg.sender) {
        vault = LiquidStakingVault(_vault);
    }
    
    /**
     * @dev Create a new governance proposal
     * @param description Human-readable description of the proposal
     * @param actionData Encoded action data to execute if proposal passes
     * @return proposalId ID of the created proposal
     */
    function createProposal(
        string memory description,
        bytes memory actionData
    ) external onlyOwner returns (uint256 proposalId) {
        require(bytes(description).length > 0, "Description cannot be empty");
        require(actionData.length > 0, "Action data cannot be empty");
        
        proposalId = _nextProposalId++;
        
        // Take snapshot of current state
        uint256 snapshotBlock = block.number;
        uint256 exchangeRateSnapshot = vault.exchangeRate();
        
        // Calculate action data hash
        bytes32 actionDataHash = keccak256(actionData);
        
        proposals[proposalId] = Proposal({
            id: proposalId,
            description: description,
            actionData: actionData,
            actionDataHash: actionDataHash,
            snapshotBlock: snapshotBlock,
            exchangeRateSnapshot: exchangeRateSnapshot,
            votingPowerRoot: bytes32(0),
            rootPublished: false,
            executed: false,
            createdAt: block.timestamp
        });
        
        emit ProposalCreated(
            proposalId,
            description,
            actionData,
            actionDataHash,
            snapshotBlock,
            exchangeRateSnapshot
        );
    }
    
    /**
     * @dev Publish voting power root for a proposal
     * @param proposalId ID of the proposal
     * @param votingPowerRoot Merkle root of voting power snapshot
     */
    function publishVotingPowerRoot(
        uint256 proposalId,
        bytes32 votingPowerRoot
    ) external onlyOwner {
        require(proposals[proposalId].id != 0, "Proposal does not exist");
        require(!proposals[proposalId].rootPublished, "Root already published");
        require(votingPowerRoot != bytes32(0), "Root cannot be zero");
        
        proposals[proposalId].votingPowerRoot = votingPowerRoot;
        proposals[proposalId].rootPublished = true;
        
        emit VotingPowerRootPublished(proposalId, votingPowerRoot);
    }
    
    /**
     * @dev Execute a proposal (called by GovernanceExecutor)
     * @param proposalId ID of the proposal to execute
     */
    function executeProposal(uint256 proposalId) external {
        require(proposals[proposalId].id != 0, "Proposal does not exist");
        require(proposals[proposalId].rootPublished, "Root not published");
        require(!proposals[proposalId].executed, "Proposal already executed");
        
        // Mark as executed
        proposals[proposalId].executed = true;
        
        emit ProposalExecuted(proposalId, proposals[proposalId].actionData);
    }
    
    /**
     * @dev Get proposal details
     * @param proposalId ID of the proposal
     * @return proposal Proposal struct
     */
    function getProposal(uint256 proposalId) external view returns (Proposal memory proposal) {
        require(proposals[proposalId].id != 0, "Proposal does not exist");
        return proposals[proposalId];
    }
    
    /**
     * @dev Get voting power for a user at a specific block
     * @param user User address
     * @param blockNumber Block number for snapshot
     * @return votingPower User's voting power at the snapshot
     */
    function getVotingPowerAtBlock(
        address user,
        uint256 blockNumber
    ) external view returns (uint256 votingPower) {
        // This would need to be implemented with proper block snapshots
        // For now, we'll use current state as a placeholder
        return vault.getVotingPower(user, blockNumber);
    }
    
    /**
     * @dev Get the next proposal ID
     */
    function nextProposalId() external view returns (uint256) {
        return _nextProposalId;
    }
    
    /**
     * @dev Check if a proposal exists
     * @param proposalId ID of the proposal
     * @return exists True if proposal exists
     */
    function proposalExists(uint256 proposalId) external view returns (bool exists) {
        return proposals[proposalId].id != 0;
    }
}
