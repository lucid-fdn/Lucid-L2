/**
 * Deploy LucidOFT to an EVM chain.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-oft.ts --network baseSepolia
 *
 * Environment:
 *   LZ_ENDPOINT — LayerZero V2 endpoint address on the target chain
 *   DEPLOYER_ADDRESS — Optional: delegate address (defaults to deployer)
 */

import { ethers } from 'hardhat';

// Known LayerZero V2 endpoints
const LZ_ENDPOINTS: Record<string, string> = {
  // Mainnets
  'ethereum': '0x1a44076050125825900e736c501f859c50fE728c',
  'base': '0x1a44076050125825900e736c501f859c50fE728c',
  'arbitrum': '0x1a44076050125825900e736c501f859c50fE728c',
  'avalanche': '0x1a44076050125825900e736c501f859c50fE728c',
  'polygon': '0x1a44076050125825900e736c501f859c50fE728c',
  // Testnets
  'baseSepolia': '0x6EDCE65403992e310A62460808c4b910D972f10f',
  'sepolia': '0x6EDCE65403992e310A62460808c4b910D972f10f',
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = (await ethers.provider.getNetwork()).name;

  console.log(`Deploying LucidOFT on ${network}`);
  console.log(`Deployer: ${deployer.address}`);

  // Resolve LayerZero endpoint
  const lzEndpoint = process.env.LZ_ENDPOINT || LZ_ENDPOINTS[network];
  if (!lzEndpoint) {
    throw new Error(
      `No LayerZero endpoint for network '${network}'. Set LZ_ENDPOINT env var.`,
    );
  }
  console.log(`LayerZero Endpoint: ${lzEndpoint}`);

  const delegate = process.env.DEPLOYER_ADDRESS || deployer.address;

  // Deploy LucidOFT
  const LucidOFT = await ethers.getContractFactory('LucidOFT');
  const lucidOFT = await LucidOFT.deploy('Lucid', 'LUCID', lzEndpoint, delegate);
  await lucidOFT.waitForDeployment();

  const address = await lucidOFT.getAddress();
  console.log(`LucidOFT deployed at: ${address}`);
  console.log(`\nVerify with:`);
  console.log(`  npx hardhat verify --network ${network} ${address} "Lucid" "LUCID" "${lzEndpoint}" "${delegate}"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
