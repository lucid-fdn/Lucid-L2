# Lucid SDK Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `@lucid/*` product-first SDK packages — from `npm install` to first API call in 30 seconds.

**Architecture:** Plugin-based monorepo. `@lucid/core` provides client factory, HTTP client, chain config, error types, and plugin registry. Product packages (`@lucid/inference`, `@lucid/passports`, etc.) auto-register via TypeScript declaration merging. `@lucid/react` wraps everything as hooks.

**Tech Stack:** TypeScript 5.x, Vitest, tsup (ESM+CJS), Zod validation, viem (EVM), @solana/web3.js (Solana), React 19

**Design doc:** `docs/plans/2026-02-26-lucid-sdk-design.md`

---

## Monorepo Location

All SDK packages live under `sdk/packages/` in the Lucid-L2 repo:

```
sdk/
  package.json                    # npm workspaces root
  tsconfig.base.json              # Shared TS config
  vitest.workspace.ts             # Vitest workspace config
  packages/
    core/                         # @lucid/core
    inference/                    # @lucid/inference
    receipts/                     # @lucid/receipts
    passports/                    # @lucid/passports
    escrow/                       # @lucid/escrow
    memory/                       # @lucid/memory
    paymaster/                    # @lucid/paymaster
    react/                        # @lucid/react
    ai/                           # @lucid/ai
```

Existing SDK at `sdk/raijin-labs-lucid-ai-typescript/` is the Speakeasy-generated SDK — we keep it as-is and build the new SDK separately.

**API base URL:** `https://api.lucid.foundation` (env: `LUCID_API_URL`)
**API key prefix:** `lk_live_` (production), `lk_test_` (test)

---

## Task 1: Monorepo Scaffold

**Files:**
- Create: `sdk/package.json`
- Create: `sdk/tsconfig.base.json`
- Create: `sdk/vitest.workspace.ts`
- Create: `sdk/packages/core/package.json`
- Create: `sdk/packages/core/tsconfig.json`
- Create: `sdk/packages/core/tsup.config.ts`
- Create: `sdk/packages/core/src/index.ts`

**Step 1: Create workspace root**

```json
// sdk/package.json
{
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "vitest run",
    "test:watch": "vitest",
    "type-check": "tsc --noEmit --workspaces"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "tsup": "^8.0.0"
  }
}
```

```json
// sdk/tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "dist"
  }
}
```

```typescript
// sdk/vitest.workspace.ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*/vitest.config.ts',
]);
```

**Step 2: Create @lucid/core package skeleton**

```json
// sdk/packages/core/package.json
{
  "name": "@lucid/core",
  "version": "0.1.0",
  "description": "Lucid SDK core — client factory, chain config, error types",
  "type": "module",
  "main": "dist/index.cjs",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./chains": {
      "import": "./dist/chains.js",
      "require": "./dist/chains.cjs",
      "types": "./dist/chains.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "peerDependencies": {
    "viem": "^2.0.0",
    "@solana/web3.js": "^1.90.0"
  },
  "peerDependenciesMeta": {
    "viem": { "optional": true },
    "@solana/web3.js": { "optional": true }
  }
}
```

```typescript
// sdk/packages/core/tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/chains.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  clean: true,
  sourcemap: true,
});
```

```json
// sdk/packages/core/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

```typescript
// sdk/packages/core/src/index.ts
export { createLucid } from './client';
export type { LucidClient, LucidConfig, LucidPlugins } from './client';
export type { LucidResult, LucidError, LucidErrorCode } from './errors';
export type { Chain, ChainConfig, Signer } from './types';
```

**Step 3: Install dependencies and verify build**

Run: `cd sdk && npm install && npx tsc --noEmit -p packages/core/tsconfig.json`
Expected: No errors (empty exports resolve fine)

**Step 4: Commit**

```bash
git add sdk/package.json sdk/tsconfig.base.json sdk/vitest.workspace.ts sdk/packages/core/
git commit -m "feat(sdk): scaffold monorepo with @lucid/core package skeleton"
```

---

## Task 2: Core — Error Types + Result Pattern

**Files:**
- Create: `sdk/packages/core/src/errors.ts`
- Create: `sdk/packages/core/src/__tests__/errors.test.ts`
- Create: `sdk/packages/core/vitest.config.ts`

**Step 1: Write the failing test**

```typescript
// sdk/packages/core/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

```typescript
// sdk/packages/core/src/__tests__/errors.test.ts
import { describe, it, expect } from 'vitest';
import { createError, isLucidError, ok, err } from '../errors';

describe('LucidError', () => {
  it('creates typed error with code and message', () => {
    const error = createError('UNAUTHORIZED', 'Invalid API key');
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.message).toBe('Invalid API key');
    expect(error.requestId).toBeDefined();
  });

  it('includes optional chain context', () => {
    const error = createError('CHAIN_ERROR', 'Tx reverted', {
      chain: 'base-sepolia',
      txHash: '0xabc',
      explorerUrl: 'https://sepolia.basescan.org/tx/0xabc',
    });
    expect(error.chain).toBe('base-sepolia');
    expect(error.txHash).toBe('0xabc');
    expect(error.explorerUrl).toContain('basescan');
  });

  it('isLucidError type guard works', () => {
    const error = createError('NOT_FOUND', 'Not found');
    expect(isLucidError(error)).toBe(true);
    expect(isLucidError(new Error('nope'))).toBe(false);
  });
});

describe('Result helpers', () => {
  it('ok() wraps data', () => {
    const result = ok({ id: '123' });
    expect(result.data).toEqual({ id: '123' });
    expect(result.error).toBeNull();
  });

  it('err() wraps error', () => {
    const error = createError('UNAUTHORIZED', 'Bad key');
    const result = err(error);
    expect(result.data).toBeNull();
    expect(result.error.code).toBe('UNAUTHORIZED');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd sdk && npx vitest run packages/core/src/__tests__/errors.test.ts`
