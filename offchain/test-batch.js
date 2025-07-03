const anchor = require('@coral-xyz/anchor');
const { SystemProgram, PublicKey } = require('@solana/web3.js');

async function testBatch() {
  // Set up provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load the program
  const programId = new PublicKey('GdbWhvXLg55ACeauwTPB4rXpcgHxjKyT6YuTGeH5orCo');
  const idl = require('../target/idl/thought_epoch.json');
  const program = new anchor.Program(idl, programId, provider);

  console.log('Program loaded successfully');
  console.log('Available methods:', Object.keys(program.methods));

  // Test single commit
  try {
    const authority = provider.wallet.publicKey;
    const [epochPda] = await PublicKey.findProgramAddress(
      [Buffer.from('epoch'), authority.toBuffer()],
      programId
    );

    console.log('Testing single commit...');
    const testRoot = Array.from(Buffer.alloc(32, 1)); // Simple test data

    const tx = await program.methods
      .commitEpoch(testRoot)
      .accounts({
        epochRecord: epochPda,
        authority: authority,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log('✅ Single commit successful:', tx);
  } catch (error) {
    console.log('❌ Single commit failed:', error.message);
  }

  // Test batch commit
  try {
    const authority = provider.wallet.publicKey;
    const [batchPda] = await PublicKey.findProgramAddress(
      [Buffer.from('epochs'), authority.toBuffer()],
      programId
    );

    console.log('Testing batch commit...');
    const testRoots = [
      Array.from(Buffer.alloc(32, 1)),
      Array.from(Buffer.alloc(32, 2)),
      Array.from(Buffer.alloc(32, 3))
    ];

    const tx = await program.methods
      .commitEpochs(testRoots)
      .accounts({
        epochRecordBatch: batchPda,
        authority: authority,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log('✅ Batch commit successful:', tx);
  } catch (error) {
    console.log('❌ Batch commit failed:', error.message);
  }
}

testBatch().catch(console.error);
