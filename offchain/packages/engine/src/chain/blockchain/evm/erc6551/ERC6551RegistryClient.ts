/**
 * ERC-6551 Registry Client
 *
 * Interacts with the canonical ERC-6551 Registry to create and query
 * Token Bound Accounts for Lucid passport NFTs.
 *
 * Canonical Registry: 0x000000006551c19487814612e58FE06813775758
 * (deployed on all major EVM chains)
 */

import ERC6551RegistryABI from './abis/ERC6551Registry.json';

/** Canonical ERC-6551 registry address */
export const ERC6551_REGISTRY_ADDRESS = '0x000000006551c19487814612e58FE06813775758';

/** Default salt for Lucid TBAs */
const DEFAULT_SALT = '0x0000000000000000000000000000000000000000000000000000000000000000';

export class ERC6551RegistryClient {
  private publicClient: any;
  private walletClient: any;
  private registryAddress: `0x${string}`;
  private accountImplementation: `0x${string}`;

  constructor(
    publicClient: any,
    walletClient: any,
    registryAddress: string = ERC6551_REGISTRY_ADDRESS,
    accountImplementation: string,
  ) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.registryAddress = registryAddress as `0x${string}`;
    this.accountImplementation = accountImplementation as `0x${string}`;
  }

  /**
   * Create a Token Bound Account for an NFT.
   * If the TBA already exists, returns the existing address.
   */
  async createAccount(
    chainId: number,
    tokenContract: string,
    tokenId: string,
    salt: string = DEFAULT_SALT,
  ): Promise<{ address: string; txHash: string }> {
    if (!this.walletClient) {
      throw new Error('Wallet client required for creating TBAs');
    }

    const hash = await this.walletClient.writeContract({
      address: this.registryAddress,
      abi: ERC6551RegistryABI,
      functionName: 'createAccount',
      args: [
        this.accountImplementation,
        salt as `0x${string}`,
        BigInt(chainId),
        tokenContract as `0x${string}`,
        BigInt(tokenId),
      ],
    });

    // Get the deterministic address
    const tbaAddress = await this.getAccount(chainId, tokenContract, tokenId, salt);

    return { address: tbaAddress, txHash: hash };
  }

  /**
   * Compute the deterministic TBA address for an NFT.
   * This doesn't require a transaction — it's a pure view call.
   */
  async getAccount(
    chainId: number,
    tokenContract: string,
    tokenId: string,
    salt: string = DEFAULT_SALT,
  ): Promise<string> {
    const address = await this.publicClient.readContract({
      address: this.registryAddress,
      abi: ERC6551RegistryABI,
      functionName: 'account',
      args: [
        this.accountImplementation,
        salt as `0x${string}`,
        BigInt(chainId),
        tokenContract as `0x${string}`,
        BigInt(tokenId),
      ],
    });

    return address;
  }

  /**
   * Check if a TBA has been deployed (has code at the address).
   */
  async isDeployed(tbaAddress: string): Promise<boolean> {
    const code = await this.publicClient.getBytecode({
      address: tbaAddress as `0x${string}`,
    });
    return code !== undefined && code !== '0x';
  }

  /**
   * Get the native token balance of a TBA.
   */
  async getBalance(tbaAddress: string): Promise<string> {
    const balance = await this.publicClient.getBalance({
      address: tbaAddress as `0x${string}`,
    });
    return balance.toString();
  }
}
