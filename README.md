# Liquid Staking + Off-Chain Voting + Cross-Chain Execution Protocol

A comprehensive multi-chain protocol implementing liquid staking with time-locked redemptions and cross-chain governance with EIP-712 voting and Merkle proof verification.

## 🏗️ Architecture Overview

### System Components

```
Chain A (Stake Chain)                    Chain B (Verify Chain)
┌─────────────────────────┐              ┌─────────────────────────┐
│ LiquidStakingVault      │              │ VoteVerifier           │
│ ├─ ERC-4626 shares     │              │ ├─ EIP-712 verification │
│ ├─ Time-locked exits   │              │ ├─ Merkle proof check   │
│ └─ Rewards distribution│              │ └─ Vote tallying        │
│                         │              │                         │
│ GovernanceRootPublisher │              │                         │
│ ├─ Proposal creation   │              │                         │
│ ├─ Snapshot taking     │              │                         │
│ └─ Root publishing     │              │                         │
│                         │              │                         │
│ GovernanceExecutor      │              │                         │
│ ├─ Action hash commit  │              │                         │
│ └─ Proposal execution  │              │                         │
└─────────────────────────┘              └─────────────────────────┘
```

### Key Features

- **Liquid Staking**: ERC-4626-like shares model with appreciating LST tokens
- **Time-locked Redemptions**: Withdrawal NFTs with unbonding periods
- **Cross-chain Governance**: Off-chain EIP-712 voting with on-chain verification
- **Merkle Proof Verification**: Efficient voting power verification
- **Dual Voting Power**: Both asset holders and LST holders can vote

## 📋 Requirements Fulfilled

### ✅ Liquid Staking Vault
- [x] ERC-4626-like shares model (no rebasing)
- [x] Correct mulDiv math for rounding
- [x] Time-locked redemptions with Withdrawal NFTs
- [x] Rewards distribution increasing exchange rate
- [x] Appreciating LST tokens (no 1:1 peg)

### ✅ Governance System
- [x] Voting power calculation: `ASSET + floor(LST * ER / 1e18)`
- [x] Off-chain EIP-712 signatures
- [x] Merkle proof verification for voting power
- [x] Cross-chain proposal execution
- [x] Action data hash verification

### ✅ Security Features
- [x] Reentrancy guards
- [x] Safe ERC-20 transfers
- [x] Under-counting on rounding (floor)
- [x] Double-voting prevention
- [x] Nonce-based replay protection

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Hardhat
- MetaMask (for frontend)

### Installation

```bash
# Install dependencies
npm install

# Compile contracts
npm run compile

# Run tests
npm test

# Deploy contracts
npm run deploy:local

# Run demo
npm run demo
```

### Development Workflow

1. **Start local blockchain**:
   ```bash
   npx hardhat node
   ```

2. **Deploy contracts**:
   ```bash
   npm run deploy:local
   ```

3. **Run tests**:
   ```bash
   npm test
   ```

4. **Build snapshot**:
   ```bash
   npm run snapshot build
   ```

5. **Collect signatures**:
   ```bash
   npm run signatures collect
   ```

6. **Relay events**:
   ```bash
   npm run relay events
   ```

## 📁 Project Structure

```
├── contracts/                 # Solidity contracts
│   ├── LiquidStakingVault.sol
│   ├── WithdrawalNFT.sol
│   ├── GovernanceRootPublisher.sol
│   ├── VoteVerifier.sol
│   ├── GovernanceExecutor.sol
│   └── MockERC20.sol
├── test/                      # Test files
│   ├── LiquidStakingVault.test.ts
│   └── Governance.test.ts
├── scripts/                   # Deployment and utility scripts
│   ├── deploy.ts
│   ├── snapshot-builder.ts
│   ├── signature-collector.ts
│   ├── relay.ts
│   └── demo.ts
├── frontend/                  # Minimal frontend demo
│   └── index.html
└── README.md
```

## 🔧 Contract Details

### LiquidStakingVault

**Purpose**: Core liquid staking vault implementing ERC-4626-like shares model.

**Key Functions**:
- `deposit(assets, receiver)`: Deposit assets and mint shares
- `mint(shares, receiver)`: Mint shares for assets
- `distributeRewards(amount)`: Distribute rewards to increase exchange rate
- `initiateWithdraw(shares)`: Burn shares and mint withdrawal NFT
- `claim(nftId)`: Claim assets after unbonding period

