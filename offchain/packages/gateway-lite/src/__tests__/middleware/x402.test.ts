/**
 * Tests for the x402 payment middleware (v2 rewrite).
 *
 * Validates backward compatibility with v1 API and new v2 features.
 */

import express, { Request, Response } from 'express';
import request from 'supertest';
import {
  requirePayment,
  setX402Config,
  getX402Config,
  isProofSpent,
  getSpentProofsCount,
  parseUSDCAmount,
  resetSpentProofs,
} from '../../middleware/x402';
import type { RequirePaymentOptions } from '../../middleware/x402';

// ---------------------------------------------------------------------------
// Helper: build a minimal Express app with x402 middleware on /protected
// ---------------------------------------------------------------------------

function buildApp(optsOrPrice?: string | RequirePaymentOptions) {
  const app = express();
  app.use(express.json());
  app.get('/protected', requirePayment(optsOrPrice), (_req: Request, res: Response) => {
    res.json({ ok: true });
  });
  app.get('/open', (_req: Request, res: Response) => {
    res.json({ open: true });
  });
  return app;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetSpentProofs();
  // Default: disabled so tests opt-in to enabling
  setX402Config({
    enabled: false,
    paymentAddress: '0xTestRecipient',
    defaultPriceUSDC: '0.01',
    paymentChain: 'base-sepolia',
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    maxProofAge: 300,
  });
});

// =============================================================================
// 1. Disabled middleware passes through
// =============================================================================