Expected: FAIL — module '../errors' not found

**Step 3: Write implementation**

```typescript
// sdk/packages/core/src/errors.ts
export type LucidErrorCode =
  | 'INVALID_PARAMS'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CHAIN_ERROR'
  | 'INSUFFICIENT_BALANCE'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'SIGNER_REQUIRED'
  | 'CHAIN_REQUIRED'
  | 'UNSUPPORTED_CHAIN';

export interface LucidError {
  readonly _tag: 'LucidError';
  code: LucidErrorCode;
  message: string;
  requestId: string;
  chain?: string;
  txHash?: string;
  explorerUrl?: string;
  details?: Record<string, unknown>;
  docsUrl?: string;
  retryAfter?: number;
}

export type LucidResult<T> =
  | { data: T; error: null }
  | { data: null; error: LucidError };

export function createError(
  code: LucidErrorCode,
  message: string,
  context?: Partial<Omit<LucidError, '_tag' | 'code' | 'message' | 'requestId'>>,
): LucidError {
  return {
    _tag: 'LucidError',
    code,
    message,
    requestId: crypto.randomUUID(),
    ...context,
  };
}

export function isLucidError(value: unknown): value is LucidError {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_tag' in value &&
    (value as LucidError)._tag === 'LucidError'
  );
}

export function ok<T>(data: T): LucidResult<T> {
  return { data, error: null };
}

export function err<T = never>(error: LucidError): LucidResult<T> {
  return { data: null, error };
}
```

**Step 4: Run test to verify it passes**

Run: `cd sdk && npx vitest run packages/core/src/__tests__/errors.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add sdk/packages/core/src/errors.ts sdk/packages/core/src/__tests__/errors.test.ts sdk/packages/core/vitest.config.ts
git commit -m "feat(sdk): add LucidError types, Result pattern, ok/err helpers"
```

---

## Task 3: Core — HTTP Client + Chain Config

**Files:**
- Create: `sdk/packages/core/src/http.ts`
- Create: `sdk/packages/core/src/chains.ts`
- Create: `sdk/packages/core/src/types.ts`
- Create: `sdk/packages/core/src/__tests__/http.test.ts`

**Step 1: Write the failing test**

```typescript
// sdk/packages/core/src/__tests__/http.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpClient } from '../http';

describe('HttpClient', () => {
  let client: HttpClient;

  beforeEach(() => {
    client = new HttpClient({
      baseUrl: 'https://api.lucid.foundation',
      apiKey: 'lk_test_123',
    });
  });

  it('builds correct headers', () => {
    const headers = client.buildHeaders();
    expect(headers['Authorization']).toBe('Bearer lk_test_123');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Lucid-SDK']).toMatch(/^@lucid\/core/);
  });

  it('builds correct URL', () => {
    const url = client.buildUrl('/v1/passports', { type: 'model', limit: '10' });
    expect(url).toBe('https://api.lucid.foundation/v1/passports?type=model&limit=10');
  });

  it('builds URL without query params', () => {
    const url = client.buildUrl('/v1/receipts/abc');
    expect(url).toBe('https://api.lucid.foundation/v1/receipts/abc');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd sdk && npx vitest run packages/core/src/__tests__/http.test.ts`
Expected: FAIL — module '../http' not found

**Step 3: Write implementation**

```typescript
// sdk/packages/core/src/types.ts
export type ChainType = 'evm' | 'solana';

export type Chain =
  | 'base' | 'ethereum' | 'arbitrum' | 'polygon' | 'avalanche' | 'apechain'
  | 'base-sepolia' | 'ethereum-sepolia' | 'apechain-testnet' | 'avalanche-fuji'
  | 'solana-mainnet' | 'solana-devnet'
  | 'monad' | 'megaeth';

export interface ChainConfig {
  chainId: string;
  name: string;
  chainType: ChainType;
  evmChainId?: number;
  rpcUrl: string;
  isTestnet: boolean;
  explorerUrl?: string;
  lucidTokenAddress?: string;
  escrowContract?: string;
  arbitrationContract?: string;
  paymaster?: string;
  entryPoint?: string;
  modules?: { policy?: string; payout?: string; receipt?: string };
  zkmlVerifier?: string;
}

/** EVM signer — viem WalletClient or ethers Signer */
export type EVMSigner = { account: { address: string }; chain: { id: number } };

/** Solana signer — Keypair or Wallet Adapter */
export type SolanaSigner = { publicKey: { toBase58(): string }; secretKey: Uint8Array };

export type Signer = EVMSigner | SolanaSigner;

export interface LucidConfig {
  apiKey: string;
  baseUrl?: string;
  chain?: Chain;
  signer?: Signer;
  chains?: Record<Chain, { signer: Signer }>;
  defaultChain?: Chain;
}
```

```typescript
// sdk/packages/core/src/http.ts
import { createError, ok, err } from './errors';
import type { LucidResult } from './errors';

const SDK_VERSION = '0.1.0';

export interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
}

export class HttpClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
  }

  buildHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'X-Lucid-SDK': `@lucid/core@${SDK_VERSION}`,
    };
  }

  buildUrl(path: string, params?: Record<string, string>): string {
    const url = `${this.baseUrl}${path}`;
    if (!params || Object.keys(params).length === 0) return url;
    const qs = new URLSearchParams(params).toString();
    return `${url}?${qs}`;
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<LucidResult<T>> {
    return this.request<T>('GET', path, undefined, params);
  }

  async post<T>(path: string, body?: unknown): Promise<LucidResult<T>> {
    return this.request<T>('POST', path, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<LucidResult<T>> {
    return this.request<T>('PATCH', path, body);
  }

  async delete<T>(path: string): Promise<LucidResult<T>> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>,
  ): Promise<LucidResult<T>> {
    const url = this.buildUrl(path, params);
    try {
      const res = await fetch(url, {
        method,
        headers: this.buildHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const text = await res.text();
        let parsed: any;
        try { parsed = JSON.parse(text); } catch { parsed = { message: text }; }

        if (res.status === 401) return err(createError('UNAUTHORIZED', parsed.message || 'Invalid API key'));
        if (res.status === 403) return err(createError('FORBIDDEN', parsed.message || 'Insufficient permissions'));
        if (res.status === 404) return err(createError('NOT_FOUND', parsed.message || 'Resource not found'));
        if (res.status === 429) return err(createError('RATE_LIMITED', parsed.message || 'Rate limited', {
          retryAfter: parseInt(res.headers.get('retry-after') || '1000', 10),
        }));
        return err(createError('NETWORK_ERROR', parsed.message || `HTTP ${res.status}`));
      }

      const data = await res.json() as T;
      return ok(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Network error';
      return err(createError('NETWORK_ERROR', message));
    }
  }
}
```

