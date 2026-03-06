import { requirePaymentAuth } from '../paymentAuth';
import type { Request, Response, NextFunction } from 'express';

describe('paymentAuth middleware', () => {
  const mockNext = jest.fn() as NextFunction;
  const mockRes = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 402 when no payment header present', async () => {
    const req = { headers: {} } as Request;
    const middleware = requirePaymentAuth();

    await middleware(req, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockNext).not.toHaveBeenCalled();
    const jsonArg = (mockRes.json as jest.Mock).mock.calls[0][0];
    expect(jsonArg.error).toBe('Payment Required');
    expect(jsonArg.methods).toBeDefined();
    expect(jsonArg.methods.length).toBeGreaterThan(0);
  });

  it('should return 402 with malformed grant header', async () => {
    const req = { headers: { 'x-payment-grant': 'not-valid-base64-json!!!' } } as unknown as Request;
    const middleware = requirePaymentAuth();

    await middleware(req, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockNext).not.toHaveBeenCalled();
  });
});
