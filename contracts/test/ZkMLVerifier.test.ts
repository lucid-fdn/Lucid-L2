import { expect } from "chai";
import { ethers } from "hardhat";
import { createHash } from "crypto";

describe("ZkMLVerifier", function () {
  let verifier: any;
  let owner: any;
  let other: any;

  // Sample G1/G2 points (identity/dummy for testing)
  const G1_ZERO = { x: 0, y: 0 };
  const G2_ZERO = { x: [0, 0], y: [0, 0] };

  // Dummy IC points for 3 public inputs (need 4 IC points)
  const IC_POINTS = [
    { x: 1, y: 2 },
    { x: 1, y: 2 },
    { x: 1, y: 2 },
    { x: 1, y: 2 },
  ];

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();

    const ZkMLVerifier = await ethers.getContractFactory("ZkMLVerifier");
    verifier = await ZkMLVerifier.deploy();
    await verifier.waitForDeployment();
  });

  describe("registerModel", function () {
    it("should register a model verifying key", async function () {
      const modelHash = "0x" + createHash("sha256").update("test-model").digest("hex");

      await verifier.registerModel(
        modelHash,
        G1_ZERO,
        G2_ZERO,
        G2_ZERO,
        G2_ZERO,
        IC_POINTS
      );

      expect(await verifier.isModelRegistered(modelHash)).to.be.true;
      expect(await verifier.getModelCount()).to.equal(1);
    });

    it("should reject zero model hash", async function () {
      await expect(
        verifier.registerModel(
          ethers.ZeroHash,
          G1_ZERO,
          G2_ZERO,
          G2_ZERO,
          G2_ZERO,
          IC_POINTS
        )
      ).to.be.revertedWith("Invalid model hash");
    });

    it("should reject insufficient IC points", async function () {
      const modelHash = "0x" + createHash("sha256").update("model").digest("hex");

      await expect(
        verifier.registerModel(
          modelHash,
          G1_ZERO,
          G2_ZERO,
          G2_ZERO,
          G2_ZERO,
          [{ x: 1, y: 2 }] // Only 1 IC point (need at least 2)
        )
      ).to.be.revertedWith("Need at least 1 public input");
    });

    it("should reject non-owner registration", async function () {
      const modelHash = "0x" + createHash("sha256").update("model").digest("hex");

      await expect(
        verifier.connect(other).registerModel(
          modelHash,
          G1_ZERO,
          G2_ZERO,
          G2_ZERO,
          G2_ZERO,
          IC_POINTS
        )
      ).to.be.reverted;
    });

    it("should return false for unregistered model", async function () {
      const modelHash = "0x" + createHash("sha256").update("unregistered").digest("hex");
      expect(await verifier.isModelRegistered(modelHash)).to.be.false;
    });
  });

  describe("verifyProof", function () {
    it("should reject proof for unregistered model", async function () {
      const modelHash = "0x" + createHash("sha256").update("unknown").digest("hex");

      await expect(
        verifier.verifyProof(
          modelHash,
          G1_ZERO,
          G2_ZERO,
          G1_ZERO,
          [1, 2, 3]
        )
      ).to.be.revertedWith("Model not registered");
    });

    it("should reject wrong number of public inputs", async function () {
      const modelHash = "0x" + createHash("sha256").update("model").digest("hex");

      await verifier.registerModel(
        modelHash,
        G1_ZERO,
        G2_ZERO,
        G2_ZERO,
        G2_ZERO,
        IC_POINTS // Expects 3 public inputs (ic.length - 1)
      );

      await expect(
        verifier.verifyProof(
          modelHash,
          G1_ZERO,
          G2_ZERO,
          G1_ZERO,
          [1, 2] // Only 2, need 3
        )
      ).to.be.revertedWith("Invalid public inputs length");
    });
  });

  describe("verifyBatch", function () {
    it("should reject array length mismatch", async function () {
      const modelHash = "0x" + createHash("sha256").update("model").digest("hex");

      await expect(
        verifier.verifyBatch(
          [modelHash, modelHash],
          [{ a: G1_ZERO, b: G2_ZERO, c: G1_ZERO }],
          [[1, 2, 3]]
        )
      ).to.be.revertedWith("Array length mismatch");
    });

    it("should return false for unregistered models in batch", async function () {
      const modelHash = "0x" + createHash("sha256").update("unknown-batch").digest("hex");

      const results = await verifier.verifyBatch.staticCall(
        [modelHash],
        [{ a: G1_ZERO, b: G2_ZERO, c: G1_ZERO }],
        [[1, 2, 3]]
      );

      expect(results[0]).to.be.false;
    });
  });

  describe("model enumeration", function () {
    it("should enumerate registered models", async function () {
      const m1 = "0x" + createHash("sha256").update("model-1").digest("hex");
      const m2 = "0x" + createHash("sha256").update("model-2").digest("hex");

      await verifier.registerModel(m1, G1_ZERO, G2_ZERO, G2_ZERO, G2_ZERO, IC_POINTS);
      await verifier.registerModel(m2, G1_ZERO, G2_ZERO, G2_ZERO, G2_ZERO, IC_POINTS);

      expect(await verifier.getModelCount()).to.equal(2);
      expect(await verifier.getRegisteredModel(0)).to.equal(m1);
      expect(await verifier.getRegisteredModel(1)).to.equal(m2);
    });

    it("should not duplicate on re-registration", async function () {
      const modelHash = "0x" + createHash("sha256").update("model").digest("hex");

      await verifier.registerModel(modelHash, G1_ZERO, G2_ZERO, G2_ZERO, G2_ZERO, IC_POINTS);
      await verifier.registerModel(modelHash, G1_ZERO, G2_ZERO, G2_ZERO, G2_ZERO, IC_POINTS);

      expect(await verifier.getModelCount()).to.equal(1);
    });
  });
});
