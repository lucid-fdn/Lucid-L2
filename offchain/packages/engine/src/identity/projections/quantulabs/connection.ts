export class QuantuLabsConnection {
  private sdk: any = null;
  readonly capabilities: { identityRegistration: boolean; reputation: boolean };

  constructor() {
    const sdk = this.getSDK();
    this.capabilities = {
      identityRegistration: typeof sdk?.register === 'function',
      reputation: true,
    };
  }

  getSDK(): any {
    if (this.sdk) return this.sdk;
    try {
      const { SolanaSDK } = require('8004-solana');
      this.sdk = new SolanaSDK();
    } catch {
      this.sdk = null;
    }
    return this.sdk;
  }
}

let _conn: QuantuLabsConnection | null = null;
export function getQuantuLabsConnection(): QuantuLabsConnection {
  if (!_conn) _conn = new QuantuLabsConnection();
  return _conn;
}
export function resetQuantuLabsConnection(): void { _conn = null; }