```typescript
// sdk/packages/core/src/chains.ts
import type { ChainConfig } from './types';

// Mirrors: offchain/packages/engine/src/chains/configs.ts
export const CHAINS: Record<string, ChainConfig> = {
  'base': {
    chainId: 'base', name: 'Base', chainType: 'evm', evmChainId: 8453,
    rpcUrl: 'https://mainnet.base.org', isTestnet: false,
    explorerUrl: 'https://basescan.org',
  },
  'ethereum': {
    chainId: 'ethereum', name: 'Ethereum', chainType: 'evm', evmChainId: 1,
    rpcUrl: 'https://eth.drpc.org', isTestnet: false,
    explorerUrl: 'https://etherscan.io',
  },
  'arbitrum': {
    chainId: 'arbitrum', name: 'Arbitrum One', chainType: 'evm', evmChainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc', isTestnet: false,
    explorerUrl: 'https://arbiscan.io',
  },
  'base-sepolia': {
    chainId: 'base-sepolia', name: 'Base Sepolia', chainType: 'evm', evmChainId: 84532,
    rpcUrl: 'https://sepolia.base.org', isTestnet: true,
    explorerUrl: 'https://sepolia.basescan.org',
    lucidTokenAddress: '0x17F583fc59b745E24C5078b9C8e4577b866cD7fc',
    escrowContract: '0x060f76F82325B98bC595954F6b8c88083B43b379',
    arbitrationContract: '0xc93b3E60503cAD1FEc11209F374A67D2886c6BA5',
    paymaster: '0xd2671c81a7169E66Aa9B0db5D0bF865Cfd6868bD',
    entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    modules: { policy: '0xe0263C014B66D4452CD42ec9693A830f5D28bC5F', payout: '0x51646afF187945B7F573503139A3a2c470064229', receipt: '0x00b811fD025A3B2606a83Ee9C4bF882f4612B745' },
    zkmlVerifier: '0xAA663967159E18A3Da2A8277FDDa35C0389e1462',
  },
  'ethereum-sepolia': {
    chainId: 'ethereum-sepolia', name: 'Ethereum Sepolia', chainType: 'evm', evmChainId: 11155111,
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com', isTestnet: true,
    explorerUrl: 'https://sepolia.etherscan.io',
    lucidTokenAddress: '0x060f76F82325B98bC595954F6b8c88083B43b379',
    escrowContract: '0x3Aff9d80Cd91Fb9C4fE475155e60e9C473F55088',
    arbitrationContract: '0x3D29D5dDAe2da5E571C015EfAbdfCab9A1B0F9BA',
    paymaster: '0xafDcb7f7D75784076eC1f62DB13F7651A73789A2',
    entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    modules: { policy: '0x1be63A49Ce0D65A010E2fF9038b81FEdf6AB1477', payout: '0xAec07214d21627dFD2131470B29a8372be21eF55', receipt: '0x7695cd6F97d1434A2Ab5f778C6B02898385b14cc' },
    zkmlVerifier: '0xd69Ce5E5AA5a68D55413766320b520eeA3fdFf98',
  },
  'solana-devnet': {
    chainId: 'solana-devnet', name: 'Solana Devnet', chainType: 'solana',
    rpcUrl: 'https://api.devnet.solana.com', isTestnet: true,
    explorerUrl: 'https://explorer.solana.com',
  },
  'solana-mainnet': {
    chainId: 'solana-mainnet', name: 'Solana', chainType: 'solana',
    rpcUrl: 'https://api.mainnet-beta.solana.com', isTestnet: false,
    explorerUrl: 'https://explorer.solana.com',
  },
};

export function getChainConfig(chain: string): ChainConfig | undefined {
  return CHAINS[chain];
}
```

**Step 4: Run tests**

Run: `cd sdk && npx vitest run packages/core/src/__tests__/http.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add sdk/packages/core/src/http.ts sdk/packages/core/src/types.ts sdk/packages/core/src/chains.ts sdk/packages/core/src/__tests__/http.test.ts
git commit -m "feat(sdk): add HttpClient, chain configs, and type definitions"
```

---

## Task 4: Core — Client Factory + Plugin Registry

**Files:**
- Create: `sdk/packages/core/src/client.ts`
- Create: `sdk/packages/core/src/__tests__/client.test.ts`
- Modify: `sdk/packages/core/src/index.ts`

**Step 1: Write the failing test**

