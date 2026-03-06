import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("LucidPassportRegistry", function () {
  let registry: any;
  let mockToken: any;
  let owner: any;
  let syncer: any;
  let payer: any;
  let other: any;

  const passportId = ethers.keccak256(ethers.toUtf8Bytes("passport-1"));
  const contentHash = ethers.keccak256(ethers.toUtf8Bytes("content-hash-1"));

  beforeEach(async function () {
    [owner, syncer, payer, other] = await ethers.getSigners();

    // Deploy mock LUCID token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("Lucid", "LUCID", 9);
    await mockToken.waitForDeployment();

    // Deploy registry
    const Registry = await ethers.getContractFactory("LucidPassportRegistry");
    registry = await Registry.deploy(await mockToken.getAddress());
    await registry.waitForDeployment();

    // Authorize syncer
    await registry.setSyncer(syncer.address, true);
  });

  describe("Syncer Management", function () {
    it("should authorize syncer", async function () {
      expect(await registry.authorizedSyncers(syncer.address)).to.be.true;
    });

    it("should emit SyncerUpdated", async function () {
      await expect(registry.setSyncer(other.address, true))
        .to.emit(registry, "SyncerUpdated")
        .withArgs(other.address, true);
    });

    it("should reject non-owner setSyncer", async function () {
      await expect(
        registry.connect(other).setSyncer(other.address, true)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  describe("Passport Anchor", function () {
    it("should anchor passport", async function () {
      await expect(
        registry.connect(syncer).anchorPassport(passportId, contentHash, payer.address)
      ).to.emit(registry, "PassportAnchored")
        .withArgs(passportId, contentHash, payer.address);
    });

    it("should verify anchor", async function () {
      await registry.connect(syncer).anchorPassport(passportId, contentHash, payer.address);
      expect(await registry.verifyAnchor(passportId, contentHash)).to.be.true;

      const wrongHash = ethers.keccak256(ethers.toUtf8Bytes("wrong"));
      expect(await registry.verifyAnchor(passportId, wrongHash)).to.be.false;
    });

    it("should update status", async function () {
      await registry.connect(syncer).anchorPassport(passportId, contentHash, payer.address);
      await expect(registry.connect(syncer).updateStatus(passportId, 1))
        .to.emit(registry, "PassportStatusUpdated")
        .withArgs(passportId, 0, 1);
    });

    it("should reject update for non-existent passport", async function () {
      const fakeId = ethers.keccak256(ethers.toUtf8Bytes("fake"));
      await expect(
        registry.connect(syncer).updateStatus(fakeId, 1)
      ).to.be.revertedWithCustomError(registry, "PassportNotAnchored");
    });

    it("should reject invalid status", async function () {
      await registry.connect(syncer).anchorPassport(passportId, contentHash, payer.address);
      await expect(
        registry.connect(syncer).updateStatus(passportId, 4)
      ).to.be.revertedWithCustomError(registry, "InvalidStatus");
    });

    it("should reject non-syncer anchor", async function () {
      await expect(
        registry.connect(other).anchorPassport(passportId, contentHash, payer.address)
      ).to.be.revertedWithCustomError(registry, "NotAuthorizedSyncer");
    });
  });

  describe("Payment Gate", function () {
    const priceNative = ethers.parseEther("0.001");
    const priceLucid = ethers.parseUnits("10", 9);
    const ONE_HOUR = 3600;

    beforeEach(async function () {
      await registry.connect(syncer).anchorPassport(passportId, contentHash, payer.address);
    });

    it("should set gate", async function () {
      await expect(
        registry.connect(payer).setGate(passportId, priceNative, priceLucid)
      ).to.emit(registry, "GateSet")
        .withArgs(passportId, priceNative, priceLucid);
    });

    it("should reject setGate from non-owner", async function () {
      await expect(
        registry.connect(other).setGate(passportId, priceNative, priceLucid)
      ).to.be.revertedWithCustomError(registry, "NotGateOwner");
    });

    it("should pay for access with native token", async function () {
      await registry.connect(payer).setGate(passportId, priceNative, priceLucid);

      await expect(
        registry.connect(other).payForAccess(passportId, ONE_HOUR, { value: priceNative })
      ).to.emit(registry, "AccessPurchased");

      expect(await registry.checkAccess(passportId, other.address)).to.be.true;
    });

    it("should reject insufficient native payment", async function () {
      await registry.connect(payer).setGate(passportId, priceNative, priceLucid);

      await expect(
        registry.connect(other).payForAccess(passportId, ONE_HOUR, { value: 0 })
      ).to.be.revertedWithCustomError(registry, "InsufficientPayment");
    });

    it("should pay for access with LUCID token", async function () {
      await registry.connect(payer).setGate(passportId, priceNative, priceLucid);

      // Mint LUCID to the payer (other) and approve
      await mockToken.mint(other.address, priceLucid);
      await mockToken.connect(other).approve(await registry.getAddress(), priceLucid);

      await expect(
        registry.connect(other).payForAccessLucid(passportId, ONE_HOUR)
      ).to.emit(registry, "AccessPurchased");

      expect(await registry.checkAccess(passportId, other.address)).to.be.true;
    });

    it("should extend access on second payment", async function () {
      await registry.connect(payer).setGate(passportId, priceNative, priceLucid);

      await registry.connect(other).payForAccess(passportId, ONE_HOUR, { value: priceNative });
      await registry.connect(other).payForAccess(passportId, ONE_HOUR, { value: priceNative });

      // Should have 2 hours from now
      const expiry = await registry.accessExpiry(passportId, other.address);
      const now = await time.latest();
      expect(Number(expiry) - now).to.be.greaterThan(ONE_HOUR);
    });

    it("should expire access after duration", async function () {
      await registry.connect(payer).setGate(passportId, priceNative, priceLucid);
      await registry.connect(other).payForAccess(passportId, ONE_HOUR, { value: priceNative });

      expect(await registry.checkAccess(passportId, other.address)).to.be.true;

      // Advance time past expiry
      await time.increase(ONE_HOUR + 1);
      expect(await registry.checkAccess(passportId, other.address)).to.be.false;
    });

    it("should withdraw revenue", async function () {
      await registry.connect(payer).setGate(passportId, priceNative, priceLucid);
      await registry.connect(other).payForAccess(passportId, ONE_HOUR, { value: priceNative });

      const balBefore = await ethers.provider.getBalance(payer.address);
      const tx = await registry.connect(payer).withdrawRevenue(passportId);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balAfter = await ethers.provider.getBalance(payer.address);

      expect(balAfter + gasUsed - balBefore).to.equal(priceNative);
    });

    it("should reject withdraw with no revenue", async function () {
      await registry.connect(payer).setGate(passportId, priceNative, priceLucid);
      await expect(
        registry.connect(payer).withdrawRevenue(passportId)
      ).to.be.revertedWithCustomError(registry, "NoRevenue");
    });

    it("should revoke access", async function () {
      await registry.connect(payer).setGate(passportId, priceNative, priceLucid);
      await registry.connect(other).payForAccess(passportId, ONE_HOUR, { value: priceNative });

      expect(await registry.checkAccess(passportId, other.address)).to.be.true;
      await registry.connect(payer).revokeAccess(passportId, other.address);
      expect(await registry.checkAccess(passportId, other.address)).to.be.false;
    });

    it("should reject gate operations on non-existent passport", async function () {
      const fakeId = ethers.keccak256(ethers.toUtf8Bytes("fake"));
      await expect(
        registry.connect(payer).setGate(fakeId, priceNative, priceLucid)
      ).to.be.revertedWithCustomError(registry, "PassportNotAnchored");
    });
  });
});
