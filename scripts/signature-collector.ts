import { ethers } from "hardhat";
import { VoteVerifier } from "../typechain-types";

interface VoteData {
  proposalId: number;
  voter: string;
  support: number;
  votingPower: bigint;
  nonce: number;
  deadline: number;
}

/**
 * Collect EIP-712 signatures for voting
 */
async function collectSignatures() {
  console.log("Collecting EIP-712 signatures for voting...");

  // Load deployed contracts
  const deployments = require("../deployments.json");
  const voteVerifier = await ethers.getContractAt("VoteVerifier", deployments.contracts.VoteVerifier);

  // Load snapshot data
  const snapshotData = require("../snapshot.json");

  // Get signers
  const [signer1, signer2, signer3] = await ethers.getSigners();

  const votes: VoteData[] = [];
  const signatures: string[] = [];

  // Create vote data for each signer
  const signers = [signer1, signer2, signer3];
  const proposalId = 1; // Example proposal ID
  const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days from now

  for (let i = 0; i < signers.length; i++) {
    const signer = signers[i];
    const address = await signer.getAddress();
    
    // Find voting power in snapshot
    const holder = snapshotData.snapshot.find((item: any) => 
      item.address.toLowerCase() === address.toLowerCase()
    );

    if (holder) {
      const voteData: VoteData = {
        proposalId,
        voter: address,
        support: i === 0 ? 1 : 0, // First signer votes for, others vote against
        votingPower: BigInt(holder.votingPower),
        nonce: 0,
        deadline
      };

      // Create EIP-712 signature
      const signature = await signVote(signer, voteData);
      
      votes.push(voteData);
      signatures.push(signature);
      
      console.log(`Vote from ${address}:`);
      console.log(`  Support: ${voteData.support}`);
      console.log(`  Voting power: ${ethers.formatEther(voteData.votingPower)}`);
      console.log(`  Signature: ${signature}`);
      console.log("");
    }
  }

  // Save vote data
  const voteData = {
    proposalId,
    votes: votes.map((vote, index) => ({
      ...vote,
      signature: signatures[index]
    }))
  };

  const fs = require('fs');
  fs.writeFileSync('votes.json', JSON.stringify(voteData, (key, value) => 
    typeof value === 'bigint' ? value.toString() : value, 2
  ));

  console.log("Vote data saved to votes.json");
  return voteData;
}

/**
 * Sign a vote using EIP-712
 */
async function signVote(signer: any, voteData: VoteData): Promise<string> {
  // Get domain separator from contract
  const voteVerifier = await ethers.getContractAt("VoteVerifier", "0x0000000000000000000000000000000000000000");
  
  // Create EIP-712 domain
  const domain = {
    name: "VoteVerifier",
    version: "1",
    chainId: await ethers.provider.getNetwork().then(n => n.chainId),
    verifyingContract: "0x0000000000000000000000000000000000000000" // Will be set to actual address
  };

  // Create vote type
  const types = {
    Vote: [
      { name: "proposalId", type: "uint256" },
      { name: "voter", type: "address" },
      { name: "support", type: "uint8" },
      { name: "votingPower", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" }
    ]
  };

  // Create message
  const message = {
    proposalId: voteData.proposalId,
    voter: voteData.voter,
    support: voteData.support,
    votingPower: voteData.votingPower,
    nonce: voteData.nonce,
    deadline: voteData.deadline
  };

  // Sign the message
  const signature = await signer.signTypedData(domain, types, message);
  return signature;
}

/**
 * Verify a signature
 */
async function verifySignature(voteData: VoteData, signature: string, expectedSigner: string): Promise<boolean> {
  try {
    // Recover the signer from signature
    const messageHash = ethers.TypedDataEncoder.hash(
      {
        name: "VoteVerifier",
        version: "1",
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: "0x0000000000000000000000000000000000000000"
      },
      {
        Vote: [
          { name: "proposalId", type: "uint256" },
          { name: "voter", type: "address" },
          { name: "support", type: "uint8" },
          { name: "votingPower", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      },
      {
        proposalId: voteData.proposalId,
        voter: voteData.voter,
        support: voteData.support,
        votingPower: voteData.votingPower,
        nonce: voteData.nonce,
        deadline: voteData.deadline
      }
    );

    const recoveredAddress = ethers.verifyMessage(ethers.getBytes(messageHash), signature);
    return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
  } catch (error) {
    console.error("Signature verification failed:", error);
    return false;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === "collect") {
    await collectSignatures();
  } else if (args[0] === "verify" && args[1]) {
    const voteData = require("../votes.json");
    const vote = voteData.votes.find((v: any) => v.voter.toLowerCase() === args[1].toLowerCase());
    if (vote) {
      const isValid = await verifySignature(vote, vote.signature, vote.voter);
      console.log(`Signature valid: ${isValid}`);
    } else {
      console.log("Vote not found for address:", args[1]);
    }
  } else {
    console.log("Usage:");
    console.log("  npm run signatures collect");
    console.log("  npm run signatures verify <address>");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
