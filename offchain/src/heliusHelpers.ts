import crypto from 'crypto';
import http from 'http';

/** Verify Helius webhook using their X-HEL apikey and signature headers */
export function verifyHeliusSignature(headers: http.IncomingHttpHeaders, body: Buffer): boolean {
  const sig = headers['x-helius-signature'] as string;
  const secret = process.env.HELIUS_WEBHOOK_SECRET || '';
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return sig === expected;
}

/** Parse the JSON body into a structured event */
export function parseHeliusEvent(raw: string): any {
  const payload = JSON.parse(raw);
  // { type: 'accountUpdate', pda, account, data: { merkle_root, authority } }
  return payload;
}
