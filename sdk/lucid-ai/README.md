# @lucid/ai

Vercel AI SDK provider for Lucid.

This is a convenience re-export of `@lucid/sdk/ai`. Use this package if you prefer a standalone import path, or `@lucid/sdk/ai` directly if you already depend on `@lucid/sdk`.

## Install

```bash
npm install @lucid/ai @lucid/sdk @ai-sdk/openai-compatible
```

### Peer Dependencies

- `@lucid/sdk`
- `@ai-sdk/openai-compatible` >= 0.1.0

## Usage

```typescript
import { createLucidProvider } from '@lucid/ai';
import { generateText, streamText } from 'ai';

const lucid = createLucidProvider({ apiKey: 'lk_live_...' });

// Non-streaming
const { text } = await generateText({
  model: lucid('gpt-4o'),
  prompt: 'Explain zero-knowledge proofs',
});

// Streaming
const stream = streamText({
  model: lucid('deepseek-v3'),
  messages: [{ role: 'user', content: 'Hello' }],
});
```

A default instance that reads `LUCID_API_KEY` from the environment is also exported:

```typescript
import { lucid } from '@lucid/ai';

const { text } = await generateText({
  model: lucid('gpt-4o'),
  prompt: 'Hello',
});
```

## API

### `createLucidProvider(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `LUCID_API_KEY` env var | Lucid API key |
| `baseURL` | `string` | `https://api.lucid.foundation` | API base URL |

Returns an OpenAI-compatible provider that works with `generateText`, `streamText`, `generateObject`, `streamObject`, and all other Vercel AI SDK functions.

### `lucid`

Pre-configured default provider instance using `LUCID_API_KEY` from the environment.