```typescript
// sdk/packages/core/src/__tests__/client.test.ts
import { describe, it, expect } from 'vitest';
import { createLucid } from '../client';

describe('createLucid', () => {
  it('creates client with API key only', () => {
    const lucid = createLucid({ apiKey: 'lk_test_123' });
    expect(lucid).toBeDefined();
    expect(lucid.config.apiKey).toBe('lk_test_123');
  });

  it('creates client with chain config', () => {
    const lucid = createLucid({ apiKey: 'lk_test_123', chain: 'base-sepolia' });
    expect(lucid.config.chain).toBe('base-sepolia');
  });

  it('defaults baseUrl to api.lucid.foundation', () => {
    const lucid = createLucid({ apiKey: 'lk_test_123' });
    expect(lucid.config.baseUrl).toBe('https://api.lucid.foundation');
  });

  it('allows custom baseUrl', () => {
    const lucid = createLucid({ apiKey: 'lk_test_123', baseUrl: 'http://localhost:3001' });
    expect(lucid.config.baseUrl).toBe('http://localhost:3001');
  });

  it('registers plugins via use()', () => {
    const lucid = createLucid({ apiKey: 'lk_test_123' });
    const mockPlugin = {
      name: 'test' as const,
      init: (client: any) => ({ hello: () => 'world' }),
    };
    lucid.use(mockPlugin);
    expect((lucid as any).test.hello()).toBe('world');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd sdk && npx vitest run packages/core/src/__tests__/client.test.ts`
Expected: FAIL — module '../client' not found

**Step 3: Write implementation**

```typescript
// sdk/packages/core/src/client.ts
import { HttpClient } from './http';
import type { LucidConfig, Chain, ChainConfig } from './types';
import { getChainConfig } from './chains';

const DEFAULT_BASE_URL = 'https://api.lucid.foundation';

export interface LucidPlugin<N extends string = string, T = unknown> {
  name: N;
  init(client: LucidClient): T;
}

// Declaration merging target — product packages augment this
export interface LucidPlugins {}

export class LucidClient {
  readonly config: Required<Pick<LucidConfig, 'apiKey' | 'baseUrl'>> & LucidConfig;
  readonly http: HttpClient;

  constructor(config: LucidConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl || DEFAULT_BASE_URL,
    };
    this.http = new HttpClient({
      baseUrl: this.config.baseUrl,
      apiKey: this.config.apiKey,
    });
  }

  use<N extends string, T>(plugin: LucidPlugin<N, T>): this {
    const instance = plugin.init(this);
    Object.defineProperty(this, plugin.name, {
      value: instance,
      enumerable: true,
      configurable: false,
    });
    return this;
  }

  getChainConfig(chain?: Chain): ChainConfig | undefined {
    const target = chain || this.config.chain || this.config.defaultChain;
    if (!target) return undefined;
    return getChainConfig(target);
  }
}

export function createLucid(config: LucidConfig): LucidClient & LucidPlugins {
  return new LucidClient(config) as LucidClient & LucidPlugins;
}
```

**Step 4: Update index.ts**

```typescript
// sdk/packages/core/src/index.ts
export { createLucid, LucidClient } from './client';
export type { LucidPlugin, LucidPlugins } from './client';
export type { LucidResult, LucidError, LucidErrorCode } from './errors';
export { createError, isLucidError, ok, err } from './errors';
export type { Chain, ChainConfig, ChainType, LucidConfig, Signer, EVMSigner, SolanaSigner } from './types';
export { HttpClient } from './http';
export { CHAINS, getChainConfig } from './chains';
```

**Step 5: Run tests**

Run: `cd sdk && npx vitest run packages/core/`
Expected: PASS (all tests)

**Step 6: Commit**

```bash
git add sdk/packages/core/src/client.ts sdk/packages/core/src/__tests__/client.test.ts sdk/packages/core/src/index.ts
git commit -m "feat(sdk): add createLucid() client factory with plugin registry"
```

---

## Task 5: @lucid/inference — Chat Completions + Streaming

**Files:**
- Create: `sdk/packages/inference/package.json`
- Create: `sdk/packages/inference/tsconfig.json`
- Create: `sdk/packages/inference/tsup.config.ts`
- Create: `sdk/packages/inference/vitest.config.ts`
- Create: `sdk/packages/inference/src/index.ts`
- Create: `sdk/packages/inference/src/types.ts`
- Create: `sdk/packages/inference/src/stream.ts`
- Create: `sdk/packages/inference/src/__tests__/inference.test.ts`

**Step 1: Create package skeleton**

```json
// sdk/packages/inference/package.json
{
  "name": "@lucid/inference",
  "version": "0.1.0",
  "description": "Lucid SDK — AI inference with verifiable receipts",
  "type": "module",
  "main": "dist/index.cjs",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "require": "./dist/index.cjs", "types": "./dist/index.d.ts" }
  },
  "scripts": { "build": "tsup", "test": "vitest run" },
  "peerDependencies": { "@lucid/core": "^0.1.0" }
}
```

**Step 2: Write the failing test**

```typescript
// sdk/packages/inference/src/__tests__/inference.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLucid } from '@lucid/core';
import '../index'; // Registers the plugin

describe('@lucid/inference', () => {
  it('registers inference namespace on client', () => {
    const lucid = createLucid({ apiKey: 'lk_test_123' });
    expect(lucid.inference).toBeDefined();
    expect(typeof lucid.inference.chat).toBe('function');
  });
});

describe('inference.chat()', () => {
  let lucid: ReturnType<typeof createLucid>;

  beforeEach(() => {
    lucid = createLucid({ apiKey: 'lk_test_123', baseUrl: 'http://localhost:3001' });
  });

  it('sends correct request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'run_123',
        choices: [{ message: { role: 'assistant', content: 'Hello!' } }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { data } = await lucid.inference.chat({
      model: 'deepseek-v3',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3001/v1/chat/completions');
    expect(JSON.parse(opts.body)).toEqual({
      model: 'deepseek-v3',
      messages: [{ role: 'user', content: 'Hi' }],
      stream: false,
    });
    expect(data?.choices[0].message.content).toBe('Hello!');

    vi.unstubAllGlobals();
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd sdk && npx vitest run packages/inference/`
Expected: FAIL

**Step 4: Write implementation**

```typescript
// sdk/packages/inference/src/types.ts
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

export interface ChatParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

export interface ChatChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string;
}

export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
}

export interface ChatResponse {
  id: string;
  choices: ChatChoice[];
  usage: ChatUsage;
  receipt_id?: string;
}

export interface ChatStreamChunk {
  id: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }>;
}
```

