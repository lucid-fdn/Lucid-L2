// offchain/src/__tests__/paymentGateService.test.ts
// Unit tests for PaymentGateService

import { PublicKey, SystemProgram } from '@solana/web3.js';

// Mock dependencies before import
jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');
  return {
    ...actual,
    Connection: jest.fn().mockImplementation(() => ({
      getAccountInfo: jest.fn().mockResolvedValue(null),
      getBalance: jest.fn().mockResolvedValue(1000000000),
      getMinimumBalanceForRentExemption: jest.fn().mockResolvedValue(890880),
    })),
  };
});

jest.mock('@coral-xyz/anchor', () => ({
  AnchorProvider: jest.fn().mockImplementation(() => ({})),
  Program: jest.fn().mockImplementation(() => ({
    methods: {},
    account: {},
  })),
  Wallet: jest.fn().mockImplementation((kp: any) => ({ publicKey: kp.publicKey })),
  setProvider: jest.fn(),
}));

jest.mock('child_process', () => ({
  execSync: jest.fn().mockReturnValue('Keypair Path: /dev/null\n'),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockImplementation((path: string) => {
    if (path.includes('lucid_passports.json')) {
      return JSON.stringify({
        metadata: { address: 'FhoemNdqwPMt8nmX4HT3WpSqUuqeAUXRb7WchAehmSaL' },
        instructions: [],
        accounts: [],
      });
    }
    // Return a valid keypair JSON for keypair loading
    return JSON.stringify(Array.from({ length: 64 }, (_, i) => i));
  }),
}));

describe('PaymentGateService', () => {
  // Re-import after mocks
  let PaymentGateService: any;
  let getPaymentGateService: any;

  beforeAll(() => {
    const mod = require('../../packages/engine/src/payment/stores/paymentGateService');
    PaymentGateService = mod.PaymentGateService;
    getPaymentGateService = mod.getPaymentGateService;
  });

  describe('constructor', () => {
    it('should create service with default options', () => {
      const service = new PaymentGateService();
      expect(service).toBeDefined();
    });

    it('should create service with custom RPC URL', () => {
      const service = new PaymentGateService({
        rpcUrl: 'https://api.devnet.solana.com',
        commitment: 'confirmed',
      });
      expect(service).toBeDefined();
    });

    it('should create service with custom program ID', () => {
      const service = new PaymentGateService({
        programId: 'FhoemNdqwPMt8nmX4HT3WpSqUuqeAUXRb7WchAehmSaL',
      });
      expect(service).toBeDefined();
    });
  });

  describe('PDA derivation', () => {
    let service: any;
    const testPassportPDA = new PublicKey('11111111111111111111111111111112');
    const testPayer = new PublicKey('11111111111111111111111111111113');

    beforeEach(() => {
      service = new PaymentGateService();
    });

    it('should derive PaymentGate PDA deterministically', () => {
      const [pda1, bump1] = service.derivePaymentGatePDA(testPassportPDA);
      const [pda2, bump2] = service.derivePaymentGatePDA(testPassportPDA);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
      expect(PublicKey.isOnCurve(pda1)).toBe(false); // PDAs are off-curve
    });

    it('should derive Vault PDA deterministically', () => {
      const [pda1] = service.deriveVaultPDA(testPassportPDA);
      const [pda2] = service.deriveVaultPDA(testPassportPDA);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
    });

    it('should derive AccessReceipt PDA deterministically', () => {
      const [pda1] = service.deriveAccessReceiptPDA(testPassportPDA, testPayer);
      const [pda2] = service.deriveAccessReceiptPDA(testPassportPDA, testPayer);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
    });

    it('should derive different PDAs for different passports', () => {
      const passport1 = new PublicKey('11111111111111111111111111111112');
      const passport2 = new PublicKey('11111111111111111111111111111114');

      const [pda1] = service.derivePaymentGatePDA(passport1);
      const [pda2] = service.derivePaymentGatePDA(passport2);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });

    it('should derive different AccessReceipt PDAs for different payers', () => {
      const payer1 = new PublicKey('11111111111111111111111111111113');
      const payer2 = new PublicKey('11111111111111111111111111111114');

      const [pda1] = service.deriveAccessReceiptPDA(testPassportPDA, payer1);
      const [pda2] = service.deriveAccessReceiptPDA(testPassportPDA, payer2);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      // Reset module to test singleton
      jest.resetModules();
      jest.doMock('child_process', () => ({ execSync: jest.fn().mockReturnValue('Keypair Path: /dev/null\n') }));
      jest.doMock('fs', () => ({
        existsSync: jest.fn().mockReturnValue(true),
        readFileSync: jest.fn().mockReturnValue(JSON.stringify(Array.from({ length: 64 }, (_, i) => i))),
      }));

      const mod = require('../../packages/engine/src/payment/stores/paymentGateService');
      const instance1 = mod.getPaymentGateService();
      const instance2 = mod.getPaymentGateService();
      expect(instance1).toBe(instance2);
    });
  });
});