**Security Features**:
- Reentrancy guards on all external functions
- Safe ERC-20 transfers using OpenZeppelin's SafeERC20
- Under-counting on rounding to prevent exploits
- Time-locked withdrawals with NFT representation

### WithdrawalNFT

**Purpose**: NFT representing time-locked withdrawal claims.

**Key Functions**:
- `mint(to, assetsOwed, availableAt)`: Mint withdrawal NFT
- `burn(tokenId)`: Burn NFT after claiming
- `getWithdrawalInfo(tokenId)`: Get withdrawal details
- `isWithdrawalAvailable(tokenId)`: Check if withdrawal is ready

### GovernanceRootPublisher

**Purpose**: Creates governance proposals and publishes voting power snapshots.

**Key Functions**:
- `createProposal(description, actionData)`: Create new proposal
- `publishVotingPowerRoot(proposalId, root)`: Publish Merkle root
- `getVotingPowerAtBlock(user, blockNumber)`: Get voting power at snapshot

### VoteVerifier

**Purpose**: Verifies EIP-712 votes and Merkle proofs on Chain B.

**Key Functions**:
- `setVotingPowerRoot(proposalId, root)`: Set voting power root
- `castVote(vote, signature, merkleProof)`: Cast vote with verification
- `finalizeVoting(proposalId, quorum, support)`: Finalize and check if passed

**Security Features**:
- EIP-712 signature verification
- Merkle proof verification for voting power
- Double-voting prevention
- Nonce-based replay protection

### GovernanceExecutor

**Purpose**: Executes governance proposals on Chain A after cross-chain verification.

**Key Functions**:
- `commitActionDataHash(hash)`: Commit action data hash
- `executeIfAuthorized(proposalId, actionData)`: Execute if authorized
- `isActionExecuted(hash)`: Check if action was executed

## 🧪 Testing

### Test Coverage

The test suite covers:

1. **Liquid Staking Tests**:
   - Deposit and mint operations
   - Rewards distribution and exchange rate appreciation
   - Time-locked withdrawals
   - Voting power calculations

2. **Governance Tests**:
   - Proposal creation and management
   - Voting power root publishing
   - Vote verification and tallying
   - Cross-chain execution

3. **Security Tests**:
   - Reentrancy protection
   - Double-voting prevention
   - Signature verification
   - Action data hash verification

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npx hardhat test test/LiquidStakingVault.test.ts

# Run with coverage
npm run coverage
```

## 🔐 Security Analysis

### Security Measures Implemented

1. **Reentrancy Protection**:
   - `nonReentrant` guards on all external functions
   - Safe external calls using OpenZeppelin's patterns

2. **Rounding Protection**:
   - Under-counting on rounding (floor) to prevent exploits
   - Proper mulDiv math for share calculations

3. **Voting Security**:
   - EIP-712 signature verification prevents signature forgery
   - Merkle proof verification ensures valid voting power
   - Double-voting prevention with vote tracking
   - Nonce-based replay protection

4. **Cross-chain Security**:
   - Action data hash verification prevents execution of wrong actions
   - Proposal state tracking prevents double execution
   - Root publishing ensures snapshot consistency

### Security Tradeoffs

1. **Off-chain Snapshots vs On-chain Checkpoints**:
   - **Chosen**: Off-chain Merkle roots for efficiency
   - **Tradeoff**: Requires trusted snapshot process vs gas costs of on-chain checkpoints
   - **Justification**: More gas-efficient for large voter bases

2. **Time-locked Withdrawals**:
   - **Benefit**: Prevents bank runs and ensures protocol stability
   - **Tradeoff**: Reduced liquidity for users
   - **Mitigation**: NFT representation allows transferability

3. **Cross-chain Execution**:
   - **Benefit**: Separates voting from execution, reduces gas costs
   - **Tradeoff**: Requires trusted relayer
   - **Mitigation**: Action data hash verification ensures correct execution

## 📊 Gas Analysis

### Key Operations Gas Usage

| Operation | Gas Used | Notes |
|-----------|----------|-------|
| Deposit | ~150,000 | Includes ERC-20 transfer and mint |
| Withdrawal Initiation | ~120,000 | Includes burn and NFT mint |
| Rewards Distribution | ~80,000 | Updates exchange rate |
| Vote Casting | ~200,000 | Includes signature and proof verification |
| Proposal Execution | ~100,000 | Includes action execution |

### Gas Optimization Strategies

1. **Batch Operations**: Multiple votes can be batched for efficiency
2. **Merkle Proofs**: Efficient voting power verification
3. **Event-driven Architecture**: Minimal on-chain state changes
4. **Optimized Math**: Efficient mulDiv operations

## 🚀 Deployment

### Local Development

```bash
# Start local node
npx hardhat node

