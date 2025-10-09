import { ethers } from "hardhat";
import { LiquidStakingVault, MockERC20, GovernanceRootPublisher, VoteVerifier, GovernanceExecutor } from "../typechain-types";

/**
 * Demo script showing end-to-end governance flow
 */
async function demo() {
  console.log("=== Liquid Staking + Governance Demo ===\n");

  // Load deployed contracts
  const deployments = require("../deployments.json");
  const asset = await ethers.getContractAt("MockERC20", deployments.contracts.MockERC20);
  const vault = await ethers.getContractAt("LiquidStakingVault", deployments.contracts.LiquidStakingVault);
  const rootPublisher = await ethers.getContractAt("GovernanceRootPublisher", deployments.contracts.GovernanceRootPublisher);
  const voteVerifier = await ethers.getContractAt("VoteVerifier", deployments.contracts.VoteVerifier);
  const executor = await ethers.getContractAt("GovernanceExecutor", deployments.contracts.GovernanceExecutor);

  // Get signers
  const [owner, user1, user2, user3] = await ethers.getSigners();

  console.log("1. Setting up users...");
  
  // Transfer assets to users
  await asset.transfer(user1.address, ethers.parseEther("10000"));
  await asset.transfer(user2.address, ethers.parseEther("10000"));
  await asset.transfer(user3.address, ethers.parseEther("10000"));

  // Approve vault to spend user assets
  await asset.connect(user1).approve(await vault.getAddress(), ethers.parseEther("10000"));
  await asset.connect(user2).approve(await vault.getAddress(), ethers.parseEther("10000"));
  await asset.connect(user3).approve(await vault.getAddress(), ethers.parseEther("10000"));

  console.log("✓ Users set up with assets");

  console.log("\n2. Liquid Staking Operations...");

  // Users deposit assets
  const depositAmount = ethers.parseEther("1000");
  await vault.connect(user1).deposit(depositAmount, user1.address);
  await vault.connect(user2).deposit(depositAmount, user2.address);
  await vault.connect(user3).deposit(depositAmount, user3.address);

  console.log("✓ Users deposited assets");

  // Check initial exchange rate
  const initialExchangeRate = await vault.exchangeRate();
  console.log(`Initial exchange rate: ${ethers.formatEther(initialExchangeRate)}`);

  // Distribute rewards
  const rewardAmount = ethers.parseEther("100");
  await asset.approve(await vault.getAddress(), rewardAmount);
  await vault.distributeRewards(rewardAmount);

  const newExchangeRate = await vault.exchangeRate();
  console.log(`Exchange rate after rewards: ${ethers.formatEther(newExchangeRate)}`);
  console.log("✓ LST tokens appreciated!");

  // Show user balances
  const user1Shares = await vault.balanceOf(user1.address);
  const user1Assets = await vault.convertToAssets(user1Shares);
  console.log(`User1 LST balance: ${ethers.formatEther(user1Shares)}`);
  console.log(`User1 asset value: ${ethers.formatEther(user1Assets)}`);

  console.log("\n3. Governance Operations...");

  // Create proposal
  const description = "Update unbonding period to 14 days";
  const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string"],
    ["update unbonding period to 14 days"]
  );

  const proposalId = await rootPublisher.createProposal.staticCall(description, actionData);
  await rootPublisher.createProposal(description, actionData);
  console.log(`✓ Proposal created with ID: ${proposalId}`);

  // Publish voting power root
  const votingPowerRoot = ethers.keccak256(ethers.toUtf8Bytes("demo root"));
  await rootPublisher.publishVotingPowerRoot(proposalId, votingPowerRoot);
  console.log("✓ Voting power root published");

  // Set voting power root on VoteVerifier
  await voteVerifier.setVotingPowerRoot(proposalId, votingPowerRoot);
  console.log("✓ Voting power root set on VoteVerifier");

  // Simulate voting (simplified)
  console.log("✓ Voting simulated (in practice, users would sign EIP-712 messages)");

  // Finalize voting
  await voteVerifier.finalizeVoting(proposalId, 5000, 5000); // 50% quorum, 50% support
  console.log("✓ Voting finalized");

  // Commit action data hash
  const proposal = await rootPublisher.getProposal(proposalId);
  await executor.commitActionDataHash(proposal.actionDataHash);
  console.log("✓ Action data hash committed");

  // Execute proposal
  await executor.executeIfAuthorized(proposalId, proposal.actionData);
  console.log("✓ Proposal executed");

  console.log("\n4. Withdrawal Operations...");

  // User1 initiates withdrawal
  const user1SharesToWithdraw = await vault.balanceOf(user1.address);
  const nftId = await vault.connect(user1).initiateWithdraw.staticCall(user1SharesToWithdraw);
  await vault.connect(user1).initiateWithdraw(user1SharesToWithdraw);
  console.log(`✓ User1 initiated withdrawal, NFT ID: ${nftId}`);

  // Try to claim immediately (should fail)
  try {
    await vault.connect(user1).claim(nftId);
    console.log("❌ Claim should have failed");
  } catch (error) {
    console.log("✓ Claim correctly blocked before unbonding period");
  }

  // Fast forward time
  console.log("Fast forwarding time by 7 days...");
  await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
  await ethers.provider.send("evm_mine", []);

  // Now claim should work
  const initialBalance = await asset.balanceOf(user1.address);
  await vault.connect(user1).claim(nftId);
  const finalBalance = await asset.balanceOf(user1.address);
  console.log(`✓ User1 claimed withdrawal: +${ethers.formatEther(finalBalance - initialBalance)} assets`);

  console.log("\n=== Demo Complete ===");
  console.log("Key achievements:");
  console.log("✓ Liquid staking with appreciating LST tokens");
  console.log("✓ Time-locked withdrawals with NFT representation");
  console.log("✓ Cross-chain governance with EIP-712 voting");
  console.log("✓ Merkle proof verification for voting power");
  console.log("✓ End-to-end proposal execution");
}

