import OpenAI from 'openai';

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 2000];
const MIN_RESPONSE_LENGTH = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enrichDomain(system: string, user: string): Promise<string> {
  const client = new OpenAI(); // reads OPENAI_API_KEY from env by default
  const model = process.env.DOCS_MODEL ?? 'gpt-4o';

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const backoff = BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
      await sleep(backoff);
    }

    try {
      const response = await client.chat.completions.create({
        model,
        temperature: 0.2,
        max_completion_tokens: 4096,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });

      const content = response.choices[0]?.message?.content ?? '';

      if (content.length < MIN_RESPONSE_LENGTH) {
        lastError = new Error(
          `Response too short (${content.length} chars) on attempt ${attempt + 1}`
        );
        continue;
      }

      return content;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`enrichDomain failed after ${MAX_ATTEMPTS} attempts`);
}
