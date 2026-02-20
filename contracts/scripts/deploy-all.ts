/**
 * Deploy LucidValidator to all configured ERC-8004 chains.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-all.ts
 *
 * This script deploys to all networks configured in hardhat.config.ts
 * (except 'hardhat' local network). It outputs a summary of deployed
 * addresses for updating chains.ts environment variables.
 *
 * Set DEPLOY_NETWORKS env var to deploy to specific networks only:
 *   DEPLOY_NETWORKS=baseSepolia,sepolia npx hardhat run scripts/deploy-all.ts
 */
import { execFileSync } from "child_process";

// All EVM networks from hardhat.config.ts
const ALL_NETWORKS = [
  // Testnets
  "baseSepolia",
  "sepolia",
  "apechainTestnet",
  // Mainnets
  "ethereum",
  "base",
  "apechain",
  "arbitrum",
  "avalanche",
  "polygon",
  "monad",
  "megaeth",
];

interface DeployResult {
  network: string;
  address?: string;
  error?: string;
}

async function main() {
  const targetNetworks = process.env.DEPLOY_NETWORKS
    ? process.env.DEPLOY_NETWORKS.split(",").map((n) => n.trim())
    : ALL_NETWORKS;

  console.log("=".repeat(60));
  console.log("LucidValidator Multi-Chain Deployment");
  console.log("=".repeat(60));
  console.log(`Target networks: ${targetNetworks.join(", ")}\n`);

  const results: DeployResult[] = [];

  for (const network of targetNetworks) {
    console.log(`\n--- Deploying to ${network} ---`);

    try {
      const output = execFileSync(
        "npx",
        ["hardhat", "run", "scripts/deploy.ts", "--network", network],
        {
          encoding: "utf-8",
          timeout: 120_000,
          env: { ...process.env },
        }
      );

      console.log(output);

      // Parse deployed address from output
      const match = output.match(/DEPLOYED:(0x[a-fA-F0-9]{40})/);
      if (match) {
        results.push({ network, address: match[1] });
      } else {
        results.push({ network, error: "Could not parse deployed address" });
      }
    } catch (error: any) {
      const errorMsg =
        error.stderr || error.message || "Unknown deployment error";
      console.error(`Failed to deploy to ${network}:`, errorMsg);
      results.push({ network, error: String(errorMsg).slice(0, 200) });
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));

  const envVarMap: Record<string, string> = {
    baseSepolia: "BASE_SEPOLIA_LUCID_VALIDATOR",
    sepolia: "SEPOLIA_LUCID_VALIDATOR",
    apechainTestnet: "APECHAIN_TESTNET_LUCID_VALIDATOR",
    ethereum: "ETHEREUM_LUCID_VALIDATOR",
    base: "BASE_LUCID_VALIDATOR",
    apechain: "APECHAIN_LUCID_VALIDATOR",
    arbitrum: "ARBITRUM_LUCID_VALIDATOR",
    avalanche: "AVALANCHE_LUCID_VALIDATOR",
    polygon: "POLYGON_LUCID_VALIDATOR",
    monad: "MONAD_LUCID_VALIDATOR",
    megaeth: "MEGAETH_LUCID_VALIDATOR",
  };

  console.log("\nSuccessful deployments:");
  const successes = results.filter((r) => r.address);
  if (successes.length === 0) {
    console.log("  (none)");
  }
  for (const r of successes) {
    console.log(`  ${r.network}: ${r.address}`);
  }

  const failures = results.filter((r) => r.error);
  if (failures.length > 0) {
    console.log("\nFailed deployments:");
    for (const r of failures) {
      console.log(`  ${r.network}: ${r.error}`);
    }
  }

  // Output env vars for copy-paste
  if (successes.length > 0) {
    console.log("\n--- Environment variables (add to .env) ---");
    for (const r of successes) {
      const envVar = envVarMap[r.network] || `${r.network.toUpperCase()}_LUCID_VALIDATOR`;
      console.log(`${envVar}=${r.address}`);
    }
  }

  console.log(
    `\nDeployed: ${successes.length}/${targetNetworks.length} networks`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