```typescript
// sdk/packages/inference/src/stream.ts
import type { ChatStreamChunk, ChatResponse, ChatUsage } from './types';

export class LucidStream implements AsyncIterable<ChatStreamChunk> {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private decoder = new TextDecoder();
  private buffer = '';
  private _finalText = '';
  private _usage: ChatUsage | null = null;
  private _receiptId: string | null = null;

  constructor(response: Response) {
    if (!response.body) throw new Error('Response body is null');
    this.reader = response.body.getReader();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<ChatStreamChunk> {
    while (true) {
      const { done, value } = await this.reader.read();
      if (done) break;

      this.buffer += this.decoder.decode(value, { stream: true });
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;

        const chunk: ChatStreamChunk = JSON.parse(data);
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) this._finalText += content;
        yield chunk;
      }
    }
  }

  async finalResult(): Promise<{ text: string; usage: ChatUsage | null; receiptId: string | null }> {
    // Consume stream if not already consumed
    for await (const _ of this) { /* drain */ }
    return { text: this._finalText, usage: this._usage, receiptId: this._receiptId };
  }

  toResponse(): Response {
    return new Response(this.reader as unknown as ReadableStream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }
}
```

```typescript
// sdk/packages/inference/src/index.ts
import type { LucidClient, LucidPlugin } from '@lucid/core';
import type { ChatParams, ChatResponse } from './types';
import type { LucidResult } from '@lucid/core';
import { LucidStream } from './stream';

export type { ChatMessage, ChatParams, ChatChoice, ChatUsage, ChatResponse, ChatStreamChunk } from './types';
export { LucidStream } from './stream';

export class InferenceClient {
  constructor(private client: LucidClient) {}

  async chat(params: ChatParams & { stream: true }): Promise<LucidStream>;
  async chat(params: ChatParams): Promise<LucidResult<ChatResponse>>;
  async chat(params: ChatParams): Promise<LucidResult<ChatResponse> | LucidStream> {
    if (params.stream) {
      const res = await fetch(
        this.client.http.buildUrl('/v1/chat/completions'),
        {
          method: 'POST',
          headers: this.client.http.buildHeaders(),
          body: JSON.stringify({ ...params, stream: true }),
        },
      );
      return new LucidStream(res);
    }

    return this.client.http.post<ChatResponse>('/v1/chat/completions', {
      ...params,
      stream: false,
    });
  }
}

// Plugin registration
const inferencePlugin: LucidPlugin<'inference', InferenceClient> = {
  name: 'inference',
  init: (client) => new InferenceClient(client),
};

// Auto-register on import
declare module '@lucid/core' {
  interface LucidPlugins {
    inference: InferenceClient;
  }
}

// Side-effect: register plugin
import { createLucid, LucidClient as _LC } from '@lucid/core';
const _origCreate = createLucid;
// We use a different approach: patch LucidClient prototype
const _origConstructor = _LC.prototype.constructor;
const _plugins: LucidPlugin[] = [inferencePlugin];

// Register via module augmentation — the createLucid function checks for registered plugins
if (typeof globalThis !== 'undefined') {
  (globalThis as any).__lucid_plugins__ = (globalThis as any).__lucid_plugins__ || [];
  (globalThis as any).__lucid_plugins__.push(inferencePlugin);
}
```

> **Note to implementer:** The plugin auto-registration pattern above is a first pass. The actual implementation should use a cleaner approach — `createLucid()` in `@lucid/core` should check `globalThis.__lucid_plugins__` and auto-register all plugins found there. Update `client.ts` accordingly:

Add to `createLucid()` in `sdk/packages/core/src/client.ts`:
```typescript
export function createLucid(config: LucidConfig): LucidClient & LucidPlugins {
  const client = new LucidClient(config);
  // Auto-register plugins from side-effect imports
  const plugins = (globalThis as any).__lucid_plugins__ || [];
  for (const plugin of plugins) {
    client.use(plugin);
  }
  return client as LucidClient & LucidPlugins;
}
```

**Step 5: Run tests**

Run: `cd sdk && npx vitest run packages/inference/`
Expected: PASS

**Step 6: Commit**

```bash
git add sdk/packages/inference/
git commit -m "feat(sdk): add @lucid/inference with chat completions + streaming"
```

---

## Task 6: @lucid/receipts — Verify + Proof

**Files:**
- Create: `sdk/packages/receipts/package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`
- Create: `sdk/packages/receipts/src/index.ts`
- Create: `sdk/packages/receipts/src/types.ts`
- Create: `sdk/packages/receipts/src/__tests__/receipts.test.ts`

**Step 1: Write the failing test**

```typescript
// sdk/packages/receipts/src/__tests__/receipts.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLucid } from '@lucid/core';
import '../index';

describe('@lucid/receipts', () => {
  let lucid: ReturnType<typeof createLucid>;

  beforeEach(() => {
    lucid = createLucid({ apiKey: 'lk_test_123', baseUrl: 'http://localhost:3001' });
  });

  it('registers receipts namespace', () => {
    expect(lucid.receipts).toBeDefined();
    expect(typeof lucid.receipts.get).toBe('function');
    expect(typeof lucid.receipts.verify).toBe('function');
    expect(typeof lucid.receipts.getProof).toBe('function');
  });

  it('verify() calls correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        hash_valid: true,
        signature_valid: true,
        inclusion_valid: true,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { data } = await lucid.receipts.verify('receipt_abc');
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:3001/v1/receipts/receipt_abc/verify');
    expect(data?.hash_valid).toBe(true);

    vi.unstubAllGlobals();
  });

  it('getProof() returns proof array (not siblings)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        proof: ['0xabc', '0xdef'],
        root: '0x123',
        leaf: '0x456',
        leaf_index: 0,
        directions: ['L', 'R'],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { data } = await lucid.receipts.getProof('receipt_abc');
    expect(data?.proof).toEqual(['0xabc', '0xdef']);
    expect(data?.leaf).toBe('0x456');

    vi.unstubAllGlobals();
  });
});
```

