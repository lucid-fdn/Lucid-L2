import { generateText, streamText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import express from 'express';
import crypto from 'crypto';

// --- Configuration (all from env vars) ---
const LUCID_MODEL = process.env.LUCID_MODEL || 'gpt-4o';
const LUCID_PROMPT = process.env.LUCID_PROMPT || 'You are a helpful AI assistant.';
const LUCID_TOOLS = (process.env.LUCID_TOOLS || '').split(',').filter(Boolean);
const LUCID_PASSPORT_ID = process.env.LUCID_PASSPORT_ID || 'unknown';
const LUCID_API_URL = process.env.LUCID_API_URL || 'http://localhost:3001';
const TRUSTGATE_URL = process.env.TRUSTGATE_URL;
const TRUSTGATE_API_KEY = process.env.TRUSTGATE_API_KEY || '';
const MCPGATE_URL = process.env.MCPGATE_URL || '';
const PORT = parseInt(process.env.PORT || '3100');
const RECEIPTS_ENABLED = !!TRUSTGATE_URL && !!LUCID_API_URL;

// --- Inference provider ---
// TrustGate (Lucid Cloud) is the default — enables receipts, reputation, traffic data.
// Any OpenAI-compatible endpoint works as fallback (Ollama, LiteLLM, vLLM, direct provider).
// Without TrustGate: inference works, but no receipts = no reputation = not part of verified network.
if (!TRUSTGATE_URL) {
  console.warn('[Runtime] TRUSTGATE_URL not set. Inference will fail.');
  console.warn('[Runtime] Set TRUSTGATE_URL to any OpenAI-compatible endpoint:');
  console.warn('[Runtime]   TrustGate: https://trustgate.lucid.foundation (recommended — full Lucid stack)');
  console.warn('[Runtime]   Ollama:    http://localhost:11434/v1 (local, free)');
  console.warn('[Runtime]   LiteLLM:   http://localhost:4000 (self-hosted proxy)');
  console.warn('[Runtime]   OpenAI:    https://api.openai.com/v1 (direct)');
}

const provider = createOpenAI({
  baseURL: TRUSTGATE_URL || 'https://api.openai.com/v1',
  apiKey: TRUSTGATE_API_KEY,
});

// --- Receipt creation (automatic when TrustGate is configured, fire-and-forget) ---
async function createReceipt(input: string, output: string, model: string, latencyMs: number) {
  if (!RECEIPTS_ENABLED) return; // No TrustGate = no receipts = not part of verified network
  try {
    const receipt = {
      model_passport_id: model,
      agent_passport_id: LUCID_PASSPORT_ID,
      input_hash: crypto.createHash('sha256').update(input).digest('hex'),
      output_hash: crypto.createHash('sha256').update(output).digest('hex'),
      latency_ms: latencyMs,
      timestamp: Date.now(),
    };
    await fetch(`${LUCID_API_URL}/v1/receipts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(receipt),
    });
  } catch {
    // Fire and forget — don't break agent on receipt failure
  }
}

// --- Express server ---
const app = express();
app.use(express.json());

// Identity header on every response
app.use((_req, res, next) => {
  res.setHeader('X-Lucid-Passport-Id', LUCID_PASSPORT_ID);
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    passport_id: LUCID_PASSPORT_ID,
    model: LUCID_MODEL,
    trustgate: !!TRUSTGATE_URL,
    version: '1.0.0',
  });
});

// Simple inference endpoint
app.post('/run', async (req, res) => {
  const start = Date.now();
  try {
    const { prompt, stream } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      const result = await streamText({
        model: provider(LUCID_MODEL),
        system: LUCID_PROMPT,
        prompt,
        stopWhen: stepCountIs(50),
      });
      let fullText = '';
      for await (const chunk of result.textStream) {
        fullText += chunk;
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
      createReceipt(prompt, fullText, LUCID_MODEL, Date.now() - start);
    } else {
      const result = await generateText({
        model: provider(LUCID_MODEL),
        system: LUCID_PROMPT,
        prompt,
        stopWhen: stepCountIs(50),
      });
      res.json({
        ok: true,
        text: result.text,
        usage: result.usage,
        passport_id: LUCID_PASSPORT_ID,
      });
      createReceipt(prompt, result.text, LUCID_MODEL, Date.now() - start);
    }
  } catch (error) {
    console.error('[Runtime] Error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// OpenAI-compatible chat completions
app.post('/v1/chat/completions', async (req, res) => {
  const start = Date.now();
  try {
    const { messages, stream: isStream } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'messages required' });

    const lastMessage = messages[messages.length - 1]?.content || '';

    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      const result = await streamText({
        model: provider(req.body.model || LUCID_MODEL),
        system: LUCID_PROMPT,
        prompt: lastMessage,
        stopWhen: stepCountIs(50),
      });
      let fullText = '';
      for await (const chunk of result.textStream) {
        fullText += chunk;
        const sseData = {
          id: `chatcmpl-${crypto.randomUUID()}`,
          object: 'chat.completion.chunk',
          choices: [{ delta: { content: chunk }, index: 0, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(sseData)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
      createReceipt(lastMessage, fullText, LUCID_MODEL, Date.now() - start);
    } else {
      const result = await generateText({
        model: provider(req.body.model || LUCID_MODEL),
        system: LUCID_PROMPT,
        prompt: lastMessage,
        stopWhen: stepCountIs(50),
      });
      res.json({
        id: `chatcmpl-${crypto.randomUUID()}`,
        object: 'chat.completion',
        choices: [{
          message: { role: 'assistant', content: result.text },
          index: 0,
          finish_reason: 'stop',
        }],
        usage: result.usage,
      });
      createReceipt(lastMessage, result.text, LUCID_MODEL, Date.now() - start);
    }
  } catch (error) {
    console.error('[Runtime] Chat error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// A2A discovery (if configured)
if (process.env.LUCID_A2A_ENABLED === 'true') {
  app.get('/.well-known/agent.json', (_req, res) => {
    res.json({
      name: LUCID_PASSPORT_ID,
      description: LUCID_PROMPT.substring(0, 200),
      url: process.env.AGENT_URL || `http://localhost:${PORT}`,
      version: '1.0.0',
      capabilities: LUCID_TOOLS,
      authentication: { type: 'bearer' },
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
    });
  });
}

app.listen(PORT, () => {
  console.log(`[Lucid Agent Runtime v1.0.0]`);
  console.log(`  Passport: ${LUCID_PASSPORT_ID}`);
  console.log(`  Model: ${LUCID_MODEL}`);
  console.log(`  Provider: ${TRUSTGATE_URL || 'NOT SET (configure TRUSTGATE_URL)'}`);
  console.log(`  Receipts: ${RECEIPTS_ENABLED ? 'enabled (TrustGate)' : 'disabled (no TrustGate)'}`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Receipts: automatic`);
});
