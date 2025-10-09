// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./WithdrawalNFT.sol";

/**
 * @title LiquidStakingVault
 * @dev ERC-4626-like liquid staking vault with time-locked redemptions
 * Implements shares model where exchange rate = totalAssets / totalShares
 * LST tokens appreciate over time as rewards are distributed
 */
contract LiquidStakingVault is ERC20, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    WithdrawalNFT public immutable withdrawalNFT;
    
    uint256 public constant UNBONDING_PERIOD = 7 days;
    uint256 public constant PRECISION = 1e18;
    
    // Total assets under management (including rewards)
    uint256 private _totalAssets;
    
    // Total shares outstanding
    uint256 private _totalShares;
    
    // Exchange rate = totalAssets / totalShares (scaled by PRECISION)
    uint256 public exchangeRate;
    
    // Last time exchange rate was updated
    uint256 public lastUpdateTime;
    
    // Events
    event Deposited(address indexed user, uint256 assets, uint256 shares);
    event RewardsDistributed(uint256 amount, uint256 newExchangeRate);
    event WithdrawalInitiated(address indexed user, uint256 shares, uint256 nftId);
    event WithdrawalClaimed(address indexed user, uint256 nftId, uint256 assets);
    
    constructor(
        address _asset,
        address _withdrawalNFT,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) Ownable(msg.sender) {
        asset = IERC20(_asset);
        withdrawalNFT = WithdrawalNFT(_withdrawalNFT);
        exchangeRate = PRECISION; // 1:1 initially
        lastUpdateTime = block.timestamp;
    }
    
    /**
     * @dev Deposit assets and mint shares
     * @param assets Amount of assets to deposit
     * @param receiver Address to receive shares
     * @return shares Amount of shares minted
     */
    function deposit(uint256 assets, address receiver) 
        external 
        nonReentrant 
        returns (uint256 shares) 
    {
        require(assets > 0, "Assets must be > 0");
        
        // Calculate shares based on current exchange rate
        shares = _convertToShares(assets);
        require(shares > 0, "Shares must be > 0");
        
        // Transfer assets from user
        asset.safeTransferFrom(msg.sender, address(this), assets);
        
        // Update state
        _totalAssets += assets;
        _totalShares += shares;
        _updateExchangeRate();
        
        // Mint shares to receiver
        _mint(receiver, shares);
        
        emit Deposited(receiver, assets, shares);
    }
    
    /**
     * @dev Mint shares for assets (alternative to deposit)
     * @param shares Amount of shares to mint
     * @param receiver Address to receive shares
     * @return assets Amount of assets required
     */
    function mint(uint256 shares, address receiver) 
        external 
        nonReentrant 
        returns (uint256 assets) 
    {
        require(shares > 0, "Shares must be > 0");
        
        // Calculate assets required
        assets = _convertToAssets(shares);
        require(assets > 0, "Assets must be > 0");
        
        // Transfer assets from user
        asset.safeTransferFrom(msg.sender, address(this), assets);
        
        // Update state
        _totalAssets += assets;
        _totalShares += shares;
        _updateExchangeRate();
        
        // Mint shares to receiver
        _mint(receiver, shares);
        
        emit Deposited(receiver, assets, shares);
    }
    
    /**
     * @dev Distribute rewards to increase exchange rate
     * @param rewardAmount Amount of rewards to distribute
     */
    function distributeRewards(uint256 rewardAmount) external onlyOwner {
        require(rewardAmount > 0, "Reward amount must be > 0");
        
        // Transfer rewards to vault
        asset.safeTransferFrom(msg.sender, address(this), rewardAmount);
        
        // Update total assets
        _totalAssets += rewardAmount;
        
        // Update exchange rate
        _updateExchangeRate();
        
        emit RewardsDistributed(rewardAmount, exchangeRate);
    }
    
    /**
     * @dev Initiate withdrawal by burning shares and minting withdrawal NFT
     * @param shares Amount of shares to burn
     * @return nftId ID of the withdrawal NFT
     */
    function initiateWithdraw(uint256 shares) 
        external 
        nonReentrant 
        returns (uint256 nftId) 
    {
        require(shares > 0, "Shares must be > 0");
        require(balanceOf(msg.sender) >= shares, "Insufficient shares");
        
        // Calculate assets owed based on current exchange rate
        uint256 assetsOwed = _convertToAssets(shares);
        
        // Burn shares
        _burn(msg.sender, shares);
        _totalShares -= shares;
        
        // Calculate available time (current time + unbonding period)
        uint256 availableAt = block.timestamp + UNBONDING_PERIOD;
        
        // Mint withdrawal NFT
        nftId = withdrawalNFT.mint(msg.sender, assetsOwed, availableAt);
        
        emit WithdrawalInitiated(msg.sender, shares, nftId);
    }
    
    /**
     * @dev Claim withdrawal after unbonding period
     * @param nftId ID of the withdrawal NFT
     */
    function claim(uint256 nftId) external nonReentrant {
        require(withdrawalNFT.ownerOf(nftId) == msg.sender, "Not NFT owner");
        
        (uint256 assetsOwed, uint256 availableAt) = withdrawalNFT.getWithdrawalInfo(nftId);
        require(block.timestamp >= availableAt, "Withdrawal not available yet");
        
        // Burn NFT
        withdrawalNFT.burn(nftId);
        
        // Transfer assets to user
        asset.safeTransfer(msg.sender, assetsOwed);
        
        emit WithdrawalClaimed(msg.sender, nftId, assetsOwed);
    }
    
    /**
     * @dev Get total assets under management
     */
    function totalAssets() external view returns (uint256) {
        return _totalAssets;
    }
    
    /**
     * @dev Get total shares outstanding
     */
    function totalShares() external view returns (uint256) {
        return _totalShares;
    }
    
    /**
     * @dev Convert assets to shares using current exchange rate
     */
    function convertToShares(uint256 assets) external view returns (uint256) {
        return _convertToShares(assets);
    }
    
    /**
     * @dev Convert shares to assets using current exchange rate
     */
    function convertToAssets(uint256 shares) external view returns (uint256) {
        return _convertToAssets(shares);
    }
    
    /**
     * @dev Get voting power for a user (assets + LST * exchange rate)
     * @param user User address
     */
    function getVotingPower(address user, uint256 /* snapshotBlock */) external view returns (uint256) {
        // Get user's asset balance at snapshot
        uint256 assetBalance = asset.balanceOf(user);
        
        // Get user's LST balance at snapshot (this would need to be implemented with snapshots)
        uint256 lstBalance = balanceOf(user);
        
        // Calculate voting power: assets + floor(LST * exchange rate / 1e18)
        uint256 lstVotingPower = (lstBalance * exchangeRate) / PRECISION;
        
        return assetBalance + lstVotingPower;
    }
    
    /**
     * @dev Internal function to convert assets to shares
     */
    function _convertToShares(uint256 assets) internal view returns (uint256) {
        if (_totalShares == 0) {
            return assets; // First deposit
        }
        return (assets * PRECISION) / exchangeRate;
    }
    
    /**
     * @dev Internal function to convert shares to assets
     */
    function _convertToAssets(uint256 shares) internal view returns (uint256) {
        if (_totalShares == 0) {
            return shares; // First mint: 1:1 ratio
        }
        return (shares * exchangeRate) / PRECISION;
    }
    
    /**
     * @dev Update exchange rate based on current total assets and shares
     */
    function _updateExchangeRate() internal {
        if (_totalShares > 0) {
            exchangeRate = (_totalAssets * PRECISION) / _totalShares;
        }
        lastUpdateTime = block.timestamp;
    }
}
