import { ethers } from "hardhat";
import { VoteVerifier, GovernanceExecutor, GovernanceRootPublisher } from "../typechain-types";

/**
 * Relay governance events between chains
 */
async function relayEvents() {
  console.log("Relaying governance events...");

  // Load deployed contracts
  const deployments = require("../deployments.json");
  const voteVerifier = await ethers.getContractAt("VoteVerifier", deployments.contracts.VoteVerifier);
  const executor = await ethers.getContractAt("GovernanceExecutor", deployments.contracts.GovernanceExecutor);
  const rootPublisher = await ethers.getContractAt("GovernanceRootPublisher", deployments.contracts.GovernanceRootPublisher);

  // Load vote data
  const voteData = require("../votes.json");
  const snapshotData = require("../snapshot.json");

  console.log("=== Relay Process ===");

  // 1. Set voting power root on VoteVerifier
  console.log("1. Setting voting power root on VoteVerifier...");
  const proposalId = voteData.proposalId;
  const votingPowerRoot = snapshotData.root;
  
  try {
    await voteVerifier.setVotingPowerRoot(proposalId, votingPowerRoot);
    console.log("✓ Voting power root set");
  } catch (error) {
    console.log("Voting power root already set or error:", error);
  }

  // 2. Cast votes
  console.log("2. Casting votes...");
  for (const vote of voteData.votes) {
    try {
      // Get Merkle proof for this voter
      const holder = snapshotData.snapshot.find((item: any) => 
        item.address.toLowerCase() === vote.voter.toLowerCase()
      );

      if (holder) {
        // Generate Merkle proof (simplified)
        const proof = generateMerkleProof(holder, snapshotData.tree.leaves);
        
        // Cast vote
        await voteVerifier.castVote(
          {
            proposalId: vote.proposalId,
            voter: vote.voter,
            support: vote.support,
            votingPower: vote.votingPower,
            nonce: vote.nonce,
            deadline: vote.deadline
          },
          vote.signature,
          proof
        );
        
        console.log(`✓ Vote cast by ${vote.voter}`);
      }
    } catch (error) {
      console.log(`Error casting vote for ${vote.voter}:`, error);
    }
  }

  // 3. Finalize voting
  console.log("3. Finalizing voting...");
  try {
    await voteVerifier.finalizeVoting(proposalId, 5000, 5000); // 50% quorum, 50% support
    console.log("✓ Voting finalized");
  } catch (error) {
    console.log("Error finalizing voting:", error);
  }

  // 4. Commit action data hash
  console.log("4. Committing action data hash...");
  const proposal = await rootPublisher.getProposal(proposalId);
  try {
    await executor.commitActionDataHash(proposal.actionDataHash);
    console.log("✓ Action data hash committed");
  } catch (error) {
    console.log("Action data hash already committed or error:", error);
  }

  // 5. Execute proposal
  console.log("5. Executing proposal...");
  try {
    await executor.executeIfAuthorized(proposalId, proposal.actionData);
    console.log("✓ Proposal executed");
  } catch (error) {
    console.log("Error executing proposal:", error);
  }

  console.log("\n=== Relay Complete ===");
}

/**
 * Generate Merkle proof for a holder
 */
function generateMerkleProof(holder: any, leaves: string[]): string[] {
  // This is a simplified implementation
  // In practice, you'd use a proper Merkle tree library
  const { MerkleTree } = require("merkletreejs");
  const { keccak256 } = require("ethers");
  
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const leaf = keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint256"],
    [holder.address, holder.votingPower]
  ));
  
  const proof = tree.getProof(leaf);
  return proof.map(p => p.data);
}

/**
 * Monitor for ProposalPassed events
 */
async function monitorEvents() {
  console.log("Monitoring for ProposalPassed events...");
  
  const deployments = require("../deployments.json");
  const voteVerifier = await ethers.getContractAt("VoteVerifier", deployments.contracts.VoteVerifier);
  
  // Listen for ProposalPassed events
  voteVerifier.on("ProposalPassed", (proposalId, forVotes, againstVotes, abstainVotes, totalVotingPower) => {
    console.log("ProposalPassed event received:");
    console.log(`  Proposal ID: ${proposalId}`);
    console.log(`  For votes: ${ethers.formatEther(forVotes)}`);
    console.log(`  Against votes: ${ethers.formatEther(againstVotes)}`);
    console.log(`  Abstain votes: ${ethers.formatEther(abstainVotes)}`);
    console.log(`  Total voting power: ${ethers.formatEther(totalVotingPower)}`);
    
    // Trigger relay to Chain A
    relayToChainA(proposalId);
  });
}

/**
 * Relay proposal execution to Chain A
 */
async function relayToChainA(proposalId: number) {
  console.log(`Relaying proposal ${proposalId} to Chain A...`);
  
  const deployments = require("../deployments.json");
  const executor = await ethers.getContractAt("GovernanceExecutor", deployments.contracts.GovernanceExecutor);
  const rootPublisher = await ethers.getContractAt("GovernanceRootPublisher", deployments.contracts.GovernanceRootPublisher);
  
  try {
    const proposal = await rootPublisher.getProposal(proposalId);
    
    // Commit action data hash
    await executor.commitActionDataHash(proposal.actionDataHash);
    console.log("✓ Action data hash committed on Chain A");
    
    // Execute proposal
    await executor.executeIfAuthorized(proposalId, proposal.actionData);
    console.log("✓ Proposal executed on Chain A");
    
  } catch (error) {
    console.error("Error relaying to Chain A:", error);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === "relay") {
    await relayEvents();
  } else if (args[0] === "monitor") {
    await monitorEvents();
  } else {
    console.log("Usage:");
    console.log("  npm run relay events");
    console.log("  npm run relay monitor");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
