# System Patterns: Lucid L2™ Architecture

## System Architecture (Phase 5 - MMR Integration)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Agent Vectors │    │   MMR Service    │    │  Solana Program │
│                 │    │                  │    │                 │
│ • Text inputs   │───▶│ • Hash vectors   │───▶│ • Store 32-byte │
│ • Per epoch     │    │ • Build MMR      │    │   MMR roots     │
│ • Batch process │    │ • Generate root  │    │ • Immutable log │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                          │
                              ▼                          ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   IPFS Storage  │    │ Dual-Gas System │
                       │                 │    │ iGas + mGas     │
                       │ • MMR state     │    │ $LUCID Burns    │
                       │ • Root history  │    │ [Compute+Burns] │
                       │ • Content addr. │    └─────────────────┘
                       └─────────────────┘
                              │
                              ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Memory Wallet   │◀───│  State Update    │◀───│ On-Chain PDA    │
│ (JSON File)     │    │  Local + Chain   │    │ Epoch Records   │
│ CDUauc4hYqP...  │    │                  │    │ Batch Records   │
└─────────────────┘    └──────────────────┘    └─────────────────┘

Traditional Flow (Phase 1-4):
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Text Input    │───▶│  Mock Inference  │───▶│   SHA-256 Hash  │
│ (API/CLI)       │    │   (inference.ts) │    │  (32 bytes)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Key Technical Decisions

### Blockchain Layer (Native Solana Program)
- **Program ID**: `8QRA7K4UHaFhsyRqrUAU7onsJhVHiP7FvwSHouD1dM29` (deployed and functional)
- **Program Derived Accounts (PDAs)**: Seeds = ["epoch", authority_pubkey]
- **Account Structure**: Simple data storage for merkle roots
- **Compute Budget**: Increased to 400k units (from default 200k) for complex operations
- **Direct Instruction Calls**: Native Solana program instructions

### Off-Chain Processing
- **Express.js Server**: REST API on port 3000 with dual-gas integration
- **TypeScript**: Type safety for Solana interactions
- **Anchor Client**: Structured Solana program interactions
- **SPL Token Integration**: @solana/spl-token for $LUCID burns
- **Centralized Gas Module**: Unified gas logic and configuration
- **Error Handling**: Comprehensive try-catch with meaningful error messages

### Data Flow Patterns
1. **Input Validation**: Text input sanitization and validation
2. **Hash Generation**: Deterministic SHA-256 for reproducible results
3. **PDA Derivation**: Consistent account addressing per user
4. **Transaction Building**: Pre-instructions for compute budget + main instruction
5. **State Synchronization**: On-chain commit followed by local wallet update

## Design Patterns in Use

### Program Derived Accounts (PDA) Pattern
```rust
#[account(
   init_if_needed,
   payer    = authority,
   space    = 8 + 32 + 32,
   seeds    = [b"epoch", authority.key().as_ref()],
   bump
)]
```
- Deterministic account addresses
- User-specific storage without collisions
- Automatic initialization on first use

### Dual-Gas Metering Pattern
```typescript
// 1. Compute budget (Solana CU)
const computeIx = makeComputeIx();

// 2. Dual-gas burns ($LUCID tokens)
const igasIx = makeBurnIx(userAta, LUCID_MINT, authority, iGasAmount);
const mgasIx = makeBurnIx(userAta, LUCID_MINT, authority, mGasAmount);

// 3. Transaction with pre-instructions
await program.methods
  .commitEpoch([...rootBytes])
  .preInstructions([computeIx, igasIx, mgasIx])
  .rpc();
```
- **iGas**: Compute operations (1 LUCID/call, 2 LUCID/batch)
- **mGas**: Memory writes (5 LUCID/root)
- **Transparency**: Gas cost breakdown displayed to users
- **Tunability**: Centralized configuration in gas.ts

### Dual Storage Pattern
- **On-Chain**: Immutable, verifiable, decentralized
- **Local**: Fast access, user-specific aggregation
- **Synchronization**: Local updates only after successful on-chain commits

## Component Relationships

### Core Components
- **thought-epoch program**: Anchor program with commit_epoch() and commit_epochs()
- **Express API**: HTTP interface with dual-gas integration
- **CLI Tool**: Command-line access with gas cost display
- **Memory Wallet**: Local JSON-based state management
- **Gas Module**: Centralized gas logic and configuration (gas.ts)
- **Setup Script**: LUCID mint configuration utility

