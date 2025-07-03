#!/usr/bin/env node

/**
 * Check LUCID token account details for debugging
 */

const {
  Connection,
  Keypair,
  PublicKey,
} = require('@solana/web3.js');

const {
  getAssociatedTokenAddress,
  getAccount,
} = require('@solana/spl-token');

const fs = require('fs');
const path = require('path');

async function checkTokenAccount() {
  try {
    console.log('🔍 Checking LUCID token account details...');
    
    // Connect to local test validator
    const connection = new Connection('http://localhost:8899', 'confirmed');
    
    // Load the authority keypair
    const { execSync } = require('child_process');
    const configOutput = execSync('solana config get', { encoding: 'utf8' });
    const keypairMatch = configOutput.match(/Keypair Path: (.+)/);
    const configPath = keypairMatch[1].trim();
    const keypairData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const authorityKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`📋 Authority: ${authorityKeypair.publicKey.toBase58()}`);
    
    // LUCID mint address from gas.ts
    const LUCID_MINT = new PublicKey('7cBsSHBB4nSVQy6ceUvmrA8Z2ks8Me8AjxSUqvJ2q1S9');
    console.log(`🏭 LUCID Mint: ${LUCID_MINT.toBase58()}`);
    
    // Get associated token address
    const associatedTokenAddress = await getAssociatedTokenAddress(
      LUCID_MINT,
      authorityKeypair.publicKey
    );
    
    console.log(`💳 Expected ATA: ${associatedTokenAddress.toBase58()}`);
    
    // Check if the account exists and get its details
    try {
      const tokenAccount = await getAccount(connection, associatedTokenAddress);
      console.log('✅ Token account found!');
      console.log(`   Address: ${tokenAccount.address.toBase58()}`);
      console.log(`   Mint: ${tokenAccount.mint.toBase58()}`);
      console.log(`   Owner: ${tokenAccount.owner.toBase58()}`);
      console.log(`   Amount: ${tokenAccount.amount.toString()}`);
      console.log(`   Decimals: ${tokenAccount.decimals}`);
      console.log(`   Is Frozen: ${tokenAccount.isFrozen}`);
      
      // Verify mint matches
      if (tokenAccount.mint.equals(LUCID_MINT)) {
        console.log('✅ Mint address matches!');
      } else {
        console.log('❌ Mint address mismatch!');
      }
      
      // Verify owner matches
      if (tokenAccount.owner.equals(authorityKeypair.publicKey)) {
        console.log('✅ Owner matches!');
      } else {
        console.log('❌ Owner mismatch!');
      }
      
    } catch (error) {
      console.log('❌ Token account not found or error:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkTokenAccount();
