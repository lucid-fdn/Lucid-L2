import request from 'supertest';
import express from 'express';
import walletRoutes, { __setSessionSignerServiceForTests } from '../../../packages/gateway-lite/src/routes/system/walletRoutes';
import { protocolManager } from '../../../packages/gateway-lite/src/protocols/protocolManager';
import { SessionSignerService } from '../../../packages/gateway-lite/src/services/sessionSignerService';

// Mock dependencies
jest.mock('../../../packages/gateway-lite/src/protocols/protocolManager', () => ({
  protocolManager: {
    execute: jest.fn(),
    setCredentialService: jest.fn(),
  },
  ProtocolManager: jest.fn(),
}));
jest.mock('../../../packages/gateway-lite/src/services/sessionSignerService', () => {
  const SessionSignerService = jest.fn().mockImplementation(() => ({
    canSign: jest.fn(),
    updateUsage: jest.fn(),
    logTransaction: jest.fn(),
    createSessionSigner: jest.fn(),
    revokeSessionSigner: jest.fn(),
    listSessionSigners: jest.fn(),
  }));
  return { SessionSignerService };
});

describe('Wallet Routes', () => {
  let app: express.Application;
  let mockProtocolManager: jest.Mocked<typeof protocolManager>;
  let mockSessionSignerService: jest.Mocked<SessionSignerService>;

  beforeEach(() => {
    // Create express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/wallets', walletRoutes);

    // Setup mocks
    mockProtocolManager = protocolManager as jest.Mocked<typeof protocolManager>;
    mockSessionSignerService = new SessionSignerService() as jest.Mocked<SessionSignerService>;

    // Inject the mocked SessionSignerService into the router module.
    __setSessionSignerServiceForTests(mockSessionSignerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    __setSessionSignerServiceForTests(null);
  });

  describe('POST /api/wallets/onboard', () => {
    it('should successfully onboard a new user with wallet and session signer', async () => {
      // Mock successful wallet creation
      mockProtocolManager.execute.mockResolvedValueOnce({
        success: true,
        data: {
          walletId: 'wallet-123',
          address: '0x1234567890abcdef',
          chainType: 'solana'
        }
      });

      // Mock successful session signer creation
      mockProtocolManager.execute.mockResolvedValueOnce({
        success: true,
        data: {
          signerId: 'signer-456',
          expiresAt: new Date(Date.now() + 86400000).toISOString()
        }
      });

      const response = await request(app)
        .post('/api/wallets/onboard')
        .send({
          userId: 'test-user-001',
          chainType: 'solana',
          policies: {
            ttl: 86400,
            maxAmount: '1000000000'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.wallet.walletId).toBe('wallet-123');
      expect(response.body.sessionSigner.signerId).toBe('signer-456');
      expect(mockProtocolManager.execute).toHaveBeenCalledTimes(2);
    });

    it('should return 400 if userId is missing', async () => {
      const response = await request(app)
        .post('/api/wallets/onboard')
        .send({
          chainType: 'solana'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('userId');
    });

    it('should return 400 if chainType is missing', async () => {
      const response = await request(app)
        .post('/api/wallets/onboard')
        .send({
          userId: 'test-user-001'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('chainType');
    });

    it('should handle wallet creation failure', async () => {
      mockProtocolManager.execute.mockResolvedValueOnce({
        success: false,
        error: 'Wallet creation failed'
      });

      const response = await request(app)
        .post('/api/wallets/onboard')
        .send({
          userId: 'test-user-001',
          chainType: 'solana',
          policies: {}
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Wallet creation failed');
    });
  });

  describe('GET /api/wallets/:userId/:chainType', () => {
    it('should retrieve wallet details for a user', async () => {
      mockProtocolManager.execute.mockResolvedValueOnce({
        success: true,
        data: {
          walletId: 'wallet-123',
          address: '0x1234567890abcdef',
          chainType: 'solana'
        }
      });

      const response = await request(app)
        .get('/api/wallets/test-user-001/solana');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.wallet.walletId).toBe('wallet-123');
    });

    it('should return 404 if wallet not found', async () => {
      mockProtocolManager.execute.mockResolvedValueOnce({
        success: false,
        error: 'Wallet not found'
      });

      const response = await request(app)
        .get('/api/wallets/nonexistent-user/solana');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/wallets/:walletId/sign-transaction', () => {
    beforeEach(() => {
      // Mock SessionSignerService methods
      mockSessionSignerService.canSign = jest.fn();
      mockSessionSignerService.updateUsage = jest.fn();
      mockSessionSignerService.logTransaction = jest.fn();
    });

    it('should successfully sign and send a transaction', async () => {
      // Mock policy check - allow transaction
      mockSessionSignerService.canSign.mockResolvedValueOnce({
        allowed: true,
        signer: {
          id: 'signer-123',
          wallet_id: 'wallet-123',
          user_id: 'test-user-001'
        }
      });

      // Mock successful transaction signing
      mockProtocolManager.execute.mockResolvedValueOnce({
        success: true,
        data: {
          signature: 'tx-signature-123',
          hash: 'tx-hash-456'
        }
      });

      const response = await request(app)
        .post('/api/wallets/wallet-123/sign-transaction')
        .send({
          userId: 'test-user-001',
          transaction: 'BASE64_ENCODED_TX',
          chainType: 'solana',
          n8nWorkflowId: 'workflow-789',
          n8nExecutionId: 'exec-012'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.signature).toBe('tx-signature-123');
    });

    it('should deny transaction if amount exceeds limit', async () => {
      // Mock policy check - deny transaction
      mockSessionSignerService.canSign.mockResolvedValueOnce({
        allowed: false,
        reason: 'Transaction amount exceeds limit',
        signer: {
          id: 'signer-123'
        }
      });

      mockSessionSignerService.logTransaction.mockResolvedValueOnce(undefined);

      const response = await request(app)
        .post('/api/wallets/wallet-123/sign-transaction')
        .send({
          userId: 'test-user-001',
          transaction: 'BASE64_ENCODED_TX',
          chainType: 'solana'
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('exceeds limit');
      expect(mockSessionSignerService.logTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'denied',
          denialReason: 'Transaction amount exceeds limit'
        })
      );
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/wallets/wallet-123/sign-transaction')
        .send({
          userId: 'test-user-001'
          // Missing transaction and chainType
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    it('should log transaction audit trail on success', async () => {
      mockSessionSignerService.canSign.mockResolvedValueOnce({
        allowed: true,
        signer: {
          id: 'signer-123',
          wallet_id: 'wallet-123',
          user_id: 'test-user-001'
        }
      });

      mockProtocolManager.execute.mockResolvedValueOnce({
        success: true,
        data: {
          signature: 'tx-sig-789'
        }
      });

      mockSessionSignerService.updateUsage.mockResolvedValueOnce(undefined);
      mockSessionSignerService.logTransaction.mockResolvedValueOnce(undefined);

      await request(app)
        .post('/api/wallets/wallet-123/sign-transaction')
        .send({
          userId: 'test-user-001',
          transaction: { data: 'BASE64_TX', amount: '100000000' },
          chainType: 'solana',
          n8nWorkflowId: 'workflow-123'
        });

      expect(mockSessionSignerService.logTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          transactionSignature: 'tx-sig-789',
          n8nWorkflowId: 'workflow-123'
        })
      );
    });
  });

  describe('DELETE /api/wallets/:walletId/session-signers/:signerId', () => {
    it('should successfully revoke a session signer', async () => {
      mockProtocolManager.execute.mockResolvedValueOnce({
        success: true,
        data: { revoked: true }
      });

      const response = await request(app)
        .delete('/api/wallets/wallet-123/session-signers/signer-456')
        .send({
          userId: 'test-user-001'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockProtocolManager.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          protocolId: 'privy',
          operationId: 'revokeSessionSigner',
          parameters: {
            walletId: 'wallet-123',
            signerId: 'signer-456'
          }
        })
      );
    });

    it('should return 400 if userId is missing', async () => {
      const response = await request(app)
        .delete('/api/wallets/wallet-123/session-signers/signer-456')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('userId');
    });
  });

  describe('GET /api/wallets/:walletId/session-signers', () => {
    it('should list all session signers for a wallet', async () => {
      mockProtocolManager.execute.mockResolvedValueOnce({
        success: true,
        data: {
          signers: [
            {
              id: 'signer-1',
              expiresAt: '2025-02-01T00:00:00Z'
            },
            {
              id: 'signer-2',
              expiresAt: '2025-02-02T00:00:00Z'
            }
          ]
        }
      });

      // The handler internally calls SessionSignerService via protocolManager; ensure the mock is set.
      // (This is already handled by __setSessionSignerServiceForTests in beforeEach)

      const response = await request(app)
        .get('/api/wallets/wallet-123/session-signers')
        .query({ userId: 'test-user-001' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.signers).toHaveLength(2);
    });

    it('should return 400 if userId query parameter is missing', async () => {
      const response = await request(app)
        .get('/api/wallets/wallet-123/session-signers');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('userId');
    });
  });

  describe('GET /api/wallets/options/:optionType', () => {
    it('should return chain options', async () => {
      const response = await request(app)
        .get('/api/wallets/options/chains');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.options).toContainEqual(
        expect.objectContaining({ name: 'Solana', value: 'solana' })
      );
    });

    it('should return allowed programs options', async () => {
      const response = await request(app)
        .get('/api/wallets/options/allowedPrograms');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.options).toContainEqual(
        expect.objectContaining({ 
          name: 'Jupiter Aggregator',
          value: 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB'
        })
      );
    });

    it('should return policy templates', async () => {
      const response = await request(app)
        .get('/api/wallets/options/policyTemplates');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.options).toContainEqual(
        expect.objectContaining({
          name: expect.stringContaining('Conservative'),
          value: 'conservative'
        })
      );
    });

    it('should return 404 for unknown option type', async () => {
      const response = await request(app)
        .get('/api/wallets/options/unknown');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });
});