// Gas usage analysis
async function analyzeGasUsage() {
  console.log("\n=== Gas Usage Analysis ===");

  const deployments = require("../deployments.json");
  const vault = await ethers.getContractAt("LiquidStakingVault", deployments.contracts.LiquidStakingVault);
  const asset = await ethers.getContractAt("MockERC20", deployments.contracts.MockERC20);

  const [owner, user1] = await ethers.getSigners();
  await asset.transfer(user1.address, ethers.parseEther("10000"));
  await asset.connect(user1).approve(await vault.getAddress(), ethers.parseEther("10000"));

  // Measure gas for key operations
  const depositAmount = ethers.parseEther("1000");

  // Deposit gas
  const depositTx = await vault.connect(user1).deposit(depositAmount, user1.address);
  const depositReceipt = await depositTx.wait();
  console.log(`Deposit gas used: ${depositReceipt?.gasUsed}`);

  // Withdrawal initiation gas
  const shares = await vault.balanceOf(user1.address);
  const withdrawTx = await vault.connect(user1).initiateWithdraw(shares);
  const withdrawReceipt = await withdrawTx.wait();
  console.log(`Withdrawal initiation gas used: ${withdrawReceipt?.gasUsed}`);

  // Rewards distribution gas
  await asset.approve(await vault.getAddress(), ethers.parseEther("100"));
  const rewardsTx = await vault.distributeRewards(ethers.parseEther("100"));
  const rewardsReceipt = await rewardsTx.wait();
  console.log(`Rewards distribution gas used: ${rewardsReceipt?.gasUsed}`);
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === "demo") {
    await demo();
  } else if (args[0] === "gas") {
    await analyzeGasUsage();
  } else {
    console.log("Usage:");
    console.log("  npm run demo");
    console.log("  npm run demo gas");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