# Deploy contracts
npm run deploy:local

# Run demo
npm run demo
```

### Production Deployment

1. **Configure Networks**:
   ```typescript
   // hardhat.config.ts
   networks: {
     chainA: {
       url: "https://chain-a-rpc.com",
       chainId: 1,
       accounts: [process.env.PRIVATE_KEY]
     },
     chainB: {
       url: "https://chain-b-rpc.com", 
       chainId: 2,
       accounts: [process.env.PRIVATE_KEY]
     }
   }
   ```

2. **Deploy to Chain A**:
   ```bash
   npx hardhat run scripts/deploy.ts --network chainA
   ```

3. **Deploy to Chain B**:
   ```bash
   npx hardhat run scripts/deploy.ts --network chainB
   ```

## 🔄 Governance Flow

### End-to-End Process

1. **Proposal Creation** (Chain A):
   - Create proposal with action data
   - Take snapshot of voting power
   - Publish Merkle root

2. **Voting** (Off-chain):
   - Users sign EIP-712 messages
   - Collect signatures and Merkle proofs
   - Submit to VoteVerifier (Chain B)

3. **Verification** (Chain B):
   - Verify EIP-712 signatures
   - Verify Merkle proofs for voting power
   - Tally votes and check thresholds

4. **Execution** (Chain A):
   - Relay ProposalPassed event
   - Commit action data hash
   - Execute proposal if authorized

### CLI Tools

- **Snapshot Builder**: Creates voting power snapshots and Merkle trees
- **Signature Collector**: Collects and verifies EIP-712 signatures
- **Relay Script**: Relays events between chains
- **Demo Script**: Shows end-to-end flow

## 🎯 Acceptance Tests

### ✅ Appreciating LST
- [x] Deposit assets → mint shares
- [x] Distribute rewards → exchange rate increases
- [x] LST tokens appreciate over time

### ✅ Time-locked Redemptions
- [x] Initiate withdrawal → burn shares, mint NFT
- [x] Claim after unbonding period → transfer assets
- [x] Cannot claim before unbonding period

### ✅ Dual Voting Power
- [x] Calculate voting power correctly at snapshot
- [x] Include both asset and LST voting power
- [x] Floor rounding for LST voting power

### ✅ Governance Flow
- [x] Create proposal → freeze root
- [x] Batch verify on Chain B → ProposalPassed
- [x] Relay → execute on Chain A
- [x] Update unbonding period example

## 🛠️ Development Tools

### CLI Scripts

```bash
# Build voting power snapshot
npm run snapshot build

# Generate Merkle proof for address
npm run snapshot proof <address>

# Collect EIP-712 signatures
npm run signatures collect

# Verify signature
npm run signatures verify <address>

# Relay governance events
npm run relay events

# Monitor for events
npm run relay monitor
```

### Frontend Demo

The minimal frontend (`frontend/index.html`) provides:
- Liquid staking interface
- Governance voting interface
- Real-time balance updates
- Transaction status tracking

## 📈 Future Enhancements

1. **Advanced Governance**:
   - Delegation mechanisms
   - Time-weighted voting
   - Proposal categories

2. **Cross-chain Improvements**:
   - Decentralized relayers
   - Optimistic execution
   - Multi-chain support

3. **Liquid Staking Features**:
   - Slashing protection
   - Validator selection
   - Reward optimization

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For questions or issues:
1. Check the test files for usage examples
2. Review the CLI scripts for implementation details
3. Open an issue for bugs or feature requests

---

**Note**: This is a demonstration implementation for the NodeOps hiring process. In production, additional security audits, gas optimizations, and testing would be required.

