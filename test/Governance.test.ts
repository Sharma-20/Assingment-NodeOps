import { expect } from "chai";
import { ethers } from "hardhat";
import { 
  LiquidStakingVault, 
  WithdrawalNFT, 
  GovernanceRootPublisher, 
  VoteVerifier, 
  GovernanceExecutor,
  MockERC20 
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Governance Flow", function () {
  let vault: LiquidStakingVault;
  let withdrawalNFT: WithdrawalNFT;
  let rootPublisher: GovernanceRootPublisher;
  let voteVerifier: VoteVerifier;
  let executor: GovernanceExecutor;
  let asset: MockERC20;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const DEPOSIT_AMOUNT = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();

    // Deploy mock ERC20 asset
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    asset = await MockERC20Factory.deploy("Test Asset", "TA", INITIAL_SUPPLY);

    // Deploy WithdrawalNFT
    const WithdrawalNFTFactory = await ethers.getContractFactory("WithdrawalNFT");
    withdrawalNFT = await WithdrawalNFTFactory.deploy();

    // Deploy LiquidStakingVault
    const VaultFactory = await ethers.getContractFactory("LiquidStakingVault");
    vault = await VaultFactory.deploy(
      await asset.getAddress(),
      await withdrawalNFT.getAddress(),
      "Liquid Staking Token",
      "LST"
    );

    // Deploy GovernanceRootPublisher
    const RootPublisherFactory = await ethers.getContractFactory("GovernanceRootPublisher");
    rootPublisher = await RootPublisherFactory.deploy(await vault.getAddress());

    // Deploy VoteVerifier
    const VoteVerifierFactory = await ethers.getContractFactory("VoteVerifier");
    voteVerifier = await VoteVerifierFactory.deploy();

    // Deploy GovernanceExecutor
    const ExecutorFactory = await ethers.getContractFactory("GovernanceExecutor");
    executor = await ExecutorFactory.deploy(await rootPublisher.getAddress());

    // Transfer some assets to users
    await asset.transfer(user1.address, ethers.parseEther("10000"));
    await asset.transfer(user2.address, ethers.parseEther("10000"));
    await asset.transfer(user3.address, ethers.parseEther("10000"));

    // Approve vault to spend user assets
    await asset.connect(user1).approve(await vault.getAddress(), ethers.parseEther("10000"));
    await asset.connect(user2).approve(await vault.getAddress(), ethers.parseEther("10000"));
    await asset.connect(user3).approve(await vault.getAddress(), ethers.parseEther("10000"));
  });

  describe("Proposal Creation", function () {
    it("Should allow creating proposals", async function () {
      const description = "Test proposal";
      const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string"],
        ["test action"]
      );

      const proposalId = await rootPublisher.createProposal.staticCall(description, actionData);
      await rootPublisher.createProposal(description, actionData);

      const proposal = await rootPublisher.getProposal(proposalId);
      expect(proposal.description).to.equal(description);
      expect(proposal.actionData).to.deep.equal(actionData);
      expect(proposal.snapshotBlock).to.equal(await ethers.provider.getBlockNumber());
    });

    it("Should prevent creating proposals with empty description", async function () {
      const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string"],
        ["test action"]
      );

      await expect(rootPublisher.createProposal("", actionData)).to.be.revertedWith("Description cannot be empty");
    });

    it("Should prevent creating proposals with empty action data", async function () {
      await expect(rootPublisher.createProposal("Test proposal", "0x")).to.be.revertedWith("Action data cannot be empty");
    });
  });

  describe("Voting Power Root Publishing", function () {
    it("Should allow publishing voting power roots", async function () {
      // Create proposal first
      const description = "Test proposal";
      const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string"],
        ["test action"]
      );
      const proposalId = await rootPublisher.createProposal.staticCall(description, actionData);
      await rootPublisher.createProposal(description, actionData);

      // Publish voting power root
      const votingPowerRoot = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      await rootPublisher.publishVotingPowerRoot(proposalId, votingPowerRoot);

      const proposal = await rootPublisher.getProposal(proposalId);
      expect(proposal.votingPowerRoot).to.equal(votingPowerRoot);
      expect(proposal.rootPublished).to.be.true;
    });

    it("Should prevent publishing root for non-existent proposal", async function () {
      const votingPowerRoot = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      await expect(rootPublisher.publishVotingPowerRoot(999, votingPowerRoot)).to.be.revertedWith("Proposal does not exist");
    });

    it("Should prevent publishing root twice", async function () {
      // Create proposal
      const description = "Test proposal";
      const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string"],
        ["test action"]
      );
      const proposalId = await rootPublisher.createProposal.staticCall(description, actionData);
      await rootPublisher.createProposal(description, actionData);

      // Publish root first time
      const votingPowerRoot = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      await rootPublisher.publishVotingPowerRoot(proposalId, votingPowerRoot);

      // Try to publish again
      await expect(rootPublisher.publishVotingPowerRoot(proposalId, votingPowerRoot)).to.be.revertedWith("Root already published");
    });
  });

  describe("Vote Verification", function () {
    it("Should allow setting voting power root", async function () {
      const proposalId = 1;
      const votingPowerRoot = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      
      await voteVerifier.setVotingPowerRoot(proposalId, votingPowerRoot);
      
      const proposal = await voteVerifier.getProposalVoting(proposalId);
      expect(proposal.votingPowerRoot).to.equal(votingPowerRoot);
    });

    it("Should prevent setting root twice", async function () {
      const proposalId = 1;
      const votingPowerRoot = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      
      await voteVerifier.setVotingPowerRoot(proposalId, votingPowerRoot);
      await expect(voteVerifier.setVotingPowerRoot(proposalId, votingPowerRoot)).to.be.revertedWith("Root already set");
    });
  });

  describe("End-to-End Governance Flow", function () {
    it("Should complete full governance flow", async function () {
      // 1. Users deposit assets
      await vault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);
      await vault.connect(user2).deposit(DEPOSIT_AMOUNT, user2.address);

      // 2. Create proposal
      const description = "Update unbonding period";
      const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string"],
        ["update unbonding period to 14 days"]
      );
      const proposalId = await rootPublisher.createProposal.staticCall(description, actionData);
      await rootPublisher.createProposal(description, actionData);

      // 3. Publish voting power root
      const votingPowerRoot = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      await rootPublisher.publishVotingPowerRoot(proposalId, votingPowerRoot);

      // 4. Set voting power root on vote verifier
      await voteVerifier.setVotingPowerRoot(proposalId, votingPowerRoot);

      // 5. Finalize voting (simplified - in real implementation, votes would be cast first)
      await voteVerifier.finalizeVoting(proposalId, 5000, 5000); // 50% quorum, 50% support

      // 6. Commit action data hash
      const proposal = await rootPublisher.getProposal(proposalId);
      await executor.commitActionDataHash(proposal.actionDataHash);

      // 7. Execute proposal
      await executor.executeIfAuthorized(proposalId, actionData);

      // Verify proposal was executed
      const executedProposal = await rootPublisher.getProposal(proposalId);
      expect(executedProposal.executed).to.be.true;
    });
  });

  describe("Security", function () {
    it("Should prevent double execution of proposals", async function () {
      // Create and execute proposal
      const description = "Test proposal";
      const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string"],
        ["test action"]
      );
      const proposalId = await rootPublisher.createProposal.staticCall(description, actionData);
      await rootPublisher.createProposal(description, actionData);

      // Publish voting power root
      const votingPowerRoot = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      await rootPublisher.publishVotingPowerRoot(proposalId, votingPowerRoot);

      const proposal = await rootPublisher.getProposal(proposalId);
      await executor.commitActionDataHash(proposal.actionDataHash);
      await executor.executeIfAuthorized(proposalId, actionData);

      // Try to execute again
      await expect(executor.executeIfAuthorized(proposalId, actionData)).to.be.revertedWith("Proposal already executed");
    });

    it("Should prevent execution with wrong action data", async function () {
      // Create proposal
      const description = "Test proposal";
      const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string"],
        ["test action"]
      );
      const proposalId = await rootPublisher.createProposal.staticCall(description, actionData);
      await rootPublisher.createProposal(description, actionData);

      // Publish voting power root
      const votingPowerRoot = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      await rootPublisher.publishVotingPowerRoot(proposalId, votingPowerRoot);

      const proposal = await rootPublisher.getProposal(proposalId);
      await executor.commitActionDataHash(proposal.actionDataHash);

      // Try to execute with wrong action data
      const wrongActionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string"],
        ["wrong action"]
      );
      await expect(executor.executeIfAuthorized(proposalId, wrongActionData)).to.be.revertedWith("Action data hash mismatch");
    });
  });
});