### Data Dependencies
- Program ID must be deployed and configured in Anchor.toml
- Solana wallet must be configured and funded
- Local memory-wallet.json created on first use
- TypeScript compilation for all off-chain components

## Critical Implementation Paths

### Deployment Path (Phase 1 - Completed)
1. Start Solana test validator
2. Build native Solana program: `cargo build-sbf --manifest-path simple-program/Cargo.toml`
3. Deploy program: `solana program deploy simple-program/target/deploy/simple_program.so`
4. Capture Program ID: `8QRA7K4UHaFhsyRqrUAU7onsJhVHiP7FvwSHouD1dM29`
5. Configure wallet: `solana-keygen new --outfile ~/.config/solana/id.json`
6. Fund wallet: `solana airdrop 2 CDUauc4hYqPjBqZzhytmXd8DG4pjiwNjPn3cpCWNpToa`
7. Install off-chain dependencies: `cd offchain && npm install`
8. Start Express server: `npm start` (running on port 3001)

### Runtime Path (Dual-Gas) - FULLY OPERATIONAL
1. Receive text input via API/CLI
2. Generate SHA-256 hash
3. Calculate gas costs (iGas + mGas)
4. Derive PDA for current authority
5. Create ATA for LUCID token burns
6. **Two-Transaction Architecture**: 
   - First: Burn gas tokens (separate transaction)
   - Second: Execute program instruction with compute budget
7. Submit both transactions to Solana network
8. Update local memory wallet
9. Return success response with transaction signatures and gas breakdown

### Critical Bug Resolution Pattern
**Problem**: "Invalid instruction data" errors in combined transactions
**Root Cause**: Keypair mismatch - CLI loading different keypair than token owner
**Solution**: Dynamic keypair resolution using `solana config get`
**Implementation**: Updated `getKeypair()` in `solanaClient.ts`
**Result**: 100% success rate for both single and batch operations

### Error Recovery Paths
- Network failures: Retry logic with exponential backoff
- Compute budget exceeded: Automatic increase to 400k units
- Account initialization: Init-if-needed pattern handles first-time users
- Invalid input: Validation and sanitization before processing

## Clean Architecture Patterns (Phase 4 - Completed)

### Modular Structure Pattern
```
offchain/src/
├── commands/           ← CLI sub-commands (single responsibility)
│   ├── batch.ts        ← Batch commit operations
│   └── run.ts          ← Single commit operations
├── services/           ← HTTP handlers, webhooks (service layer)
│   ├── api.ts          ← Express router and HTTP handlers
│   └── indexer.ts      ← Future Helius/Shyft webhook listener
├── solana/             ← All Solana/Anchor client logic (blockchain layer)
│   ├── client.ts       ← initSolana(), derivePDAs, connection management
│   └── gas.ts          ← makeComputeIx(), makeBurnIx(), gas calculations
├── utils/              ← Utilities, config, and helpers (infrastructure)
│   ├── config.ts       ← Centralized configuration (Version 1.0)
│   ├── inference.ts    ← Mock inference logic
│   └── memoryStore.ts  ← Local JSON storage utilities
├── index.ts            ← Thin HTTP server bootstrap (12 lines)
└── cli.ts              ← Thin commander bootstrap
```

### Configuration Centralization Pattern
```typescript
// utils/config.ts - Version 1.0
export const CONFIG_VERSION = '1.0';

// Gas rates and costs
export const IGAS_PER_CALL = 1;      // 1 LUCID per inference call
export const MGAS_PER_ROOT = 5;      // 5 LUCID per memory write
export const IGAS_PER_BATCH = 2;     // 2 LUCID per batch operation

// Token configuration
export const LUCID_MINT = new PublicKey('G2bVsRy2xBiAAMeZDoFbH3526AKNPKa5SuCC9PCe2hTE');
export const LUCID_DECIMALS = 9;

// Solana configuration
export const PROGRAM_ID = new PublicKey('8QRA7K4UHaFhsyRqrUAU7onsJhVHiP7FvwSHouD1dM29');
export const RPC_URL = 'http://127.0.0.1:8899';
export const COMPUTE_UNITS = 400_000;
```