**Step 2: Write implementation**

```typescript
// sdk/packages/receipts/src/types.ts
export interface Receipt {
  run_id: string;
  receipt_hash: string;
  receipt_signature: string;
  signer_pubkey: string;
  model_passport_id: string;
  compute_passport_id: string;
  policy_hash: string;
  runtime: string;
  timestamp: number;
  metrics: {
    ttft_ms: number;
    tokens_in: number;
    tokens_out: number;
  };
}

export interface ReceiptVerifyResult {
  hash_valid: boolean;
  signature_valid: boolean;
  inclusion_valid?: boolean;
}

export interface ReceiptProof {
  run_id: string;
  receipt_hash: string;
  leaf: string;
  leaf_index: number;
  proof: string[];  // Note: renamed from "siblings" in the monorepo restructuring
  root: string;
  directions: ('L' | 'R')[];
}
```

```typescript
// sdk/packages/receipts/src/index.ts
import type { LucidClient, LucidPlugin, LucidResult } from '@lucid/core';
import type { Receipt, ReceiptVerifyResult, ReceiptProof } from './types';

export type { Receipt, ReceiptVerifyResult, ReceiptProof } from './types';

export class ReceiptClient {
  constructor(private client: LucidClient) {}

  async get(receiptId: string): Promise<LucidResult<Receipt>> {
    return this.client.http.get<Receipt>(`/v1/receipts/${receiptId}`);
  }

  async verify(receiptId: string): Promise<LucidResult<ReceiptVerifyResult>> {
    return this.client.http.get<ReceiptVerifyResult>(`/v1/receipts/${receiptId}/verify`);
  }

  async getProof(receiptId: string): Promise<LucidResult<ReceiptProof>> {
    return this.client.http.get<ReceiptProof>(`/v1/receipts/${receiptId}/proof`);
  }

  async getMmrRoot(): Promise<LucidResult<{ root: string; leaf_count: number }>> {
    return this.client.http.get('/v1/mmr/root');
  }
}

const receiptsPlugin: LucidPlugin<'receipts', ReceiptClient> = {
  name: 'receipts',
  init: (client) => new ReceiptClient(client),
};

declare module '@lucid/core' {
  interface LucidPlugins {
    receipts: ReceiptClient;
  }
}

if (typeof globalThis !== 'undefined') {
  (globalThis as any).__lucid_plugins__ = (globalThis as any).__lucid_plugins__ || [];
  (globalThis as any).__lucid_plugins__.push(receiptsPlugin);
}
```

**Step 3: Run tests, verify pass, commit**

Run: `cd sdk && npx vitest run packages/receipts/`

```bash
git add sdk/packages/receipts/
git commit -m "feat(sdk): add @lucid/receipts with verify, proof, and MMR root"
```

---

## Task 7: @lucid/passports — CRUD + Search

**Files:**
- Create: `sdk/packages/passports/` (full package)

**Key implementation:**

```typescript
// sdk/packages/passports/src/index.ts
import type { LucidClient, LucidPlugin, LucidResult } from '@lucid/core';
import type { Passport, PassportCreateParams, PassportUpdateParams, PassportListParams, PaginatedPassports } from './types';

export class PassportClient {
  constructor(private client: LucidClient) {}

  async create(params: PassportCreateParams): Promise<LucidResult<Passport>> {
    return this.client.http.post<Passport>('/v1/passports', params);
  }

  async get(passportId: string): Promise<LucidResult<Passport>> {
    return this.client.http.get<Passport>(`/v1/passports/${passportId}`);
  }

  async update(passportId: string, params: PassportUpdateParams): Promise<LucidResult<Passport>> {
    return this.client.http.patch<Passport>(`/v1/passports/${passportId}`, params);
  }

  async delete(passportId: string): Promise<LucidResult<{ success: boolean }>> {
    return this.client.http.delete(`/v1/passports/${passportId}`);
  }

  async list(params?: PassportListParams): Promise<LucidResult<PaginatedPassports>> {
    const qs: Record<string, string> = {};
    if (params?.type) qs.type = params.type;
    if (params?.owner) qs.owner = params.owner;
    if (params?.status) qs.status = params.status;
    if (params?.limit) qs.per_page = String(params.limit);
    if (params?.page) qs.page = String(params.page);
    return this.client.http.get<PaginatedPassports>('/v1/passports', qs);
  }

  async search(params: { type: string; runtime?: string; available?: boolean }): Promise<LucidResult<PaginatedPassports>> {
    const qs: Record<string, string> = {};
    if (params.type === 'model') {
      if (params.available !== undefined) qs.available = String(params.available);
      return this.client.http.get<PaginatedPassports>('/v1/models', qs);
    }
    if (params.type === 'compute') return this.client.http.get<PaginatedPassports>('/v1/compute', qs);
    return this.client.http.get<PaginatedPassports>('/v1/passports', { type: params.type });
  }

  async sync(passportId: string): Promise<LucidResult<{ success: boolean; tx?: string }>> {
    return this.client.http.post(`/v1/passports/${passportId}/sync`);
  }

  async updatePricing(passportId: string, pricing: Record<string, unknown>): Promise<LucidResult<Passport>> {
    return this.client.http.patch<Passport>(`/v1/passports/${passportId}/pricing`, pricing);
  }

  async updateEndpoints(passportId: string, endpoints: Array<{ url: string; type: string }>): Promise<LucidResult<Passport>> {
    return this.client.http.patch<Passport>(`/v1/passports/${passportId}/endpoints`, { endpoints });
  }
}

// Plugin + declaration merging (same pattern as inference/receipts)
```

**Test, verify, commit:**

```bash
git add sdk/packages/passports/
git commit -m "feat(sdk): add @lucid/passports with CRUD, search, sync, pricing"
```

---

