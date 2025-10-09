// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title WithdrawalNFT
 * @dev NFT representing a time-locked withdrawal claim
 * Each NFT contains information about assets owed and when they become available
 */
contract WithdrawalNFT is ERC721, Ownable {
    
    struct WithdrawalInfo {
        uint256 assetsOwed;
        uint256 availableAt;
    }
    
    // Mapping from token ID to withdrawal info
    mapping(uint256 => WithdrawalInfo) public withdrawals;
    
    // Counter for token IDs
    uint256 private _nextTokenId = 1;
    
    // Events
    event WithdrawalMinted(address indexed to, uint256 indexed tokenId, uint256 assetsOwed, uint256 availableAt);
    event WithdrawalBurned(uint256 indexed tokenId);
    
    constructor() ERC721("Withdrawal NFT", "WITHDRAWAL") Ownable(msg.sender) {}
    
    /**
     * @dev Mint a new withdrawal NFT
     * @param to Address to mint to
     * @param assetsOwed Amount of assets owed
     * @param availableAt Timestamp when withdrawal becomes available
     * @return tokenId ID of the minted NFT
     */
    function mint(address to, uint256 assetsOwed, uint256 availableAt) 
        external 
        onlyOwner 
        returns (uint256 tokenId) 
    {
        tokenId = _nextTokenId++;
        
        withdrawals[tokenId] = WithdrawalInfo({
            assetsOwed: assetsOwed,
            availableAt: availableAt
        });
        
        _mint(to, tokenId);
        
        emit WithdrawalMinted(to, tokenId, assetsOwed, availableAt);
    }
    
    /**
     * @dev Burn a withdrawal NFT
     * @param tokenId ID of the NFT to burn
     */
    function burn(uint256 tokenId) external onlyOwner {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        
        delete withdrawals[tokenId];
        _burn(tokenId);
        
        emit WithdrawalBurned(tokenId);
    }
    
    /**
     * @dev Get withdrawal information for a token
     * @param tokenId ID of the token
     * @return assetsOwed Amount of assets owed
     * @return availableAt Timestamp when withdrawal becomes available
     */
    function getWithdrawalInfo(uint256 tokenId) external view returns (uint256 assetsOwed, uint256 availableAt) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        WithdrawalInfo memory info = withdrawals[tokenId];
        return (info.assetsOwed, info.availableAt);
    }
    
    /**
     * @dev Check if a withdrawal is available
     * @param tokenId ID of the token
     * @return available True if withdrawal is available
     */
    function isWithdrawalAvailable(uint256 tokenId) external view returns (bool available) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        return block.timestamp >= withdrawals[tokenId].availableAt;
    }
    
    /**
     * @dev Get the next token ID
     */
    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }
}
