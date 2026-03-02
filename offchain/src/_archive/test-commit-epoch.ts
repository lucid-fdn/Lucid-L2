// Quick test script to verify thought-epoch program works
import { Connection, PublicKey, SystemProgram, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, setProvider, Idl } from '@coral-xyz/anchor';
import * as fs from 'fs';
import { execSync } from 'child_process';

async function main() {
  console.log('=== Testing thought-epoch program directly ===\n');
  
  // 1. Load keypair from solana config
  const configOutput = execSync('solana config get', { encoding: 'utf8' });
  const keypairMatch = configOutput.match(/Keypair Path: (.+)/);
  if (!keypairMatch) {
    throw new Error('Could not find keypair path');
  }
  const configPath = keypairMatch[1].trim();
  console.log('📁 Keypair path:', configPath);
  
  const keypairData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  console.log('🔑 Wallet pubkey:', keypair.publicKey.toBase58());
  
  // 2. Connect to devnet
  const rpcUrl = 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  console.log('🌐 RPC URL:', rpcUrl);
  
  // Check balance
  const balance = await connection.getBalance(keypair.publicKey);
  console.log('💰 Balance:', balance / 1e9, 'SOL\n');
  
  // 3. Load IDL
  const idlPath = '../target/idl/thought_epoch.json';
  const idlJson = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
  console.log('📄 IDL loaded:', idlJson.metadata?.name || 'thought_epoch');
  console.log('   Program ID from IDL:', idlJson.address);
  
  // 4. Create provider and program
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  setProvider(provider);
  
  // Ensure metadata has address
  if (!idlJson.metadata) idlJson.metadata = {};
  idlJson.metadata.address = idlJson.address || '8QXiFjguJT4PLVzH6BYNMHXZ3eLRaoF8cwx23EBc44Q6';
  
  const program = new Program(idlJson as Idl, provider);
  console.log('✅ Program loaded');
  console.log('   Program ID:', program.programId.toBase58());
  console.log('   Provider wallet:', provider.wallet.publicKey.toBase58());
  console.log('   Methods:', Object.keys(program.methods));
  
  // 5. Derive PDA
  const authority = keypair.publicKey;
  const [epochPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('epoch'), authority.toBuffer()],
    program.programId
  );
  console.log('\n📍 Epoch PDA:', epochPDA.toBase58());
  
  // 6. Create test root (32 random bytes)
  const testRoot = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    testRoot[i] = Math.floor(Math.random() * 256);
  }
  console.log('🎲 Test root:', Buffer.from(testRoot).toString('hex').slice(0, 32) + '...');
  
  // 7. Try to commit epoch
  console.log('\n🚀 Attempting to commit epoch...\n');
  
  try {
    const tx = await program.methods
      .commitEpoch([...testRoot])
      .accounts({
        authority: authority,
        epochRecord: epochPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log('✅ SUCCESS! Transaction signature:', tx);
    console.log(`🔗 Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
  } catch (error: any) {
    console.error('❌ FAILED:', error.message);
    if (error.logs) {
      console.log('\nTransaction logs:');
      error.logs.forEach((log: string) => console.log('  ', log));
    }
  }
}

main().catch(console.error);
