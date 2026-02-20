/**
 * HTTP client for the LucidLayer API.
 *
 * Zero dependencies — uses native fetch (Node 18+ / browser).
 */

export interface ClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
  headers?: Record<string, string>;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  headers: Record<string, string>;
}

export class LucidClient {
  private config: ClientConfig;

  constructor(config: ClientConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl.replace(/\/$/, ''),
    };
  }

  async get<T = unknown>(path: string, query?: Record<string, string>): Promise<ApiResponse<T>> {
    let url = `${this.config.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams(query);
      url += `?${params.toString()}`;
    }
    return this.request<T>('GET', url);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    const url = `${this.config.baseUrl}${path}`;
    return this.request<T>('POST', url, body);
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = await response.json() as T;

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        ok: response.ok,
        status: response.status,
        data,
        headers: responseHeaders,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Make a request with x402 payment retry.
   * If the server returns 402, the onPaymentRequired callback is called
   * to obtain a payment proof, then the request is retried.
   */
  async requestWithPayment<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown | undefined,
    onPaymentRequired: (paymentInfo: any) => Promise<string | null>,
  ): Promise<ApiResponse<T>> {
    const firstResponse = method === 'GET'
      ? await this.get<T>(path)
      : await this.post<T>(path, body);

    if (firstResponse.status !== 402) {
      return firstResponse;
    }

    // Extract payment info from 402 response
    const paymentInfo = (firstResponse.data as any)?.x402?.payment;
    if (!paymentInfo) {
      return firstResponse;
    }

    // Get payment proof from callback
    const txHash = await onPaymentRequired(paymentInfo);
    if (!txHash) {
      return firstResponse; // User declined payment
    }

    // Retry with payment proof
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Payment-Proof': txHash,
      ...this.config.headers,
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = await response.json() as T;

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        ok: response.ok,
        status: response.status,
        data,
        headers: responseHeaders,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
