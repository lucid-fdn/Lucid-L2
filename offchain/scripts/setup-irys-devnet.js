#!/usr/bin/env node
// =============================================================================
// Irys Devnet Setup Script
// Usage: node scripts/setup-irys-devnet.js
//
// Prerequisites:
//   1. Run: solana airdrop 1 <pubkey> --url devnet
//      Or visit https://faucet.solana.com and paste the pubkey
//   2. Then run this script to fund Irys and test an upload
// =============================================================================

const fs = require('fs');
const path = require('path');

const KEYPAIR_PATH = path.join(__dirname, '..', 'keys', 'irys-keypair.json');

async function main() {
  // Load keypair
  if (!fs.existsSync(KEYPAIR_PATH)) {
    console.error('Keypair not found at:', KEYPAIR_PATH);
    console.error('Run: solana-keygen new --no-bip39-passphrase -o', KEYPAIR_PATH);
    process.exit(1);
  }

  const keypairBytes = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
  const wallet = new Uint8Array(keypairBytes);

  console.log('=== Irys Devnet Setup ===\n');

  // Initialize uploader
  const { Uploader } = require('@irys/upload');
  const { Solana } = require('@irys/upload-solana');

  console.log('Initializing Irys uploader (devnet)...');
  const uploader = await Uploader(Solana)
    .withWallet(wallet)
    .withRpc('https://api.devnet.solana.com')
    .devnet();

  console.log('Address:', uploader.address);

  // Check balance
  const balance = await uploader.getBalance();
  console.log('Current Irys balance:', balance.toString(), 'lamports');

  if (balance.toString() === '0' || BigInt(balance.toString()) < 100000n) {
    console.log('\nFunding Irys with 0.5 SOL...');
    try {
      const fundTx = await uploader.fund(uploader.utils.toAtomic(0.5));
      console.log('Funded! TX:', fundTx.id);
    } catch (err) {
      console.error('Funding failed:', err.message);
      console.error('\nMake sure the keypair has devnet SOL:');
      console.error('  solana airdrop 1 ' + uploader.address + ' --url devnet');
      console.error('  Or visit https://faucet.solana.com and paste: ' + uploader.address);
      process.exit(1);
    }

    const newBalance = await uploader.getBalance();
    console.log('New Irys balance:', newBalance.toString(), 'lamports');
  }

  // Test upload
  console.log('\nTest upload...');
  const testData = Buffer.from(JSON.stringify({
    test: true,
    timestamp: Date.now(),
    message: 'Lucid-L2 Irys devnet test',
  }));

  const receipt = await uploader.upload(testData, {
    tags: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'App-Name', value: 'Lucid-L2' },
      { name: 'Type', value: 'test' },
    ],
  });

  console.log('Upload successful!');
  console.log('  TX ID:', receipt.id);
  console.log('  URL: https://arweave.net/' + receipt.id);

  // Verify retrieval
  console.log('\nVerifying retrieval...');
  const res = await fetch('https://arweave.net/' + receipt.id);
  if (res.ok) {
    const data = await res.json();
    console.log('  Retrieved:', JSON.stringify(data));
    console.log('  PASS!');
  } else {
    console.log('  Note: Arweave may take a few minutes to propagate. Check later at:');
    console.log('  https://arweave.net/' + receipt.id);
  }

  // Output env var (JSON array format — ArweaveStorage.ts parses this)
  const envKey = JSON.stringify(Array.from(keypairBytes));

  console.log('\n=== Setup Complete ===\n');
  console.log('Env vars to set on your server:');
  console.log('  DEPIN_PERMANENT_PROVIDER=arweave');
  console.log('  IRYS_NETWORK=devnet');
  console.log('  IRYS_PRIVATE_KEY=' + envKey);
  console.log('\n(For mainnet, change IRYS_NETWORK=mainnet and fund with real SOL)');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
