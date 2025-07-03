// offchain/src/solana/client.ts
import { Connection, PublicKey, SystemProgram, Keypair, TransactionInstruction } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, setProvider } from '@coral-xyz/anchor';
import * as fs from 'fs';
import path from 'path';
import { RPC_URL, COMMITMENT, PROGRAM_ID } from '../utils/config';

export function initSolana(): Program {
  const connection = new Connection(RPC_URL, COMMITMENT);
  const keypair = getKeypair();
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: COMMITMENT });
  
  // Set the provider globally
  setProvider(provider);
  
  // Load the IDL with absolute path
  const idlPath = path.resolve(__dirname, '../../../target/idl/thought_epoch.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
  
  // Log for debugging
  console.log('Program ID:', PROGRAM_ID.toString());
  console.log('IDL Metadata:', idl.metadata);
  console.log('IDL Path:', idlPath);
  console.log('IDL Instructions:', JSON.stringify(idl.instructions, null, 2));

  // Check if there are any undefined addresses in the IDL
  console.log('Checking IDL for undefined addresses...');
  
  // Only set the metadata address, don't modify the IDL structure
  if (!idl.metadata) {
    idl.metadata = {};
  }
  idl.metadata.address = PROGRAM_ID.toString();

  // Add system program address to prevent undefined address issues
  if (!idl.constants) {
    idl.constants = [];
  }
  
  // Ensure system program is properly defined
  const systemProgramId = SystemProgram.programId.toString();
  console.log('System Program ID:', systemProgramId);

  // Try to identify what's causing the undefined address issue
  console.log('Creating Program...');
  try {
    // Use direct Program creation
    console.log('Trying direct Program creation...');
    const program = new Program(idl, provider);
    console.log('Program created successfully');
    console.log('Available methods:', Object.keys(program.methods));
    console.log('Program ID from program object:', program.programId.toString());
    return program;
  } catch (error) {
    console.log('Program creation failed:', error);
    throw error;
  }
}

export function getConnection(): Connection {
  return new Connection(RPC_URL, COMMITMENT);
}

export function getKeypair(): Keypair {
  // Use the same method as working scripts - get from solana config
  const { execSync } = require('child_process');
  const configOutput = execSync('solana config get', { encoding: 'utf8' });
  const keypairMatch = configOutput.match(/Keypair Path: (.+)/);
  const configPath = keypairMatch[1].trim();
  const keypairData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return Keypair.fromSecretKey(new Uint8Array(keypairData));
}

export async function deriveEpochPDA(authority: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddress(
    [Buffer.from('epoch'), authority.toBuffer()],
    programId
  );
}

export async function deriveEpochBatchPDA(authority: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddress(
    [Buffer.from('epochs'), authority.toBuffer()],
    programId
  );
}

export function createCommitInstruction(
  epochAccount: PublicKey,
  authority: PublicKey,
  merkleRoot: Buffer
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: epochAccount, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: merkleRoot,
  });
}
