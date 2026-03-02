# @lucid/react

React hooks for the Lucid SDK.

## Install

```bash
npm install @lucid/react @lucid/sdk
```

### Peer Dependencies

- `react` >= 18
- `@lucid/sdk`

## Setup

Wrap your app with `LucidProvider`:

```tsx
import { LucidProvider } from '@lucid/react';

function App() {
  return (
    <LucidProvider apiKey="lk_live_..." chain="base">
      <MyApp />
    </LucidProvider>
  );
}
```

### Provider Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `apiKey` | `string` | Yes | Lucid API key |
| `chain` | `string` | No | Default chain for v2 endpoints |
| `serverURL` | `string` | No | Override API base URL |

## Hooks

### useChat

Chat completion with message state management.

```tsx
import { useChat } from '@lucid/react';

function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isStreaming, error } = useChat({
    model: 'deepseek-v3',
  });

  return (
    <div>
      {messages.map((m, i) => (
        <div key={i}>{m.role}: {m.content}</div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} disabled={isStreaming} />
        <button type="submit">Send</button>
      </form>
      {error && <p>{error.message}</p>}
    </div>
  );
}
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | `string` | `'deepseek-v3'` | Model to use for completions |
| `initialMessages` | `ChatMessage[]` | `[]` | Pre-populate conversation |

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `messages` | `ChatMessage[]` | Conversation history |
| `input` | `string` | Current input value |
| `handleInputChange` | `(e) => void` | Bind to input `onChange` |
| `handleSubmit` | `(e?) => void` | Bind to form `onSubmit` |
| `isStreaming` | `boolean` | True while waiting for response |
| `error` | `Error \| null` | Last error, if any |
| `setMessages` | `Dispatch` | Manually set messages |
| `setInput` | `Dispatch` | Manually set input |

### usePassport

Fetch a passport by ID.

```tsx
import { usePassport } from '@lucid/react';

function PassportCard({ id }: { id: string }) {
  const { data, error, isLoading } = usePassport(id);

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Set to `false` to skip fetching |

### useEscrow

Fetch escrow details by ID with optional polling.

```tsx
import { useEscrow } from '@lucid/react';

function EscrowStatus({ id }: { id: string }) {
  const { data, error, isLoading } = useEscrow(id, {
    refetchInterval: 5000,
  });

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `refetchInterval` | `number` | -- | Poll interval in ms |
| `enabled` | `boolean` | `true` | Set to `false` to skip fetching |

### useLucid

Direct access to the SDK instance and chain from the provider context.

```tsx
import { useLucid } from '@lucid/react';

function CustomQuery() {
  const { sdk, chain } = useLucid();

  async function listModels() {
    const result = await sdk.passports.searchModels({ available: 'true' });
    console.log(result);
  }

  return <button onClick={listModels}>List Models</button>;
}
```

Throws if used outside of `<LucidProvider>`.