### Enhanced Gas Module Pattern
```typescript
// solana/gas.ts - Type-safe gas operations
export function makeComputeIx(): TransactionInstruction {
  return ComputeBudgetProgram.requestUnits({
    units: COMPUTE_UNITS,
    additionalFee: 0,
  });
}

export function makeBurnIx(
  type: 'iGas' | 'mGas',
  userAta: PublicKey,
  mint: PublicKey,
  authority: PublicKey,
  amount: number
): TransactionInstruction {
  return createBurnCheckedInstruction(
    userAta,
    mint,
    authority,
    amount,
    LUCID_DECIMALS
  );
}

export function calculateGasCost(
  type: 'single' | 'batch',
  rootCount: number = 1
): { iGas: number; mGas: number; total: number } {
  const iGas = type === 'single' ? IGAS_PER_CALL : IGAS_PER_BATCH;
  const mGas = MGAS_PER_ROOT * rootCount;
  return { iGas, mGas, total: iGas + mGas };
}
```

### Minimal Bootstrap Pattern
```typescript
// index.ts - Pure HTTP server setup (12 lines)
import express from 'express';
import { apiRouter } from './services/api';
import { API_PORT } from './utils/config';

const app = express();
app.use(express.json());
app.use('/', apiRouter);

app.listen(API_PORT, () => {
  console.log(`▶️  Lucid L2 API listening on http://localhost:${API_PORT}`);
});
```

### Benefits Achieved
- **Scalability**: Adding features = create helper file in appropriate folder
- **Maintainability**: Single responsibility per module, configuration in one place
- **Testability**: Each module can be tested independently
- **Type Safety**: Enhanced with proper TypeScript interfaces
- **Clean Imports**: Clear dependency relationships
- **Future-Proof**: Ready for UI integration, real AI, production deployment

## Browser Extension Architecture Patterns (Phase 8.2 - Complete)

### Phase 8.2: Browser Extension mGas Earning System ✅ COMPLETE
**Pattern**: Client-side mGas earning through browser extension
```
User Input → Extension Processing → Quality Assessment → mGas Earning → Balance Update
```

**Key Components**:
- **Extension Popup**: User interface for text processing and wallet connection
- **Background Service**: Persistent processing and notifications
- **Content Scripts**: Webpage interaction and floating buttons
- **Storage System**: Chrome storage API for user data persistence
- **Wallet Integration**: Solana wallet connection for transaction signing
- **Task System**: Daily tasks and progress tracking for mGas earning
- **Quality Scoring**: Basic assessment of user input quality
- **Notification System**: User feedback and achievement notifications

**Architecture Benefits**:
- **Accessibility**: Available on any webpage through browser extension
- **Persistence**: Background processing maintains state between sessions
- **User Experience**: Seamless integration with existing web browsing
- **Monetization**: Direct mGas earning through AI usage
- **Flexibility**: Multiple interaction methods (popup, context menu, shortcuts)

### Phase 8.3: Advanced mGas Rewards & Gamification ✅ COMPLETE
**Pattern**: Comprehensive reward system with quality assessment and achievements
```
User Input → Quality Assessment → Reward Calculation → Achievement Progress → Social Features
```

**Key Components Implemented**:
- **Advanced Quality Scoring**: 5-dimension assessment (creativity, complexity, coherence, uniqueness, AI engagement)
- **Achievement System**: 8 progressive achievements with mGas rewards and unlocking criteria
- **Streak Bonuses**: Daily usage incentives with increasing multipliers
- **mGas Conversion**: Direct conversion to $LUCID tokens (100 mGas = 1 LUCID)
- **Social Features**: Sharing, referrals, and community engagement
- **Leaderboards**: Competition and social comparison with rankings
- **Seasonal Events**: Weekend bonuses, monthly challenges, and special events
- **Advanced UI**: Modal overlays, quality tier indicators, and professional animations

**Implementation Files**:
- **browser-extension/reward-system.js**: Complete RewardSystem class with all features
- **PHASE-8.3-MGAS-REWARDS-GUIDE.md**: Comprehensive implementation guide (200+ lines)
- **test-phase8-3.js**: Complete testing suite for all reward system features
- Enhanced popup.js, styles.css, and popup.html for advanced features

**Architecture Benefits**:
- **Gamification**: Achievement system encourages continued engagement
- **Quality Incentives**: Rewards for high-quality AI interactions
- **Social Integration**: Community building through sharing and referrals
- **Economic Model**: Sustainable mGas earning and conversion system
- **Event System**: Dynamic events maintain user interest and engagement

## Advanced mGas Rewards System Pattern (Phase 8.3 - Complete)

### Quality Assessment Algorithm
```javascript
// 5-dimension quality evaluation system
class QualityAssessment {
  assessQuality(text, response) {
    const dimensions = {
      creativity: this.assessCreativity(text, response),
      complexity: this.assessComplexity(text, response),
      coherence: this.assessCoherence(text, response),
      uniqueness: this.assessUniqueness(text, response),
      aiEngagement: this.assessAIEngagement(text, response)
    };
    
    return this.calculateOverallScore(dimensions);
  }
  
