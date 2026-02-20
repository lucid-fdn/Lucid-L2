/**
 * Deploy LucidValidator to a single network.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network baseSepolia
 *   npx hardhat run scripts/deploy.ts --network apechain
 */
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying LucidValidator with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const LucidValidator = await ethers.getContractFactory("LucidValidator");
  const validator = await LucidValidator.deploy();
  await validator.waitForDeployment();

  const address = await validator.getAddress();
  console.log("LucidValidator deployed to:", address);

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
