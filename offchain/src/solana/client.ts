// offchain/src/solana/client.ts
import { Connection, PublicKey, SystemProgram, Keypair, TransactionInstruction, Commitment } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, setProvider, Idl } from '@coral-xyz/anchor';
import * as fs from 'fs';
import path from 'path';
import { getRPC_URL, getCOMMITMENT, getPROGRAM_ID } from '../utils/config';
import { getSolanaKeypair } from './keypair';

// Cache the program instance to avoid re-initialization issues
let cachedProgram: Program | null = null;

/**
 * Reset the cached Solana program instance.
 * Call this after rebuilding the IDL or when experiencing signing issues.
 */
export function resetSolanaCache(): void {
  cachedProgram = null;
  console.log('🔄 Solana program cache cleared');
}

export function initSolana(): Program {
  // Return cached instance if available
  if (cachedProgram) {
    return cachedProgram;
  }
  
  const rpcUrl = getRPC_URL();
  const commitment = getCOMMITMENT() as Commitment;
  const programId = getPROGRAM_ID();
  
  const connection = new Connection(rpcUrl, commitment);
  const keypair = getKeypair();
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment });
  
  // Set the provider globally
  setProvider(provider);
  
  // Load the IDL with absolute path
  const idlPath = path.resolve(__dirname, '../../../target/idl/thought_epoch.json');
  const idlJson = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
  
  console.log('Program ID:', programId.toString());
  console.log('IDL name:', idlJson.name || idlJson.metadata?.name);
  console.log('IDL version:', idlJson.version || idlJson.metadata?.version);

  // Ensure metadata exists with program address
  if (!idlJson.metadata) {
    idlJson.metadata = {};
  }
  idlJson.metadata.address = programId.toString();

  // Create Program using the IDL with embedded address in metadata
  console.log('Creating Anchor Program...');
  try {
    // Use two-parameter constructor: Program(idl, provider)
    // The programId is read from idl.metadata.address
    const program = new Program(idlJson as Idl, provider);
    console.log('✅ Program created successfully');
    console.log('Program ID:', program.programId.toString());
    console.log('Available methods:', Object.keys(program.methods));
    
    // Cache the successfully created program
    cachedProgram = program;
    
    return program;
  } catch (error) {
    console.error('❌ Program creation failed:', error);
    console.error('Error details:', {
      programId: programId.toString(),
      idlMetadata: idlJson.metadata
    });
    throw error;
  }
}

export function getConnection(): Connection {
  const rpcUrl = getRPC_URL();
  const commitment = getCOMMITMENT() as Commitment;
  return new Connection(rpcUrl, commitment);
}

export function getKeypair(): Keypair {
  return getSolanaKeypair();
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
  const programId = getPROGRAM_ID();
  return new TransactionInstruction({
    keys: [
      { pubkey: epochAccount, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data: merkleRoot,
  });
}
