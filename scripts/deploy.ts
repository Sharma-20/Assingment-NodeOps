const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying contracts...");

  // Get signers
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy MockERC20
  console.log("\nDeploying MockERC20...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const asset = await MockERC20.deploy("Test Asset", "TA", ethers.parseEther("1000000"));
  await asset.waitForDeployment();
  console.log("MockERC20 deployed to:", await asset.getAddress());

  // Deploy WithdrawalNFT
  console.log("\nDeploying WithdrawalNFT...");
  const WithdrawalNFT = await ethers.getContractFactory("WithdrawalNFT");
  const withdrawalNFT = await WithdrawalNFT.deploy();
  await withdrawalNFT.waitForDeployment();
  console.log("WithdrawalNFT deployed to:", await withdrawalNFT.getAddress());

  // Deploy LiquidStakingVault
  console.log("\nDeploying LiquidStakingVault...");
  const LiquidStakingVault = await ethers.getContractFactory("LiquidStakingVault");
  const vault = await LiquidStakingVault.deploy(
    await asset.getAddress(),
    await withdrawalNFT.getAddress(),
    "Liquid Staking Token",
    "LST"
  );
  await vault.waitForDeployment();
  console.log("LiquidStakingVault deployed to:", await vault.getAddress());

  // Transfer ownership of WithdrawalNFT to LiquidStakingVault
  console.log("\nTransferring WithdrawalNFT ownership to LiquidStakingVault...");
  await withdrawalNFT.transferOwnership(await vault.getAddress());
  console.log("✓ Ownership transferred");

  // Deploy GovernanceRootPublisher
  console.log("\nDeploying GovernanceRootPublisher...");
  const GovernanceRootPublisher = await ethers.getContractFactory("GovernanceRootPublisher");
  const rootPublisher = await GovernanceRootPublisher.deploy(await vault.getAddress());
  await rootPublisher.waitForDeployment();
  console.log("GovernanceRootPublisher deployed to:", await rootPublisher.getAddress());

  // Deploy VoteVerifier
  console.log("\nDeploying VoteVerifier...");
  const VoteVerifier = await ethers.getContractFactory("VoteVerifier");
  const voteVerifier = await VoteVerifier.deploy();
  await voteVerifier.waitForDeployment();
  console.log("VoteVerifier deployed to:", await voteVerifier.getAddress());

  // Deploy GovernanceExecutor
  console.log("\nDeploying GovernanceExecutor...");
  const GovernanceExecutor = await ethers.getContractFactory("GovernanceExecutor");
  const executor = await GovernanceExecutor.deploy(await rootPublisher.getAddress());
  await executor.waitForDeployment();
  console.log("GovernanceExecutor deployed to:", await executor.getAddress());

  console.log("\n=== Deployment Summary ===");
  console.log("MockERC20:", await asset.getAddress());
  console.log("WithdrawalNFT:", await withdrawalNFT.getAddress());
  console.log("LiquidStakingVault:", await vault.getAddress());
  console.log("GovernanceRootPublisher:", await rootPublisher.getAddress());
  console.log("VoteVerifier:", await voteVerifier.getAddress());
  console.log("GovernanceExecutor:", await executor.getAddress());

  // Save deployment addresses
  const deploymentInfo = {
    network: "localhost",
    contracts: {
      MockERC20: await asset.getAddress(),
      WithdrawalNFT: await withdrawalNFT.getAddress(),
      LiquidStakingVault: await vault.getAddress(),
      GovernanceRootPublisher: await rootPublisher.getAddress(),
      VoteVerifier: await voteVerifier.getAddress(),
      GovernanceExecutor: await executor.getAddress()
    }
  };

  const fs = require('fs');
  fs.writeFileSync('deployments.json', JSON.stringify(deploymentInfo, null, 2));
  console.log("\nDeployment info saved to deployments.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