  assessCreativity(text, response) {
    // Creative writing indicators
    const creativeKeywords = ['imagine', 'create', 'design', 'innovate', 'story'];
    const keywordMatches = creativeKeywords.filter(kw => 
      text.toLowerCase().includes(kw) || response.toLowerCase().includes(kw)
    ).length;
    
    return Math.min(keywordMatches * 0.2, 1.0);
  }
  
  assessComplexity(text, response) {
    // Technical complexity indicators
    const complexityFactors = [
      text.split(' ').length > 20,
      response.split(' ').length > 50,
      /[{}()\[\]]/.test(text),
      response.includes('Therefore') || response.includes('However')
    ];
    
    return complexityFactors.filter(Boolean).length / complexityFactors.length;
  }
}
```

### Achievement System Pattern
```javascript
// 8 progressive achievements with mGas rewards
class AchievementSystem {
  constructor() {
    this.achievements = [
      {
        id: 'first-thought',
        title: 'First Thought',
        description: 'Process your first AI interaction',
        reward: 10,
        condition: (stats) => stats.totalInteractions >= 1
      },
      {
        id: 'quality-master',
        title: 'Quality Master',
        description: 'Achieve 5 high-quality interactions',
        reward: 25,
        condition: (stats) => stats.highQualityCount >= 5
      },
      {
        id: 'streak-keeper',
        title: 'Streak Keeper',
        description: 'Maintain a 7-day streak',
        reward: 50,
        condition: (stats) => stats.longestStreak >= 7
      },
      {
        id: 'social-butterfly',
        title: 'Social Butterfly',
        description: 'Share 3 AI interactions',
        reward: 30,
        condition: (stats) => stats.sharedCount >= 3
      },
      {
        id: 'converter',
        title: 'Converter',
        description: 'Convert mGas to LUCID for the first time',
        reward: 20,
        condition: (stats) => stats.conversions >= 1
      },
      {
        id: 'power-user',
        title: 'Power User',
        description: 'Complete 100 AI interactions',
        reward: 100,
        condition: (stats) => stats.totalInteractions >= 100
      },
      {
        id: 'quality-expert',
        title: 'Quality Expert',
        description: 'Achieve 25 high-quality interactions',
        reward: 150,
        condition: (stats) => stats.highQualityCount >= 25
      },
      {
        id: 'legend',
        title: 'Lucid Legend',
        description: 'Earn 1000 mGas total',
        reward: 200,
        condition: (stats) => stats.totalEarned >= 1000
      }
    ];
  }
  
  checkAchievements(userStats) {
    const newAchievements = [];
    
    for (const achievement of this.achievements) {
      if (!userStats.unlockedAchievements.includes(achievement.id)) {
        if (achievement.condition(userStats)) {
          newAchievements.push(achievement);
          userStats.unlockedAchievements.push(achievement.id);
        }
      }
    }
    
    return newAchievements;
  }
}
```

### Reward Calculation System
```javascript
// Multi-layered reward calculation
class RewardCalculation {
  calculateReward(interaction, userStats) {
    const baseReward = 10; // Base mGas reward
    
    // Quality multiplier (1.0 to 2.0)
    const qualityMultiplier = 1.0 + (interaction.qualityScore * 1.0);
    
    // Streak multiplier (1.0 to 3.0)
    const streakMultiplier = Math.min(1.0 + (userStats.currentStreak * 0.1), 3.0);
    
    // Event multiplier (weekend bonus, special events)
    const eventMultiplier = this.getEventMultiplier();
    
    // First daily bonus (extra 50% for first interaction of day)
    const firstDailyBonus = this.isFirstDailyInteraction(userStats) ? 1.5 : 1.0;
    
    const totalReward = Math.floor(
      baseReward * qualityMultiplier * streakMultiplier * eventMultiplier * firstDailyBonus
    );
    
    return {
      baseReward,
      qualityMultiplier,
      streakMultiplier,
      eventMultiplier,
      firstDailyBonus,
      totalReward,
      breakdown: this.generateBreakdown(interaction, userStats)
    };
  }
  
