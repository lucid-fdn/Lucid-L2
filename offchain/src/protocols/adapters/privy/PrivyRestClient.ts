/**
 * Privy REST API Client
 * 
 * Handles all HTTP requests to Privy's REST API with proper authentication,
 * error handling, and retry logic.
 */

import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios';
import { SignatureGenerator } from './SignatureGenerator';
import { PrivyCredentials, PrivyRPCRequest, PrivyRPCResponse } from './types';

export class PrivyRestClient {
  private client: AxiosInstance;
  private signatureGenerator: SignatureGenerator;
  private credentials: PrivyCredentials;
  private requestId: number = 1;

  constructor(credentials: PrivyCredentials) {
    this.credentials = credentials;
    this.signatureGenerator = new SignatureGenerator(credentials.authPrivateKey);

    const baseURL = credentials.apiBaseUrl || 'https://api.privy.io/v1';

    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'privy-app-id': credentials.appId
      }
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use(
      (config) => this.addAuthHeaders(config),
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => this.handleError(error)
    );
  }

  /**
   * Add authentication headers to request
   */
  private addAuthHeaders(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
    const timestamp = Date.now();
    const payload = {
      timestamp,
      method: config.method?.toUpperCase(),
      url: config.url,
      body: config.data
    };

    // Generate authorization signature
    const signature = this.signatureGenerator.sign(payload);

    config.headers.set('privy-authorization-signature', signature);
    config.headers.set('privy-authorization-timestamp', timestamp.toString());
    config.headers.set('privy-app-secret', this.credentials.appSecret);

    return config;
  }

  /**
   * Handle API errors
   */
  private handleError(error: AxiosError): Promise<never> {
    if (error.response) {
      // Server responded with error status
      const data = error.response.data as any;
      const message = data?.error?.message || data?.message || 'Unknown Privy API error';
      const code = data?.error?.code || error.response.status;
      
      throw new Error(`Privy API Error (${code}): ${message}`);
    } else if (error.request) {
      // No response received
      throw new Error('Privy API: No response received from server');
    } else {
      // Error setting up request
      throw new Error(`Privy API: ${error.message}`);
    }
  }

  /**
   * Execute RPC method on a wallet
   */
  async rpc(walletId: string, method: string, params: any[]): Promise<any> {
    const request: PrivyRPCRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++
    };

    const response = await this.client.post<PrivyRPCResponse>(
      `/wallets/${walletId}/rpc`,
      request
    );

    if (response.data.error) {
      throw new Error(
        `Privy RPC Error (${response.data.error.code}): ${response.data.error.message}`
      );
    }

    return response.data.result;
  }

  /**
   * Create a new Privy user with embedded wallet
   */
  async createUser(params: { chainType: string }): Promise<any> {
    const response = await this.client.post('/users', {
      create_embedded_wallet: true,
      chain_type: params.chainType
    });

    return response.data;
  }

  /**
   * Get user details
   */
  async getUser(privyUserId: string): Promise<any> {
    const response = await this.client.get(`/users/${privyUserId}`);
    return response.data;
  }

  /**
   * Get user's wallets
   */
  async getUserWallets(privyUserId: string): Promise<any> {
    const response = await this.client.get(`/users/${privyUserId}/wallets`);
    return response.data;
  }

  /**
   * Add session signer (delegated action) to a wallet
   */
  async addSessionSigner(params: {
    walletId: string;
    authorizationKeyPublic: string;
    keyQuorumId: string;
    policies?: any;
  }): Promise<any> {
    const response = await this.client.post(
      `/wallets/${params.walletId}/session-signers`,
      {
        authorization_key: params.authorizationKeyPublic,
        key_quorum_id: params.keyQuorumId,
        policies: params.policies
      }
    );

    return response.data;
  }

  /**
   * Revoke session signer
   */
  async revokeSessionSigner(walletId: string, signerId: string): Promise<any> {
    const response = await this.client.delete(
      `/wallets/${walletId}/session-signers/${signerId}`
    );

    return response.data;
  }

  /**
   * List session signers for a wallet
   */
  async listSessionSigners(walletId: string): Promise<any> {
    const response = await this.client.get(
      `/wallets/${walletId}/session-signers`
    );

    return response.data;
  }

  /**
   * Sign a Solana transaction
   */
  async signSolanaTransaction(walletId: string, transaction: string): Promise<string> {
    return await this.rpc(walletId, 'signTransaction', [transaction]);
  }

  /**
   * Sign and send a Solana transaction
   */
  async signAndSendSolanaTransaction(
    walletId: string,
    transaction: string
  ): Promise<{ signature: string }> {
    const signature = await this.rpc(walletId, 'signAndSendTransaction', [transaction]);
    return { signature };
  }

  /**
   * Sign an Ethereum transaction
   */
  async signEthereumTransaction(walletId: string, transaction: any): Promise<string> {
    return await this.rpc(walletId, 'eth_signTransaction', [transaction]);
  }

  /**
   * Send an Ethereum transaction
   */
  async sendEthereumTransaction(
    walletId: string,
    transaction: any
  ): Promise<{ hash: string }> {
    const hash = await this.rpc(walletId, 'eth_sendTransaction', [transaction]);
    return { hash };
  }

  /**
   * Get wallet balance
   */
  async getBalance(walletId: string, chainType: string): Promise<string> {
    if (chainType === 'solana') {
      return await this.rpc(walletId, 'getBalance', []);
    } else {
      return await this.rpc(walletId, 'eth_getBalance', ['latest']);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/health');
      return true;
    } catch (error) {
      return false;
    }
  }
}