## Task 8: @lucid/escrow — On-Chain Escrow Operations

**Files:**
- Create: `sdk/packages/escrow/` (full package)

**Key implementation:**

```typescript
// sdk/packages/escrow/src/index.ts
export class EscrowClient {
  constructor(private client: LucidClient) {}

  async create(params: EscrowCreateParams): Promise<LucidResult<EscrowInfo>> {
    return this.client.http.post<EscrowInfo>('/v1/escrow', params);
  }

  async get(escrowId: string): Promise<LucidResult<EscrowInfo>> {
    return this.client.http.get<EscrowInfo>(`/v1/escrow/${escrowId}`);
  }

  async release(escrowId: string, params: EscrowReleaseParams): Promise<LucidResult<{ txHash: string }>> {
    return this.client.http.post(`/v1/escrow/${escrowId}/release`, params);
  }

  async dispute(escrowId: string, params: { reason: string }): Promise<LucidResult<DisputeInfo>> {
    return this.client.http.post(`/v1/escrow/${escrowId}/dispute`, params);
  }

  async claimTimeout(escrowId: string): Promise<LucidResult<{ txHash: string }>> {
    return this.client.http.post(`/v1/escrow/${escrowId}/claim-timeout`);
  }
}
```

> **Note:** Escrow currently goes through the API server which relays to on-chain. Direct on-chain interaction (viem contract calls) will be a future enhancement when the SDK supports direct chain writes.

**Test, verify, commit.**

---

## Task 9: @lucid/memory — Agent MMR Proofs

**Files:**
- Create: `sdk/packages/memory/` (full package)

```typescript
// sdk/packages/memory/src/index.ts
export class MemoryClient {
  constructor(private client: LucidClient) {}

  async initAgent(params: { agentId: string }): Promise<LucidResult<{ agentId: string }>> {
    return this.client.http.post('/api/agents/init', params);
  }

  async processEpoch(params: { agentId: string; vectors: string[] }): Promise<LucidResult<{ epoch: number; root: string }>> {
    return this.client.http.post('/api/agents/epoch', params);
  }

  async generateProof(params: { agentId: string; epoch: number; vectorText: string }): Promise<LucidResult<any>> {
    return this.client.http.post('/api/agents/proof', params);
  }

  async getStats(agentId: string): Promise<LucidResult<{ leaf_count: number; root: string; epoch_count: number }>> {
    return this.client.http.get(`/api/agents/${agentId}/stats`);
  }

  async getRoot(agentId: string): Promise<LucidResult<{ root: string }>> {
    return this.client.http.get(`/api/agents/${agentId}/root`);
  }
}
```

**Test, verify, commit.**

---

## Task 10: @lucid/paymaster — Gas Abstraction

**Files:**
- Create: `sdk/packages/paymaster/` (full package)

```typescript
// sdk/packages/paymaster/src/index.ts
export class PaymasterClient {
  constructor(private client: LucidClient) {}

  async estimate(params: { userOp: UserOperation }): Promise<LucidResult<GasEstimate>> {
    return this.client.http.post('/v1/paymaster/estimate', params);
  }

  async sponsor(params: { userOp: UserOperation }): Promise<LucidResult<SponsoredUserOp>> {
    return this.client.http.post('/v1/paymaster/sponsor', params);
  }

  async getRate(): Promise<LucidResult<{ lucidPerEth: string }>> {
    return this.client.http.get('/v1/paymaster/rate');
  }

  async getDeposit(): Promise<LucidResult<{ deposit: string; minDeposit: string }>> {
    return this.client.http.get('/v1/paymaster/deposit');
  }
}
```

**Test, verify, commit.**

---

## Task 11: @lucid/react — Provider + Hooks

**Files:**
- Create: `sdk/packages/react/package.json` (peerDeps: react ^19.0.0, @lucid/core)
- Create: `sdk/packages/react/src/provider.tsx`
- Create: `sdk/packages/react/src/hooks/useLucid.ts`
- Create: `sdk/packages/react/src/hooks/usePassport.ts`
- Create: `sdk/packages/react/src/hooks/useChat.ts`
- Create: `sdk/packages/react/src/index.ts`

**Key implementation:**

```tsx
// sdk/packages/react/src/provider.tsx
import React, { createContext, useContext, useMemo } from 'react';
import { createLucid, type LucidConfig, type LucidClient, type LucidPlugins } from '@lucid/core';

const LucidContext = createContext<(LucidClient & LucidPlugins) | null>(null);

export interface LucidProviderProps extends LucidConfig {
  children: React.ReactNode;
}

export function LucidProvider({ children, ...config }: LucidProviderProps) {
  const client = useMemo(() => createLucid(config), [config.apiKey, config.chain]);
  return <LucidContext.Provider value={client}>{children}</LucidContext.Provider>;
}

export function useLucidClient(): LucidClient & LucidPlugins {
  const client = useContext(LucidContext);
  if (!client) throw new Error('useLucidClient must be used within <LucidProvider>');
  return client;
}
```

```tsx
// sdk/packages/react/src/hooks/useChat.ts
import { useState, useCallback, useRef } from 'react';
import { useLucidClient } from '../provider';
import type { ChatMessage } from '@lucid/inference';

export interface UseChatOptions {
  model: string;
  system?: string;
  onFinish?: (message: ChatMessage) => void;
  onError?: (error: any) => void;
}

export function useChat(options: UseChatOptions) {
  const client = useLucidClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    const allMessages = [...messages, userMessage];
    if (options.system) allMessages.unshift({ role: 'system', content: options.system });

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    setError(null);

    try {
      const stream = await (client as any).inference.chat({
        model: options.model,
        messages: allMessages,
        stream: true,
      });

      let content = '';
      const assistantMessage: ChatMessage = { role: 'assistant', content: '' };
      setMessages(prev => [...prev, assistantMessage]);

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          content += delta;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content };
            return updated;
          });
        }
      }

      options.onFinish?.({ role: 'assistant', content });
    } catch (e) {
      setError(e);
      options.onError?.(e);
    } finally {
      setIsStreaming(false);
    }
  }, [input, messages, isStreaming, client, options]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isStreaming,
    error,
    stop,
    setMessages,
    append: (msg: ChatMessage) => setMessages(prev => [...prev, msg]),
  };
}
```

