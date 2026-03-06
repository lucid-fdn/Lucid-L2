import { expect } from "chai";
import { ethers } from "hardhat";

describe("EpochRegistry", function () {
  let registry: any;
  let owner: any;
  let submitter: any;
  let unauthorized: any;

  const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));
  const mmrRoot = ethers.keccak256(ethers.toUtf8Bytes("root-1"));
  const mmrRoot2 = ethers.keccak256(ethers.toUtf8Bytes("root-2"));

  beforeEach(async function () {
    [owner, submitter, unauthorized] = await ethers.getSigners();

    const EpochRegistry = await ethers.getContractFactory("EpochRegistry");
    registry = await EpochRegistry.deploy();
    await registry.waitForDeployment();
  });

  describe("Authorization", function () {
    it("should allow owner to commit epochs", async function () {
      await expect(registry.commitEpoch(agentId, mmrRoot, 1, 100, 127))
        .to.emit(registry, "EpochCommitted");
    });

    it("should allow authorized submitter", async function () {
      await registry.setSubmitter(submitter.address, true);
      await expect(
        registry.connect(submitter).commitEpoch(agentId, mmrRoot, 1, 50, 63)
      ).to.emit(registry, "EpochCommitted");
    });

    it("should reject unauthorized submitter", async function () {
      await expect(
        registry.connect(unauthorized).commitEpoch(agentId, mmrRoot, 1, 50, 63)
      ).to.be.revertedWithCustomError(registry, "NotAuthorized");
    });

    it("should allow revoking submitter access", async function () {
      await registry.setSubmitter(submitter.address, true);
      await registry.setSubmitter(submitter.address, false);
      await expect(
        registry.connect(submitter).commitEpoch(agentId, mmrRoot, 1, 50, 63)
      ).to.be.revertedWithCustomError(registry, "NotAuthorized");
    });

    it("should emit SubmitterAuthorized on setSubmitter", async function () {
      await expect(registry.setSubmitter(submitter.address, true))
        .to.emit(registry, "SubmitterAuthorized")
        .withArgs(submitter.address, true);
    });

    it("should reject non-owner calling setSubmitter", async function () {
      await expect(
        registry.connect(unauthorized).setSubmitter(submitter.address, true)
      ).to.be.reverted;
    });
  });

  describe("Epoch Commitment", function () {
    it("should reject zero root", async function () {
      await expect(
        registry.commitEpoch(agentId, ethers.ZeroHash, 1, 100, 127)
      ).to.be.revertedWithCustomError(registry, "InvalidRoot");
    });

    it("should reject zero epochId", async function () {
      await expect(
        registry.commitEpoch(agentId, mmrRoot, 0, 100, 127)
      ).to.be.revertedWithCustomError(registry, "InvalidEpochId");
    });

    it("should reject duplicate epochId", async function () {
      await registry.commitEpoch(agentId, mmrRoot, 1, 100, 127);
      await expect(
        registry.commitEpoch(agentId, mmrRoot2, 1, 50, 63)
      ).to.be.revertedWithCustomError(registry, "EpochAlreadyExists");
    });

    it("should reject non-sequential epochId", async function () {
      await registry.commitEpoch(agentId, mmrRoot, 2, 100, 127);
      await expect(
        registry.commitEpoch(agentId, mmrRoot2, 1, 50, 63)
      ).to.be.revertedWithCustomError(registry, "EpochAlreadyExists");
    });

    it("should commit multiple sequential epochs", async function () {
      await registry.commitEpoch(agentId, mmrRoot, 1, 100, 127);
      await registry.commitEpoch(agentId, mmrRoot2, 2, 200, 255);
      expect(await registry.latestEpoch(agentId)).to.equal(2);
      expect(await registry.getEpochCount(agentId)).to.equal(2);
    });

    it("should store epoch data correctly", async function () {
      await registry.commitEpoch(agentId, mmrRoot, 1, 100, 127);
      const epoch = await registry.getEpoch(agentId, 1);
      expect(epoch.mmrRoot).to.equal(mmrRoot);
      expect(epoch.epochId).to.equal(1);
      expect(epoch.leafCount).to.equal(100);
      expect(epoch.mmrSize).to.equal(127);
      expect(epoch.finalized).to.be.true;
      expect(epoch.timestamp).to.be.gt(0);
    });
  });

  describe("Epoch Queries", function () {
    beforeEach(async function () {
      await registry.commitEpoch(agentId, mmrRoot, 1, 100, 127);
      await registry.commitEpoch(agentId, mmrRoot2, 2, 200, 255);
    });

    it("should get epoch by ID", async function () {
      const epoch = await registry.getEpoch(agentId, 1);
      expect(epoch.mmrRoot).to.equal(mmrRoot);
      expect(epoch.epochId).to.equal(1);
      expect(epoch.leafCount).to.equal(100);
    });

    it("should get latest epoch", async function () {
      const epoch = await registry.getLatestEpoch(agentId);
      expect(epoch.mmrRoot).to.equal(mmrRoot2);
      expect(epoch.epochId).to.equal(2);
    });

    it("should return correct epoch count", async function () {
      expect(await registry.getEpochCount(agentId)).to.equal(2);
    });

    it("should revert for non-existent epoch", async function () {
      await expect(
        registry.getEpoch(agentId, 99)
      ).to.be.revertedWithCustomError(registry, "EpochNotFound");
    });

    it("should revert getLatestEpoch for unknown agent", async function () {
      const unknownAgent = ethers.keccak256(ethers.toUtf8Bytes("unknown"));
      await expect(
        registry.getLatestEpoch(unknownAgent)
      ).to.be.revertedWithCustomError(registry, "EpochNotFound");
    });

    it("should return zero count for unknown agent", async function () {
      const unknownAgent = ethers.keccak256(ethers.toUtf8Bytes("unknown"));
      expect(await registry.getEpochCount(unknownAgent)).to.equal(0);
    });
  });

  describe("Verification", function () {
    beforeEach(async function () {
      await registry.commitEpoch(agentId, mmrRoot, 1, 100, 127);
    });

    it("should verify correct root", async function () {
      expect(await registry.verifyEpochInclusion(agentId, 1, mmrRoot)).to.be
        .true;
    });

    it("should reject incorrect root", async function () {
      expect(await registry.verifyEpochInclusion(agentId, 1, mmrRoot2)).to.be
        .false;
    });

    it("should return false for non-existent epoch", async function () {
      expect(await registry.verifyEpochInclusion(agentId, 99, mmrRoot)).to.be
        .false;
    });
  });

  describe("Pagination", function () {
    beforeEach(async function () {
      for (let i = 1; i <= 5; i++) {
        const root = ethers.keccak256(ethers.toUtf8Bytes(`root-${i}`));
        await registry.commitEpoch(agentId, root, i, i * 100, i * 127);
      }
    });

    it("should return a range of epochs", async function () {
      const epochs = await registry.getEpochRange(agentId, 1, 3);
      expect(epochs.length).to.equal(3);
      expect(epochs[0].epochId).to.equal(2);
      expect(epochs[2].epochId).to.equal(4);
    });

    it("should handle offset beyond length", async function () {
      const epochs = await registry.getEpochRange(agentId, 10, 5);
      expect(epochs.length).to.equal(0);
    });

    it("should handle limit beyond end", async function () {
      const epochs = await registry.getEpochRange(agentId, 3, 100);
      expect(epochs.length).to.equal(2);
    });

    it("should return all epochs with offset 0 and large limit", async function () {
      const epochs = await registry.getEpochRange(agentId, 0, 100);
      expect(epochs.length).to.equal(5);
      expect(epochs[0].epochId).to.equal(1);
      expect(epochs[4].epochId).to.equal(5);
    });

    it("should return single epoch with limit 1", async function () {
      const epochs = await registry.getEpochRange(agentId, 2, 1);
      expect(epochs.length).to.equal(1);
      expect(epochs[0].epochId).to.equal(3);
    });
  });

  describe("Multi-Agent Isolation", function () {
    const agent2 = ethers.keccak256(ethers.toUtf8Bytes("agent-2"));

    it("should maintain separate epoch timelines per agent", async function () {
      await registry.commitEpoch(agentId, mmrRoot, 1, 100, 127);
      await registry.commitEpoch(agent2, mmrRoot2, 1, 50, 63);

      const epoch1 = await registry.getEpoch(agentId, 1);
      const epoch2 = await registry.getEpoch(agent2, 1);

      expect(epoch1.mmrRoot).to.equal(mmrRoot);
      expect(epoch2.mmrRoot).to.equal(mmrRoot2);
      expect(epoch1.leafCount).to.equal(100);
      expect(epoch2.leafCount).to.equal(50);
    });

    it("should track latest epoch independently per agent", async function () {
      await registry.commitEpoch(agentId, mmrRoot, 1, 100, 127);
      await registry.commitEpoch(agentId, mmrRoot2, 2, 200, 255);
      await registry.commitEpoch(agent2, mmrRoot, 1, 50, 63);

      expect(await registry.latestEpoch(agentId)).to.equal(2);
      expect(await registry.latestEpoch(agent2)).to.equal(1);
      expect(await registry.getEpochCount(agentId)).to.equal(2);
      expect(await registry.getEpochCount(agent2)).to.equal(1);
    });

    it("should verify roots independently per agent", async function () {
      await registry.commitEpoch(agentId, mmrRoot, 1, 100, 127);
      await registry.commitEpoch(agent2, mmrRoot2, 1, 50, 63);

      expect(await registry.verifyEpochInclusion(agentId, 1, mmrRoot)).to.be
        .true;
      expect(await registry.verifyEpochInclusion(agentId, 1, mmrRoot2)).to.be
        .false;
      expect(await registry.verifyEpochInclusion(agent2, 1, mmrRoot2)).to.be
        .true;
      expect(await registry.verifyEpochInclusion(agent2, 1, mmrRoot)).to.be
        .false;
    });
  });

  describe("commitEpochBatch", function () {
    const agent2 = ethers.keccak256(ethers.toUtf8Bytes("agent-2"));
    const root3 = ethers.keccak256(ethers.toUtf8Bytes("root-3"));
    const root4 = ethers.keccak256(ethers.toUtf8Bytes("root-4"));

    it("should commit multiple epochs in one tx", async function () {
      const tx = await registry.commitEpochBatch(
        [agentId, agent2, agentId],
        [mmrRoot, mmrRoot2, root3],
        [1, 1, 2],
        [100, 50, 200],
        [127, 63, 255]
      );

      // Verify all three EpochCommitted events were emitted
      await expect(tx)
        .to.emit(registry, "EpochCommitted")
        .withArgs(agentId, 1, mmrRoot, 100, 127, await getBlockTimestamp(tx));
      await expect(tx)
        .to.emit(registry, "EpochCommitted")
        .withArgs(agent2, 1, mmrRoot2, 50, 63, await getBlockTimestamp(tx));
      await expect(tx)
        .to.emit(registry, "EpochCommitted")
        .withArgs(agentId, 2, root3, 200, 255, await getBlockTimestamp(tx));

      // Verify state
      expect(await registry.latestEpoch(agentId)).to.equal(2);
      expect(await registry.latestEpoch(agent2)).to.equal(1);
      expect(await registry.getEpochCount(agentId)).to.equal(2);
      expect(await registry.getEpochCount(agent2)).to.equal(1);

      const epoch1 = await registry.getEpoch(agentId, 1);
      expect(epoch1.mmrRoot).to.equal(mmrRoot);
      expect(epoch1.leafCount).to.equal(100);

      const epoch2 = await registry.getEpoch(agentId, 2);
      expect(epoch2.mmrRoot).to.equal(root3);
      expect(epoch2.leafCount).to.equal(200);
    });

    it("should reject batch > 16", async function () {
      const agentIds = Array(17).fill(agentId);
      const roots = Array(17).fill(mmrRoot);
      const epochIds = Array.from({ length: 17 }, (_, i) => i + 1);
      const leafCounts = Array(17).fill(100);
      const mmrSizes = Array(17).fill(127);

      await expect(
        registry.commitEpochBatch(agentIds, roots, epochIds, leafCounts, mmrSizes)
      ).to.be.revertedWith("batch: 1-16 epochs");
    });

    it("should reject empty batch", async function () {
      await expect(
        registry.commitEpochBatch([], [], [], [], [])
      ).to.be.revertedWith("batch: 1-16 epochs");
    });

    it("should reject mismatched array lengths", async function () {
      await expect(
        registry.commitEpochBatch(
          [agentId, agent2],
          [mmrRoot],       // mismatched: 1 vs 2
          [1, 1],
          [100, 50],
          [127, 63]
        )
      ).to.be.revertedWith("batch: length mismatch");
    });

    it("should reject zero root in batch", async function () {
      await expect(
        registry.commitEpochBatch(
          [agentId],
          [ethers.ZeroHash],
          [1],
          [100],
          [127]
        )
      ).to.be.revertedWithCustomError(registry, "InvalidRoot");
    });

    it("should reject zero epochId in batch", async function () {
      await expect(
        registry.commitEpochBatch(
          [agentId],
          [mmrRoot],
          [0],
          [100],
          [127]
        )
      ).to.be.revertedWithCustomError(registry, "InvalidEpochId");
    });

    it("should reject duplicate epochId in batch", async function () {
      await expect(
        registry.commitEpochBatch(
          [agentId, agentId],
          [mmrRoot, mmrRoot2],
          [1, 1],
          [100, 50],
          [127, 63]
        )
      ).to.be.revertedWithCustomError(registry, "EpochAlreadyExists");
    });

    it("should reject unauthorized submitter for batch", async function () {
      await expect(
        registry.connect(unauthorized).commitEpochBatch(
          [agentId],
          [mmrRoot],
          [1],
          [100],
          [127]
        )
      ).to.be.revertedWithCustomError(registry, "NotAuthorized");
    });
  });
});

// Helper to get the block timestamp from a transaction
async function getBlockTimestamp(tx: any): Promise<number> {
  const receipt = await tx.wait();
  const block = await ethers.provider.getBlock(receipt.blockNumber);
  return block!.timestamp;
}