  getEventMultiplier() {
    const now = new Date();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    
    // Weekend bonus
    if (isWeekend) return 1.5;
    
    // Check for special events
    const currentEvent = this.getCurrentEvent();
    if (currentEvent) return currentEvent.multiplier;
    
    return 1.0;
  }
}
```

### mGas to LUCID Conversion Pattern
```javascript
// Token conversion system
class ConversionSystem {
  constructor() {
    this.conversionRate = 100; // 100 mGas = 1 LUCID
    this.minimumConversion = 100; // Minimum 100 mGas to convert
  }
  
  async convertMGasToLucid(mGasAmount, userWallet) {
    // Validation
    if (mGasAmount < this.minimumConversion) {
      throw new Error(`Minimum conversion is ${this.minimumConversion} mGas`);
    }
    
    const lucidAmount = Math.floor(mGasAmount / this.conversionRate);
    
    try {
      // Create transaction to mint LUCID tokens
      const transaction = await this.createMintTransaction(
        userWallet,
        lucidAmount
      );
      
      // Execute transaction
      const signature = await window.solana.signAndSendTransaction(transaction);
      
      // Update user balance
      await this.updateUserBalance(userWallet, -mGasAmount, lucidAmount);
      
      return {
        success: true,
        signature,
        mGasConverted: mGasAmount,
        lucidReceived: lucidAmount,
        newBalance: await this.getUserBalance(userWallet)
      };
    } catch (error) {
      throw new Error(`Conversion failed: ${error.message}`);
    }
  }
  
  async createMintTransaction(userWallet, amount) {
    // Implementation would create actual Solana transaction
    // to mint LUCID tokens to user's wallet
    return mockTransaction;
  }
}
```

### Social Features Pattern
```javascript
// Social sharing and referral system
class SocialFeatures {
  generateShareableContent(interaction, qualityScore) {
    const content = {
      text: `Just earned ${interaction.reward} mGas with a quality score of ${qualityScore.toFixed(2)} on Lucid L2™!`,
      url: 'https://lucid-l2.com',
      hashtags: ['LucidL2', 'AI', 'mGas', 'Solana'],
      image: this.generateShareImage(interaction, qualityScore)
    };
    
    return content;
  }
  
  processReferral(referralCode, newUser) {
    // Validate referral code
    const referrer = this.validateReferralCode(referralCode);
    if (!referrer) return null;
    
    // Reward both referrer and new user
    const referralReward = {
      referrer: { mGas: 50, bonus: 'referral_bonus' },
      newUser: { mGas: 25, bonus: 'welcome_bonus' }
    };
    
    // Track referral in system
    this.trackReferral(referrer, newUser, referralReward);
    
    return referralReward;
  }
  
  generateReferralCode(userWallet) {
    // Generate unique referral code based on wallet
    const hash = this.createHash(userWallet + Date.now());
    return `LUCID-${hash.substring(0, 8).toUpperCase()}`;
  }
}
```

### Leaderboard System Pattern
```javascript
// Community rankings and competition
class LeaderboardSystem {
  async getLeaderboards() {
    return {
      earnings: await this.getTopEarners(),
      quality: await this.getTopQuality(),
      streaks: await this.getTopStreaks(),
      achievements: await this.getTopAchievements()
    };
  }
  
  async getTopEarners() {
    // Mock implementation - would fetch from API
    return [
      { rank: 1, wallet: 'ABC...123', earnings: 2500, change: '+5' },
      { rank: 2, wallet: 'DEF...456', earnings: 2200, change: '-1' },
      { rank: 3, wallet: 'GHI...789', earnings: 1800, change: '+2' }
    ];
  }
  
