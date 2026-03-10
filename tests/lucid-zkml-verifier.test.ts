/**
 * Lucid zkML Verifier -- Integration Tests
 * Tests model registration, proof verification, batch verification, bloom filter.
 * Requires: solana-test-validator running on port 8899
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import {
  createFundedWallet,
  confirmTransaction,
  generateContentHash,
} from "./helpers/fixtures";

let program: Program;

// ---------------------------------------------------------------------------
// PDA helpers
// ---------------------------------------------------------------------------

function findModelPDA(modelHash: number[]): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("model"), Buffer.from(modelHash)],
    program.programId,
  );
}

function findBloomPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bloom"), authority.toBuffer()],
    program.programId,
  );
}

// ---------------------------------------------------------------------------
// Test data generators (dummy bytes, correct lengths for Groth16 components)
// ---------------------------------------------------------------------------

/** G1 point: 64 bytes (two 32-byte coordinates on BN254) */
function generateG1Point(): number[] {
  return Array.from({ length: 64 }, (_, i) => (i + 1) % 256);
}

/** G2 point: 128 bytes (two pairs of 32-byte coordinates on BN254) */
function generateG2Point(): number[] {
  return Array.from({ length: 128 }, (_, i) => ((i + 1) * 3) % 256);
}

/** Public input: 32-byte scalar field element (non-zero) */
function generatePublicInput(seed: string): number[] {
  return generateContentHash(seed);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Lucid zkML Verifier", () => {
  const provider = anchor.AnchorProvider.local("http://127.0.0.1:8899");
  anchor.setProvider(provider);

  program = anchor.workspace.LucidZkmlVerifier as Program;

  let authority: Keypair;
  let bloomPDA: PublicKey;
  const modelHash = generateContentHash("test-model-v1");

  before(async () => {
    authority = await createFundedWallet(provider.connection, 10);
    [bloomPDA] = findBloomPDA(authority.publicKey);
  });

  // =========================================================================
  // 1. Bloom Filter Init
  // =========================================================================

  it("initializes bloom filter", async () => {
    const tx = await program.methods
      .initBloom()
      .accounts({
        bloom: bloomPDA,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    await confirmTransaction(provider.connection, tx);

    // @ts-ignore - Anchor workspace types
    const bloomAccount = await program.account.proofBloomFilter.fetch(bloomPDA);
    expect(bloomAccount.proofCount.toNumber()).to.equal(0);
    expect(bloomAccount.authority.toBase58()).to.equal(authority.publicKey.toBase58());
  });

  // =========================================================================
  // 2. Register Model
  // =========================================================================

  it("registers a model circuit", async () => {
    const [modelPDA] = findModelPDA(modelHash);
    const nrPubinputs = 2;

    const tx = await program.methods
      .registerModel(
        modelHash,
        generateG1Point(),         // vk_alpha_g1 (64 bytes)
        generateG2Point(),         // vk_beta_g2 (128 bytes)
        generateG2Point(),         // vk_gamma_g2 (128 bytes)
        generateG2Point(),         // vk_delta_g2 (128 bytes)
        // vk_ic: nr_pubinputs + 1 = 3 G1 points
        [generateG1Point(), generateG1Point(), generateG1Point()],
        nrPubinputs,
      )
      .accounts({
        model: modelPDA,
        owner: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    await confirmTransaction(provider.connection, tx);

    // @ts-ignore - Anchor workspace types
    const modelAccount = await program.account.modelCircuit.fetch(modelPDA);
    expect(modelAccount.nrPubinputs).to.equal(nrPubinputs);
    expect(modelAccount.owner.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(Array.from(modelAccount.modelHash as number[])).to.deep.equal(modelHash);
    expect(modelAccount.registeredAt.toNumber()).to.be.greaterThan(0);
    // vk_ic should have nr_pubinputs + 1 entries
    expect(modelAccount.vkIc.length).to.equal(nrPubinputs + 1);
  });

  it("rejects model with nr_pubinputs = 0", async () => {
    const badModelHash = generateContentHash("bad-model-zero");
    const [modelPDA] = findModelPDA(badModelHash);

    try {
      await program.methods
        .registerModel(
          badModelHash,
          generateG1Point(),
          generateG2Point(),
          generateG2Point(),
          generateG2Point(),
          [generateG1Point()], // 1 IC point for 0 public inputs (0 + 1 = 1)
          0,                   // nr_pubinputs = 0 -- INVALID
        )
        .accounts({
          model: modelPDA,
          owner: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      expect.fail("Should have thrown InvalidPublicInputCount");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.toString()).to.include("InvalidPublicInputCount");
    }
  });

  it("rejects model with nr_pubinputs > 8", async () => {
    const badModelHash = generateContentHash("bad-model-too-many");
    const [modelPDA] = findModelPDA(badModelHash);

    try {
      await program.methods
        .registerModel(
          badModelHash,
          generateG1Point(),
          generateG2Point(),
          generateG2Point(),
          generateG2Point(),
          // 10 IC points for 9 public inputs (9 + 1 = 10)
          Array.from({ length: 10 }, () => generateG1Point()),
          9, // nr_pubinputs = 9 -- INVALID (max 8)
        )
        .accounts({
          model: modelPDA,
          owner: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      expect.fail("Should have thrown InvalidPublicInputCount");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.toString()).to.include("InvalidPublicInputCount");
    }
  });

  it("rejects model with vk_ic length mismatch", async () => {
    const badModelHash = generateContentHash("bad-model-ic-mismatch");
    const [modelPDA] = findModelPDA(badModelHash);

    try {
      await program.methods
        .registerModel(
          badModelHash,
          generateG1Point(),
          generateG2Point(),
          generateG2Point(),
          generateG2Point(),
          // 2 IC points but nr_pubinputs = 3 (expects 4 IC points)
          [generateG1Point(), generateG1Point()],
          3,
        )
        .accounts({
          model: modelPDA,
          owner: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      expect.fail("Should have thrown VkIcLengthMismatch");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.toString()).to.include("VkIcLengthMismatch");
    }
  });

  // =========================================================================
  // 3. Verify Proof
  // =========================================================================

  it("verifies a proof and updates bloom filter", async () => {
    const [modelPDA] = findModelPDA(modelHash);
    const receiptHash = generateContentHash("receipt-1");

    const tx = await program.methods
      .verifyProof(
        generateG1Point(),  // proof_a (64 bytes)
        generateG2Point(),  // proof_b (128 bytes)
        generateG1Point(),  // proof_c (64 bytes)
        [
          generatePublicInput("pub-input-1"),
          generatePublicInput("pub-input-2"),
        ], // 2 public inputs (matches model.nr_pubinputs)
        receiptHash,
      )
      .accounts({
        model: modelPDA,
        bloom: bloomPDA,
        verifier: authority.publicKey,
        // proofRecord omitted -- optional account, Anchor uses program ID as sentinel
      })
      .signers([authority])
      .rpc();

    await confirmTransaction(provider.connection, tx);

    // @ts-ignore - Anchor workspace types
    const bloomAccount = await program.account.proofBloomFilter.fetch(bloomPDA);
    expect(bloomAccount.proofCount.toNumber()).to.equal(1);
    expect(bloomAccount.lastUpdated.toNumber()).to.be.greaterThan(0);
  });

  it("rejects proof with wrong number of public inputs", async () => {
    const [modelPDA] = findModelPDA(modelHash);

    try {
      await program.methods
        .verifyProof(
          generateG1Point(),
          generateG2Point(),
          generateG1Point(),
          [generatePublicInput("single-input")], // Only 1 input, model expects 2
          generateContentHash("bad-receipt"),
        )
        .accounts({
          model: modelPDA,
          bloom: bloomPDA,
          verifier: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      expect.fail("Should have thrown PublicInputCountMismatch");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.toString()).to.include("PublicInputCountMismatch");
    }
  });

  it("rejects proof with zero-value components", async () => {
    const [modelPDA] = findModelPDA(modelHash);

    try {
      await program.methods
        .verifyProof(
          Array.from({ length: 64 }, () => 0),   // zero proof_a -- INVALID
          generateG2Point(),
          generateG1Point(),
          [
            generatePublicInput("pub-zero-1"),
            generatePublicInput("pub-zero-2"),
          ],
          generateContentHash("zero-proof-receipt"),
        )
        .accounts({
          model: modelPDA,
          bloom: bloomPDA,
          verifier: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      expect.fail("Should have thrown InvalidProofComponents");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.toString()).to.include("InvalidProofComponents");
    }
  });

  it("rejects proof with zero-value public input", async () => {
    const [modelPDA] = findModelPDA(modelHash);

    try {
      await program.methods
        .verifyProof(
          generateG1Point(),
          generateG2Point(),
          generateG1Point(),
          [
            generatePublicInput("valid-pub-input"),
            Array.from({ length: 32 }, () => 0), // zero public input -- INVALID
          ],
          generateContentHash("zero-input-receipt"),
        )
        .accounts({
          model: modelPDA,
          bloom: bloomPDA,
          verifier: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      expect.fail("Should have thrown InvalidPublicInput");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.toString()).to.include("InvalidPublicInput");
    }
  });

  // =========================================================================
  // 4. Bloom Filter Dedup
  // =========================================================================

  it("rejects duplicate proof (bloom filter hit)", async () => {
    const [modelPDA] = findModelPDA(modelHash);
    const receiptHash = generateContentHash("receipt-dedup");

    // Use deterministic proof components so the bloom hash is identical both times
    const proofA = generateG1Point();
    const proofB = generateG2Point();
    const proofC = generateG1Point();
    const pubInputs = [
      generatePublicInput("dedup-input-1"),
      generatePublicInput("dedup-input-2"),
    ];

    // First verify -- should succeed
    const tx = await program.methods
      .verifyProof(proofA, proofB, proofC, pubInputs, receiptHash)
      .accounts({
        model: modelPDA,
        bloom: bloomPDA,
        verifier: authority.publicKey,
      })
      .signers([authority])
      .rpc();

    await confirmTransaction(provider.connection, tx);

    // Second verify with same components -- should fail (bloom filter hit)
    try {
      await program.methods
        .verifyProof(proofA, proofB, proofC, pubInputs, receiptHash)
        .accounts({
          model: modelPDA,
          bloom: bloomPDA,
          verifier: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      expect.fail("Should have thrown ProofAlreadyVerified");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.toString()).to.include("ProofAlreadyVerified");
    }
  });

  // =========================================================================
  // 5. Batch Verification
  // =========================================================================

  it("rejects empty batch", async () => {
    try {
      await program.methods
        .verifyBatch([])
        .accounts({
          bloom: bloomPDA,
          verifier: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      expect.fail("Should have thrown EmptyBatch");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.toString()).to.include("EmptyBatch");
    }
  });

  it("verifies a batch of proofs", async () => {
    const proofs = [
      {
        modelHash: modelHash,
        proofA: generateG1Point(),
        proofB: generateG2Point(),
        proofC: generateG1Point(),
        publicInputs: [
          generatePublicInput("batch-1-input-1"),
          generatePublicInput("batch-1-input-2"),
        ],
        receiptHash: generateContentHash("batch-receipt-1"),
      },
      {
        modelHash: modelHash,
        proofA: Array.from({ length: 64 }, (_, i) => (i + 7) % 256),
        proofB: Array.from({ length: 128 }, (_, i) => (i + 11) % 256),
        proofC: Array.from({ length: 64 }, (_, i) => (i + 13) % 256),
        publicInputs: [
          generatePublicInput("batch-2-input-1"),
          generatePublicInput("batch-2-input-2"),
        ],
        receiptHash: generateContentHash("batch-receipt-2"),
      },
    ];

    // @ts-ignore - Anchor workspace types
    const bloomBefore = await program.account.proofBloomFilter.fetch(bloomPDA);
    const countBefore = bloomBefore.proofCount.toNumber();

    const tx = await program.methods
      .verifyBatch(proofs)
      .accounts({
        bloom: bloomPDA,
        verifier: authority.publicKey,
      })
      .signers([authority])
      .rpc();

    await confirmTransaction(provider.connection, tx);

    // @ts-ignore - Anchor workspace types
    const bloomAfter = await program.account.proofBloomFilter.fetch(bloomPDA);
    expect(bloomAfter.proofCount.toNumber()).to.equal(countBefore + proofs.length);
  });

  it("rejects batch that exceeds max size (> 10)", async () => {
    const proofs = Array.from({ length: 11 }, (_, i) => ({
      modelHash: modelHash,
      proofA: Array.from({ length: 64 }, (_, j) => (j + i + 50) % 256),
      proofB: Array.from({ length: 128 }, (_, j) => (j + i + 50) % 256),
      proofC: Array.from({ length: 64 }, (_, j) => (j + i + 100) % 256),
      publicInputs: [
        generatePublicInput(`batch-overflow-${i}-1`),
        generatePublicInput(`batch-overflow-${i}-2`),
      ],
      receiptHash: generateContentHash(`batch-overflow-receipt-${i}`),
    }));

    try {
      await program.methods
        .verifyBatch(proofs)
        .accounts({
          bloom: bloomPDA,
          verifier: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      expect.fail("Should have thrown BatchTooLarge");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.toString()).to.include("BatchTooLarge");
    }
  });

  // =========================================================================
  // 6. Check Proof (bloom filter lookup)
  // =========================================================================

  it("checks proof existence via bloom filter", async () => {
    // This instruction emits a ProofChecked event; it does not return a value.
    // We just verify the instruction succeeds without error.
    const proofHash = generateContentHash("some-proof-hash");

    const tx = await program.methods
      .checkProof(proofHash)
      .accounts({
        bloom: bloomPDA,
      })
      .rpc();

    await confirmTransaction(provider.connection, tx);
  });
});