```typescript
// sdk/packages/react/src/hooks/usePassport.ts
import { useState, useEffect } from 'react';
import { useLucidClient } from '../provider';
import type { LucidError } from '@lucid/core';

export function usePassport(id: string) {
  const client = useLucidClient();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<LucidError | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    (client as any).passports.get(id).then((result: any) => {
      if (result.error) setError(result.error);
      else setData(result.data);
      setIsLoading(false);
    });
  }, [id, client]);

  return { data, error, isLoading };
}
```

**Test, verify, commit:**

```bash
git add sdk/packages/react/
git commit -m "feat(sdk): add @lucid/react with LucidProvider, useChat, usePassport hooks"
```

---

## Task 12: @lucid/ai — Vercel AI SDK Provider

**Files:**
- Create: `sdk/packages/ai/` (full package)

```typescript
// sdk/packages/ai/src/index.ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export interface LucidAIProviderSettings {
  apiKey?: string;
  baseURL?: string;
}

export function createLucidProvider(options: LucidAIProviderSettings = {}) {
  const apiKey = options.apiKey || process.env.LUCID_API_KEY || '';
  const baseURL = (options.baseURL || 'https://api.lucid.foundation').replace(/\/+$/, '');

  return createOpenAICompatible({
    name: 'lucid',
    apiKey,
    baseURL: baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`,
  });
}

export const lucid = createLucidProvider();
```

> **Note:** This wraps the existing `ai.ts` from the Speakeasy SDK. The `@lucid/ai` package is a clean re-export for the new SDK.

**Test, verify, commit:**

```bash
git add sdk/packages/ai/
git commit -m "feat(sdk): add @lucid/ai Vercel AI SDK provider"
```

---

## Task 13: Integration Test — Full Stack

**Files:**
- Create: `sdk/packages/core/src/__tests__/integration.test.ts`

```typescript
// sdk/packages/core/src/__tests__/integration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLucid } from '../index';
import '../../inference/src/index';
import '../../receipts/src/index';
import '../../passports/src/index';

describe('Full SDK Integration', () => {
  it('supports the 30-second quickstart', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'run_123',
        choices: [{ message: { role: 'assistant', content: 'Hello from Lucid!' } }],
        usage: { prompt_tokens: 5, completion_tokens: 10 },
        receipt_id: 'receipt_abc',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const lucid = createLucid({ apiKey: 'lk_test_123' });

    // Inference works
    const { data } = await lucid.inference.chat({
      model: 'deepseek-v3',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(data?.choices[0].message.content).toBe('Hello from Lucid!');

    // All namespaces registered
    expect(lucid.inference).toBeDefined();
    expect(lucid.receipts).toBeDefined();
    expect(lucid.passports).toBeDefined();

    vi.unstubAllGlobals();
  });

  it('chain config resolves correctly', () => {
    const lucid = createLucid({ apiKey: 'lk_test_123', chain: 'base-sepolia' });
    const config = lucid.getChainConfig();
    expect(config?.evmChainId).toBe(84532);
    expect(config?.lucidTokenAddress).toBe('0x17F583fc59b745E24C5078b9C8e4577b866cD7fc');
    expect(config?.escrowContract).toBe('0x060f76F82325B98bC595954F6b8c88083B43b379');
  });
});
```

**Run all tests:**

Run: `cd sdk && npx vitest run`
Expected: All tests PASS across all packages

**Commit:**

```bash
git add sdk/packages/core/src/__tests__/integration.test.ts
git commit -m "test(sdk): add full SDK integration test"
```

---

## Task 14: Build + Publish Prep

**Files:**
- Modify: `sdk/package.json` (add build:all script)
- Create: `sdk/.npmrc`

**Step 1: Build all packages**

Run: `cd sdk && npm run build --workspaces`
Expected: All packages build ESM + CJS + .d.ts

**Step 2: Verify package exports**

Run: `cd sdk && node -e "const c = require('./packages/core/dist/index.cjs'); console.log(typeof c.createLucid)"`
Expected: `function`

Run: `cd sdk && node --input-type=module -e "import { createLucid } from './packages/core/dist/index.js'; console.log(typeof createLucid)"`
Expected: `function`

**Step 3: Commit**

```bash
git add sdk/
git commit -m "feat(sdk): complete @lucid/* SDK — 9 packages, ready for npm publish"
```

---

## Summary

| Task | Package | What it builds | Est. |
|------|---------|---------------|------|
| 1 | `@lucid/core` | Monorepo scaffold + package skeleton | 5 min |
| 2 | `@lucid/core` | Error types + Result pattern | 5 min |
| 3 | `@lucid/core` | HTTP client + chain configs | 5 min |
| 4 | `@lucid/core` | Client factory + plugin registry | 5 min |
| 5 | `@lucid/inference` | Chat completions + streaming | 10 min |
| 6 | `@lucid/receipts` | Verify + proof + MMR root | 5 min |
| 7 | `@lucid/passports` | CRUD + search + sync + pricing | 5 min |
| 8 | `@lucid/escrow` | Create, release, dispute | 5 min |
| 9 | `@lucid/memory` | Agent init, epoch, proof | 5 min |
| 10 | `@lucid/paymaster` | Gas estimation + sponsoring | 5 min |
| 11 | `@lucid/react` | Provider + useChat + usePassport | 10 min |
| 12 | `@lucid/ai` | Vercel AI SDK provider | 3 min |
| 13 | Integration | Full stack test | 5 min |
| 14 | Build | Build + publish prep | 5 min |

**Total: ~78 minutes of implementation**
