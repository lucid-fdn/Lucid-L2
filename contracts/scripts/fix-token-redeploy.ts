/**
 * Redeploy LucidArbitration + LucidPaymaster with the correct Lucid token address.
 *
 * On Sepolia, these were originally deployed pointing to a MockERC20 (0x585F...).
 * This script redeploys them with the real Lucid token and re-links escrow→arbitration.
 *
 * Usage:
 *   EVM_PRIVATE_KEY=0x... npx hardhat run scripts/fix-token-redeploy.ts --network sepolia
 */
import { ethers } from "hardhat";

// Known Sepolia addresses (already deployed)
const SEPOLIA = {
  LucidValidator: "0x2f3F68fEF35D39711F78Ce75c5a7fbA35f80500e",
  LucidEscrow: "0x3Aff9d80Cd91Fb9C4fE475155e60e9C473F55088",
  Lucid: "0x060f76F82325B98bC595954F6b8c88083B43b379", // real Lucid token
};

const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const LUCID_PER_ETH = ethers.parseUnits("1000", 9);
const MAX_COST_LUCID = ethers.parseUnits("10000", 9);

let currentNonce = -1;

async function deployContract(name: string, args: any[] = []) {
  console.log(`Deploying ${name}...`);
  const [deployer] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory(name);

  if (currentNonce < 0) {
    currentNonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
  }

  const feeData = await ethers.provider.getFeeData();
  const overrides: Record<string, any> = { nonce: currentNonce };
  if (feeData.maxFeePerGas) {
    overrides.maxFeePerGas = feeData.maxFeePerGas * 2n;
    overrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas || 1000000n) * 2n;
  }

  const contract = await Factory.deploy(...args, overrides);
  currentNonce++;
  await contract.waitForDeployment();
  const deployTx = contract.deploymentTransaction();
  if (deployTx) await deployTx.wait(1);
  const addr = await contract.getAddress();
  console.log(`  ✓ ${name}: ${addr}`);
  return contract;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(60));
  console.log("Fix: Redeploy Arbitration + Paymaster with correct Lucid token");
  console.log("=".repeat(60));
  console.log("Deployer:", deployer.address);
  console.log("Lucid token:", SEPOLIA.Lucid);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH\n");

  // 1. Redeploy LucidArbitration
  const arbitration = await deployContract("LucidArbitration", [
    SEPOLIA.LucidEscrow,
    SEPOLIA.LucidValidator,
    SEPOLIA.Lucid,
  ]);
  const arbAddr = await arbitration.getAddress();

  // 2. Re-link escrow → arbitration
  console.log("Linking Escrow → new Arbitration...");
  const escrow = await ethers.getContractAt("LucidEscrow", SEPOLIA.LucidEscrow);
  const feeData = await ethers.provider.getFeeData();
  const linkTx = await escrow.setArbitrationContract(arbAddr, {
    nonce: currentNonce,
    maxFeePerGas: feeData.maxFeePerGas! * 2n,
    maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas || 1000000n) * 2n,
  });
  currentNonce++;
  await linkTx.wait(1);
  console.log("  ✓ Escrow arbitration contract updated");

  // 3. Redeploy LucidPaymaster
  const paymaster = await deployContract("LucidPaymaster", [
    SEPOLIA.Lucid,
    ENTRY_POINT_V07,
    LUCID_PER_ETH,
    MAX_COST_LUCID,
  ]);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Done! New addresses:");
  console.log("  LucidArbitration:", arbAddr);
  console.log("  LucidPaymaster: ", await paymaster.getAddress());
  console.log("=".repeat(60));

  const finalBalance = await ethers.provider.getBalance(deployer.address);
  console.log("Gas spent:", ethers.formatEther(balance - finalBalance), "ETH");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed:", error);
    process.exit(1);
  });
