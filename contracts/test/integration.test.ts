/**
 * Integration Tests — Live Testnet Contracts
 *
 * Calls real deployed contracts on Sepolia, Base Sepolia, or ApeChain Curtis.
 * Skips automatically on local hardhat network.
 *
 * Usage:
 *   EVM_PRIVATE_KEY=0x... npx hardhat test test/integration.test.ts --network sepolia
 *   EVM_PRIVATE_KEY=0x... npx hardhat test test/integration.test.ts --network baseSepolia
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import { createHash } from "crypto";

// Deployed addresses per network
const NETWORK_ADDRESSES: Record<string, Record<string, string>> = {
  sepolia: {
    LucidValidator: "0x2f3F68fEF35D39711F78Ce75c5a7fbA35f80500e",
    ZkMLVerifier: "0xd69Ce5E5AA5a68D55413766320b520eeA3fdFf98",
    LucidEscrow: "0x3Aff9d80Cd91Fb9C4fE475155e60e9C473F55088",
    Lucid: "0x060f76F82325B98bC595954F6b8c88083B43b379",
    LucidArbitration: "0x3D29D5dDAe2da5E571C015EfAbdfCab9A1B0F9BA",
    LucidPolicyModule: "0x1be63A49Ce0D65A010E2fF9038b81FEdf6AB1477",
    LucidPayoutModule: "0xAec07214d21627dFD2131470B29a8372be21eF55",
    LucidReceiptModule: "0x7695cd6F97d1434A2Ab5f778C6B02898385b14cc",
    LucidPaymaster: "0xafDcb7f7D75784076eC1f62DB13F7651A73789A2",
  },
  baseSepolia: {
    LucidValidator: "0x7695cd6F97d1434A2Ab5f778C6B02898385b14cc",
    ZkMLVerifier: "0xAA663967159E18A3Da2A8277FDDa35C0389e1462",
    LucidEscrow: "0x060f76F82325B98bC595954F6b8c88083B43b379",
    Lucid: "0x17F583fc59b745E24C5078b9C8e4577b866cD7fc",
    LucidArbitration: "0xc93b3E60503cAD1FEc11209F374A67D2886c6BA5",
    LucidPolicyModule: "0xe0263C014B66D4452CD42ec9693A830f5D28bC5F",
    LucidPayoutModule: "0x51646afF187945B7F573503139A3a2c470064229",
    LucidReceiptModule: "0x00b811fD025A3B2606a83Ee9C4bF882f4612B745",
    LucidPaymaster: "0xd2671c81a7169E66Aa9B0db5D0bF865Cfd6868bD",
  },
};

const networkName = process.env.HARDHAT_NETWORK || "hardhat";
const isLive = networkName !== "hardhat";
const ADDRESSES = NETWORK_ADDRESSES[networkName] || {};

function sha256Hex(data: string): string {
  return "0x" + createHash("sha256").update(data).digest("hex");
}

// L2 chains need explicit nonce + gas overrides to avoid "replacement transaction underpriced"
let _nonce = -1;
async function txOverrides(): Promise<Record<string, any>> {
  const [signer] = await ethers.getSigners();
  if (_nonce < 0) {
    _nonce = await ethers.provider.getTransactionCount(signer.address, "latest");
  }
  const feeData = await ethers.provider.getFeeData();
  const overrides: Record<string, any> = { nonce: _nonce++ };
  if (feeData.maxFeePerGas) {
    overrides.maxFeePerGas = feeData.maxFeePerGas * 2n;
    overrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas || 1000000n) * 2n;
  }
  return overrides;
}

(isLive ? describe : describe.skip)(`Integration: ${networkName} Contracts`, function () {
  this.timeout(120_000);

  let deployer: any;
  let validator: any;
  let zkml: any;
  let escrow: any;
  let token: any;
  let arbitration: any;
  let policyModule: any;
  let payoutModule: any;
  let receiptModule: any;
  let paymaster: any;

  before(async function () {
    if (!ADDRESSES.LucidValidator) {
      console.log(`  No addresses configured for network '${networkName}', skipping`);
      this.skip();
    }

    [deployer] = await ethers.getSigners();
    console.log("  Network:", networkName);
    console.log("  Deployer:", deployer.address);
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("  Balance:", ethers.formatEther(balance), "ETH");

    validator = await ethers.getContractAt("LucidValidator", ADDRESSES.LucidValidator);
    zkml = await ethers.getContractAt("ZkMLVerifier", ADDRESSES.ZkMLVerifier);
    escrow = await ethers.getContractAt("LucidEscrow", ADDRESSES.LucidEscrow);
    token = await ethers.getContractAt("Lucid", ADDRESSES.Lucid);
    arbitration = await ethers.getContractAt("LucidArbitration", ADDRESSES.LucidArbitration);
    policyModule = await ethers.getContractAt("LucidPolicyModule", ADDRESSES.LucidPolicyModule);
    payoutModule = await ethers.getContractAt("LucidPayoutModule", ADDRESSES.LucidPayoutModule);
    receiptModule = await ethers.getContractAt("LucidReceiptModule", ADDRESSES.LucidReceiptModule);
    paymaster = await ethers.getContractAt("LucidPaymaster", ADDRESSES.LucidPaymaster);
  });

  // ────────────────────────────────────────────────────────
  // 1. LucidValidator — Read-only verification
  // ────────────────────────────────────────────────────────
  describe("LucidValidator", function () {
    it("should verify a correct receipt hash", async function () {
      const preimage = "integration-test-receipt-" + Date.now();
      const hash = sha256Hex(preimage);
      const result = await validator.verifyReceiptHash(hash, ethers.toUtf8Bytes(preimage));
      expect(result).to.be.true;
    });

    it("should reject an incorrect receipt hash", async function () {
      const hash = sha256Hex("correct");
      const result = await validator.verifyReceiptHash(hash, ethers.toUtf8Bytes("wrong"));
      expect(result).to.be.false;
    });

    it("should validate receipt signature format (64-byte ed25519)", async function () {
      const hash = sha256Hex("test-sig-check");
      const sig = "0x" + "aa".repeat(64);
      const pubkey = "0x" + "bb".repeat(32);
      const result = await validator.validateReceipt(hash, sig, pubkey);
      expect(result).to.be.true;
    });

    it("should reject invalid signature length", async function () {
      const hash = sha256Hex("test-bad-sig");
      const shortSig = "0x" + "aa".repeat(32); // 32 bytes, not 64
      const pubkey = "0x" + "bb".repeat(32);
      await expect(
        validator.validateReceipt(hash, shortSig, pubkey)
      ).to.be.revertedWith("Invalid signature length");
    });

    it("should verify a single-leaf MMR proof", async function () {
      const leaf = sha256Hex("mmr-leaf-integration");
      const result = await validator.verifyMMRProof(
        leaf,
        [],      // no siblings
        [leaf],  // single peak
        0,       // index
        leaf     // root = leaf for single-leaf tree
      );
      expect(result).to.be.true;
    });
  });

  // ────────────────────────────────────────────────────────
  // 2. ZkMLVerifier — Model registry reads
  // ────────────────────────────────────────────────────────
  describe("ZkMLVerifier", function () {
    it("should report model count", async function () {
      const count = await zkml.getModelCount();
      console.log("    Registered models:", count.toString());
      expect(count).to.be.gte(0);
    });

    it("should return false for unregistered model", async function () {
      const fakeHash = sha256Hex("unregistered-model-" + Date.now());
      const result = await zkml.isModelRegistered(fakeHash);
      expect(result).to.be.false;
    });
  });

  // ────────────────────────────────────────────────────────
  // 3. Lucid Token — ERC-20 basics
  // ────────────────────────────────────────────────────────
  describe("Lucid Token", function () {
    it("should have 9 decimals", async function () {
      const decimals = await token.decimals();
      expect(decimals).to.equal(9);
    });

    it("should return name and symbol", async function () {
      const name = await token.name();
      const symbol = await token.symbol();
      expect(name).to.equal("Lucid");
      expect(symbol).to.equal("LUCID");
    });

    it("should read deployer balance", async function () {
      const balance = await token.balanceOf(deployer.address);
      console.log("    LUCID balance:", ethers.formatUnits(balance, 9));
      expect(balance).to.be.gte(0);
    });

    it("should mint tokens (owner only)", async function () {
      const amount = ethers.parseUnits("100", 9); // 100 LUCID
      const balanceBefore = await token.balanceOf(deployer.address);
      const tx = await token.mint(deployer.address, amount, await txOverrides());
      await tx.wait(2); // wait 2 confirmations on L2 for state propagation
      const balanceAfter = await token.balanceOf(deployer.address);
      expect(balanceAfter - balanceBefore).to.equal(amount);
    });
  });

  // ────────────────────────────────────────────────────────
  // 4. LucidEscrow — Full escrow lifecycle
  // ────────────────────────────────────────────────────────
  describe("LucidEscrow", function () {
    const escrowAmount = ethers.parseUnits("10", 9); // 10 LUCID

    it("should create and release an escrow with receipt verification", async function () {
      const mintTx = await token.mint(deployer.address, escrowAmount, await txOverrides());
      await mintTx.wait(2);

      const approveTx = await token.approve(ADDRESSES.LucidEscrow, escrowAmount, await txOverrides());
      await approveTx.wait(2);

      const receiptPreimage = "integration-escrow-" + Date.now();
      const receiptHash = sha256Hex(receiptPreimage);

      const tx = await escrow.createEscrow(
        deployer.address,
        ADDRESSES.Lucid,
        escrowAmount,
        3600,
        receiptHash,
        await txOverrides()
      );
      const receipt = await tx.wait(2);

      const createEvent = receipt.logs.find(
        (l: any) => l.fragment?.name === "EscrowCreated"
      );
      expect(createEvent).to.not.be.undefined;
      const escrowId = createEvent!.args[0];
      console.log("    Created escrow:", escrowId);

      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.status).to.equal(0); // Created

      const sig = "0x" + "aa".repeat(64);
      const pubkey = "0x" + "bb".repeat(32);

      const releaseTx = await escrow.releaseEscrow(escrowId, receiptHash, sig, pubkey, await txOverrides());
      await releaseTx.wait(2);

      const released = await escrow.getEscrow(escrowId);
      expect(released.status).to.equal(1); // Released
      console.log("    Escrow released successfully");
    });
  });

  // ────────────────────────────────────────────────────────
  // 5. ERC-7579 Modules — Read + install/uninstall
  // ────────────────────────────────────────────────────────
  describe("ERC-7579 Modules", function () {
    it("LucidPolicyModule should identify as TYPE_VALIDATOR (1)", async function () {
      const isValidator = await policyModule.isModuleType(1);
      const isExecutor = await policyModule.isModuleType(2);
      expect(isValidator).to.be.true;
      expect(isExecutor).to.be.false;
    });

    it("LucidPayoutModule should identify as TYPE_EXECUTOR (2)", async function () {
      const isValidator = await payoutModule.isModuleType(1);
      const isExecutor = await payoutModule.isModuleType(2);
      expect(isValidator).to.be.false;
      expect(isExecutor).to.be.true;
    });

    it("LucidReceiptModule should identify as TYPE_EXECUTOR (2)", async function () {
      const isExecutor = await receiptModule.isModuleType(2);
      expect(isExecutor).to.be.true;
    });

    it("should set and read a policy", async function () {
      const policyHash = sha256Hex("integration-policy-" + Date.now());
      const tx = await policyModule.setPolicy(policyHash, true, await txOverrides());
      await tx.wait(2);

      const allowed = await policyModule.isPolicyAllowed(deployer.address, policyHash);
      expect(allowed).to.be.true;

      const cleanTx = await policyModule.setPolicy(policyHash, false, await txOverrides());
      await cleanTx.wait(2);
    });

    it("should emit a receipt event", async function () {
      const receiptHash = sha256Hex("integration-receipt-" + Date.now());
      const policyHash = sha256Hex("policy-1");
      const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes32", "string", "string", "uint256", "uint256"],
        [receiptHash, policyHash, "model_test", "compute_test", 100, 50]
      );

      const tx = await receiptModule.emitReceipt(encoded, await txOverrides());
      const receipt = await tx.wait(2);
      const event = receipt.logs.find(
        (l: any) => l.fragment?.name === "ReceiptEmitted"
      );
      expect(event).to.not.be.undefined;
      console.log("    Receipt emitted on-chain");
    });
  });

  // ────────────────────────────────────────────────────────
  // 6. LucidPaymaster — Read-only checks
  // ────────────────────────────────────────────────────────
  describe("LucidPaymaster", function () {
    it("should read exchange rate", async function () {
      const rate = await paymaster.lucidPerEth();
      console.log("    LUCID per ETH:", ethers.formatUnits(rate, 9));
      expect(rate).to.be.gt(0);
    });

    it("should read max cost", async function () {
      const maxCost = await paymaster.maxCostLucid();
      console.log("    Max cost:", ethers.formatUnits(maxCost, 9), "LUCID");
      expect(maxCost).to.be.gt(0);
    });

    it("should estimate LUCID cost for ETH amount", async function () {
      const ethCost = ethers.parseEther("0.001");
      const lucidCost = await paymaster.estimateLucidCost(ethCost);
      console.log("    0.001 ETH =", ethers.formatUnits(lucidCost, 9), "LUCID");
      expect(lucidCost).to.be.gt(0);
    });

    it("should read EntryPoint deposit", async function () {
      const deposit = await paymaster.getDeposit();
      console.log("    EntryPoint deposit:", ethers.formatEther(deposit), "ETH");
      expect(deposit).to.be.gte(0);
    });
  });

  // ────────────────────────────────────────────────────────
  // 7. Cross-contract wiring
  // ────────────────────────────────────────────────────────
  describe("Cross-Contract Wiring", function () {
    it("LucidEscrow should reference the correct validator", async function () {
      const validatorAddr = await escrow.lucidValidator();
      expect(validatorAddr).to.equal(ADDRESSES.LucidValidator);
    });

    it("LucidArbitration should reference escrow and validator", async function () {
      const escrowAddr = await arbitration.escrowContract();
      const validatorAddr = await arbitration.lucidValidator();
      expect(escrowAddr).to.equal(ADDRESSES.LucidEscrow);
      expect(validatorAddr).to.equal(ADDRESSES.LucidValidator);
    });

    it("LucidArbitration should reference the correct token", async function () {
      const tokenAddr = await arbitration.lucidToken();
      expect(tokenAddr).to.equal(ADDRESSES.Lucid);
    });

    it("LucidPaymaster should reference the correct token", async function () {
      const tokenAddr = await paymaster.lucidToken();
      expect(tokenAddr).to.equal(ADDRESSES.Lucid);
    });
  });
});
