// @lucidlayer/sdk - Core Client
// Base HTTP client with error handling, retries, and logging

import {
  LucidClientConfig,
  LucidError,
  ValidationError,
  NotFoundError,
  NoCompatibleComputeError,
  ComputeUnavailableError,
  TimeoutError,
} from './types';

import { PassportModule } from './modules/passports';
import { SearchModule } from './modules/search';
import { MatchModule } from './modules/match';
import { RunModule } from './modules/run';
import { ReceiptModule } from './modules/receipts';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<LucidClientConfig> = {
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
  debug: false,
};

/**
 * LucidClient - Main SDK client for interacting with LucidLayer API
 * 
 * @example
 * ```typescript
 * const client = new LucidClient({
 *   baseUrl: 'https://api.lucidlayer.io',
 *   apiKey: 'your-api-key'
 * });
 * 
 * // Create a model passport
 * const passport = await client.passports.create({
 *   type: 'model',
 *   owner: 'your-wallet-address',
 *   metadata: { name: 'My Model', format: 'safetensors', runtime_recommended: 'vllm' }
 * });
 * 
 * // Run inference
 * const result = await client.run.inference({
 *   model_passport_id: passport.passport_id,
 *   prompt: 'Hello, world!'
 * });
 * ```
 */
export class LucidClient {
  private config: Required<LucidClientConfig>;

  /** Passport CRUD operations */
  public readonly passports: PassportModule;

  /** Search and discovery operations */
  public readonly search: SearchModule;

  /** Compute matching operations */
  public readonly match: MatchModule;

  /** Inference execution operations */
  public readonly run: RunModule;

  /** Receipt and proof operations */
  public readonly receipts: ReceiptModule;

  constructor(config: LucidClientConfig) {
    // Validate required config
    if (!config.baseUrl) {
      throw new ValidationError('baseUrl is required');
    }

    // Normalize baseUrl (remove trailing slash)
    const baseUrl = config.baseUrl.replace(/\/+$/, '');

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      baseUrl,
      headers: config.headers || {},
    } as Required<LucidClientConfig>;

    // Initialize modules
    this.passports = new PassportModule(this);
    this.search = new SearchModule(this);
    this.match = new MatchModule(this);
    this.run = new RunModule(this);
    this.receipts = new ReceiptModule(this);
  }

  /**
   * Get the base URL for API requests
   */
  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Check if debug mode is enabled
   */
  isDebugEnabled(): boolean {
    return this.config.debug;
  }

  /**
   * Log debug messages if debug mode is enabled
   */
  debug(message: string, data?: any): void {
    if (this.config.debug) {
      console.log(`[LucidSDK] ${message}`, data ?? '');
    }
  }

  /**
   * Make an HTTP request to the API
   * 
   * @param method HTTP method
   * @param path API path (relative to baseUrl)
   * @param options Request options
   * @returns Response data
   */
  async request<T = any>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    options: {
      body?: any;
      query?: Record<string, any>;
      headers?: Record<string, string>;
      timeout?: number;
    } = {}
  ): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const headers = this.buildHeaders(options.headers);
    const timeout = options.timeout || this.config.timeout;

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt < this.config.retries) {
      attempt++;

      try {
        this.debug(`Request [${attempt}/${this.config.retries}]: ${method} ${url}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        this.debug(`Response: ${response.status} ${response.statusText}`);

        // Handle non-success responses
        if (!response.ok) {
          const errorData = await this.parseErrorResponse(response);
          throw this.createError(response.status, errorData);
        }

        // Parse successful response
        const data = await response.json();
        return data as T;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on certain errors
        if (error instanceof LucidError) {
          if (error.status === 400 || error.status === 404 || error.status === 422) {
            throw error;
          }
        }

        // Check if it's an abort error (timeout)
        if ((error as any).name === 'AbortError') {
          lastError = new TimeoutError(`${method} ${path}`);
          // Don't retry on timeout
          throw lastError;
        }

        // If we have more retries, wait before retrying
        if (attempt < this.config.retries) {
          this.debug(`Retrying in ${this.config.retryDelay}ms...`);
          await this.sleep(this.config.retryDelay);
        }
      }
    }

    throw lastError || new LucidError('Request failed', 'REQUEST_FAILED');
  }

  /**
   * Make a streaming request (for SSE endpoints)
   * 
   * @param path API path
   * @param body Request body
   * @returns AsyncGenerator yielding chunks
   */
  async *requestStream<T = any>(
    path: string,
    body: any,
    headers?: Record<string, string>
  ): AsyncGenerator<T, void, unknown> {
    const url = this.buildUrl(path);
    const requestHeaders = this.buildHeaders(headers);

    this.debug(`Stream request: POST ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await this.parseErrorResponse(response);
      throw this.createError(response.status, errorData);
    }

    if (!response.body) {
      throw new LucidError('No response body for stream', 'STREAM_ERROR');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            // Check for [DONE] marker
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              yield parsed as T;
            } catch (e) {
              // Skip non-JSON lines
              this.debug(`Skipping non-JSON SSE data: ${data}`);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(path: string, query?: Record<string, any>): string {
    const url = new URL(path, this.config.baseUrl);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            url.searchParams.set(key, value.join(','));
          } else {
            url.searchParams.set(key, String(value));
          }
        }
      }
    }

    return url.toString();
  }

  /**
   * Build request headers
   */
  private buildHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...this.config.headers,
      ...additionalHeaders,
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  /**
   * Parse error response body
   */
  private async parseErrorResponse(response: Response): Promise<any> {
    try {
      return await response.json();
    } catch {
      return { error: response.statusText };
    }
  }

  /**
   * Create appropriate error based on status code
   */
  private createError(status: number, data: any): LucidError {
    const message = data.error || data.message || 'Unknown error';
    const code = data.error_code || data.code || 'UNKNOWN_ERROR';
    const details = data.details;

    switch (status) {
      case 400:
        return new ValidationError(message, details);
      case 404:
        return new NotFoundError('Resource', 'unknown');
      case 422:
        if (code === 'NO_COMPATIBLE_COMPUTE' || message.includes('NO_COMPATIBLE_COMPUTE')) {
          return new NoCompatibleComputeError(data.explain);
        }
        return new LucidError(message, code, status, details);
      case 503:
        return new ComputeUnavailableError(message);
      case 504:
        return new TimeoutError('request');
      default:
        return new LucidError(message, code, status, details);
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a new LucidClient instance
 * 
 * @example
 * ```typescript
 * const client = createClient({
 *   baseUrl: 'https://api.lucidlayer.io',
 *   apiKey: 'your-api-key'
 * });
 * ```
 */
export function createClient(config: LucidClientConfig): LucidClient {
  return new LucidClient(config);
}

// Export default
export default LucidClient;
