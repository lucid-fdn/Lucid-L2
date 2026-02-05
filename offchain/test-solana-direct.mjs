/**
 * Direct Solana Program Test - Bypasses API epoch tracking
 * Tests the thought-epoch program directly on devnet
 */
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PROGRAM_ID = new PublicKey('J1JNYJB41UeyyR3qYFjwxZ2RsD71JRm3ULYZG6bLhm3c');
const RPC_URL = 'https://api.devnet.solana.com';

// Compute Anchor instruction discriminator
function getDiscriminator(instructionName) {
  const hash = createHash('sha256')
    .update(`global:${instructionName}`)
    .digest();
  return hash.slice(0, 8);
}

async function main() {
  console.log('======================================');
  console.log('  DIRECT SOLANA PROGRAM TEST');
  console.log('======================================\n');

  // Load keypair from Solana config
  const keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
  console.log(`Loading keypair from: ${keypairPath}`);
  
  if (!fs.existsSync(keypairPath)) {
    console.error('❌ Keypair not found at', keypairPath);
    process.exit(1);
  }

  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')));
  const wallet = Keypair.fromSecretKey(secretKey);
  console.log(`Authority: ${wallet.publicKey.toBase58()}`);

  // Connect to devnet
  const connection = new Connection(RPC_URL, 'confirmed');
  console.log(`Connected to: ${RPC_URL}`);

  // Check balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`Balance: ${balance / 1e9} SOL\n`);

  if (balance < 0.01 * 1e9) {
    console.error('❌ Insufficient balance. Need at least 0.01 SOL');
    process.exit(1);
  }

  // Derive PDA for epoch record
  const [epochRecordPDA, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('epoch'), wallet.publicKey.toBuffer()],
    PROGRAM_ID
  );
  console.log(`Epoch Record PDA: ${epochRecordPDA.toBase58()}`);
  console.log(`Bump: ${bump}`);

  // Our actual MMR root from the receipts
  const testRoot = Buffer.from(
    '04cb139cbf6659480b4f01115fd6bb2f58f1569d5477458ec03fb9468d5cb013',
    'hex'
  );
  console.log(`Merkle Root: ${testRoot.toString('hex')}\n`);

  // Build the commit_epoch instruction
  const discriminator = getDiscriminator('commit_epoch');
  console.log(`Discriminator: ${discriminator.toString('hex')}`);

  // Instruction data: 8-byte discriminator + 32-byte root
  const instructionData = Buffer.concat([discriminator, testRoot]);

  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: epochRecordPDA, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: instructionData,
  });

  console.log('🚀 Sending commit_epoch transaction...\n');

  try {
    const transaction = new Transaction().add(instruction);
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      { commitment: 'confirmed' }
    );

    console.log('✅ SUCCESS!');
    console.log(`Transaction: ${signature}`);
    console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet\n`);

    // Verify the account data
    console.log('Verifying on-chain data...');
    const accountInfo = await connection.getAccountInfo(epochRecordPDA);
    if (accountInfo) {
      // Skip 8-byte discriminator, read 32-byte root
      const onChainRoot = accountInfo.data.slice(8, 40);
      const onChainAuthority = new PublicKey(accountInfo.data.slice(40, 72));
      
      console.log(`On-chain root:      ${Buffer.from(onChainRoot).toString('hex')}`);
      console.log(`Expected root:      ${testRoot.toString('hex')}`);
      console.log(`Root match:         ${Buffer.from(onChainRoot).equals(testRoot) ? '✅' : '❌'}`);
      console.log(`On-chain authority: ${onChainAuthority.toBase58()}`);
      console.log(`Expected authority: ${wallet.publicKey.toBase58()}`);
      console.log(`Authority match:    ${onChainAuthority.equals(wallet.publicKey) ? '✅' : '❌'}`);
    }

    console.log('\n======================================');
    console.log('  TEST COMPLETE - PROGRAM WORKS!');
    console.log('======================================');

  } catch (error) {
    console.error('❌ Transaction failed:', error.message);
    if (error.logs) {
      console.error('Logs:', error.logs);
    }
    process.exit(1);
  }
}

main().catch(console.error);
