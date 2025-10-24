/**
 * Thought Epoch Program - Complete Test Suite
 * Production-ready tests for Merkle root commitment functionality
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  generateMerkleRoot,
  generateMerkleRoots,
  createFundedWallet,
  confirmTransaction,
  TEST_CONSTANTS
} from "./helpers/fixtures";
import {
  assertPublicKeyEquals,
  assertBytesEqual,
  assertAccountExists,
  assertBatchSize,
  TestResultsLogger
} from "./helpers/assertions";

describe("Thought Epoch Program - Complete Tests", () => {
  // Test environment setup
  const provider = anchor.AnchorProvider.local("https://api.devnet.solana.com");
  anchor.setProvider(provider);
  
  const program = anchor.workspace.ThoughtEpoch as Program;
  const logger = new TestResultsLogger();
  
  describe("1. Single Epoch Commitment", () => {
    it("should commit a single Merkle root on-chain", async () => {
      const endTest = logger.startTest("Single epoch commitment");
      
      try {
        const root = generateMerkleRoot(42);
        const rootArray = Array.from(root);
        
        // Derive PDA for epoch record
        const [pda] = await PublicKey.findProgramAddress(
          [Buffer.from("epoch"), provider.wallet.publicKey.toBuffer()],
          program.programId
        );
        
        console.log("\n📝 Committing epoch with root:", root.slice(0, 4).join(",") + "...");
        console.log("   PDA:", pda.toBase58());
        
        // Call commit_epoch instruction
        const tx = await program.methods
          .commitEpoch(rootArray)
          .accounts({
            epochRecord: pda,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        await confirmTransaction(provider.connection, tx);
        console.log("   Transaction:", tx);
        
        // Fetch and verify the stored record
        // @ts-ignore - Anchor workspace types
        const record = await program.account.epochRecord.fetch(pda);
        
        assertBytesEqual(record.merkleRoot, rootArray, "Merkle root should match");
        assertPublicKeyEquals(record.authority, provider.wallet.publicKey, "Authority should match");
        
        console.log("✅ Single epoch commitment successful");
        endTest();
      } catch (error: any) {
        logger.recordFailure("Single epoch commitment", error.toString(), 0);
        throw error;
      }
    });
    
    it("should allow updating an existing epoch record", async () => {
      const endTest = logger.startTest("Update epoch record");
      
      try {
        const root1 = generateMerkleRoot(1);
        const root2 = generateMerkleRoot(2);
        
        const [pda] = await PublicKey.findProgramAddress(
          [Buffer.from("epoch"), provider.wallet.publicKey.toBuffer()],
          program.programId
        );
        
        // First commit
        await program.methods
          .commitEpoch(Array.from(root1))
          .accounts({
            epochRecord: pda,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        // Update with new root
        await program.methods
          .commitEpoch(Array.from(root2))
          .accounts({
            epochRecord: pda,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        // @ts-ignore - Anchor workspace types
        const record = await program.account.epochRecord.fetch(pda);
        assertBytesEqual(record.merkleRoot, Array.from(root2), "Should have updated root");
        
        console.log("✅ Epoch record update successful");
        endTest();
      } catch (error: any) {
        logger.recordFailure("Update epoch record", error.toString(), 0);
        throw error;
      }
    });
  });
  
  describe("2. Batch Epoch Commitments", () => {
    it("should commit multiple epochs in a single transaction", async () => {
      const endTest = logger.startTest("Batch commit");
      
      try {
        const batchSize = 5;
        const roots = generateMerkleRoots(batchSize);
        
        const [pda] = await PublicKey.findProgramAddress(
          [Buffer.from("epochs"), provider.wallet.publicKey.toBuffer()],
          program.programId
        );
        
        console.log("\n📝 Batch committing", batchSize, "epochs");
        
        const tx = await program.methods
          .commitEpochs(roots)
          .accounts({
            epochRecordBatch: pda,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        await confirmTransaction(provider.connection, tx);
        
        // @ts-ignore - Anchor workspace types
        const batch = await program.account.epochRecordBatch.fetch(pda);
        
        expect(batch.roots.length).to.equal(batchSize);
        assertPublicKeyEquals(batch.authority, provider.wallet.publicKey);
        
        // Verify each root
        roots.forEach((root, i) => {
          assertBytesEqual(batch.roots[i], root, "Root " + i + " should match");
        });
        
        console.log("✅ Batch commit successful");
        endTest();
      } catch (error: any) {
        logger.recordFailure("Batch commit", error.toString(), 0);
        throw error;
      }
    });
    
    it("should handle maximum batch size", async () => {
      const endTest = logger.startTest("Maximum batch size");
      
      try {
        const maxBatch = TEST_CONSTANTS.MAX_BATCH_SIZE;
        const roots = generateMerkleRoots(maxBatch);
        
        assertBatchSize(roots.length, maxBatch);
        
        const [pda] = await PublicKey.findProgramAddress(
          [Buffer.from("epochs"), provider.wallet.publicKey.toBuffer()],
          program.programId
        );
        
        console.log("\n📝 Testing maximum batch size:", maxBatch, "epochs");
        
        const tx = await program.methods
          .commitEpochs(roots)
          .accounts({
            epochRecordBatch: pda,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        await confirmTransaction(provider.connection, tx);
        
        // @ts-ignore - Anchor workspace types
        const batch = await program.account.epochRecordBatch.fetch(pda);
        expect(batch.roots.length).to.equal(maxBatch);
        
        console.log("✅ Maximum batch size handled successfully");
        endTest();
      } catch (error: any) {
        logger.recordFailure("Maximum batch size", error.toString(), 0);
        throw error;
      }
    });
    
    it("should reject batch size exceeding maximum", async () => {
      const endTest = logger.startTest("Reject oversized batch");
      
      try {
        const oversizeBatch = TEST_CONSTANTS.MAX_BATCH_SIZE + 1;
        const roots = generateMerkleRoots(oversizeBatch);
        
        const [pda] = await PublicKey.findProgramAddress(
          [Buffer.from("epochs"), provider.wallet.publicKey.toBuffer()],
          program.programId
        );
        
        console.log("\n📝 Testing oversized batch:", oversizeBatch, "epochs (should fail)");
        
        try {
          await program.methods
            .commitEpochs(roots)
            .accounts({
              epochRecordBatch: pda,
              authority: provider.wallet.publicKey,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();
          
          throw new Error("Should have failed with BatchTooLarge error");
        } catch (error: any) {
          expect(error.toString()).to.include("BatchTooLarge");
          console.log("✅ Correctly rejected oversized batch");
        }
        
        endTest();
      } catch (error: any) {
        logger.recordFailure("Reject oversized batch", error.toString(), 0);
        throw error;
      }
    });
  });
  
  describe("3. PDA Validation", () => {
    it("should derive correct PDA for single epoch", async () => {
      const endTest = logger.startTest("PDA derivation - single");
      
      try {
        const [expectedPda, bump] = await PublicKey.findProgramAddress(
          [Buffer.from("epoch"), provider.wallet.publicKey.toBuffer()],
          program.programId
        );
        
        console.log("\n📝 Expected PDA:", expectedPda.toBase58());
        console.log("   Bump:", bump);
        
        // Commit to create the account
        const root = generateMerkleRoot(99);
        await program.methods
          .commitEpoch(Array.from(root))
          .accounts({
            epochRecord: expectedPda,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        // Verify account exists at expected address
        await assertAccountExists(program, expectedPda, "PDA account exists");
        
        console.log("✅ PDA derivation correct");
        endTest();
      } catch (error: any) {
        logger.recordFailure("PDA derivation - single", error.toString(), 0);
        throw error;
      }
    });
    
    it("should derive correct PDA for batch epochs", async () => {
      const endTest = logger.startTest("PDA derivation - batch");
      
      try {
        const [expectedPda, bump] = await PublicKey.findProgramAddress(
          [Buffer.from("epochs"), provider.wallet.publicKey.toBuffer()],
          program.programId
        );
        
        console.log("\n📝 Expected batch PDA:", expectedPda.toBase58());
        console.log("   Bump:", bump);
        
        const roots = generateMerkleRoots(3);
        await program.methods
          .commitEpochs(roots)
          .accounts({
            epochRecordBatch: expectedPda,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        await assertAccountExists(program, expectedPda, "Batch PDA account exists");
        
        console.log("✅ Batch PDA derivation correct");
        endTest();
      } catch (error: any) {
        logger.recordFailure("PDA derivation - batch", error.toString(), 0);
        throw error;
      }
    });
  });
  
  describe("4. Edge Cases", () => {
    it("should handle all-zero root", async () => {
      const endTest = logger.startTest("All-zero root");
      
      try {
        const zeroRoot = new Uint8Array(32).fill(0);
        
        const [pda] = await PublicKey.findProgramAddress(
          [Buffer.from("epoch"), provider.wallet.publicKey.toBuffer()],
          program.programId
        );
        
        await program.methods
          .commitEpoch(Array.from(zeroRoot))
          .accounts({
            epochRecord: pda,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        // @ts-ignore - Anchor workspace types
        const record = await program.account.epochRecord.fetch(pda);
        assertBytesEqual(record.merkleRoot, Array.from(zeroRoot));
        
        console.log("✅ All-zero root handled");
        endTest();
      } catch (error: any) {
        logger.recordFailure("All-zero root", error.toString(), 0);
        throw error;
      }
    });
    
    it("should handle all-ones root", async () => {
      const endTest = logger.startTest("All-ones root");
      
      try {
        const onesRoot = new Uint8Array(32).fill(255);
        
        const [pda] = await PublicKey.findProgramAddress(
          [Buffer.from("epoch"), provider.wallet.publicKey.toBuffer()],
          program.programId
        );
        
        await program.methods
          .commitEpoch(Array.from(onesRoot))
          .accounts({
            epochRecord: pda,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        // @ts-ignore - Anchor workspace types
        const record = await program.account.epochRecord.fetch(pda);
        assertBytesEqual(record.merkleRoot, Array.from(onesRoot));
        
        console.log("✅ All-ones root handled");
        endTest();
      } catch (error: any) {
        logger.recordFailure("All-ones root", error.toString(), 0);
        throw error;
      }
    });
  });
  
  // Print test summary
  after(() => {
    logger.printSummary();
  });
});
