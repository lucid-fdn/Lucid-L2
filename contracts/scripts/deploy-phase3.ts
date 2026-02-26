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

// Track nonce manually to avoid "replacement transaction underpriced" on L2s
let currentNonce = -1;

/** Deploy a contract with explicit nonce + gas management */
async function deployContract(name: string, args: any[] = []) {
  console.log(`Deploying ${name}...`);
  const [deployer] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory(name);

  // Initialize nonce from chain on first deploy
  if (currentNonce < 0) {
    currentNonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
  }

  // Fresh fee data per deploy
  const feeData = await ethers.provider.getFeeData();
  const overrides: Record<string, any> = {
    nonce: currentNonce,
  };
  if (feeData.maxFeePerGas) {
    overrides.maxFeePerGas = feeData.maxFeePerGas * 2n;
    overrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas || 1000000n) * 2n;
  }

  const contract = await Factory.deploy(...args, overrides);
  currentNonce++;
  await contract.waitForDeployment();
  const deployTx = contract.deploymentTransaction();
  if (deployTx) {
    await deployTx.wait(1);
  }
  const addr = await contract.getAddress();
  console.log(`  ✓ ${name}: ${addr}`);
  return contract;
}

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
    const validator = await deployContract("LucidValidator");
    validatorAddress = await validator.getAddress();
  }
  deployed["LucidValidator"] = validatorAddress;

  // ── 2. ZkMLVerifier ────────────────────────────────────────
  const zkml = await deployContract("ZkMLVerifier");
  deployed["ZkMLVerifier"] = await zkml.getAddress();

  // ── 3. LucidEscrow ────────────────────────────────────────
  const escrow = await deployContract("LucidEscrow", [validatorAddress]);
  deployed["LucidEscrow"] = await escrow.getAddress();

  // ── 4. Deploy LucidToken (or use existing) ─────────────────
  let lucidTokenAddress = process.env.LUCID_TOKEN_ADDRESS;
  if (lucidTokenAddress) {
    console.log("Using existing LUCID token:", lucidTokenAddress);
  } else {
    const token = await deployContract("LucidToken", ["Lucid", "LUCID", deployer.address]);
    lucidTokenAddress = await token.getAddress();
  }
  deployed["LucidToken"] = lucidTokenAddress;

  // ── 5. LucidArbitration ────────────────────────────────────
  const arbitration = await deployContract("LucidArbitration", [
    deployed["LucidEscrow"],
    validatorAddress,
    lucidTokenAddress,
  ]);
  deployed["LucidArbitration"] = await arbitration.getAddress();

  // ── 6. Link Escrow <-> Arbitration ─────────────────────────
  console.log("Linking Escrow → Arbitration...");
  const feeData = await ethers.provider.getFeeData();
  const linkTx = await escrow.setArbitrationContract(deployed["LucidArbitration"], {
    nonce: currentNonce,
    maxFeePerGas: feeData.maxFeePerGas! * 2n,
    maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas || 1000000n) * 2n,
  });
  currentNonce++;
  await linkTx.wait(1);
  console.log("  ✓ Escrow arbitration contract set");

  // ── 7. ERC-7579 Modules ────────────────────────────────────
  console.log("Deploying ERC-7579 Modules...");
  const policy = await deployContract("LucidPolicyModule");
  deployed["LucidPolicyModule"] = await policy.getAddress();

  const payout = await deployContract("LucidPayoutModule");
  deployed["LucidPayoutModule"] = await payout.getAddress();

  const receipt = await deployContract("LucidReceiptModule");
  deployed["LucidReceiptModule"] = await receipt.getAddress();

  // ── 8. LucidPaymaster ──────────────────────────────────────
  const entryPointAddress = process.env.ENTRY_POINT_ADDRESS || ENTRY_POINT_V07;
  console.log("  EntryPoint:", entryPointAddress);
  const paymaster = await deployContract("LucidPaymaster", [
    lucidTokenAddress,
    entryPointAddress,
    LUCID_PER_ETH,
    MAX_COST_LUCID,
  ]);
  deployed["LucidPaymaster"] = await paymaster.getAddress();

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
