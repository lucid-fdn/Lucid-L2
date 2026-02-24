import { expect } from "chai";
import { ethers } from "hardhat";
import { createHash } from "crypto";

describe("LucidArbitration", function () {
  let arbitration: any;
  let escrow: any;
  let validator: any;
  let token: any;
  let owner: any;
  let depositor: any;
  let beneficiary: any;
  let other: any;

  const AMOUNT = ethers.parseUnits("1000", 9);
  const DURATION = 86400; // 24 hours
  const EVIDENCE_WINDOW = 48 * 3600; // 48 hours
  const APPEAL_WINDOW = 72 * 3600; // 72 hours
  const APPEAL_STAKE = ethers.parseUnits("100", 9); // 100 $LUCID

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

    // Deploy arbitration
    const LucidArbitration = await ethers.getContractFactory("LucidArbitration");
    arbitration = await LucidArbitration.deploy(
      await escrow.getAddress(),
      await validator.getAddress(),
      await token.getAddress()
    );
    await arbitration.waitForDeployment();

    // Set arbitration contract on escrow
    await escrow.setArbitrationContract(await arbitration.getAddress());

    // Mint tokens
    await token.mint(depositor.address, AMOUNT * 10n);
    await token.connect(depositor).approve(await escrow.getAddress(), AMOUNT * 10n);

    // Mint appeal stake tokens to other parties
    await token.mint(beneficiary.address, APPEAL_STAKE * 2n);
    await token.connect(beneficiary).approve(await arbitration.getAddress(), APPEAL_STAKE * 2n);
    await token.mint(depositor.address, APPEAL_STAKE * 2n);
    await token.connect(depositor).approve(await arbitration.getAddress(), APPEAL_STAKE * 2n);
  });

  async function createAndDisputeEscrow(): Promise<{ escrowId: string; disputeId: string }> {
    // Create escrow
    const tx = await escrow.connect(depositor).createEscrow(
      beneficiary.address,
      await token.getAddress(),
      AMOUNT,
      DURATION,
      ethers.ZeroHash
    );
    const receipt = await tx.wait();
    const escrowEvent = receipt.logs.find((l: any) => l.fragment?.name === "EscrowCreated");
    const escrowId = escrowEvent.args[0];

    // Open dispute via arbitration
    const dtx = await arbitration.connect(depositor).openDispute(escrowId, "Work not delivered");
    const dreceipt = await dtx.wait();
    const disputeEvent = dreceipt.logs.find((l: any) => l.fragment?.name === "DisputeOpened");
    const disputeId = disputeEvent.args[0];

    return { escrowId, disputeId };
  }

  describe("openDispute", function () {
    it("should open a dispute and freeze escrow", async function () {
      const { escrowId, disputeId } = await createAndDisputeEscrow();

      const dispute = await arbitration.getDispute(disputeId);
      expect(dispute.escrowId).to.equal(escrowId);
      expect(dispute.status).to.equal(1); // EvidencePhase
      expect(dispute.initiator).to.equal(depositor.address);

      // Escrow should be disputed
      const escrowInfo = await escrow.getEscrow(escrowId);
      expect(escrowInfo.status).to.equal(3); // Disputed
    });

    it("should reject duplicate dispute for same escrow", async function () {
      const { escrowId } = await createAndDisputeEscrow();

      await expect(
        arbitration.connect(beneficiary).openDispute(escrowId, "Second dispute")
      ).to.be.revertedWith("Dispute already exists for escrow");
    });
  });

  describe("submitEvidence", function () {
    it("should accept evidence during evidence window", async function () {
      const { disputeId } = await createAndDisputeEscrow();
      const receiptHash = "0x" + createHash("sha256").update("evidence-receipt").digest("hex");
      const mmrRoot = "0x" + createHash("sha256").update("mmr-root").digest("hex");

      await arbitration.connect(beneficiary).submitEvidence(
        disputeId,
        receiptHash,
        mmrRoot,
        "0x",
        "Proof of completed work"
      );

      const count = await arbitration.getEvidenceCount(disputeId);
      expect(count).to.equal(1);

      const evidence = await arbitration.getEvidence(disputeId, 0);
      expect(evidence.submitter).to.equal(beneficiary.address);
      expect(evidence.receiptHash).to.equal(receiptHash);
    });

    it("should reject evidence after deadline", async function () {
      const { disputeId } = await createAndDisputeEscrow();

      // Fast-forward past evidence window
      await ethers.provider.send("evm_increaseTime", [EVIDENCE_WINDOW + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        arbitration.connect(beneficiary).submitEvidence(
          disputeId,
          ethers.ZeroHash,
          ethers.ZeroHash,
          "0x",
          "Late evidence"
        )
      ).to.be.revertedWith("Evidence window closed");
    });
  });

  describe("resolveDispute", function () {
    it("should resolve in favor of beneficiary with valid receipt evidence", async function () {
      const { disputeId } = await createAndDisputeEscrow();

      // Submit receipt evidence
      const receiptHash = "0x" + createHash("sha256").update("valid-receipt").digest("hex");
      await arbitration.connect(beneficiary).submitEvidence(
        disputeId,
        receiptHash,
        ethers.ZeroHash,
        "0x",
        "Valid receipt"
      );

      // Fast-forward past evidence window
      await ethers.provider.send("evm_increaseTime", [EVIDENCE_WINDOW + 1]);
      await ethers.provider.send("evm_mine", []);

      await arbitration.resolveDispute(disputeId);

      const dispute = await arbitration.getDispute(disputeId);
      expect(dispute.status).to.equal(2); // Resolved
      expect(dispute.resolvedInFavorOf).to.equal(beneficiary.address);

      // Beneficiary should have received funds
      const balance = await token.balanceOf(beneficiary.address);
      expect(balance).to.be.gte(AMOUNT);
    });

    it("should resolve in favor of depositor with no evidence", async function () {
      const { disputeId } = await createAndDisputeEscrow();

      // Fast-forward past evidence window (no evidence submitted)
      await ethers.provider.send("evm_increaseTime", [EVIDENCE_WINDOW + 1]);
      await ethers.provider.send("evm_mine", []);

      await arbitration.resolveDispute(disputeId);

      const dispute = await arbitration.getDispute(disputeId);
      expect(dispute.status).to.equal(2); // Resolved
      expect(dispute.resolvedInFavorOf).to.equal(depositor.address);
    });

    it("should reject resolution during evidence window", async function () {
      const { disputeId } = await createAndDisputeEscrow();

      await expect(
        arbitration.resolveDispute(disputeId)
      ).to.be.revertedWith("Evidence window still open");
    });
  });

  describe("appealDecision", function () {
    it("should allow appeal with stake", async function () {
      const { disputeId } = await createAndDisputeEscrow();

      // Fast-forward and resolve
      await ethers.provider.send("evm_increaseTime", [EVIDENCE_WINDOW + 1]);
      await ethers.provider.send("evm_mine", []);
      await arbitration.resolveDispute(disputeId);

      // Appeal
      await arbitration.connect(beneficiary).appealDecision(disputeId);

      const dispute = await arbitration.getDispute(disputeId);
      expect(dispute.status).to.equal(3); // Appealed
      expect(dispute.appealed).to.be.true;
      expect(dispute.appealedBy).to.equal(beneficiary.address);
    });

    it("should reject double appeal", async function () {
      const { disputeId } = await createAndDisputeEscrow();

      await ethers.provider.send("evm_increaseTime", [EVIDENCE_WINDOW + 1]);
      await ethers.provider.send("evm_mine", []);
      await arbitration.resolveDispute(disputeId);

      await arbitration.connect(beneficiary).appealDecision(disputeId);

      // Fast-forward past appeal, resolve again
      await ethers.provider.send("evm_increaseTime", [APPEAL_WINDOW + 1]);
      await ethers.provider.send("evm_mine", []);
      await arbitration.resolveDispute(disputeId);

      // Try to appeal again
      await expect(
        arbitration.connect(depositor).appealDecision(disputeId)
      ).to.be.revertedWith("Already appealed");
    });

    it("should reject appeal of unresolved dispute", async function () {
      const { disputeId } = await createAndDisputeEscrow();

      await expect(
        arbitration.connect(beneficiary).appealDecision(disputeId)
      ).to.be.revertedWith("Can only appeal resolved disputes");
    });
  });
});
