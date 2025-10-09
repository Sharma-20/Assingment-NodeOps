import { ethers } from "hardhat";
import { LiquidStakingVault, MockERC20 } from "../typechain-types";
import { MerkleTree } from "merkletreejs";
import { keccak256 } from "ethers";

interface VotingPowerSnapshot {
  address: string;
  votingPower: bigint;
}

/**
 * Build voting power snapshot for governance
 */
async function buildSnapshot() {
  console.log("Building voting power snapshot...");

  // Load deployed contracts
  const deployments = require("../deployments.json");
  const vault = await ethers.getContractAt("LiquidStakingVault", deployments.contracts.LiquidStakingVault);
  const asset = await ethers.getContractAt("MockERC20", deployments.contracts.MockERC20);

  // Get current block number
  const currentBlock = await ethers.provider.getBlockNumber();
  console.log("Snapshot block:", currentBlock);

  // Get all holders (simplified - in practice, you'd query events or use a more sophisticated method)
  const holders = [
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // Hardhat account 0
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // Hardhat account 1
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // Hardhat account 2
  ];

  const snapshot: VotingPowerSnapshot[] = [];

  for (const holder of holders) {
    try {
      // Get asset balance
      const assetBalance = await asset.balanceOf(holder);
      
      // Get LST balance
      const lstBalance = await vault.balanceOf(holder);
      
      // Get exchange rate
      const exchangeRate = await vault.exchangeRate();
      
      // Calculate voting power: assets + floor(LST * exchange rate / 1e18)
      const lstVotingPower = (lstBalance * exchangeRate) / ethers.parseEther("1");
      const totalVotingPower = assetBalance + lstVotingPower;
      
      if (totalVotingPower > 0) {
        snapshot.push({
          address: holder,
          votingPower: totalVotingPower
        });
        
        console.log(`Holder: ${holder}`);
        console.log(`  Asset balance: ${ethers.formatEther(assetBalance)}`);
        console.log(`  LST balance: ${ethers.formatEther(lstBalance)}`);
        console.log(`  Exchange rate: ${ethers.formatEther(exchangeRate)}`);
        console.log(`  Total voting power: ${ethers.formatEther(totalVotingPower)}`);
        console.log("");
      }
    } catch (error) {
      console.log(`Error getting balance for ${holder}:`, error);
    }
  }

  // Build Merkle tree
  const leaves = snapshot.map(item => 
    keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256"],
      [item.address, item.votingPower]
    ))
  );

  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root = tree.getRoot();

  console.log("=== Snapshot Summary ===");
  console.log(`Total holders: ${snapshot.length}`);
  console.log(`Total voting power: ${ethers.formatEther(
    snapshot.reduce((sum, item) => sum + item.votingPower, 0n)
  )}`);
  console.log(`Merkle root: ${root}`);

  // Save snapshot data
  const snapshotData = {
    blockNumber: currentBlock,
    timestamp: Date.now(),
    root: root,
    snapshot: snapshot,
    tree: {
      root: root,
      leaves: leaves
    }
  };

  const fs = require('fs');
  fs.writeFileSync('snapshot.json', JSON.stringify(snapshotData, (key, value) => 
    typeof value === 'bigint' ? value.toString() : value, 2
  ));

  console.log("Snapshot saved to snapshot.json");
  return snapshotData;
}

/**
 * Generate Merkle proof for a specific address
 */
async function generateProof(address: string, snapshotData: any) {
  const tree = new MerkleTree(snapshotData.tree.leaves, keccak256, { sortPairs: true });
  
  // Find the holder in snapshot
  const holder = snapshotData.snapshot.find((item: any) => item.address.toLowerCase() === address.toLowerCase());
  if (!holder) {
    throw new Error("Address not found in snapshot");
  }

  const leaf = keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint256"],
    [holder.address, holder.votingPower]
  ));

  const proof = tree.getProof(leaf);
  const proofHex = proof.map(p => p.data);

  console.log(`Proof for ${address}:`);
  console.log(`Voting power: ${ethers.formatEther(holder.votingPower)}`);
  console.log(`Proof: ${JSON.stringify(proofHex)}`);

  return {
    address: holder.address,
    votingPower: holder.votingPower,
    proof: proofHex
  };
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === "build") {
    await buildSnapshot();
  } else if (args[0] === "proof" && args[1]) {
    const snapshotData = require("../snapshot.json");
    await generateProof(args[1], snapshotData);
  } else {
    console.log("Usage:");
    console.log("  npm run snapshot build");
    console.log("  npm run snapshot proof <address>");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

