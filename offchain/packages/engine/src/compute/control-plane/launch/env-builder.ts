/** Build Lucid env vars injected into every launched container */
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
    PROVIDER_URL: process.env.PROVIDER_URL || process.env.TRUSTGATE_URL || '',
    PROVIDER_API_KEY: process.env.PROVIDER_API_KEY || process.env.TRUSTGATE_API_KEY || '',
    ...(opts.extra || {}),
  };
}

/** Build env vars specific to the base runtime image */
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
    PROVIDER_URL: process.env.PROVIDER_URL || process.env.TRUSTGATE_URL || '',
    PROVIDER_API_KEY: process.env.PROVIDER_API_KEY || process.env.TRUSTGATE_API_KEY || '',
  };
}
