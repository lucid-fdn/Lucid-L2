/**
 * Integration Tests — Live Testnet Contracts
 *
 * Calls real deployed contracts on Sepolia (or any configured --network).
 * Skips automatically on local hardhat network.
 *
 * Usage:
 *   EVM_PRIVATE_KEY=0x... npx hardhat test test/integration.test.ts --network sepolia
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import { createHash } from "crypto";

// Deployed addresses on Ethereum Sepolia
const SEPOLIA_ADDRESSES: Record<string, string> = {
  LucidValidator: "0x2f3F68fEF35D39711F78Ce75c5a7fbA35f80500e",
  ZkMLVerifier: "0xd69Ce5E5AA5a68D55413766320b520eeA3fdFf98",
  LucidEscrow: "0x3Aff9d80Cd91Fb9C4fE475155e60e9C473F55088",
  LucidToken: "0x060f76F82325B98bC595954F6b8c88083B43b379",
  LucidArbitration: "0x912d97060bE413E2e28066B52AC4D82947A3f499",
  LucidPolicyModule: "0x1be63A49Ce0D65A010E2fF9038b81FEdf6AB1477",
  LucidPayoutModule: "0xAec07214d21627dFD2131470B29a8372be21eF55",
  LucidReceiptModule: "0x7695cd6F97d1434A2Ab5f778C6B02898385b14cc",
  LucidPaymaster: "0xAA663967159E18A3Da2A8277FDDa35C0389e1462",
};

// Skip on local hardhat network
const isLive = process.env.HARDHAT_NETWORK !== undefined && process.env.HARDHAT_NETWORK !== "hardhat";

function sha256Hex(data: string): string {
  return "0x" + createHash("sha256").update(data).digest("hex");
}

(isLive ? describe : describe.skip)("Integration: Live Testnet Contracts", function () {
  // Longer timeouts for testnet RPC calls
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
    [deployer] = await ethers.getSigners();
    console.log("  Deployer:", deployer.address);
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("  Balance:", ethers.formatEther(balance), "ETH");

    // Attach to deployed contracts
    validator = await ethers.getContractAt("LucidValidator", SEPOLIA_ADDRESSES.LucidValidator);
    zkml = await ethers.getContractAt("ZkMLVerifier", SEPOLIA_ADDRESSES.ZkMLVerifier);
    escrow = await ethers.getContractAt("LucidEscrow", SEPOLIA_ADDRESSES.LucidEscrow);
    token = await ethers.getContractAt("LucidToken", SEPOLIA_ADDRESSES.LucidToken);
    arbitration = await ethers.getContractAt("LucidArbitration", SEPOLIA_ADDRESSES.LucidArbitration);
    policyModule = await ethers.getContractAt("LucidPolicyModule", SEPOLIA_ADDRESSES.LucidPolicyModule);
    payoutModule = await ethers.getContractAt("LucidPayoutModule", SEPOLIA_ADDRESSES.LucidPayoutModule);
    receiptModule = await ethers.getContractAt("LucidReceiptModule", SEPOLIA_ADDRESSES.LucidReceiptModule);
    paymaster = await ethers.getContractAt("LucidPaymaster", SEPOLIA_ADDRESSES.LucidPaymaster);
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
      // Single-leaf MMR: no siblings, one peak = the leaf itself
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
  // 3. LucidToken — ERC-20 basics
  // ────────────────────────────────────────────────────────
  describe("LucidToken", function () {
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
      const tx = await token.mint(deployer.address, amount);
      await tx.wait(1);
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
      // Use manual nonce tracking to avoid nonce race on live testnets
      let nonce = await ethers.provider.getTransactionCount(deployer.address, "latest");

      // Mint tokens and approve escrow contract
      const mintTx = await token.mint(deployer.address, escrowAmount, { nonce: nonce++ });
      await mintTx.wait(1);

      const approveTx = await token.approve(SEPOLIA_ADDRESSES.LucidEscrow, escrowAmount, { nonce: nonce++ });
      await approveTx.wait(1);

      // Create escrow (depositor = deployer, beneficiary = deployer for simplicity)
      const receiptPreimage = "integration-escrow-" + Date.now();
      const receiptHash = sha256Hex(receiptPreimage);

      const tx = await escrow.createEscrow(
        deployer.address, // beneficiary
        SEPOLIA_ADDRESSES.LucidToken,
        escrowAmount,
        3600, // 1 hour duration
        receiptHash,
        { nonce: nonce++ }
      );
      const receipt = await tx.wait(1);

      // Extract escrowId from event
      const createEvent = receipt.logs.find(
        (l: any) => l.fragment?.name === "EscrowCreated"
      );
      expect(createEvent).to.not.be.undefined;
      const escrowId = createEvent!.args[0];
      console.log("    Created escrow:", escrowId);

      // Read escrow state
      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.status).to.equal(0); // Created

      // Release with "receipt" (MVP: just needs 64-byte sig + 32-byte pubkey)
      const sig = "0x" + "aa".repeat(64);
      const pubkey = "0x" + "bb".repeat(32);

      const releaseTx = await escrow.releaseEscrow(escrowId, receiptHash, sig, pubkey, { nonce: nonce++ });
      await releaseTx.wait(1);

      // Verify released
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
      const tx = await policyModule.setPolicy(policyHash, true);
      await tx.wait(1);

      const allowed = await policyModule.isPolicyAllowed(deployer.address, policyHash);
      expect(allowed).to.be.true;

      // Clean up
      const cleanTx = await policyModule.setPolicy(policyHash, false);
      await cleanTx.wait(1);
    });

    it("should emit a receipt event", async function () {
      const receiptHash = sha256Hex("integration-receipt-" + Date.now());
      const policyHash = sha256Hex("policy-1");
      const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes32", "string", "string", "uint256", "uint256"],
        [receiptHash, policyHash, "model_test", "compute_test", 100, 50]
      );

      const tx = await receiptModule.emitReceipt(encoded);
      const receipt = await tx.wait(1);
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
  // 7. Cross-contract: Escrow → Arbitration wiring
  // ────────────────────────────────────────────────────────
  describe("Cross-Contract Wiring", function () {
    it("LucidEscrow should reference the correct validator", async function () {
      const validatorAddr = await escrow.lucidValidator();
      expect(validatorAddr).to.equal(SEPOLIA_ADDRESSES.LucidValidator);
    });

    it("LucidArbitration should reference escrow and validator", async function () {
      const escrowAddr = await arbitration.escrowContract();
      const validatorAddr = await arbitration.lucidValidator();
      expect(escrowAddr).to.equal(SEPOLIA_ADDRESSES.LucidEscrow);
      expect(validatorAddr).to.equal(SEPOLIA_ADDRESSES.LucidValidator);
    });

    it("LucidArbitration and LucidPaymaster should reference the same token", async function () {
      // The deploy script may have used a MockERC20 or the real LucidToken;
      // what matters is all contracts reference the same token address.
      const arbToken = await arbitration.lucidToken();
      const pmToken = await paymaster.lucidToken();
      console.log("    Arbitration token:", arbToken);
      console.log("    Paymaster token: ", pmToken);
      expect(arbToken).to.equal(pmToken);
      // Verify it's a valid ERC-20 (has name/symbol)
      const linkedToken = await ethers.getContractAt("LucidToken", arbToken);
      const name = await linkedToken.name();
      expect(name).to.be.a("string").that.is.not.empty;
    });
  });
});
