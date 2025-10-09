import { expect } from "chai";
import { ethers } from "hardhat";
import { LiquidStakingVault, WithdrawalNFT, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("LiquidStakingVault", function () {
  let vault: LiquidStakingVault;
  let withdrawalNFT: WithdrawalNFT;
  let asset: MockERC20;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const DEPOSIT_AMOUNT = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

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

    // Transfer ownership of WithdrawalNFT to LiquidStakingVault
    await withdrawalNFT.transferOwnership(await vault.getAddress());

    // Transfer some assets to users
    await asset.transfer(user1.address, ethers.parseEther("10000"));
    await asset.transfer(user2.address, ethers.parseEther("10000"));

    // Approve vault to spend user assets
    await asset.connect(user1).approve(await vault.getAddress(), ethers.parseEther("10000"));
    await asset.connect(user2).approve(await vault.getAddress(), ethers.parseEther("10000"));
  });

  describe("Deposit and Mint", function () {
    it("Should allow users to deposit assets and mint shares", async function () {
      const shares = await vault.connect(user1).deposit.staticCall(DEPOSIT_AMOUNT, user1.address);
      
      await vault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);
      
      expect(await vault.balanceOf(user1.address)).to.equal(shares);
      expect(await vault.totalAssets()).to.equal(DEPOSIT_AMOUNT);
      expect(await vault.totalShares()).to.equal(shares);
    });

    it("Should allow users to mint shares for assets", async function () {
      const shares = ethers.parseEther("1000");
      const assets = await vault.connect(user1).mint.staticCall(shares, user1.address);
      
      await vault.connect(user1).mint(shares, user1.address);
      
      expect(await vault.balanceOf(user1.address)).to.equal(shares);
      expect(await vault.totalAssets()).to.equal(assets);
      expect(await vault.totalShares()).to.equal(shares);
    });

    it("Should maintain 1:1 exchange rate initially", async function () {
      await vault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);
      
      expect(await vault.exchangeRate()).to.equal(ethers.parseEther("1"));
    });
  });

  describe("Rewards Distribution", function () {
    it("Should increase exchange rate when rewards are distributed", async function () {
      // Initial deposit
      await vault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);
      const initialExchangeRate = await vault.exchangeRate();
      
      // Distribute rewards
      const rewardAmount = ethers.parseEther("100");
      await asset.approve(await vault.getAddress(), rewardAmount);
      await vault.distributeRewards(rewardAmount);
      
      const newExchangeRate = await vault.exchangeRate();
      expect(newExchangeRate).to.be.gt(initialExchangeRate);
    });

    it("Should allow LST holders to benefit from rewards", async function () {
      // User1 deposits
      await vault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);
      const user1Shares = await vault.balanceOf(user1.address);
      
      // Distribute rewards
      const rewardAmount = ethers.parseEther("100");
      await asset.approve(await vault.getAddress(), rewardAmount);
      await vault.distributeRewards(rewardAmount);
      
      // User1's assets should have increased
      const user1Assets = await vault.connect(user1).convertToAssets(user1Shares);
      expect(user1Assets).to.be.gt(DEPOSIT_AMOUNT);
    });
  });

  describe("Withdrawals", function () {
    it("Should allow users to initiate withdrawals", async function () {
      // Deposit first
      await vault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);
      const shares = await vault.balanceOf(user1.address);
      
      // Initiate withdrawal
      const nftId = await vault.connect(user1).initiateWithdraw.staticCall(shares);
      await vault.connect(user1).initiateWithdraw(shares);
      
      // Check that shares were burned
      expect(await vault.balanceOf(user1.address)).to.equal(0);
      
      // Check that withdrawal NFT was minted
      expect(await withdrawalNFT.ownerOf(nftId)).to.equal(user1.address);
    });

    it("Should enforce unbonding period before claiming", async function () {
      // Deposit and initiate withdrawal
      await vault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);
      const shares = await vault.balanceOf(user1.address);
      const nftId = await vault.connect(user1).initiateWithdraw.staticCall(shares);
      await vault.connect(user1).initiateWithdraw(shares);
      
      // Try to claim immediately (should fail)
      await expect(vault.connect(user1).claim(nftId)).to.be.revertedWith("Withdrawal not available yet");
    });

    it("Should allow claiming after unbonding period", async function () {
      // Deposit and initiate withdrawal
      await vault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);
      const shares = await vault.balanceOf(user1.address);
      const nftId = await vault.connect(user1).initiateWithdraw.staticCall(shares);
      await vault.connect(user1).initiateWithdraw(shares);
      
      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]); // 7 days
      await ethers.provider.send("evm_mine", []);
      
      // Claim should succeed
      const initialBalance = await asset.balanceOf(user1.address);
      await vault.connect(user1).claim(nftId);
      const finalBalance = await asset.balanceOf(user1.address);
      
      expect(finalBalance).to.be.gt(initialBalance);
    });
  });

  describe("Voting Power", function () {
    it("Should calculate voting power correctly", async function () {
      // User1 deposits assets
      await vault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);
      
      // Get voting power
      const votingPower = await vault.getVotingPower(user1.address, await ethers.provider.getBlockNumber());
      
      // Voting power should include both asset balance and LST voting power
      expect(votingPower).to.be.gt(0);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero deposits gracefully", async function () {
      await expect(vault.connect(user1).deposit(0, user1.address)).to.be.revertedWith("Assets must be > 0");
    });

    it("Should handle zero shares gracefully", async function () {
      await expect(vault.connect(user1).mint(0, user1.address)).to.be.revertedWith("Shares must be > 0");
    });

    it("Should prevent withdrawal of more shares than owned", async function () {
      await vault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);
      const shares = await vault.balanceOf(user1.address);
      
      await expect(vault.connect(user1).initiateWithdraw(shares + 1n)).to.be.revertedWith("Insufficient shares");
    });
  });
});
