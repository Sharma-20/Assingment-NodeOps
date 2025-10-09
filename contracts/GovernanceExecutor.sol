// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./GovernanceRootPublisher.sol";

/**
 * @title GovernanceExecutor
 * @dev Executes governance proposals on Chain A after cross-chain verification
 * Handles proposal execution with action data hash verification
 */
contract GovernanceExecutor is Ownable, ReentrancyGuard {
    
    // Reference to the governance root publisher
    GovernanceRootPublisher public immutable rootPublisher;
    
    // Mapping from action data hash to commitment status
    mapping(bytes32 => bool) public committedActions;
    
    // Mapping from action data hash to execution status
    mapping(bytes32 => bool) public executedActions;
    
    // Events
    event ProposalExecuted(
        uint256 indexed proposalId,
        bytes32 actionDataHash,
        bytes actionData,
        address executor
    );
    
    event ActionDataHashCommitted(
        bytes32 indexed actionDataHash,
        uint256 timestamp
    );
    
    constructor(address _rootPublisher) Ownable(msg.sender) {
        rootPublisher = GovernanceRootPublisher(_rootPublisher);
    }
    
    /**
     * @dev Commit action data hash for execution
     * @param actionDataHash Hash of the action data to execute
     */
    function commitActionDataHash(bytes32 actionDataHash) external onlyOwner {
        require(actionDataHash != bytes32(0), "Action data hash cannot be zero");
        require(!executedActions[actionDataHash], "Action already executed");
        
        // Mark as committed
        committedActions[actionDataHash] = true;
        
        emit ActionDataHashCommitted(actionDataHash, block.timestamp);
    }
    
    /**
     * @dev Execute a proposal if authorized
     * @param proposalId ID of the proposal to execute
     * @param actionData Action data to execute
     */
    function executeIfAuthorized(
        uint256 proposalId,
        bytes memory actionData
    ) external nonReentrant {
        require(actionData.length > 0, "Action data cannot be empty");
        
        // Get proposal details
        GovernanceRootPublisher.Proposal memory proposal = rootPublisher.getProposal(proposalId);
        require(proposal.id != 0, "Proposal does not exist");
        require(proposal.rootPublished, "Root not published");
        require(!proposal.executed, "Proposal already executed");
        
        // Verify action data hash matches
        bytes32 actionDataHash = keccak256(actionData);
        require(actionDataHash == proposal.actionDataHash, "Action data hash mismatch");
        
        // Check if action has been committed
        require(committedActions[actionDataHash], "Action not committed");
        
        // Mark as executed in root publisher
        rootPublisher.executeProposal(proposalId);
        
        // Mark as executed locally
        executedActions[actionDataHash] = true;
        
        emit ProposalExecuted(proposalId, actionDataHash, actionData, msg.sender);
        
        // Execute the action data
        _executeAction(actionData);
    }
    
    /**
     * @dev Execute action data (internal function)
     * @param actionData Encoded action data to execute
     */
    function _executeAction(bytes memory actionData) internal {
        // Decode action data and execute
        // This is a simplified implementation - in practice, you'd decode
        // the action data and execute specific functions based on the action type
        
        // For example, if actionData contains a function call to update unbonding period:
        // (address target, bytes4 selector, bytes data) = abi.decode(actionData, (address, bytes4, bytes));
        // (bool success, ) = target.call(abi.encodePacked(selector, data));
        // require(success, "Action execution failed");
        
        // For now, we'll just emit an event to indicate execution
        // In a real implementation, you'd decode and execute the actual action
        emit ActionExecuted(actionData);
    }
    
    /**
     * @dev Check if an action has been executed
     * @param actionDataHash Hash of the action data
     * @return executed True if action has been executed
     */
    function isActionExecuted(bytes32 actionDataHash) external view returns (bool executed) {
        return executedActions[actionDataHash];
    }
    
    /**
     * @dev Get proposal details from root publisher
     * @param proposalId ID of the proposal
     * @return proposal Proposal struct
     */
    function getProposal(uint256 proposalId) external view returns (GovernanceRootPublisher.Proposal memory proposal) {
        return rootPublisher.getProposal(proposalId);
    }
    
    // Event for action execution (placeholder)
    event ActionExecuted(bytes actionData);
}
