export function buildLucidEnvVars(opts: {
  passportId: string;
  verification: 'full' | 'minimal';
  extra?: Record<string, string>;
}): Record<string, string> {
  const lucidApiUrl = process.env.LUCID_API_URL || `http://localhost:${process.env.PORT || 3001}`;
  return {
    LUCID_API_URL: lucidApiUrl,
    LUCID_PASSPORT_ID: opts.passportId,
    LUCID_VERIFICATION_MODE: opts.verification,
    TRUSTGATE_URL: process.env.TRUSTGATE_URL || '',
    ...(opts.extra || {}),
  };
}

export function buildBaseRuntimeEnvVars(opts: {
  model: string;
  prompt: string;
  tools: string[];
  configHash: string;
}): Record<string, string> {
  return {
    LUCID_MODEL: opts.model,
    LUCID_PROMPT: opts.prompt,
    LUCID_TOOLS: opts.tools.join(','),
    LUCID_CONFIG_HASH: opts.configHash,
    TRUSTGATE_URL: process.env.TRUSTGATE_URL || '',
    TRUSTGATE_API_KEY: process.env.TRUSTGATE_API_KEY || '',
    MCPGATE_URL: process.env.MCPGATE_URL || '',
  };
}
