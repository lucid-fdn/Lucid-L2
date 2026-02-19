import { expect } from "chai";
import { ethers } from "hardhat";
import { createHash } from "crypto";

describe("LucidValidator", function () {
  let validator: any;

  beforeEach(async function () {
    const LucidValidator = await ethers.getContractFactory("LucidValidator");
    validator = await LucidValidator.deploy();
    await validator.waitForDeployment();
  });

  describe("verifyReceiptHash", function () {
    it("should verify a valid SHA-256 receipt hash", async function () {
      const preimage = ethers.toUtf8Bytes('{"run_id":"test-123","schema_version":"1.0"}');
      const hash = createHash("sha256").update(preimage).digest();
      const hashHex = "0x" + hash.toString("hex");

      const valid = await validator.verifyReceiptHash(hashHex, preimage);
      expect(valid).to.be.true;
    });

    it("should reject an incorrect receipt hash", async function () {
      const preimage = ethers.toUtf8Bytes("some data");
      const fakeHash = "0x" + "ab".repeat(32);

      const valid = await validator.verifyReceiptHash(fakeHash, preimage);
      expect(valid).to.be.false;
    });
  });

  describe("validateReceipt", function () {
    it("should accept a 64-byte signature with valid hash and pubkey", async function () {
      const receiptHash = "0x" + createHash("sha256").update("test").digest("hex");
      const signature = "0x" + "aa".repeat(64); // 64 bytes
      const signerPubkey = "0x" + "bb".repeat(32);

      const valid = await validator.validateReceipt(receiptHash, signature, signerPubkey);
      expect(valid).to.be.true;
    });

    it("should reject a signature with wrong length", async function () {
      const receiptHash = "0x" + createHash("sha256").update("test").digest("hex");
      const badSig = "0x" + "aa".repeat(32); // 32 bytes, not 64
      const signerPubkey = "0x" + "bb".repeat(32);

      await expect(
        validator.validateReceipt(receiptHash, badSig, signerPubkey)
      ).to.be.revertedWith("Invalid signature length");
    });
  });

  describe("verifyMMRProof", function () {
    /**
     * Minimal MMR test: single leaf, no siblings, one peak.
     * root = sha256(leaf)
     */
    it("should verify a single-leaf MMR proof", async function () {
      const leafData = ethers.toUtf8Bytes("leaf-0");
      const leafHash = "0x" + createHash("sha256").update(leafData).digest("hex");

      // Single leaf: no siblings, one peak = leafHash, root = leafHash
      const valid = await validator.verifyMMRProof(
        leafHash,
        [],         // no siblings
        [leafHash], // peaks
        0,          // leafIndex
        leafHash    // expectedRoot = single peak
      );
      expect(valid).to.be.true;
    });

    /**
     * Two-leaf MMR test:
     * leaf0, leaf1 -> peak = sha256(leaf0 || leaf1)
     * root = peak (single peak)
     */
    it("should verify a two-leaf MMR proof for the left leaf", async function () {
      const leaf0 = Buffer.from(createHash("sha256").update("leaf-0").digest());
      const leaf1 = Buffer.from(createHash("sha256").update("leaf-1").digest());

      // Peak = sha256(leaf0 || leaf1)
      const peak = createHash("sha256")
        .update(Buffer.concat([leaf0, leaf1]))
        .digest();

      const leaf0Hex = "0x" + leaf0.toString("hex");
      const leaf1Hex = "0x" + leaf1.toString("hex");
      const peakHex = "0x" + peak.toString("hex");

      // Prove leaf0: sibling is leaf1, leafIndex=0 (even, so left child)
      const valid = await validator.verifyMMRProof(
        leaf0Hex,
        [leaf1Hex],  // siblings
        [peakHex],   // peaks
        0,           // leafIndex
        peakHex      // expectedRoot
      );
      expect(valid).to.be.true;
    });

    it("should verify a two-leaf MMR proof for the right leaf", async function () {
      const leaf0 = Buffer.from(createHash("sha256").update("leaf-0").digest());
      const leaf1 = Buffer.from(createHash("sha256").update("leaf-1").digest());

      const peak = createHash("sha256")
        .update(Buffer.concat([leaf0, leaf1]))
        .digest();

      const leaf0Hex = "0x" + leaf0.toString("hex");
      const leaf1Hex = "0x" + leaf1.toString("hex");
      const peakHex = "0x" + peak.toString("hex");

      // Prove leaf1: sibling is leaf0, leafIndex=1 (odd, so right child)
      const valid = await validator.verifyMMRProof(
        leaf1Hex,
        [leaf0Hex],
        [peakHex],
        1,
        peakHex
      );
      expect(valid).to.be.true;
    });

    it("should reject a proof with wrong expectedRoot", async function () {
      const leafHash = "0x" + createHash("sha256").update("leaf").digest("hex");
      const fakeRoot = "0x" + "ff".repeat(32);

      const valid = await validator.verifyMMRProof(
        leafHash,
        [],
        [leafHash],
        0,
        fakeRoot
      );
      expect(valid).to.be.false;
    });
  });
});
