import { expect } from "chai";
import { ethers } from "hardhat";
import { createHash } from "crypto";

describe("LucidModules (ERC-7579)", function () {
  let policyModule: any;
  let payoutModule: any;
  let receiptModule: any;
  let token: any;
  let owner: any;
  let recipient1: any;
  let recipient2: any;
  let recipient3: any;

  beforeEach(async function () {
    [owner, recipient1, recipient2, recipient3] = await ethers.getSigners();

    // Deploy modules
    const PolicyModule = await ethers.getContractFactory("LucidPolicyModule");
    policyModule = await PolicyModule.deploy();
    await policyModule.waitForDeployment();

    const PayoutModule = await ethers.getContractFactory("LucidPayoutModule");
    payoutModule = await PayoutModule.deploy();
    await payoutModule.waitForDeployment();

    const ReceiptModule = await ethers.getContractFactory("LucidReceiptModule");
    receiptModule = await ReceiptModule.deploy();
    await receiptModule.waitForDeployment();

    // Deploy mock token
    const MockToken = await ethers.getContractFactory("MockERC20");
    token = await MockToken.deploy("Lucid Token", "LUCID", 9);
    await token.waitForDeployment();

    // Mint tokens
    await token.mint(owner.address, ethers.parseUnits("100000", 9));
  });

  // =========================================================================
  // Policy Module
  // =========================================================================

  describe("LucidPolicyModule", function () {
    it("should identify as validator type", async function () {
      expect(await policyModule.isModuleType(1)).to.be.true; // TYPE_VALIDATOR
      expect(await policyModule.isModuleType(2)).to.be.false; // TYPE_EXECUTOR
    });

    it("should install with policy hashes", async function () {
      const policy1 = "0x" + createHash("sha256").update("policy-1").digest("hex");
      const policy2 = "0x" + createHash("sha256").update("policy-2").digest("hex");

      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32[]"],
        [[policy1, policy2]]
      );

      await policyModule.onInstall(initData);

      expect(await policyModule.isPolicyAllowed(owner.address, policy1)).to.be.true;
      expect(await policyModule.isPolicyAllowed(owner.address, policy2)).to.be.true;
    });

    it("should set and check individual policies", async function () {
      const policyHash = "0x" + createHash("sha256").update("test-policy").digest("hex");

      await policyModule.setPolicy(policyHash, true);
      expect(await policyModule.isPolicyAllowed(owner.address, policyHash)).to.be.true;

      await policyModule.setPolicy(policyHash, false);
      expect(await policyModule.isPolicyAllowed(owner.address, policyHash)).to.be.false;
    });

    it("should reject unknown policies in validation", async function () {
      const unknownPolicy = "0x" + createHash("sha256").update("unknown").digest("hex");
      expect(await policyModule.validatePolicy(unknownPolicy)).to.be.false;
    });

    it("should uninstall and clear all policies", async function () {
      const policy = "0x" + createHash("sha256").update("policy").digest("hex");
      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32[]"],
        [[policy]]
      );

      await policyModule.onInstall(initData);
      expect(await policyModule.isPolicyAllowed(owner.address, policy)).to.be.true;

      await policyModule.onUninstall("0x");
      expect(await policyModule.isPolicyAllowed(owner.address, policy)).to.be.false;
    });

    it("should get all policies for an account", async function () {
      const p1 = "0x" + createHash("sha256").update("p1").digest("hex");
      const p2 = "0x" + createHash("sha256").update("p2").digest("hex");

      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32[]"],
        [[p1, p2]]
      );
      await policyModule.onInstall(initData);

      const policies = await policyModule.getPolicies(owner.address);
      expect(policies.length).to.equal(2);
    });
  });

  // =========================================================================
  // Payout Module
  // =========================================================================

  describe("LucidPayoutModule", function () {
    it("should identify as executor type", async function () {
      expect(await payoutModule.isModuleType(2)).to.be.true; // TYPE_EXECUTOR
      expect(await payoutModule.isModuleType(1)).to.be.false; // TYPE_VALIDATOR
    });

    it("should install with split configuration", async function () {
      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address[]", "uint256[]"],
        [
          [recipient1.address, recipient2.address, recipient3.address],
          [7000, 2000, 1000],
        ]
      );

      await payoutModule.onInstall(initData);

      const [recipients, bps] = await payoutModule.getSplit(owner.address);
      expect(recipients.length).to.equal(3);
      expect(bps[0]).to.equal(7000);
      expect(bps[1]).to.equal(2000);
      expect(bps[2]).to.equal(1000);
    });

    it("should reject splits not summing to 10000", async function () {
      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address[]", "uint256[]"],
        [
          [recipient1.address, recipient2.address],
          [5000, 3000], // Only 8000
        ]
      );

      await expect(payoutModule.onInstall(initData))
        .to.be.revertedWith("Basis points must sum to 10000");
    });

    it("should execute equal split", async function () {
      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address[]", "uint256[]"],
        [
          [recipient1.address, recipient2.address],
          [5000, 5000], // 50/50
        ]
      );
      await payoutModule.onInstall(initData);

      const amount = ethers.parseUnits("1000", 9);
      await token.approve(await payoutModule.getAddress(), amount);
      await payoutModule.execute(await token.getAddress(), amount);

      const bal1 = await token.balanceOf(recipient1.address);
      const bal2 = await token.balanceOf(recipient2.address);
      expect(bal1).to.equal(ethers.parseUnits("500", 9));
      expect(bal2).to.equal(ethers.parseUnits("500", 9));
    });

    it("should execute unequal split (70/20/10)", async function () {
      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address[]", "uint256[]"],
        [
          [recipient1.address, recipient2.address, recipient3.address],
          [7000, 2000, 1000],
        ]
      );
      await payoutModule.onInstall(initData);

      const amount = ethers.parseUnits("10000", 9);
      await token.approve(await payoutModule.getAddress(), amount);
      await payoutModule.execute(await token.getAddress(), amount);

      expect(await token.balanceOf(recipient1.address)).to.equal(ethers.parseUnits("7000", 9));
      expect(await token.balanceOf(recipient2.address)).to.equal(ethers.parseUnits("2000", 9));
      expect(await token.balanceOf(recipient3.address)).to.equal(ethers.parseUnits("1000", 9));
    });

    it("should update split via setSplit", async function () {
      await payoutModule.setSplit(
        [recipient1.address, recipient2.address],
        [6000, 4000]
      );

      const [recipients, bps] = await payoutModule.getSplit(owner.address);
      expect(recipients.length).to.equal(2);
      expect(bps[0]).to.equal(6000);
      expect(bps[1]).to.equal(4000);
    });

    it("should uninstall and clear split", async function () {
      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address[]", "uint256[]"],
        [
          [recipient1.address, recipient2.address],
          [5000, 5000],
        ]
      );
      await payoutModule.onInstall(initData);
      await payoutModule.onUninstall("0x");

      const amount = ethers.parseUnits("1000", 9);
      await token.approve(await payoutModule.getAddress(), amount);

      await expect(payoutModule.execute(await token.getAddress(), amount))
        .to.be.revertedWith("No split configured");
    });
  });

  // =========================================================================
  // Receipt Module
  // =========================================================================

  describe("LucidReceiptModule", function () {
    it("should identify as executor type", async function () {
      expect(await receiptModule.isModuleType(2)).to.be.true;
      expect(await receiptModule.isModuleType(1)).to.be.false;
    });

    it("should emit receipt event", async function () {
      const receiptHash = "0x" + createHash("sha256").update("receipt-data").digest("hex");
      const policyHash = "0x" + createHash("sha256").update("policy").digest("hex");

      const receiptData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes32", "string", "string", "uint256", "uint256"],
        [receiptHash, policyHash, "model-passport-123", "compute-passport-456", 1000, 500]
      );

      const tx = await receiptModule.emitReceipt(receiptData);
      const receipt = await tx.wait();

      const event = receipt.logs.find((l: any) => l.fragment?.name === "ReceiptEmitted");
      expect(event).to.not.be.undefined;
      expect(event.args[1]).to.equal(receiptHash); // indexed receiptHash
    });

    it("should install and uninstall without error (stateless)", async function () {
      await receiptModule.onInstall("0x");
      await receiptModule.onUninstall("0x");
    });
  });
});