  async getUserRank(userWallet) {
    // Get user's current ranking across all leaderboards
    const rankings = await this.fetchUserRankings(userWallet);
    
    return {
      earnings: rankings.earnings || 'Not ranked',
      quality: rankings.quality || 'Not ranked',
      streaks: rankings.streaks || 'Not ranked',
      achievements: rankings.achievements || 'Not ranked'
    };
  }
}
```

### Event System Pattern
```javascript
// Seasonal events and challenges
class EventSystem {
  getCurrentEvent() {
    const now = new Date();
    
    // Weekend bonus event
    if (now.getDay() === 0 || now.getDay() === 6) {
      return {
        id: 'weekend-bonus',
        title: 'Weekend Warrior',
        description: 'Earn 50% more mGas on weekends!',
        multiplier: 1.5,
        endTime: this.getNextWeekdayStart()
      };
    }
    
    // Monthly challenge
    const monthlyChallenge = this.getMonthlyChallenge();
    if (monthlyChallenge && this.isEventActive(monthlyChallenge)) {
      return monthlyChallenge;
    }
    
    return null;
  }
  
  getMonthlyChallenge() {
    const now = new Date();
    const month = now.getMonth();
    
    const challenges = [
      { month: 0, title: 'New Year New AI', goal: 'Complete 50 interactions', reward: 500 },
      { month: 1, title: 'Love Your AI', goal: 'Achieve 20 high-quality interactions', reward: 400 },
      { month: 2, title: 'Spring Awakening', goal: 'Maintain 15-day streak', reward: 600 }
    ];
    
    return challenges.find(c => c.month === month);
  }
}
```

## Phase 8.3 Architecture Benefits

### Economic Model
- **Sustainable Rewards**: Balanced mGas earning and conversion rates
- **Quality Incentives**: Higher rewards for better AI interactions
- **Engagement Mechanisms**: Streaks, achievements, and social features
- **Anti-Inflation**: Minimum conversion thresholds and rate limiting

### Technical Implementation
- **Modular Design**: Clean separation of concerns across components
- **Extensible Architecture**: Easy addition of new achievements and events
- **Performance Optimized**: Efficient quality assessment algorithms
- **User Experience**: Responsive UI with professional animations

### Future Scalability
- **Real-time Events**: Foundation for live events and competitions
- **Advanced Analytics**: User behavior tracking and optimization
- **Community Features**: Enhanced social interactions and competitions
- **Integration Ready**: Prepared for Phase 8.4 anti-cheat systems

## Phase 8.4: Devnet Migration & Real Wallet Integration Patterns

### Current Challenge: Mock to Real Wallet Transition
**Pattern**: Transition from mock wallet simulation to actual Solana wallet integration
```
Mock Wallet (Current) → Real Wallet Connection → Devnet Integration → Production-Ready Testing
```

### Network Migration Pattern
```javascript
// Configuration migration pattern
// FROM: Localnet development
const LOCAL_CONFIG = {
  rpcUrl: 'http://localhost:8899',
  commitment: 'processed',
  programId: '8QRA7K4UHaFhsyRqrUAU7onsJhVHiP7FvwSHouD1dM29', // localnet
  lucidMint: 'G2bVsRy2xBiAAMeZDoFbH3526AKNPKa5SuCC9PCe2hTE'  // localnet
};

// TO: Devnet testing
const DEVNET_CONFIG = {
  rpcUrl: 'https://api.devnet.solana.com',
  commitment: 'confirmed',
  programId: 'NEW_DEVNET_PROGRAM_ID',  // Need to deploy
  lucidMint: 'NEW_DEVNET_MINT_ADDRESS' // Need to create
};
```

### Real Wallet Integration Pattern
```javascript
// Browser Extension Wallet Connection
// FROM: Mock wallet simulation
class MockWalletConnection {
  async connectWallet() {
    // Simulate wallet connection with hardcoded address
    this.wallet = {
      address: 'CDUauc4hYqPjBqZzhytmXd8DG4pjiwNjPn3cpCWNpToa',
      publicKey: 'CDUauc4hYqPjBqZzhytmXd8DG4pjiwNjPn3cpCWNpToa'
    };
    
    // Simulate random balances
    this.balance.mGas = Math.floor(Math.random() * 1000) + 500;
    this.balance.lucid = Math.floor(Math.random() * 100) + 50;
  }
}

