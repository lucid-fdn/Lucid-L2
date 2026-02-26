/**
 * Deploy Phase 3 contracts to a single network.
 *
 * Deploys in dependency order:
 *   1. LucidValidator (if not already deployed)
 *   2. ZkMLVerifier
 *   3. LucidEscrow (depends on Validator)
 *   4. LucidArbitration (depends on Escrow, Validator, LUCID token)
 *   5. ERC-7579 Modules: Policy, Payout, Receipt
 *   6. LucidPaymaster (depends on LUCID token, EntryPoint)
 *
 * Usage:
 *   npx hardhat run scripts/deploy-phase3.ts --network baseSepolia
 *
 * Env vars (optional overrides):
 *   LUCID_VALIDATOR_ADDRESS  - Skip redeploying validator
 *   LUCID_TOKEN_ADDRESS      - ERC-20 token for escrow/arbitration/paymaster
 *   ENTRY_POINT_ADDRESS      - ERC-4337 EntryPoint v0.7
 */
import { ethers } from "hardhat";

// ERC-4337 EntryPoint v0.7 canonical address
const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

// Exchange rate: 1 ETH = 1000 $LUCID (9-decimal token)
const LUCID_PER_ETH = ethers.parseUnits("1000", 9);
// Max gas cost: 10000 $LUCID per operation
const MAX_COST_LUCID = ethers.parseUnits("10000", 9);

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(60));
  console.log("Phase 3 Deployment — Become the Standard");
  console.log("=".repeat(60));
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");
  console.log("");

  const deployed: Record<string, string> = {};

  // ── 1. LucidValidator ──────────────────────────────────────
  let validatorAddress = process.env.LUCID_VALIDATOR_ADDRESS;
  if (validatorAddress) {
    console.log("Using existing LucidValidator:", validatorAddress);
  } else {
    console.log("Deploying LucidValidator...");
    const LucidValidator = await ethers.getContractFactory("LucidValidator");
    const validator = await LucidValidator.deploy();
    await validator.waitForDeployment();
    validatorAddress = await validator.getAddress();
    console.log("  ✓ LucidValidator:", validatorAddress);
  }
  deployed["LucidValidator"] = validatorAddress;

  // ── 2. ZkMLVerifier ────────────────────────────────────────
  console.log("Deploying ZkMLVerifier...");
  const ZkMLVerifier = await ethers.getContractFactory("ZkMLVerifier");
  const zkml = await ZkMLVerifier.deploy();
  await zkml.waitForDeployment();
  deployed["ZkMLVerifier"] = await zkml.getAddress();
  console.log("  ✓ ZkMLVerifier:", deployed["ZkMLVerifier"]);

  // ── 3. LucidEscrow ────────────────────────────────────────
  console.log("Deploying LucidEscrow...");
  const LucidEscrow = await ethers.getContractFactory("LucidEscrow");
  const escrow = await LucidEscrow.deploy(validatorAddress);
  await escrow.waitForDeployment();
  deployed["LucidEscrow"] = await escrow.getAddress();
  console.log("  ✓ LucidEscrow:", deployed["LucidEscrow"]);

  // ── 4. Deploy MockERC20 as LUCID token (testnet only) ─────
  let lucidTokenAddress = process.env.LUCID_TOKEN_ADDRESS;
  if (lucidTokenAddress) {
    console.log("Using existing LUCID token:", lucidTokenAddress);
  } else {
    console.log("Deploying MockERC20 as LUCID token (testnet)...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Lucid Token", "LUCID", 9);
    await token.waitForDeployment();
    lucidTokenAddress = await token.getAddress();
    console.log("  ✓ LUCID Token (Mock):", lucidTokenAddress);
  }
  deployed["LucidToken"] = lucidTokenAddress;

  // ── 5. LucidArbitration ────────────────────────────────────
  console.log("Deploying LucidArbitration...");
  const LucidArbitration = await ethers.getContractFactory("LucidArbitration");
  const arbitration = await LucidArbitration.deploy(
    deployed["LucidEscrow"],
    validatorAddress,
    lucidTokenAddress
  );
  await arbitration.waitForDeployment();
  deployed["LucidArbitration"] = await arbitration.getAddress();
  console.log("  ✓ LucidArbitration:", deployed["LucidArbitration"]);

  // ── 6. Link Escrow <-> Arbitration ─────────────────────────
  console.log("Linking Escrow → Arbitration...");
  const tx = await escrow.setArbitrationContract(deployed["LucidArbitration"]);
  await tx.wait();
  console.log("  ✓ Escrow arbitration contract set");

  // ── 7. ERC-7579 Modules ────────────────────────────────────
  console.log("Deploying ERC-7579 Modules...");

  const LucidPolicyModule = await ethers.getContractFactory("LucidPolicyModule");
  const policy = await LucidPolicyModule.deploy();
  await policy.waitForDeployment();
  deployed["LucidPolicyModule"] = await policy.getAddress();
  console.log("  ✓ LucidPolicyModule:", deployed["LucidPolicyModule"]);

  const LucidPayoutModule = await ethers.getContractFactory("LucidPayoutModule");
  const payout = await LucidPayoutModule.deploy();
  await payout.waitForDeployment();
  deployed["LucidPayoutModule"] = await payout.getAddress();
  console.log("  ✓ LucidPayoutModule:", deployed["LucidPayoutModule"]);

  const LucidReceiptModule = await ethers.getContractFactory("LucidReceiptModule");
  const receipt = await LucidReceiptModule.deploy();
  await receipt.waitForDeployment();
  deployed["LucidReceiptModule"] = await receipt.getAddress();
  console.log("  ✓ LucidReceiptModule:", deployed["LucidReceiptModule"]);

  // ── 8. LucidPaymaster ──────────────────────────────────────
  const entryPointAddress = process.env.ENTRY_POINT_ADDRESS || ENTRY_POINT_V07;
  console.log("Deploying LucidPaymaster...");
  console.log("  EntryPoint:", entryPointAddress);
  const LucidPaymaster = await ethers.getContractFactory("LucidPaymaster");
  const paymaster = await LucidPaymaster.deploy(
    lucidTokenAddress,
    entryPointAddress,
    LUCID_PER_ETH,
    MAX_COST_LUCID
  );
  await paymaster.waitForDeployment();
  deployed["LucidPaymaster"] = await paymaster.getAddress();
  console.log("  ✓ LucidPaymaster:", deployed["LucidPaymaster"]);

  // ── Summary ────────────────────────────────────────────────
  console.log("");
  console.log("=".repeat(60));
  console.log("Deployment Complete!");
  console.log("=".repeat(60));
  console.log("");
  console.log("Add to your .env:");
  console.log("─".repeat(60));
  for (const [name, address] of Object.entries(deployed)) {
    const envKey = name.replace(/([A-Z])/g, "_$1").toUpperCase().replace(/^_/, "");
    console.log(`${envKey}=${address}`);
  }
  console.log("─".repeat(60));

  const finalBalance = await ethers.provider.getBalance(deployer.address);
  console.log("");
  console.log("Gas spent:", ethers.formatEther(balance - finalBalance), "ETH");
  console.log("Remaining:", ethers.formatEther(finalBalance), "ETH");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
