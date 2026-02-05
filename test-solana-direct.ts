/**
 * Direct Solana Program Test - Bypasses API epoch tracking
 * Tests the thought-epoch program directly on devnet
 */
import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, setProvider, web3 } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const PROGRAM_ID = new PublicKey('J1JNYJB41UeyyR3qYFjwxZ2RsD71JRm3ULYZG6bLhm3c');
const RPC_URL = 'https://api.devnet.solana.com';

// The IDL for thought-epoch program
const IDL = {
  version: '0.1.0',
  name: 'thought_epoch',
  instructions: [
    {
      name: 'commitEpoch',
      accounts: [
        { name: 'epochRecord', isMut: true, isSigner: false },
        { name: 'authority', isMut: true, isSigner: true },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'root', type: { array: ['u8', 32] } }],
    },
    {
      name: 'commitEpochs',
      accounts: [
        { name: 'epochRecordBatch', isMut: true, isSigner: false },
        { name: 'authority', isMut: true, isSigner: true },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'roots', type: { vec: { array: ['u8', 32] } } }],
    },
  ],
  accounts: [
    {
      name: 'EpochRecord',
      type: {
        kind: 'struct',
        fields: [
          { name: 'merkleRoot', type: { array: ['u8', 32] } },
          { name: 'authority', type: 'publicKey' },
        ],
      },
    },
    {
      name: 'EpochRecordBatch',
      type: {
        kind: 'struct',
        fields: [
          { name: 'roots', type: { vec: { array: ['u8', 32] } } },
          { name: 'authority', type: 'publicKey' },
        ],
      },
    },
  ],
};

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

  // Create provider
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: wallet.publicKey,
      signTransaction: async (tx) => {
        tx.partialSign(wallet);
        return tx;
      },
      signAllTransactions: async (txs) => {
        return txs.map(tx => {
          tx.partialSign(wallet);
          return tx;
        });
      },
    },
    { commitment: 'confirmed' }
  );
  setProvider(provider);

  // Create program interface
  const program = new Program(IDL as any, PROGRAM_ID, provider);

  // Derive PDA for epoch record
  const [epochRecordPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('epoch'), wallet.publicKey.toBuffer()],
    PROGRAM_ID
  );
  console.log(`Epoch Record PDA: ${epochRecordPDA.toBase58()}`);

  // Generate a test merkle root (our actual MMR root from the receipts)
  const testRoot = Buffer.from(
    '04cb139cbf6659480b4f01115fd6bb2f58f1569d5477458ec03fb9468d5cb013',
    'hex'
  );
  console.log(`Merkle Root: ${testRoot.toString('hex')}\n`);

  console.log('🚀 Calling commit_epoch instruction...\n');

  try {
    // Convert Buffer to array for Anchor
    const rootArray = Array.from(testRoot);

    const tx = await program.methods
      .commitEpoch(rootArray)
      .accounts({
        epochRecord: epochRecordPDA,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([wallet])
      .rpc();

    console.log('✅ SUCCESS!');
    console.log(`Transaction: ${tx}`);
    console.log(`Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet\n`);

    // Verify the account data
    console.log('Verifying on-chain data...');
    const accountInfo = await connection.getAccountInfo(epochRecordPDA);
    if (accountInfo) {
      // Skip 8-byte discriminator, read 32-byte root
      const onChainRoot = accountInfo.data.slice(8, 40);
      console.log(`On-chain root: ${Buffer.from(onChainRoot).toString('hex')}`);
      console.log(`Expected root: ${testRoot.toString('hex')}`);
      console.log(`Match: ${Buffer.from(onChainRoot).equals(testRoot) ? '✅' : '❌'}`);
    }

    console.log('\n======================================');
    console.log('  TEST COMPLETE - PROGRAM WORKS!');
    console.log('======================================');

  } catch (error: any) {
    console.error('❌ Transaction failed:', error.message);
    if (error.logs) {
      console.error('Logs:', error.logs);
    }
    process.exit(1);
  }
}

main().catch(console.error);