// TO: Real Phantom wallet integration
class RealWalletConnection {
  async connectWallet() {
    if (!window.solana || !window.solana.isPhantom) {
      throw new Error('Phantom wallet not found');
    }
    
    try {
      // Request wallet connection
      const response = await window.solana.connect();
      this.wallet = {
        address: response.publicKey.toString(),
        publicKey: response.publicKey
      };
      
      // Query actual blockchain balances
      await this.updateRealBalances();
      
      // Set up wallet event listeners
      this.setupWalletListeners();
      
    } catch (error) {
      throw new Error(`Wallet connection failed: ${error.message}`);
    }
  }
  
  async updateRealBalances() {
    try {
      const connection = new Connection(this.rpcUrl);
      
      // Get LUCID token balance
      const lucidBalance = await connection.getTokenAccountBalance(
        this.getUserLucidATA()
      );
      
      // Get mGas balance from extension storage
      const mGasBalance = await this.getMGasBalance();
      
      this.balance = {
        lucid: lucidBalance.value.uiAmount || 0,
        mGas: mGasBalance || 0
      };
    } catch (error) {
      console.error('Balance update failed:', error);
    }
  }
  
  setupWalletListeners() {
    window.solana.on('connect', () => {
      this.onWalletConnect();
    });
    
    window.solana.on('disconnect', () => {
      this.onWalletDisconnect();
    });
    
    window.solana.on('accountChanged', (publicKey) => {
      this.onAccountChanged(publicKey);
    });
  }
}
```

### Devnet Deployment Pattern
```bash
# Phase 8.4 Deployment Sequence
# 1. Configure Solana CLI for devnet
solana config set --url devnet

# 2. Create and fund devnet wallet
solana-keygen new --outfile ~/.config/solana/devnet-keypair.json
solana airdrop 5 --keypair ~/.config/solana/devnet-keypair.json

# 3. Build and deploy programs to devnet
cd programs/thought-epoch
anchor build
anchor deploy --provider.cluster devnet

cd ../gas-utils
anchor build
anchor deploy --provider.cluster devnet

# 4. Create LUCID token on devnet
spl-token create-token --decimals 9
spl-token create-account <MINT_ADDRESS>
spl-token mint <MINT_ADDRESS> 1000000 <TOKEN_ACCOUNT>

# 5. Update configuration with new addresses
# Update offchain/src/utils/config.ts with devnet addresses
```

### Transaction Signing Pattern
```javascript
// Real transaction signing with Phantom
class DevnetTransactionHandler {
  async signAndSendTransaction(transaction) {
    try {
      // Add recent blockhash and fee payer
      const connection = new Connection(this.rpcUrl);
      const { blockhash } = await connection.getRecentBlockhash();
      
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.wallet.publicKey;
      
      // Sign transaction with Phantom
      const signedTransaction = await window.solana.signTransaction(transaction);
      
      // Send to devnet
      const signature = await connection.sendRawTransaction(
        signedTransaction.serialize()
      );
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');
      
      return signature;
    } catch (error) {
      throw new Error(`Transaction failed: ${error.message}`);
    }
  }
  
