/**
 * SDK Integration Tests
 *
 * Tests that the generated LucidSDK correctly constructs requests
 * and handles responses for all resource classes.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import http from 'node:http';
import { LucidSDK } from '../sdk/sdk.js';
import { createLucidSDK } from '../lucid.js';

// Minimal mock server that records requests and returns canned responses
let server: http.Server;
let baseURL: string;
let lastRequest: { method: string; url: string; body: string; headers: Record<string, string> };

function resetLastRequest() {
  lastRequest = { method: '', url: '', body: '', headers: {} };
}

beforeAll(async () => {
  resetLastRequest();

  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      lastRequest = {
        method: req.method ?? '',
        url: req.url ?? '',
        body,
        headers: req.headers as Record<string, string>,
      };

      // Route-specific canned responses
      const url = req.url ?? '';
      res.setHeader('Content-Type', 'application/json');

      if (url.includes('/v1/models')) {
        res.end(JSON.stringify({ data: [{ id: 'deepseek-v3', object: 'model' }] }));
      } else if (url.includes('/v1/chat/completions')) {
        res.end(JSON.stringify({
          id: 'chat-1',
          object: 'chat.completion',
          choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }));
      } else if (url.includes('/v1/passports') && req.method === 'POST') {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          passport_id: 'passport_abc',
          passport: {
            passport_id: 'passport_abc', name: 'Test', type: 'model',
            owner: '0xowner123', status: 'active',
            created_at: 1700000000, updated_at: 1700000000,
          },
        }));
        return;
      } else if (url.includes('/v1/passports/')) {
        res.end(JSON.stringify({
          success: true,
          passport: {
            passport_id: 'passport_abc', name: 'Test', type: 'model',
            owner: '0xowner123', status: 'active',
            created_at: 1700000000, updated_at: 1700000000,
          },
        }));
      } else if (url.includes('/v2/escrow/create')) {
        res.end(JSON.stringify({ success: true, escrowId: 'escrow_123' }));
      } else if (url.includes('/v2/escrow/release')) {
        res.end(JSON.stringify({ success: true, released: true }));
      } else if (url.includes('/v2/escrow/dispute')) {
        res.end(JSON.stringify({ success: true, disputed: true }));
      } else if (url.includes('/v2/escrow/')) {
        res.end(JSON.stringify({ success: true, escrow: { escrowId: 'escrow_123', status: 'Created' } }));
      } else if (url.includes('/v2/disputes/open')) {
        res.end(JSON.stringify({ success: true, disputeId: 'dispute_123' }));
      } else if (url.includes('/v2/disputes') && url.includes('/evidence')) {
        res.end(JSON.stringify({ success: true }));
      } else if (url.includes('/v2/disputes') && url.includes('/resolve')) {
        res.end(JSON.stringify({ success: true, outcome: 'beneficiary' }));
      } else if (url.includes('/v2/disputes') && url.includes('/appeal')) {
        res.end(JSON.stringify({ success: true }));
      } else if (url.includes('/v2/disputes/')) {
        res.end(JSON.stringify({ success: true, dispute: { disputeId: 'dispute_123', status: 'Open' } }));
      } else if (url.includes('/v2/paymaster/sponsor')) {
        res.end(JSON.stringify({ success: true, paymasterAndData: '0x...' }));
      } else if (url.includes('/v2/paymaster/rate')) {
        res.end(JSON.stringify({ success: true, rate: '1000000000', decimals: 9 }));
      } else if (url.includes('/v2/paymaster/estimate')) {
        res.end(JSON.stringify({ success: true, estimatedCostLucid: '100' }));
      } else if (url.includes('/v2/identity/link') && req.method === 'POST') {
        res.end(JSON.stringify({ success: true, link: { linkId: 'link_1' } }));
      } else if (url.includes('/v2/identity/resolve')) {
        res.end(JSON.stringify({ success: true, primaryCaip10: 'eip155:1:0xabc', links: [] }));
      } else if (url.includes('/v2/identity/unlink')) {
        res.end(JSON.stringify({ success: true, deleted: true }));
      } else if (url.includes('/v2/identity/chains')) {
        res.end(JSON.stringify({ success: true, chains: ['eip155:1', 'eip155:8453'] }));
      } else if (url.includes('/v2/tba/create')) {
        res.end(JSON.stringify({ success: true, tbaAddress: '0xtba123' }));
      } else if (url.includes('/v2/tba/')) {
        res.end(JSON.stringify({ success: true, tba: { address: '0xtba123', tokenId: '1' } }));
      } else if (url.includes('/v2/modules/install')) {
        res.end(JSON.stringify({ success: true }));
      } else if (url.includes('/v2/modules/uninstall')) {
        res.end(JSON.stringify({ success: true }));
      } else if (url.includes('/v2/modules/policy/configure')) {
        res.end(JSON.stringify({ success: true }));
      } else if (url.includes('/v2/modules/payout/configure')) {
        res.end(JSON.stringify({ success: true }));
      } else if (url.includes('/v2/modules/')) {
        res.end(JSON.stringify({ success: true, modules: {} }));
      } else if (url.includes('/v2/zkml/prove')) {
        res.end(JSON.stringify({ success: true, proof: { a: '0x1', b: '0x2', c: '0x3' }, publicInputs: [] }));
      } else if (url.includes('/v2/zkml/verify')) {
        res.end(JSON.stringify({ success: true, valid: true }));
      } else if (url.includes('/v2/zkml/register-model')) {
        res.end(JSON.stringify({ success: true }));
      } else if (url.includes('/v2/zkml/models/')) {
        res.end(JSON.stringify({ success: true, models: {} }));
      } else if (url.includes('/health')) {
        res.end(JSON.stringify({
          status: 'healthy',
          timestamp: '2024-01-01T00:00:00Z',
          uptime: 1000,
          version: '1.0.0',
          dependencies: { db: { status: 'healthy' } },
        }));
      } else {
        res.end(JSON.stringify({ success: true }));
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      baseURL = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  resetLastRequest();
});

// ─── SDK INSTANTIATION ──────────────────────────────────────────────

describe('SDK Instantiation', () => {
  it('creates LucidSDK with serverURL', () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    expect(sdk).toBeInstanceOf(LucidSDK);
  });

  it('creates via createLucidSDK factory', () => {
    const sdk = createLucidSDK({ apiKey: 'test-key', chain: 'base', serverURL: baseURL });
    expect(sdk).toBeInstanceOf(LucidSDK);
  });

  it('exposes all resource namespaces', () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    expect(sdk.passports).toBeDefined();
    expect(sdk.run).toBeDefined();
    expect(sdk.receipts).toBeDefined();
    expect(sdk.epochs).toBeDefined();
    expect(sdk.escrow).toBeDefined();
    expect(sdk.disputes).toBeDefined();
    expect(sdk.paymaster).toBeDefined();
    expect(sdk.identity).toBeDefined();
    expect(sdk.tba).toBeDefined();
    expect(sdk.modules).toBeDefined();
    expect(sdk.zkML).toBeDefined();
    expect(sdk.health).toBeDefined();
    expect(sdk.agents).toBeDefined();
    expect(sdk.compute).toBeDefined();
    expect(sdk.match).toBeDefined();
    expect(sdk.payouts).toBeDefined();
    expect(sdk.shares).toBeDefined();
  });
});

// ─── V1 ENDPOINTS ───────────────────────────────────────────────────

describe('V1 Endpoints', () => {
  it('POST /v1/chat/completions', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    const result = await sdk.run.chatCompletions({
      body: {
        model: 'deepseek-v3',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v1/chat/completions');
    expect(result.choices).toHaveLength(1);
    expect(result.choices![0]!.message!.content).toBe('Hello!');
  });

  it('POST /v1/passports', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.passports.create({
      name: 'Test Model',
      type: 'model',
      owner: '0xowner123',
      metadata: { framework: 'pytorch' },
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v1/passports');
    const body = JSON.parse(lastRequest.body);
    expect(body.name).toBe('Test Model');
    expect(body.type).toBe('model');
    expect(body.owner).toBe('0xowner123');
  });

  it('GET /v1/passports/:id', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.passports.get({ passportId: 'passport_abc' });

    expect(lastRequest.method).toBe('GET');
    expect(lastRequest.url).toContain('/v1/passports/passport_abc');
  });
});

// ─── V2 ESCROW ──────────────────────────────────────────────────────

describe('V2 Escrow', () => {
  it('POST /v2/escrow/create', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.escrow.create({
      chainId: 'base',
      beneficiary: '0xabc',
      token: '0xtoken',
      amount: '100',
      duration: 3600,
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/escrow/create');
    const body = JSON.parse(lastRequest.body);
    expect(body.chainId).toBe('base');
    expect(body.beneficiary).toBe('0xabc');
  });

  it('POST /v2/escrow/release', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.escrow.release({
      chainId: 'base',
      escrowId: 'escrow_123',
      receiptHash: '0xhash',
      signature: '0xsig',
      signerPubkey: '0xpub',
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/escrow/release');
    const body = JSON.parse(lastRequest.body);
    expect(body.escrowId).toBe('escrow_123');
  });

  it('POST /v2/escrow/dispute', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.escrow.dispute({
      chainId: 'base',
      escrowId: 'escrow_123',
      reason: 'bad service',
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/escrow/dispute');
  });

  it('GET /v2/escrow/:chainId/:escrowId', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.escrow.get({ chainId: 'base', escrowId: 'escrow_123' });

    expect(lastRequest.method).toBe('GET');
    expect(lastRequest.url).toBe('/v2/escrow/base/escrow_123');
  });
});

// ─── V2 DISPUTES ────────────────────────────────────────────────────

describe('V2 Disputes', () => {
  it('POST /v2/disputes/open', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.disputes.open({
      chainId: 'base',
      escrowId: 'escrow_123',
      reason: 'fraud',
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/disputes/open');
  });

  it('POST /v2/disputes/:id/evidence', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.disputes.submitEvidence({
      disputeId: 'dispute_123',
      body: { chainId: 'base' },
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/disputes/dispute_123/evidence');
  });

  it('POST /v2/disputes/:id/resolve', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.disputes.resolve({
      disputeId: 'dispute_123',
      body: { chainId: 'base' },
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/disputes/dispute_123/resolve');
  });

  it('GET /v2/disputes/:chainId/:disputeId', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.disputes.get({ chainId: 'base', disputeId: 'dispute_123' });

    expect(lastRequest.method).toBe('GET');
    expect(lastRequest.url).toBe('/v2/disputes/base/dispute_123');
  });
});

// ─── V2 PAYMASTER ───────────────────────────────────────────────────

describe('V2 Paymaster', () => {
  it('POST /v2/paymaster/sponsor', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.paymaster.sponsor({
      chainId: 'base',
      userOp: { sender: '0xabc', callData: '0x' },
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/paymaster/sponsor');
  });

  it('GET /v2/paymaster/rate/:chainId', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.paymaster.getRate({ chainId: 'base' });

    expect(lastRequest.method).toBe('GET');
    expect(lastRequest.url).toBe('/v2/paymaster/rate/base');
  });

  it('POST /v2/paymaster/estimate', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.paymaster.estimate({
      chainId: 'base',
      userOp: { sender: '0xabc', callData: '0x' },
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/paymaster/estimate');
  });
});

// ─── V2 IDENTITY ────────────────────────────────────────────────────

describe('V2 Identity', () => {
  it('POST /v2/identity/link', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.identity.link({
      primaryCaip10: 'eip155:1:0xabc',
      linkedCaip10: 'eip155:8453:0xdef',
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/identity/link');
  });

  it('POST /v2/identity/resolve', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.identity.resolve({
      caip10: 'eip155:1:0xabc',
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/identity/resolve');
  });

  it('POST /v2/identity/unlink', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.identity.unlink({
      primaryCaip10: 'eip155:1:0xabc',
      linkedCaip10: 'eip155:8453:0xdef',
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/identity/unlink');
  });
});

// ─── V2 TBA ─────────────────────────────────────────────────────────

describe('V2 TBA', () => {
  it('POST /v2/tba/create', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.tba.create({
      chainId: 'base',
      tokenId: '1',
      tokenContract: '0xnft',
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/tba/create');
  });

  it('GET /v2/tba/:chainId/:tokenId', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.tba.get({ chainId: 'base', tokenId: '1', tokenContract: '0xnft' });

    expect(lastRequest.method).toBe('GET');
    expect(lastRequest.url).toContain('/v2/tba/base/1');
  });
});

// ─── V2 MODULES ─────────────────────────────────────────────────────

describe('V2 Modules', () => {
  it('POST /v2/modules/install', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.modules.install({
      chainId: 'base',
      account: '0xtba',
      moduleType: 'validator',
      moduleAddress: '0xmodule',
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/modules/install');
  });

  it('POST /v2/modules/uninstall', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.modules.uninstall({
      chainId: 'base',
      account: '0xtba',
      moduleType: 'validator',
      moduleAddress: '0xmodule',
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/modules/uninstall');
  });

  it('GET /v2/modules/:chainId/:account', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.modules.list({ chainId: 'base', account: '0xtba' });

    expect(lastRequest.method).toBe('GET');
    expect(lastRequest.url).toBe('/v2/modules/base/0xtba');
  });

  it('POST /v2/modules/policy/configure', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.modules.configurePolicy({
      chainId: 'base',
      account: '0xtba',
      policyHashes: ['0xpolicy1'],
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/modules/policy/configure');
  });

  it('POST /v2/modules/payout/configure', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.modules.configurePayout({
      chainId: 'base',
      account: '0xtba',
      recipients: ['0xa', '0xb'],
      basisPoints: [7000, 3000],
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/modules/payout/configure');
  });
});

// ─── V2 ZKML ────────────────────────────────────────────────────────

describe('V2 zkML', () => {
  it('POST /v2/zkml/prove', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.zkML.prove({
      modelId: 'model_1',
      inputHash: '0xinput',
      outputHash: '0xoutput',
      policyHash: '0xpolicy',
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/zkml/prove');
  });

  it('POST /v2/zkml/verify', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.zkML.verify({
      chainId: 'base',
      proof: { a: '0x1', b: '0x2', c: '0x3' },
      receiptHash: '0xreceipt',
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/zkml/verify');
  });

  it('POST /v2/zkml/register-model', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.zkML.registerModel({
      chainId: 'base',
      modelHash: '0xmodel',
      verifyingKey: '0xvk123',
    });

    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/v2/zkml/register-model');
  });

  it('GET /v2/zkml/models/:chainId', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.zkML.listModels({ chainId: 'base' });

    expect(lastRequest.method).toBe('GET');
    expect(lastRequest.url).toBe('/v2/zkml/models/base');
  });
});

// ─── DEFAULT CHAIN HOOK ─────────────────────────────────────────────

describe('Default Chain Hook', () => {
  it('passes factory chain through to v2 POST requests', async () => {
    const sdk = createLucidSDK({ apiKey: 'test', chain: 'base', serverURL: baseURL });
    await sdk.escrow.create({
      chainId: 'base',
      beneficiary: '0xabc',
      token: '0xtoken',
      amount: '100',
      duration: 3600,
    });

    expect(lastRequest.method).toBe('POST');
    const body = JSON.parse(lastRequest.body);
    expect(body.chainId).toBe('base');
  });

  it('does not override explicit chainId', async () => {
    const sdk = createLucidSDK({ apiKey: 'test', chain: 'base', serverURL: baseURL });
    await sdk.escrow.create({
      chainId: 'ethereum-sepolia',
      beneficiary: '0xabc',
      token: '0xtoken',
      amount: '100',
      duration: 3600,
    });

    const body = JSON.parse(lastRequest.body);
    expect(body.chainId).toBe('ethereum-sepolia');
  });

  it('does not inject into v1 requests', async () => {
    const sdk = createLucidSDK({ apiKey: 'test', chain: 'base', serverURL: baseURL });
    await sdk.passports.create({
      name: 'Test',
      type: 'model',
      owner: '0xowner',
      metadata: { framework: 'pytorch' },
    });

    const body = JSON.parse(lastRequest.body);
    expect(body.chainId).toBeUndefined();
  });
});

// ─── AUTH ────────────────────────────────────────────────────────────

describe('Authentication', () => {
  it('sends Bearer token in Authorization header', async () => {
    const sdk = createLucidSDK({ apiKey: 'lk_test_abc123', serverURL: baseURL });
    await sdk.health.checkSystemHealth();

    expect(lastRequest.headers['authorization']).toBe('Bearer lk_test_abc123');
  });

  it('works without API key', async () => {
    const sdk = new LucidSDK({ serverURL: baseURL });
    await sdk.health.checkSystemHealth();

    // Should not throw, auth is optional
    expect(lastRequest.method).toBe('GET');
  });
});

// ─── AI PROVIDER ────────────────────────────────────────────────────

describe('AI Provider', () => {
  it('createLucidProvider exports exist', async () => {
    const { createLucidProvider, lucid } = await import('../ai.js');
    expect(typeof createLucidProvider).toBe('function');
    expect(lucid).toBeDefined();
  });

  it('createLucidProvider creates a provider function', async () => {
    const { createLucidProvider } = await import('../ai.js');
    const provider = createLucidProvider({ apiKey: 'test', baseURL });
    expect(typeof provider).toBe('function');
  });
});
