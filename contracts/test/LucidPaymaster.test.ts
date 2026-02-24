import { expect } from "chai";
import { ethers } from "hardhat";

describe("LucidPaymaster", function () {
  let paymaster: any;
  let token: any;
  let entryPoint: any;
  let owner: any;
  let user: any;

  const LUCID_PER_ETH = ethers.parseUnits("1000", 9); // 1 ETH = 1000 $LUCID (9-decimal token)
  const MAX_COST_LUCID = ethers.parseUnits("10000", 9); // Max 10000 $LUCID per op

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Deploy mock ERC-20 token
    const MockToken = await ethers.getContractFactory("MockERC20");
    token = await MockToken.deploy("Lucid Token", "LUCID", 9);
    await token.waitForDeployment();

    // Deploy mock EntryPoint
    const MockEntryPoint = await ethers.getContractFactory("MockEntryPoint");
    entryPoint = await MockEntryPoint.deploy();
    await entryPoint.waitForDeployment();

    // Deploy paymaster
    const LucidPaymaster = await ethers.getContractFactory("LucidPaymaster");
    paymaster = await LucidPaymaster.deploy(
      await token.getAddress(),
      await entryPoint.getAddress(),
      LUCID_PER_ETH,
      MAX_COST_LUCID
    );
    await paymaster.waitForDeployment();

    // Mint tokens to user
    await token.mint(user.address, ethers.parseUnits("100000", 9));
    await token.connect(user).approve(await paymaster.getAddress(), ethers.parseUnits("100000", 9));
  });

  describe("constructor", function () {
    it("should set initial values", async function () {
      expect(await paymaster.lucidPerEth()).to.equal(LUCID_PER_ETH);
      expect(await paymaster.maxCostLucid()).to.equal(MAX_COST_LUCID);
      expect(await paymaster.lucidToken()).to.equal(await token.getAddress());
      expect(await paymaster.entryPoint()).to.equal(await entryPoint.getAddress());
    });

    it("should reject zero token address", async function () {
      const LucidPaymaster = await ethers.getContractFactory("LucidPaymaster");
      await expect(
        LucidPaymaster.deploy(ethers.ZeroAddress, await entryPoint.getAddress(), LUCID_PER_ETH, MAX_COST_LUCID)
      ).to.be.revertedWith("Invalid token");
    });
  });

  describe("validatePaymasterUserOp", function () {
    it("should validate with sufficient allowance and balance", async function () {
      const userOp = {
        sender: user.address,
        nonce: 0,
        initCode: "0x",
        callData: "0x",
        accountGasLimits: ethers.ZeroHash,
        preVerificationGas: 0,
        gasFees: ethers.ZeroHash,
        paymasterAndData: "0x",
        signature: "0x",
      };

      const maxCost = ethers.parseEther("0.001"); // 0.001 ETH
      // 0.001 ETH * 1000 LUCID/ETH = 1 $LUCID (in 9 decimals = 1_000_000_000)

      const [context, validationData] = await paymaster.validatePaymasterUserOp(
        userOp,
        ethers.ZeroHash,
        maxCost
      );

      expect(validationData).to.equal(0);
      expect(context.length).to.be.greaterThan(2); // non-empty context
    });

    it("should reject insufficient allowance", async function () {
      // Revoke allowance
      await token.connect(user).approve(await paymaster.getAddress(), 0);

      const userOp = {
        sender: user.address,
        nonce: 0,
        initCode: "0x",
        callData: "0x",
        accountGasLimits: ethers.ZeroHash,
        preVerificationGas: 0,
        gasFees: ethers.ZeroHash,
        paymasterAndData: "0x",
        signature: "0x",
      };

      await expect(
        paymaster.validatePaymasterUserOp(userOp, ethers.ZeroHash, ethers.parseEther("0.001"))
      ).to.be.revertedWith("Insufficient LUCID allowance");
    });
  });

  describe("setExchangeRate", function () {
    it("should update exchange rate", async function () {
      const newRate = ethers.parseUnits("2000", 9);
      await paymaster.setExchangeRate(newRate);
      expect(await paymaster.lucidPerEth()).to.equal(newRate);
    });

    it("should reject zero rate", async function () {
      await expect(paymaster.setExchangeRate(0)).to.be.revertedWith("Rate must be > 0");
    });

    it("should reject non-owner", async function () {
      await expect(
        paymaster.connect(user).setExchangeRate(ethers.parseUnits("2000", 9))
      ).to.be.reverted;
    });
  });

  describe("setMaxCost", function () {
    it("should update max cost", async function () {
      const newMax = ethers.parseUnits("20000", 9);
      await paymaster.setMaxCost(newMax);
      expect(await paymaster.maxCostLucid()).to.equal(newMax);
    });

    it("should reject zero max", async function () {
      await expect(paymaster.setMaxCost(0)).to.be.revertedWith("Max must be > 0");
    });
  });

  describe("estimateLucidCost", function () {
    it("should calculate correct LUCID cost", async function () {
      const ethCost = ethers.parseEther("0.01"); // 0.01 ETH
      const lucidCost = await paymaster.estimateLucidCost(ethCost);
      // 0.01 ETH * 1000 LUCID/ETH = 10 LUCID
      // In 9 decimals = 10_000_000_000
      expect(lucidCost).to.equal(10n * 10n ** 9n);
    });
  });

  describe("deposit", function () {
    it("should deposit ETH to EntryPoint", async function () {
      const depositAmount = ethers.parseEther("1.0");
      await paymaster.deposit({ value: depositAmount });

      const deposit = await paymaster.getDeposit();
      expect(deposit).to.equal(depositAmount);
    });

    it("should reject zero deposit", async function () {
      await expect(paymaster.deposit({ value: 0 })).to.be.revertedWith("Must send ETH");
    });
  });
});
