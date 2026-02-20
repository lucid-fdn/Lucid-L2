/**
 * x402 auto-payment helper.
 *
 * When the LucidLayer API returns HTTP 402, this module handles
 * the payment flow automatically by sending USDC on-chain and
 * retrying the request with the payment proof.
 *
 * Note: Actual payment transaction submission requires a wallet library
 * (e.g., viem, ethers). This module provides the payment flow logic
 * and expects a payTransaction callback for the actual on-chain transfer.
 */

export interface X402PaymentInfo {
  chain: string;
  currency: string;
  amount: string;
  recipient: string;
  usdc_address: string;
}

export type PayTransactionFn = (paymentInfo: X402PaymentInfo) => Promise<string | null>;

/**
 * Create an x402 payment handler.
 *
 * Returns a callback suitable for LucidClient.requestWithPayment().
 * The payTransaction function should:
 * 1. Send a USDC transfer to paymentInfo.recipient for paymentInfo.amount
 * 2. Return the transaction hash on success, or null to skip payment
 */
export function createX402Handler(
  payTransaction: PayTransactionFn,
): (paymentInfo: X402PaymentInfo) => Promise<string | null> {
  return async (paymentInfo: X402PaymentInfo) => {
    try {
      return await payTransaction(paymentInfo);
    } catch (error) {
      console.error('[x402] Payment failed:', error);
      return null;
    }
  };
}

/**
 * Create a no-op x402 handler that logs payment requirements but doesn't pay.
 * Useful for development and testing.
 */
export function createDryRunX402Handler(): (paymentInfo: X402PaymentInfo) => Promise<string | null> {
  return async (paymentInfo: X402PaymentInfo) => {
    console.log('[x402] Payment required (dry-run):', {
      chain: paymentInfo.chain,
      amount: paymentInfo.amount,
      currency: paymentInfo.currency,
      recipient: paymentInfo.recipient,
    });
    return null;
  };
}
