+ import http from 'http';
+ import { verifyHeliusSignature, parseHeliusEvent } from './heliusHelpers';
+ import { upsertMemoryMap } from './memoryWallet';
+
+ const PORT = 4000;
+
+ const server = http.createServer(async (req, res) => {
+   if (req.method !== 'POST') {
+     res.writeHead(404);
+     return res.end();
+   }
+   const chunks: Buffer[] = [];
+   for await (const chunk of req) chunks.push(chunk as Buffer);
+   const body = Buffer.concat(chunks);
+
+   // Validate Helius signature header
+   if (!verifyHeliusSignature(req.headers, body)) {
+     res.writeHead(401);
+     return res.end('invalid signature');
+   }
+
+   const event = parseHeliusEvent(body.toString());
+   // Example: if it's an accountUpdate for our PDA:
+   if (event.type === 'accountUpdate' && event.account === event.pda) {
+     await upsertMemoryMap({
+       authority: event.authority,
+       rootHex:   event.data.merkle_root,
+     });
+     console.log('✅ Indexed ThoughtEpoch update', event);
+   }
+
+   res.writeHead(200);
+   res.end('ok');
+ });
+
+ server.listen(PORT, () => {
+   console.log(`🔔 Helius indexer listening on http://localhost:${PORT}`);
+ });