describe('x402 middleware (disabled)', () => {
  it('passes through when X402_ENABLED is false', async () => {
    const app = buildApp('0.01');
    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// =============================================================================
// 2. Backward compatibility: requirePayment overloads
// =============================================================================

describe('requirePayment backward compatibility', () => {
  it('requirePayment() with no args returns a middleware function', () => {
    const mw = requirePayment();
    expect(typeof mw).toBe('function');
    expect(mw.length).toBe(3); // (req, res, next)
  });

  it('requirePayment("0.01") with string arg returns a middleware function', () => {
    const mw = requirePayment('0.01');
    expect(typeof mw).toBe('function');
    expect(mw.length).toBe(3);
  });

  it('requirePayment({ priceUSDC: "0.01" }) with options returns a middleware function', () => {
    const mw = requirePayment({ priceUSDC: '0.01' });
    expect(typeof mw).toBe('function');
    expect(mw.length).toBe(3);
  });

  it('requirePayment({ priceUSDC: "0.05", facilitator: "coinbase" }) accepts facilitator option', () => {
    const mw = requirePayment({ priceUSDC: '0.05', facilitator: 'coinbase' });
    expect(typeof mw).toBe('function');
  });
});

// =============================================================================
// 3. 402 response format (v2)
// =============================================================================

describe('x402 middleware (enabled, no proof)', () => {
  beforeEach(() => {
    setX402Config({ enabled: true });
  });

  it('returns 402 with v2 format when no payment proof is provided', async () => {
    const app = buildApp('0.01');
    const res = await request(app).get('/protected');

    expect(res.status).toBe(402);
    expect(res.body.error).toBe('Payment Required');

    // v2 block
    const x402 = res.body.x402;
    expect(x402).toBeDefined();
    expect(x402.version).toBe('2');
    expect(x402.facilitator).toBe('direct');
    expect(x402.description).toBe('API access');
    expect(typeof x402.expires).toBe('number');

    // payment sub-block
    const payment = x402.payment;
    expect(payment).toBeDefined();
    expect(payment.chain).toBe('base-sepolia');
    expect(payment.token).toBe('USDC');
    expect(payment.tokenAddress).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
    expect(payment.amount).toBe('10000'); // 0.01 USDC = 10000 micro
    expect(payment.recipient).toBe('0xTestRecipient');
    expect(payment.facilitator).toBe('direct');
    expect(payment.scheme).toBe('exact');
  });

  it('returns 402 with correct amount for custom price', async () => {
    const app = buildApp('1.50');
    const res = await request(app).get('/protected');

    expect(res.status).toBe(402);
    expect(res.body.x402.payment.amount).toBe('1500000'); // 1.50 USDC
  });

  it('returns 402 using options object price', async () => {
    const app = buildApp({ priceUSDC: '0.05' });
    const res = await request(app).get('/protected');

    expect(res.status).toBe(402);
    expect(res.body.x402.payment.amount).toBe('50000'); // 0.05 USDC
  });

  it('uses custom facilitator name in response', async () => {
    const app = buildApp({ priceUSDC: '0.01', facilitator: 'coinbase' });
    const res = await request(app).get('/protected');

    expect(res.status).toBe(402);
    expect(res.body.x402.facilitator).toBe('coinbase');
    expect(res.body.x402.payment.facilitator).toBe('coinbase');
  });
});

// =============================================================================
// 4. skipIf option
// =============================================================================

describe('skipIf option', () => {
  beforeEach(() => {
    setX402Config({ enabled: true });
  });

  it('skips payment when skipIf returns true', async () => {
    const app = buildApp({
      priceUSDC: '0.01',
      skipIf: async (_req) => true,
    });
    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('requires payment when skipIf returns false', async () => {
    const app = buildApp({
      priceUSDC: '0.01',
      skipIf: async (_req) => false,
    });
    const res = await request(app).get('/protected');
    expect(res.status).toBe(402);
  });

  it('continues with payment check when skipIf throws', async () => {
    const app = buildApp({
      priceUSDC: '0.01',
      skipIf: async () => { throw new Error('boom'); },
    });
    const res = await request(app).get('/protected');
    expect(res.status).toBe(402);
  });
});

// =============================================================================
// 5. setX402Config / getX402Config
// =============================================================================

describe('setX402Config / getX402Config', () => {
  it('setX402Config updates config and getX402Config reflects changes', () => {
    setX402Config({ defaultPriceUSDC: '5.00', paymentChain: 'base' });
    const cfg = getX402Config();
    expect(cfg.defaultPriceUSDC).toBe('5.00');
    expect(cfg.paymentChain).toBe('base');
    // Other fields remain
    expect(cfg.enabled).toBe(false);
  });

  it('getX402Config returns a copy (not a reference)', () => {
    const a = getX402Config();
    const b = getX402Config();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// =============================================================================
// 6. parseUSDCAmount
// =============================================================================

describe('parseUSDCAmount', () => {
  it('parses whole USDC amounts', () => {
    expect(parseUSDCAmount('1')).toBe(1000000n);
    expect(parseUSDCAmount('100')).toBe(100000000n);
  });

  it('parses fractional USDC amounts', () => {
    expect(parseUSDCAmount('0.01')).toBe(10000n);
    expect(parseUSDCAmount('0.000001')).toBe(1n);
    expect(parseUSDCAmount('1.50')).toBe(1500000n);
  });

  it('pads short decimals', () => {
    expect(parseUSDCAmount('0.1')).toBe(100000n);
  });

  it('truncates excess decimals', () => {
    expect(parseUSDCAmount('0.0000019')).toBe(1n);
  });
});

// =============================================================================
// 7. isProofSpent / getSpentProofsCount / resetSpentProofs
// =============================================================================

describe('spent proofs (sync backward compat)', () => {
  it('isProofSpent returns false for unknown hash', () => {
    expect(isProofSpent('0xabc')).toBe(false);
  });

  it('getSpentProofsCount returns 0 after reset', () => {
    expect(getSpentProofsCount()).toBe(0);
  });

  it('resetSpentProofs clears the cache', () => {
    // We cannot easily mark proofs as spent without going through the full
    // middleware flow, but we can verify reset clears the state.
    resetSpentProofs();
    expect(getSpentProofsCount()).toBe(0);
  });
});

// =============================================================================
// 8. Middleware returns function (type checks)
// =============================================================================

describe('requirePayment return type', () => {
  it('all overloads return async middleware (3-arity function)', () => {
    expect(requirePayment().length).toBe(3);
    expect(requirePayment('0.01').length).toBe(3);
    expect(requirePayment({}).length).toBe(3);
    expect(requirePayment({ priceUSDC: '0.01', dynamic: true }).length).toBe(3);
  });
});
