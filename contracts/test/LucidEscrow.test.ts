import { expect } from "chai";
import { ethers } from "hardhat";
import { createHash } from "crypto";

describe("LucidEscrow", function () {
  let escrow: any;
  let validator: any;
  let token: any;
  let owner: any;
  let depositor: any;
  let beneficiary: any;
  let other: any;

  const AMOUNT = ethers.parseUnits("1000", 9); // 1000 $LUCID (9 decimals)
  const DURATION = 86400; // 24 hours

  beforeEach(async function () {
    [owner, depositor, beneficiary, other] = await ethers.getSigners();

    // Deploy validator
    const LucidValidator = await ethers.getContractFactory("LucidValidator");
    validator = await LucidValidator.deploy();
    await validator.waitForDeployment();

    // Deploy mock ERC-20 token
    const MockToken = await ethers.getContractFactory("MockERC20");
    token = await MockToken.deploy("Lucid Token", "LUCID", 9);
    await token.waitForDeployment();

    // Deploy escrow
    const LucidEscrow = await ethers.getContractFactory("LucidEscrow");
    escrow = await LucidEscrow.deploy(await validator.getAddress());
    await escrow.waitForDeployment();

    // Mint tokens to depositor and approve escrow
    await token.mint(depositor.address, AMOUNT * 10n);
    await token.connect(depositor).approve(await escrow.getAddress(), AMOUNT * 10n);
  });

  describe("createEscrow", function () {
    it("should create an escrow and transfer tokens", async function () {
      const receiptHash = "0x" + createHash("sha256").update("test-receipt").digest("hex");

      const tx = await escrow.connect(depositor).createEscrow(
        beneficiary.address,
        await token.getAddress(),
        AMOUNT,
        DURATION,
        receiptHash
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find((l: any) => l.fragment?.name === "EscrowCreated");
      expect(event).to.not.be.undefined;

      // Token balance should transfer to escrow
      const escrowBalance = await token.balanceOf(await escrow.getAddress());
      expect(escrowBalance).to.equal(AMOUNT);
    });

    it("should reject zero amount", async function () {
      await expect(
        escrow.connect(depositor).createEscrow(
          beneficiary.address,
          await token.getAddress(),
          0,
          DURATION,
          ethers.ZeroHash
        )
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("should reject zero beneficiary", async function () {
      await expect(
        escrow.connect(depositor).createEscrow(
          ethers.ZeroAddress,
          await token.getAddress(),
          AMOUNT,
          DURATION,
          ethers.ZeroHash
        )
      ).to.be.revertedWith("Invalid beneficiary");
    });
  });

  describe("releaseEscrow", function () {
    let escrowId: string;
    const receiptHash = "0x" + createHash("sha256").update("valid-receipt").digest("hex");

    beforeEach(async function () {
      const tx = await escrow.connect(depositor).createEscrow(
        beneficiary.address,
        await token.getAddress(),
        AMOUNT,
        DURATION,
        receiptHash
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find((l: any) => l.fragment?.name === "EscrowCreated");
      escrowId = event.args[0];
    });

    it("should release with valid receipt", async function () {
      const signature = "0x" + "aa".repeat(64); // 64 bytes
      const signerPubkey = "0x" + "bb".repeat(32);

      await escrow.releaseEscrow(escrowId, receiptHash, signature, signerPubkey);

      const info = await escrow.getEscrow(escrowId);
      expect(info.status).to.equal(1); // Released

      const beneficiaryBalance = await token.balanceOf(beneficiary.address);
      expect(beneficiaryBalance).to.equal(AMOUNT);
    });

    it("should reject mismatched receipt hash", async function () {
      const wrongHash = "0x" + createHash("sha256").update("wrong").digest("hex");
      const signature = "0x" + "aa".repeat(64);
      const signerPubkey = "0x" + "bb".repeat(32);

      await expect(
        escrow.releaseEscrow(escrowId, wrongHash, signature, signerPubkey)
      ).to.be.revertedWith("Receipt hash mismatch");
    });

    it("should reject invalid signature length", async function () {
      const badSig = "0x" + "aa".repeat(32); // Wrong length
      const signerPubkey = "0x" + "bb".repeat(32);

      await expect(
        escrow.releaseEscrow(escrowId, receiptHash, badSig, signerPubkey)
      ).to.be.reverted;
    });
  });

  describe("claimTimeout", function () {
    let escrowId: string;

    beforeEach(async function () {
      const tx = await escrow.connect(depositor).createEscrow(
        beneficiary.address,
        await token.getAddress(),
        AMOUNT,
        DURATION,
        ethers.ZeroHash
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find((l: any) => l.fragment?.name === "EscrowCreated");
      escrowId = event.args[0];
    });

    it("should allow depositor to claim after timeout", async function () {
      // Fast-forward past expiry
      await ethers.provider.send("evm_increaseTime", [DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      await escrow.connect(depositor).claimTimeout(escrowId);

      const info = await escrow.getEscrow(escrowId);
      expect(info.status).to.equal(2); // Refunded

      const depositorBalance = await token.balanceOf(depositor.address);
      expect(depositorBalance).to.equal(AMOUNT * 10n); // Original amount restored
    });

    it("should reject claim before timeout", async function () {
      await expect(
        escrow.connect(depositor).claimTimeout(escrowId)
      ).to.be.revertedWith("Escrow has not expired");
    });

    it("should reject non-depositor claim", async function () {
      await ethers.provider.send("evm_increaseTime", [DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        escrow.connect(beneficiary).claimTimeout(escrowId)
      ).to.be.revertedWith("Only depositor can claim timeout");
    });
  });

  describe("disputeEscrow", function () {
    let escrowId: string;

    beforeEach(async function () {
      const tx = await escrow.connect(depositor).createEscrow(
        beneficiary.address,
        await token.getAddress(),
        AMOUNT,
        DURATION,
        ethers.ZeroHash
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find((l: any) => l.fragment?.name === "EscrowCreated");
      escrowId = event.args[0];
    });

    it("should allow depositor to dispute", async function () {
      await escrow.connect(depositor).disputeEscrow(escrowId, "Work not delivered");

      const info = await escrow.getEscrow(escrowId);
      expect(info.status).to.equal(3); // Disputed
    });

    it("should allow beneficiary to dispute", async function () {
      await escrow.connect(beneficiary).disputeEscrow(escrowId, "Payment terms unclear");

      const info = await escrow.getEscrow(escrowId);
      expect(info.status).to.equal(3); // Disputed
    });

    it("should reject dispute from non-party", async function () {
      await expect(
        escrow.connect(other).disputeEscrow(escrowId, "Random dispute")
      ).to.be.revertedWith("Only depositor, beneficiary, or arbitration contract can dispute");
    });

    it("should prevent timeout claim after dispute", async function () {
      await escrow.connect(depositor).disputeEscrow(escrowId, "Dispute reason");

      await ethers.provider.send("evm_increaseTime", [DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        escrow.connect(depositor).claimTimeout(escrowId)
      ).to.be.revertedWith("Escrow not in Created status");
    });
  });

  describe("resolveDispute", function () {
    let escrowId: string;

    beforeEach(async function () {
      const tx = await escrow.connect(depositor).createEscrow(
        beneficiary.address,
        await token.getAddress(),
        AMOUNT,
        DURATION,
        ethers.ZeroHash
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find((l: any) => l.fragment?.name === "EscrowCreated");
      escrowId = event.args[0];

      // Dispute it
      await escrow.connect(depositor).disputeEscrow(escrowId, "test dispute");

      // Set arbitration contract to owner for testing
      await escrow.setArbitrationContract(owner.address);
    });

    it("should resolve in favor of beneficiary", async function () {
      await escrow.resolveDispute(escrowId, beneficiary.address);

      const info = await escrow.getEscrow(escrowId);
      expect(info.status).to.equal(1); // Released

      const balance = await token.balanceOf(beneficiary.address);
      expect(balance).to.equal(AMOUNT);
    });

    it("should resolve in favor of depositor", async function () {
      await escrow.resolveDispute(escrowId, depositor.address);

      const info = await escrow.getEscrow(escrowId);
      expect(info.status).to.equal(2); // Refunded
    });

    it("should reject non-arbitration caller", async function () {
      await expect(
        escrow.connect(other).resolveDispute(escrowId, depositor.address)
      ).to.be.revertedWith("Only arbitration contract");
    });
  });
});
