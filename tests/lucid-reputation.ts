/**
 * Lucid Reputation Program - Integration Test Suite
 * Tests for passport stats, feedback submission, validation, and revocation.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { createFundedWallet, confirmTransaction, generateContentHash } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// PDA helpers
// ---------------------------------------------------------------------------

let program: Program;

function findStatsPDA(passportId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stats"), Buffer.from(passportId)],
    program.programId,
  );
}

function findFeedbackPDA(passportId: string, index: number): [PublicKey, number] {
  const indexBuf = Buffer.alloc(4);
  indexBuf.writeUInt32LE(index);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("feedback"), Buffer.from(passportId), indexBuf],
    program.programId,
  );
}

function findValidationPDA(passportId: string, receiptHash: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("validation"), Buffer.from(passportId), receiptHash],
    program.programId,
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Lucid Reputation Program", () => {
  const provider = anchor.AnchorProvider.local("http://127.0.0.1:8899");
  anchor.setProvider(provider);

  program = anchor.workspace.LucidReputation as Program;

  const passportId = `test-passport-${Date.now()}`;
  const receiptHash1 = Buffer.from(generateContentHash("receipt-1"));
  const receiptHash2 = Buffer.from(generateContentHash("receipt-2"));
  const validationReceiptHash = Buffer.from(generateContentHash("validation-receipt-1"));

  // =========================================================================
  // 1. Init Stats
  // =========================================================================

  it("initializes stats for a passport", async () => {
    const [statsPDA] = findStatsPDA(passportId);

    const tx = await program.methods
      .initStats(passportId)
      .accounts({
        stats: statsPDA,
        payer: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await confirmTransaction(provider.connection, tx);

    // @ts-ignore - Anchor workspace types
    const stats = await program.account.passportStats.fetch(statsPDA);

    expect(stats.passportId).to.equal(passportId);
    expect(stats.feedbackCount).to.equal(0);
    expect(stats.validationCount).to.equal(0);
    expect(stats.totalScore.toNumber()).to.equal(0);
    expect(stats.avgScore).to.equal(0);
    expect(stats.lastUpdated.toNumber()).to.be.greaterThan(0);
  });

  // =========================================================================
  // 2. Submit first feedback
  // =========================================================================

  it("submits feedback with receipt hash", async () => {
    const [statsPDA] = findStatsPDA(passportId);
    const [feedbackPDA] = findFeedbackPDA(passportId, 0); // index = current feedback_count = 0

    const tx = await program.methods
      .submitFeedback(
        passportId,
        85,                             // score
        "accuracy",                     // category
        Array.from(receiptHash1),       // receipt_hash as number[]
        0,                              // asset_type: model
        "good model performance",       // metadata
      )
      .accounts({
        feedback: feedbackPDA,
        stats: statsPDA,
        submitter: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await confirmTransaction(provider.connection, tx);

    // Verify feedback entry
    // @ts-ignore - Anchor workspace types
    const entry = await program.account.feedbackEntry.fetch(feedbackPDA);
    expect(entry.passportId).to.equal(passportId);
    expect(entry.from.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
    expect(entry.score).to.equal(85);
    expect(entry.category).to.equal("accuracy");
    expect(Array.from(entry.receiptHash)).to.deep.equal(Array.from(receiptHash1));
    expect(entry.assetType).to.equal(0);
    expect(entry.metadata).to.equal("good model performance");
    expect(entry.revoked).to.equal(false);
    expect(entry.index).to.equal(0);
    expect(entry.timestamp.toNumber()).to.be.greaterThan(0);

    // Verify stats update
    // @ts-ignore - Anchor workspace types
    const stats = await program.account.passportStats.fetch(statsPDA);
    expect(stats.feedbackCount).to.equal(1);
    expect(stats.totalScore.toNumber()).to.equal(85);
    // avg_score = (85 * 100) / 1 = 8500
    expect(stats.avgScore).to.equal(8500);
  });

  // =========================================================================
  // 3. Submit second feedback -- running average
  // =========================================================================

  it("submits second feedback and updates avg", async () => {
    const [statsPDA] = findStatsPDA(passportId);
    const [feedbackPDA] = findFeedbackPDA(passportId, 1); // index = current feedback_count = 1

    const tx = await program.methods
      .submitFeedback(
        passportId,
        95,                             // score
        "latency",                      // category
        Array.from(receiptHash2),       // receipt_hash
        0,                              // asset_type: model
        "fast inference",               // metadata
      )
      .accounts({
        feedback: feedbackPDA,
        stats: statsPDA,
        submitter: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await confirmTransaction(provider.connection, tx);

    // @ts-ignore - Anchor workspace types
    const stats = await program.account.passportStats.fetch(statsPDA);
    expect(stats.feedbackCount).to.equal(2);
    expect(stats.totalScore.toNumber()).to.equal(85 + 95);
    // avg_score = (180 * 100) / 2 = 9000
    expect(stats.avgScore).to.equal(9000);

    // Verify second feedback entry
    // @ts-ignore - Anchor workspace types
    const entry = await program.account.feedbackEntry.fetch(feedbackPDA);
    expect(entry.score).to.equal(95);
    expect(entry.index).to.equal(1);
  });

  // =========================================================================
  // 4. Reject invalid score (0)
  // =========================================================================

  it("rejects invalid score (0)", async () => {
    const [statsPDA] = findStatsPDA(passportId);
    const [feedbackPDA] = findFeedbackPDA(passportId, 2); // next index

    try {
      await program.methods
        .submitFeedback(
          passportId,
          0,                                                      // invalid score
          "test",
          Array.from(Buffer.from(generateContentHash("bad-1"))),
          0,
          "",
        )
        .accounts({
          feedback: feedbackPDA,
          stats: statsPDA,
          submitter: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      expect.fail("should have thrown InvalidScore error");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("InvalidScore");
    }
  });

  // =========================================================================
  // 5. Reject invalid asset type (5)
  // =========================================================================

  it("rejects invalid asset type (5)", async () => {
    const [statsPDA] = findStatsPDA(passportId);
    const [feedbackPDA] = findFeedbackPDA(passportId, 2); // still index 2 (prev failed)

    try {
      await program.methods
        .submitFeedback(
          passportId,
          50,
          "test",
          Array.from(Buffer.from(generateContentHash("bad-2"))),
          5,                                                      // invalid asset type
          "",
        )
        .accounts({
          feedback: feedbackPDA,
          stats: statsPDA,
          submitter: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      expect.fail("should have thrown InvalidAssetType error");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("InvalidAssetType");
    }
  });

  // =========================================================================
  // 6. Submit validation
  // =========================================================================

  it("submits validation", async () => {
    const [statsPDA] = findStatsPDA(passportId);
    const [validationPDA] = findValidationPDA(passportId, validationReceiptHash);

    const tx = await program.methods
      .submitValidation(
        passportId,
        Array.from(validationReceiptHash),
        true,                          // valid
        1,                             // asset_type: compute
        "validated compute node",      // metadata
      )
      .accounts({
        validation: validationPDA,
        stats: statsPDA,
        validator: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await confirmTransaction(provider.connection, tx);

    // Verify validation entry
    // @ts-ignore - Anchor workspace types
    const entry = await program.account.validationEntry.fetch(validationPDA);
    expect(entry.passportId).to.equal(passportId);
    expect(entry.validator.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
    expect(entry.valid).to.equal(true);
    expect(Array.from(entry.receiptHash)).to.deep.equal(Array.from(validationReceiptHash));
    expect(entry.assetType).to.equal(1);
    expect(entry.metadata).to.equal("validated compute node");
    expect(entry.timestamp.toNumber()).to.be.greaterThan(0);

    // Verify stats update
    // @ts-ignore - Anchor workspace types
    const stats = await program.account.passportStats.fetch(statsPDA);
    expect(stats.validationCount).to.equal(1);
    // feedback_count should be unchanged
    expect(stats.feedbackCount).to.equal(2);
  });

  // =========================================================================
  // 7. Reject duplicate validation (same receipt hash => PDA already exists)
  // =========================================================================

  it("rejects duplicate validation (same receipt hash)", async () => {
    const [statsPDA] = findStatsPDA(passportId);
    const [validationPDA] = findValidationPDA(passportId, validationReceiptHash);

    try {
      await program.methods
        .submitValidation(
          passportId,
          Array.from(validationReceiptHash), // same receipt hash as above
          false,
          1,
          "duplicate attempt",
        )
        .accounts({
          validation: validationPDA,
          stats: statsPDA,
          validator: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      expect.fail("should have thrown error for duplicate validation PDA");
    } catch (err: any) {
      // The account already exists, so init will fail.
      // Anchor surfaces this as a transaction error (not a custom program error),
      // typically containing "already in use" in the message or a SendTransactionError.
      const errStr = err.toString();
      const isDuplicate =
        errStr.includes("already in use") ||
        errStr.includes("0x0") ||
        (err.error && err.error.errorCode);
      expect(isDuplicate).to.equal(true, `Unexpected error: ${errStr}`);
    }
  });

  // =========================================================================
  // 8. Revoke feedback
  // =========================================================================

  it("revokes feedback", async () => {
    const [statsPDA] = findStatsPDA(passportId);
    const [feedbackPDA] = findFeedbackPDA(passportId, 0); // revoke the first feedback (index 0)

    const tx = await program.methods
      .revokeFeedback(passportId, 0)
      .accounts({
        feedback: feedbackPDA,
        stats: statsPDA,
        submitter: provider.wallet.publicKey,
      })
      .rpc();

    await confirmTransaction(provider.connection, tx);

    // Verify feedback is revoked
    // @ts-ignore - Anchor workspace types
    const entry = await program.account.feedbackEntry.fetch(feedbackPDA);
    expect(entry.revoked).to.equal(true);

    // Verify stats adjusted
    // @ts-ignore - Anchor workspace types
    const stats = await program.account.passportStats.fetch(statsPDA);
    // feedback_count stays at 2 (not decremented -- tracks total ever created)
    expect(stats.feedbackCount).to.equal(2);
    // total_score = 180 - 85 = 95
    expect(stats.totalScore.toNumber()).to.equal(95);
    // avg_score = (95 * 100) / (2 - 1) = 9500
    expect(stats.avgScore).to.equal(9500);
  });

  // =========================================================================
  // 9. Reject revoke from wrong signer
  // =========================================================================

  it("rejects revoke from wrong signer", async () => {
    const [statsPDA] = findStatsPDA(passportId);
    const [feedbackPDA] = findFeedbackPDA(passportId, 1); // the second feedback (index 1)

    const wrongSigner = await createFundedWallet(provider.connection, 1);

    try {
      await program.methods
        .revokeFeedback(passportId, 1)
        .accounts({
          feedback: feedbackPDA,
          stats: statsPDA,
          submitter: wrongSigner.publicKey,
        })
        .signers([wrongSigner])
        .rpc();

      expect.fail("should have thrown UnauthorizedRevoke error");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("UnauthorizedRevoke");
    }
  });

  // =========================================================================
  // 10. Reject double revoke
  // =========================================================================

  it("rejects double revoke", async () => {
    const [statsPDA] = findStatsPDA(passportId);
    const [feedbackPDA] = findFeedbackPDA(passportId, 0); // already revoked in test 8

    try {
      await program.methods
        .revokeFeedback(passportId, 0)
        .accounts({
          feedback: feedbackPDA,
          stats: statsPDA,
          submitter: provider.wallet.publicKey,
        })
        .rpc();

      expect.fail("should have thrown AlreadyRevoked error");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("AlreadyRevoked");
    }
  });

  // =========================================================================
  // 11. Works with all 5 asset types
  // =========================================================================

  it("works with all 5 asset types", async () => {
    const assetPassportId = `asset-types-${Date.now()}`;
    const [assetStatsPDA] = findStatsPDA(assetPassportId);

    // Initialize stats for this passport
    const initTx = await program.methods
      .initStats(assetPassportId)
      .accounts({
        stats: assetStatsPDA,
        payer: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await confirmTransaction(provider.connection, initTx);

    const assetTypeNames = ["model", "compute", "tool", "agent", "dataset"];

    for (let assetType = 0; assetType < 5; assetType++) {
      const [feedbackPDA] = findFeedbackPDA(assetPassportId, assetType); // index = assetType since sequential
      const hash = Buffer.from(generateContentHash(`asset-type-${assetType}`));

      const tx = await program.methods
        .submitFeedback(
          assetPassportId,
          50 + assetType * 10,                // scores: 50, 60, 70, 80, 90
          assetTypeNames[assetType],           // category matches asset name
          Array.from(hash),
          assetType,                           // asset type 0..4
          `feedback for ${assetTypeNames[assetType]}`,
        )
        .accounts({
          feedback: feedbackPDA,
          stats: assetStatsPDA,
          submitter: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await confirmTransaction(provider.connection, tx);

      // Verify the entry was created with correct asset type
      // @ts-ignore - Anchor workspace types
      const entry = await program.account.feedbackEntry.fetch(feedbackPDA);
      expect(entry.assetType).to.equal(
        assetType,
        `asset type should be ${assetType} (${assetTypeNames[assetType]})`,
      );
      expect(entry.score).to.equal(50 + assetType * 10);
    }

    // Verify final stats
    // @ts-ignore - Anchor workspace types
    const stats = await program.account.passportStats.fetch(assetStatsPDA);
    expect(stats.feedbackCount).to.equal(5);
    // total = 50 + 60 + 70 + 80 + 90 = 350
    expect(stats.totalScore.toNumber()).to.equal(350);
    // avg_score = (350 * 100) / 5 = 7000
    expect(stats.avgScore).to.equal(7000);
  });
});
