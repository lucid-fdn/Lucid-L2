import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const DEPLOYER_KEY = process.env.EVM_PRIVATE_KEY || "0x" + "ac".repeat(32);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {},

    // ── Testnets ──────────────────────────────────────────────
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
      chainId: 84532,
      accounts: [DEPLOYER_KEY],
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
      accounts: [DEPLOYER_KEY],
    },
    apechainTestnet: {
      url: process.env.APECHAIN_TESTNET_RPC || "https://rpc.curtis.apechain.com/http",
      chainId: 33111,
      accounts: [DEPLOYER_KEY],
    },

    // ── Mainnets ─────────────────────────────────────────────
    ethereum: {
      url: process.env.ETHEREUM_RPC || "https://eth.llamarpc.com",
      chainId: 1,
      accounts: [DEPLOYER_KEY],
    },
    base: {
      url: process.env.BASE_RPC || "https://mainnet.base.org",
      chainId: 8453,
      accounts: [DEPLOYER_KEY],
    },
    apechain: {
      url: process.env.APECHAIN_RPC || "https://rpc.apechain.com/http",
      chainId: 33139,
      accounts: [DEPLOYER_KEY],
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC || "https://arb1.arbitrum.io/rpc",
      chainId: 42161,
      accounts: [DEPLOYER_KEY],
    },
    avalanche: {
      url: process.env.AVALANCHE_RPC || "https://api.avax.network/ext/bc/C/rpc",
      chainId: 43114,
      accounts: [DEPLOYER_KEY],
    },
    polygon: {
      url: process.env.POLYGON_RPC || "https://polygon-rpc.com",
      chainId: 137,
      accounts: [DEPLOYER_KEY],
    },
    monad: {
      url: process.env.MONAD_RPC || "https://testnet.monad.xyz/v1",
      chainId: 10143,
      accounts: [DEPLOYER_KEY],
    },
    megaeth: {
      url: process.env.MEGAETH_RPC || "https://rpc.megaeth.com",
      chainId: 6342,
      accounts: [DEPLOYER_KEY],
    },
  },
  sourcify: {
    enabled: true,
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      baseSepolia: process.env.BASESCAN_API_KEY || "",
      base: process.env.BASESCAN_API_KEY || "",
    },
  },
};

export default config;
