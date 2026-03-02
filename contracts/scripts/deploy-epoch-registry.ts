/**
 * Deploy EpochRegistry to a single network.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-epoch-registry.ts --network baseSepolia
 *   npx hardhat run scripts/deploy-epoch-registry.ts --network apechain
 */
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying EpochRegistry with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const EpochRegistry = await ethers.getContractFactory("EpochRegistry");
  const registry = await EpochRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("EpochRegistry deployed to:", address);

  // Output in a format that can be parsed by deploy-all.ts
  console.log(`DEPLOYED:${address}`);

  return address;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
