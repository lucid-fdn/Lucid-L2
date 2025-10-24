/**
 * Thought Epoch Program - Devnet Test Suite
 * Production tests for deployed devnet program
 */

const anchor = require('@coral-xyz/anchor');
const assert = require('assert');

describe('Thought Epoch - Devnet Tests', () => {
  // Connect to devnet
  const connection = new anchor.web3.Connection('https://api.devnet.solana.com', 'confirmed');
  const wallet = anchor.AnchorProvider.env().wallet;
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);
  
  // Use anchor workspace to load the program
  const program = anchor.workspace.ThoughtEpoch;

  console.log('\n🔍 Test Configuration:');
  console.log('   Program ID:', program.programId.toBase58());
  console.log('   Wallet:', wallet.publicKey.toBase58());
  console.log('   Network: Devnet\n');

  it('should commit a single Merkle root on-chain', async () => {
    console.log('\n📝 Test 1: Single Epoch Commitment');
    
    // Generate test root
    const root = Uint8Array.from(Array(32).fill(42));
    
    // Derive PDA
    const [pda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from('epoch'), provider.wallet.publicKey.toBuffer()],
      program.programId
    );
    
    console.log('   Root:', Array.from(root).slice(0, 4).join(',') + '...');
    console.log('   PDA:', pda.toBase58());
    
    // Commit epoch
    const tx = await program.methods
      .commitEpoch([...root])
      .accounts({
        epochRecord: pda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    
    console.log('   Transaction:', tx);
    
    // Verify the stored record
    const record = await program.account.epochRecord.fetch(pda);
    assert.ok(record.merkleRoot.every(b => b === 42), 'Merkle root should match');
    assert.ok(record.authority.equals(provider.wallet.publicKey), 'Authority should match');
    
    console.log('✅ Single epoch commitment successful');
  });

  it('should commit batch of Merkle roots', async () => {
    console.log('\n📝 Test 2: Batch Epoch Commitment');
    
    // Generate batch of roots
    const batchSize = 5;
    const roots = [];
    for (let i = 0; i < batchSize; i++) {
      roots.push(Array.from(Uint8Array.from(Array(32).fill(i + 1))));
    }
    
    // Derive batch PDA
    const [pda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from('epochs'), provider.wallet.publicKey.toBuffer()],
      program.programId
    );
    
    console.log('   Batch size:', batchSize);
    console.log('   PDA:', pda.toBase58());
    
    // Commit batch
    const tx = await program.methods
      .commitEpochs(roots)
      .accounts({
        epochRecordBatch: pda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    
    console.log('   Transaction:', tx);
    
    // Verify batch
    const batch = await program.account.epochRecordBatch.fetch(pda);
    assert.equal(batch.roots.length, batchSize, 'Batch size should match');
    assert.ok(batch.authority.equals(provider.wallet.publicKey), 'Authority should match');
    
    // Verify each root
    for (let i = 0; i < batchSize; i++) {
      assert.ok(batch.roots[i].every(b => b === i + 1), `Root ${i} should match`);
    }
    
    console.log('✅ Batch commitment successful');
  });

  it('should handle maximum batch size (16 roots)', async () => {
    console.log('\n📝 Test 3: Maximum Batch Size');
    
    const maxBatch = 16;
    const roots = [];
    for (let i = 0; i < maxBatch; i++) {
      roots.push(Array.from(Uint8Array.from(Array(32).fill(i + 10))));
    }
    
    const [pda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from('epochs'), provider.wallet.publicKey.toBuffer()],
      program.programId
    );
    
    console.log('   Batch size:', maxBatch, '(maximum)');
    
    const tx = await program.methods
      .commitEpochs(roots)
      .accounts({
        epochRecordBatch: pda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    
    console.log('   Transaction:', tx);
    
    const batch = await program.account.epochRecordBatch.fetch(pda);
    assert.equal(batch.roots.length, maxBatch, 'Should handle max batch size');
    
    console.log('✅ Maximum batch size handled');
  });

  it('should reject oversized batch (17 roots)', async () => {
    console.log('\n📝 Test 4: Reject Oversized Batch');
    
    const oversized = 17;
    const roots = [];
    for (let i = 0; i < oversized; i++) {
      roots.push(Array.from(Uint8Array.from(Array(32).fill(i))));
    }
    
    const [pda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from('epochs'), provider.wallet.publicKey.toBuffer()],
      program.programId
    );
    
    console.log('   Batch size:', oversized, '(should fail)');
    
    try {
      await program.methods
        .commitEpochs(roots)
        .accounts({
          epochRecordBatch: pda,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      
      assert.fail('Should have failed with BatchTooLarge error');
    } catch (error) {
      assert.ok(error.toString().includes('BatchTooLarge'), 'Should get BatchTooLarge error');
      console.log('✅ Correctly rejected oversized batch');
    }
  });

  it('should handle edge case: all-zero root', async () => {
    console.log('\n📝 Test 5: All-Zero Root');
    
    const zeroRoot = Uint8Array.from(Array(32).fill(0));
    
    const [pda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from('epoch'), provider.wallet.publicKey.toBuffer()],
      program.programId
    );
    
    const tx = await program.methods
      .commitEpoch([...zeroRoot])
      .accounts({
        epochRecord: pda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    
    console.log('   Transaction:', tx);
    
    const record = await program.account.epochRecord.fetch(pda);
    assert.ok(record.merkleRoot.every(b => b === 0), 'Should store all-zero root');
    
    console.log('✅ All-zero root handled');
  });

  it('should handle edge case: all-ones root', async () => {
    console.log('\n📝 Test 6: All-Ones Root (255)');
    
    const onesRoot = Uint8Array.from(Array(32).fill(255));
    
    const [pda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from('epoch'), provider.wallet.publicKey.toBuffer()],
      program.programId
    );
    
    const tx = await program.methods
      .commitEpoch([...onesRoot])
      .accounts({
        epochRecord: pda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    
    console.log('   Transaction:', tx);
    
    const record = await program.account.epochRecord.fetch(pda);
    assert.ok(record.merkleRoot.every(b => b === 255), 'Should store all-ones root');
    
    console.log('✅ All-ones root handled');
  });

  it('should update existing epoch record', async () => {
    console.log('\n📝 Test 7: Update Existing Record');
    
    const root1 = Uint8Array.from(Array(32).fill(100));
    const root2 = Uint8Array.from(Array(32).fill(200));
    
    const [pda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from('epoch'), provider.wallet.publicKey.toBuffer()],
      program.programId
    );
    
    // First commit
    await program.methods
      .commitEpoch([...root1])
      .accounts({
        epochRecord: pda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    
    // Update
    const tx = await program.methods
      .commitEpoch([...root2])
      .accounts({
        epochRecord: pda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    
    console.log('   Transaction:', tx);
    
    const record = await program.account.epochRecord.fetch(pda);
    assert.ok(record.merkleRoot.every(b => b === 200), 'Should have updated root');
    
    console.log('✅ Record update successful');
  });
});
