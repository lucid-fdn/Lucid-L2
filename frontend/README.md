# Lucid L2™ Frontend - Phase 3a

A Next.js frontend for the Lucid L2™ blockchain thought commitment system with Solana Wallet Adapter integration.

## Features

- **Wallet Integration**: Connect with Phantom, Solflare, and other Solana wallets
- **Single Thought Commitment**: Submit individual thoughts to the blockchain
- **Batch Thought Commitment**: Submit multiple thoughts in a single transaction for gas savings
- **Real-time Gas Cost Display**: See iGas and mGas costs before committing
- **Transaction History**: View committed thought epochs with blockchain explorer links
- **Responsive Design**: Modern UI with Tailwind CSS

## Prerequisites

1. **Backend API Running**: The offchain API server must be running on port 3001
2. **Solana Test Validator**: Local test validator should be running on port 8899
3. **LUCID Tokens**: Wallet must have LUCID tokens for gas payments
4. **Solana Wallet**: Browser extension wallet (Phantom, Solflare, etc.)

## Installation

```bash
cd frontend
npm install
```

## Development

```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`

## Usage

### 1. Connect Wallet
- Click "Select Wallet" to connect your Solana wallet
- Ensure your wallet is connected to localhost:8899 (local test validator)
- Make sure you have LUCID tokens for gas payments

### 2. Single Thought Commitment
- Navigate to the "Single Thought" tab
- Enter your thought in the text area
- Review gas cost: 1 iGas + 5 mGas = 6 $LUCID
- Click "Commit Thought" to submit to blockchain

### 3. Batch Thought Commitment
- Navigate to the "Batch Thoughts" tab
- Add multiple thoughts using "+ Add Thought"
- Review gas cost: 2 iGas + (5 × thoughts) mGas
- See gas savings percentage for batches
- Click "Commit Batch" to submit all thoughts in one transaction

### 4. View History
- See all committed thought epochs in the history section
- Click "View Transaction" to see details on Solana Explorer
- Each entry shows the thought text, merkle root, and gas costs

## Gas Cost Structure

### Single Thoughts
- **iGas (Instruction Gas)**: 1 $LUCID per transaction
- **mGas (Memory Gas)**: 5 $LUCID per thought
- **Total**: 6 $LUCID per single thought

### Batch Thoughts
- **iGas (Instruction Gas)**: 2 $LUCID per batch transaction
- **mGas (Memory Gas)**: 5 $LUCID per thought in batch
- **Total**: 2 + (5 × number of thoughts) $LUCID
- **Savings**: Significant gas reduction for multiple thoughts

## API Endpoints

The frontend connects to these backend endpoints:

- `POST /run` - Submit single thought
- `POST /batch` - Submit batch of thoughts

## Architecture

### Components
- `WalletContextProvider.tsx` - Solana wallet adapter setup
- `LucidInterface.tsx` - Main UI component with thought submission
- `page.tsx` - Next.js app router page

### Key Features
- **Wallet Adapter Integration**: Seamless wallet connection
- **Real-time Gas Calculation**: Dynamic cost display
- **Batch Optimization**: Visual gas savings indicators
- **Transaction Tracking**: Links to blockchain explorer
- **Error Handling**: User-friendly error messages

## Configuration

### Environment Variables
- `NODE_ENV` - Determines API endpoint (development/production)
- Backend API URL is configured in `LucidInterface.tsx`

### Wallet Configuration
- Supports localhost:8899 for development
- Can be configured for devnet/mainnet in `WalletContextProvider.tsx`

## Troubleshooting

### Common Issues

1. **"Failed to submit thought"**
   - Ensure backend API is running on port 3001
   - Check that Solana test validator is running
   - Verify wallet has sufficient LUCID tokens

2. **Wallet Connection Issues**
   - Ensure wallet extension is installed
   - Check that wallet is connected to correct network
   - Try refreshing the page and reconnecting

3. **Transaction Failures**
   - Verify LUCID token balance
   - Check that program is deployed correctly
   - Ensure wallet has SOL for transaction fees

### Development Tips

- Use browser developer tools to monitor API calls
- Check console for detailed error messages
- Verify network configuration in wallet settings

## Next Steps

Phase 3a provides the foundation for:
- **Phase 3b**: Real AI integration (replace mock inference)
- **Production Deployment**: Move from localhost to live networks
- **Enhanced UI**: Additional features and optimizations
- **Mobile Support**: Responsive design improvements

## Dependencies

- Next.js 15.3.4
- React 19
- Tailwind CSS
- @solana/wallet-adapter-react
- @solana/wallet-adapter-react-ui
- @solana/web3.js
- TypeScript

## License

Part of the Lucid L2™ project - see main project README for license information.
