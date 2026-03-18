// src/cli/oauth-callback.ts
import http from 'http';
import { URL } from 'url';

/**
 * Start a temporary localhost server to receive OAuth callback.
 * Returns the authorization code or token from the callback URL.
 */
export function waitForOAuthCallback(port: number = 0): Promise<{ code?: string; token?: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const addr = server.address() as { port: number };
      const url = new URL(req.url || '/', `http://localhost:${addr?.port || port}`);
      const code = url.searchParams.get('code');
      const token = url.searchParams.get('token');
      const error = url.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (error) {
        res.end('<html><body><h2>Authentication failed</h2><p>You can close this window.</p></body></html>');
        server.close();
        resolve({ error });
      } else {
        res.end('<html><body><h2>Authenticated!</h2><p>You can close this window and return to the terminal.</p></body></html>');
        server.close();
        resolve({ code: code || undefined, token: token || undefined });
      }
    });

    server.listen(port, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      (server as any)._resolvedPort = addr.port;
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth callback timed out after 2 minutes'));
    }, 120000);
  });
}

export function getCallbackPort(server: http.Server): number {
  return (server.address() as { port: number })?.port || 0;
}