  async processThoughtWithRealTransaction(text) {
    try {
      // Create transaction for thought processing
      const transaction = await this.createThoughtTransaction(text);
      
      // Sign and send with real wallet
      const signature = await this.signAndSendTransaction(transaction);
      
      // Update local state after confirmation
      await this.updateLocalState(signature);
      
      return {
        success: true,
        signature,
        explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
```

### Error Handling Pattern for Real Wallet
```javascript
// Comprehensive error handling for real wallet integration
class WalletErrorHandler {
  constructor() {
    this.errorTypes = {
      WALLET_NOT_FOUND: 'wallet_not_found',
      CONNECTION_REJECTED: 'connection_rejected',
      TRANSACTION_FAILED: 'transaction_failed',
      INSUFFICIENT_FUNDS: 'insufficient_funds',
      NETWORK_ERROR: 'network_error',
      TIMEOUT: 'timeout'
    };
  }
  
  async handleWalletError(error, operation) {
    console.error(`Wallet error during ${operation}:`, error);
    
    // Determine error type
    const errorType = this.categorizeError(error);
    
    switch (errorType) {
      case this.errorTypes.WALLET_NOT_FOUND:
        return {
          success: false,
          error: 'Phantom wallet not found. Please install Phantom wallet.',
          action: 'install_phantom',
          recoverable: true
        };
        
      case this.errorTypes.CONNECTION_REJECTED:
        return {
          success: false,
          error: 'Wallet connection rejected. Please approve the connection.',
          action: 'retry_connection',
          recoverable: true
        };
        
      case this.errorTypes.TRANSACTION_FAILED:
        return {
          success: false,
          error: 'Transaction failed. Please check your balance and try again.',
          action: 'check_balance',
          recoverable: true
        };
        
      case this.errorTypes.INSUFFICIENT_FUNDS:
        return {
          success: false,
          error: 'Insufficient SOL for transaction fees. Please fund your wallet.',
          action: 'fund_wallet',
          recoverable: true
        };
        
      case this.errorTypes.NETWORK_ERROR:
        return {
          success: false,
          error: 'Network error. Please check your connection and try again.',
          action: 'retry',
          recoverable: true
        };
        
      case this.errorTypes.TIMEOUT:
        return {
          success: false,
          error: 'Transaction timed out. Please try again.',
          action: 'retry',
          recoverable: true
        };
        
      default:
        return {
          success: false,
          error: 'Unknown error occurred. Please try again.',
          action: 'retry',
          recoverable: false
        };
    }
  }
  
  categorizeError(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('phantom') || message.includes('wallet not found')) {
      return this.errorTypes.WALLET_NOT_FOUND;
    }
    
    if (message.includes('rejected') || message.includes('cancelled')) {
      return this.errorTypes.CONNECTION_REJECTED;
    }
    
    if (message.includes('insufficient funds') || message.includes('balance')) {
      return this.errorTypes.INSUFFICIENT_FUNDS;
    }
    
    if (message.includes('network') || message.includes('connection')) {
      return this.errorTypes.NETWORK_ERROR;
    }
    
    if (message.includes('timeout') || message.includes('timed out')) {
      return this.errorTypes.TIMEOUT;
    }
    
    return this.errorTypes.TRANSACTION_FAILED;
  }
}
```

### Configuration Management Pattern
```javascript
// Environment-aware configuration for devnet migration
class ConfigurationManager {
  constructor() {
    this.environments = {
      localnet: {
        rpcUrl: 'http://localhost:8899',
        commitment: 'processed',
        programId: '8QRA7K4UHaFhsyRqrUAU7onsJhVHiP7FvwSHouD1dM29',
        lucidMint: 'G2bVsRy2xBiAAMeZDoFbH3526AKNPKa5SuCC9PCe2hTE'
      },
      devnet: {
        rpcUrl: 'https://api.devnet.solana.com',
        commitment: 'confirmed',
        programId: 'DEVNET_PROGRAM_ID_PLACEHOLDER',
        lucidMint: 'DEVNET_MINT_ADDRESS_PLACEHOLDER'
      },
      mainnet: {
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        commitment: 'confirmed',
        programId: 'MAINNET_PROGRAM_ID_PLACEHOLDER',
        lucidMint: 'MAINNET_MINT_ADDRESS_PLACEHOLDER'
      }
    };
    
    this.currentEnvironment = 'localnet'; // Default to localnet
  }
  
  setEnvironment(env) {
    if (!this.environments[env]) {
      throw new Error(`Invalid environment: ${env}`);
    }
    
    this.currentEnvironment = env;
    this.notifyEnvironmentChange(env);
  }
  
  getConfig() {
    return {
      ...this.environments[this.currentEnvironment],
      environment: this.currentEnvironment
    };
  }
  
  isDevnet() {
    return this.currentEnvironment === 'devnet';
  }
  
  isMainnet() {
    return this.currentEnvironment === 'mainnet';
  }
  
  notifyEnvironmentChange(env) {
    console.log(`🌐 Environment switched to: ${env}`);
    
    // Update browser extension with new config
    chrome.storage.local.set({
      'lucid_environment': env,
      'lucid_config': this.getConfig()
    });
  }
}
```

### Phase 8.4 Implementation Benefits
- **Real Wallet Testing**: Actual Phantom integration on devnet
- **Production-Ready**: Environment preparation for mainnet deployment
- **Error Handling**: Comprehensive error management for real-world scenarios
- **User Experience**: Seamless wallet connection with native devnet support
- **Configuration Management**: Environment-aware configuration switching
- **Transaction Verification**: Real blockchain transaction confirmation
- **Network Resilience**: Proper handling of network issues and failures

The Phase 8.4 implementation provides the foundation for real-world wallet testing and prepares the system for production deployment on mainnet.
