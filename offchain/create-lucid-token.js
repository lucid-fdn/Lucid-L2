#!/usr/bin/env node

/**
 * Create LUCID SPL Token and mint initial supply
 * This script creates a new SPL token for LUCID and mints tokens to the authority
 */

const {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} = require('@solana/web3.js');

const {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} = require('@solana/spl-token');

const fs = require('fs');
const path = require('path');

async function createLucidToken() {
  try {
    console.log('🚀 Creating LUCID SPL Token...');
    
    // Connect to Solana devnet
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    console.log('🔗 Connected to Solana devnet');
    
    // Load the authority keypair (same as used in CLI)
    const authorityKeypairPath = path.join(__dirname, 'memory-wallet.json');
    let authorityKeypair;
    
    try {
      // Try to load existing keypair from solana config
      const { execSync } = require('child_process');
      const configOutput = execSync('solana config get', { encoding: 'utf8' });
      const keypairMatch = configOutput.match(/Keypair Path: (.+)/);
      if (!keypairMatch) {
        throw new Error('Could not find keypair path in solana config');
      }
      const configPath = keypairMatch[1].trim();
      const keypairData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      authorityKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
      console.log(`📋 Using authority: ${authorityKeypair.publicKey.toBase58()}`);
    } catch (error) {
      console.error('❌ Could not load authority keypair from solana config');
      console.error('   Make sure you have solana CLI configured and a keypair set');
      console.error('   Error:', error.message);
      process.exit(1);
    }

    // Create the LUCID token mint
    console.log('🏭 Creating LUCID token mint...');
    const lucidMint = await createMint(
      connection,
      authorityKeypair,
      authorityKeypair.publicKey, // mint authority
      authorityKeypair.publicKey, // freeze authority
      9 // decimals (same as SOL)
    );

    console.log(`✅ LUCID token mint created: ${lucidMint.toBase58()}`);

    // Create associated token account for the authority
    console.log('💳 Creating associated token account...');
    const authorityTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      authorityKeypair,
      lucidMint,
      authorityKeypair.publicKey
    );

    console.log(`✅ Token account created: ${authorityTokenAccount.address.toBase58()}`);

    // Mint initial supply (1 million LUCID tokens)
    const initialSupply = 1_000_000 * Math.pow(10, 9); // 1M tokens with 9 decimals
    console.log('💰 Minting initial supply...');
    
    await mintTo(
      connection,
      authorityKeypair,
      lucidMint,
      authorityTokenAccount.address,
      authorityKeypair.publicKey,
      initialSupply
    );

    console.log(`✅ Minted ${initialSupply / Math.pow(10, 9)} LUCID tokens`);

    // Update gas.ts with the new mint address
    console.log('⚙️  Updating gas.ts configuration...');
    const gasFilePath = path.join(__dirname, 'src', 'solana', 'gas.ts');
    let gasContent = fs.readFileSync(gasFilePath, 'utf8');
    
    // Replace the LUCID_MINT address
    gasContent = gasContent.replace(
      /export const LUCID_MINT = new PublicKey\('.*?'\);/,
      `export const LUCID_MINT = new PublicKey('${lucidMint.toBase58()}');`
    );
    
    // Update the comment
    gasContent = gasContent.replace(
      /\/\/ LUCID mint address configured: .*$/m,
      `// LUCID mint address configured: ${lucidMint.toBase58()}`
    );
    
    fs.writeFileSync(gasFilePath, gasContent);

    console.log('');
    console.log('🎉 LUCID Token Setup Complete!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   Mint Address: ${lucidMint.toBase58()}`);
    console.log(`   Authority: ${authorityKeypair.publicKey.toBase58()}`);
    console.log(`   Token Account: ${authorityTokenAccount.address.toBase58()}`);
    console.log(`   Initial Supply: ${initialSupply / Math.pow(10, 9)} LUCID`);
    console.log('');
    console.log('✅ gas.ts has been updated with the new mint address');
    console.log('');
    console.log('🚀 Ready to test with token burning enabled!');
    console.log('   Try: npm run cli run "Hello LUCID!"');

  } catch (error) {
    console.error('❌ Error creating LUCID token:', error);
    process.exit(1);
  }
}

createLucidToken();
