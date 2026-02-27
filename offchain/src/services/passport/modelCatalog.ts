/**
 * Lucid Gateway Model Catalog
 *
 * Rich metadata for all auto-synced API models.
 * Used by syncApiModels() to populate passport metadata.
 *
 * Pricing: USD per million tokens (as of Feb 2026)
 * Context/output: in tokens
 */

export interface ModelCatalogEntry {
  name: string;                    // Human-readable display name
  provider: string;                // Provider identifier
  base: string;                    // API compatibility layer
  modality: string[];              // text, vision, embedding, reasoning, code, audio
  context_length: number;          // Max input context window
  max_output_tokens: number;       // Max output per request
  parameter_count: string | null;  // e.g. "8B", "70B", null if undisclosed
  architecture: string;            // transformer, moe, etc.
  knowledge_cutoff: string | null; // e.g. "2024-10"
  license: string;                 // proprietary, apache-2.0, etc.
  languages: string[];             // ISO 639-1 codes
  capabilities: string[];          // streaming, tools, json_mode, vision, etc.
  pricing: {
    input_per_mtok: number;
    output_per_mtok: number;
    currency: string;
    free_tier: boolean;
  };
  infrastructure: {
    regions: string[];
    data_residency: string[];
    content_policy: 'strict' | 'moderate' | 'permissive' | 'none';
    rate_limit_rpm?: number;
  };
}

export const MODEL_CATALOG: Record<string, ModelCatalogEntry> = {

  // =====================================================================
  // OpenAI — Chat Models
  // =====================================================================

  'gpt-4o': {
    name: 'GPT-4o',
    provider: 'openai',
    base: 'openai',
    modality: ['text', 'vision'],
    context_length: 128000,
    max_output_tokens: 16384,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2024-10',
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'tools', 'json_mode', 'vision', 'batch_api', 'fine_tuning'],
    pricing: { input_per_mtok: 2.50, output_per_mtok: 10.00, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['global'], data_residency: ['US'], content_policy: 'strict', rate_limit_rpm: 10000 },
  },

  'gpt-4o-mini': {
    name: 'GPT-4o Mini',
    provider: 'openai',
    base: 'openai',
    modality: ['text', 'vision'],
    context_length: 128000,
    max_output_tokens: 16384,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2024-10',
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'tools', 'json_mode', 'vision', 'batch_api', 'fine_tuning'],
    pricing: { input_per_mtok: 0.15, output_per_mtok: 0.60, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['global'], data_residency: ['US'], content_policy: 'strict', rate_limit_rpm: 30000 },
  },

  'gpt-4.1': {
    name: 'GPT-4.1',
    provider: 'openai',
    base: 'openai',
    modality: ['text', 'vision', 'code'],
    context_length: 1047576,
    max_output_tokens: 32768,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2025-01',
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'tools', 'json_mode', 'vision', 'batch_api'],
    pricing: { input_per_mtok: 2.00, output_per_mtok: 8.00, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['global'], data_residency: ['US'], content_policy: 'strict', rate_limit_rpm: 10000 },
  },

  'gpt-4.1-mini': {
    name: 'GPT-4.1 Mini',
    provider: 'openai',
    base: 'openai',
    modality: ['text', 'vision', 'code'],
    context_length: 1047576,
    max_output_tokens: 32768,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2025-01',
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'tools', 'json_mode', 'vision', 'batch_api'],
    pricing: { input_per_mtok: 0.40, output_per_mtok: 1.60, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['global'], data_residency: ['US'], content_policy: 'strict', rate_limit_rpm: 30000 },
  },

  'o3-mini': {
    name: 'o3-mini',
    provider: 'openai',
    base: 'openai',
    modality: ['text', 'reasoning'],
    context_length: 200000,
    max_output_tokens: 100000,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2024-10',
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'tools', 'reasoning'],
    pricing: { input_per_mtok: 1.10, output_per_mtok: 4.40, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['global'], data_residency: ['US'], content_policy: 'strict' },
  },

  'o1-mini': {
    name: 'o1-mini',
    provider: 'openai',
    base: 'openai',
    modality: ['text', 'reasoning'],
    context_length: 128000,
    max_output_tokens: 65536,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2024-04',
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'reasoning'],
    pricing: { input_per_mtok: 3.00, output_per_mtok: 12.00, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['global'], data_residency: ['US'], content_policy: 'strict' },
  },

  // =====================================================================
  // OpenAI — Embeddings
  // =====================================================================

  'text-embedding-3-small': {
    name: 'Text Embedding 3 Small',
    provider: 'openai',
    base: 'openai',
    modality: ['embedding'],
    context_length: 8191,
    max_output_tokens: 0,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: null,
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['batch_api'],
    pricing: { input_per_mtok: 0.02, output_per_mtok: 0, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['global'], data_residency: ['US'], content_policy: 'none' },
  },

  'text-embedding-3-large': {
    name: 'Text Embedding 3 Large',
    provider: 'openai',
    base: 'openai',
    modality: ['embedding'],
    context_length: 8191,
    max_output_tokens: 0,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: null,
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['batch_api'],
    pricing: { input_per_mtok: 0.13, output_per_mtok: 0, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['global'], data_residency: ['US'], content_policy: 'none' },
  },

  'text-embedding-ada-002': {
    name: 'Text Embedding Ada 002',
    provider: 'openai',
    base: 'openai',
    modality: ['embedding'],
    context_length: 8191,
    max_output_tokens: 0,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: null,
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['batch_api'],
    pricing: { input_per_mtok: 0.10, output_per_mtok: 0, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['global'], data_residency: ['US'], content_policy: 'none' },
  },

  // =====================================================================
  // Anthropic
  // =====================================================================

  'claude-3-5-sonnet': {
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    base: 'anthropic',
    modality: ['text', 'vision', 'code'],
    context_length: 200000,
    max_output_tokens: 8192,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2025-04',
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'tools', 'vision', 'batch_api'],
    pricing: { input_per_mtok: 3.00, output_per_mtok: 15.00, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['us-east-1', 'eu-west-1'], data_residency: ['US', 'EU'], content_policy: 'moderate' },
  },

  'claude-3-5-haiku': {
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    base: 'anthropic',
    modality: ['text', 'vision'],
    context_length: 200000,
    max_output_tokens: 8192,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2025-04',
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'tools', 'vision', 'batch_api'],
    pricing: { input_per_mtok: 0.80, output_per_mtok: 4.00, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['us-east-1', 'eu-west-1'], data_residency: ['US', 'EU'], content_policy: 'moderate' },
  },

  'claude-3-opus': {
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    base: 'anthropic',
    modality: ['text', 'vision'],
    context_length: 200000,
    max_output_tokens: 4096,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2024-08',
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'tools', 'vision'],
    pricing: { input_per_mtok: 15.00, output_per_mtok: 75.00, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['us-east-1'], data_residency: ['US'], content_policy: 'moderate' },
  },

  // =====================================================================
  // Google Gemini
  // =====================================================================

  'gemini-2.0-flash': {
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    base: 'google',
    modality: ['text', 'vision', 'audio', 'code'],
    context_length: 1048576,
    max_output_tokens: 8192,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2025-01',
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'tools', 'json_mode', 'vision', 'code_execution'],
    pricing: { input_per_mtok: 0.10, output_per_mtok: 0.40, currency: 'usd', free_tier: true },
    infrastructure: { regions: ['global'], data_residency: ['US'], content_policy: 'strict' },
  },

  'gemini-1.5-flash': {
    name: 'Gemini 1.5 Flash',
    provider: 'google',
    base: 'google',
    modality: ['text', 'vision', 'audio'],
    context_length: 1048576,
    max_output_tokens: 8192,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2024-05',
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'tools', 'json_mode', 'vision'],
    pricing: { input_per_mtok: 0.075, output_per_mtok: 0.30, currency: 'usd', free_tier: true },
    infrastructure: { regions: ['global'], data_residency: ['US'], content_policy: 'strict' },
  },

  'gemini-1.5-pro': {
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    base: 'google',
    modality: ['text', 'vision', 'audio'],
    context_length: 2097152,
    max_output_tokens: 8192,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2024-05',
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'tools', 'json_mode', 'vision'],
    pricing: { input_per_mtok: 1.25, output_per_mtok: 5.00, currency: 'usd', free_tier: true },
    infrastructure: { regions: ['global'], data_residency: ['US'], content_policy: 'strict' },
  },

  // =====================================================================
  // Groq (ultra-fast inference)
  // =====================================================================

  'groq-llama-3.3-70b': {
    name: 'Llama 3.3 70B (Groq)',
    provider: 'groq',
    base: 'groq',
    modality: ['text', 'code'],
    context_length: 128000,
    max_output_tokens: 32768,
    parameter_count: '70B',
    architecture: 'transformer',
    knowledge_cutoff: '2024-12',
    license: 'llama3.1',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'tools', 'json_mode'],
    pricing: { input_per_mtok: 0.59, output_per_mtok: 0.79, currency: 'usd', free_tier: true },
    infrastructure: { regions: ['us-east-1'], data_residency: ['US'], content_policy: 'permissive' },
  },

  'groq-llama-3.1-8b': {
    name: 'Llama 3.1 8B (Groq)',
    provider: 'groq',
    base: 'groq',
    modality: ['text', 'code'],
    context_length: 128000,
    max_output_tokens: 8192,
    parameter_count: '8B',
    architecture: 'transformer',
    knowledge_cutoff: '2024-07',
    license: 'llama3.1',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'tools', 'json_mode'],
    pricing: { input_per_mtok: 0.05, output_per_mtok: 0.08, currency: 'usd', free_tier: true },
    infrastructure: { regions: ['us-east-1'], data_residency: ['US'], content_policy: 'permissive' },
  },

  'groq-mixtral-8x7b': {
    name: 'Mixtral 8x7B (Groq)',
    provider: 'groq',
    base: 'groq',
    modality: ['text', 'code'],
    context_length: 32768,
    max_output_tokens: 4096,
    parameter_count: '46.7B',
    architecture: 'moe',
    knowledge_cutoff: '2024-01',
    license: 'apache-2.0',
    languages: ['en', 'fr', 'de', 'es', 'it', 'multilingual'],
    capabilities: ['streaming', 'tools'],
    pricing: { input_per_mtok: 0.24, output_per_mtok: 0.24, currency: 'usd', free_tier: true },
    infrastructure: { regions: ['us-east-1'], data_residency: ['US'], content_policy: 'permissive' },
  },

  // =====================================================================
  // Mistral
  // =====================================================================

  'mistral-large': {
    name: 'Mistral Large',
    provider: 'mistral',
    base: 'mistral',
    modality: ['text', 'vision', 'code'],
    context_length: 128000,
    max_output_tokens: 4096,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2024-11',
    license: 'proprietary',
    languages: ['en', 'fr', 'de', 'es', 'it', 'multilingual'],
    capabilities: ['streaming', 'tools', 'json_mode', 'vision'],
    pricing: { input_per_mtok: 2.00, output_per_mtok: 6.00, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['eu-west-1', 'us-east-1'], data_residency: ['EU', 'US'], content_policy: 'moderate' },
  },

  'mistral-small': {
    name: 'Mistral Small',
    provider: 'mistral',
    base: 'mistral',
    modality: ['text', 'code'],
    context_length: 128000,
    max_output_tokens: 4096,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2024-11',
    license: 'proprietary',
    languages: ['en', 'fr', 'de', 'es', 'it', 'multilingual'],
    capabilities: ['streaming', 'tools', 'json_mode'],
    pricing: { input_per_mtok: 0.10, output_per_mtok: 0.30, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['eu-west-1', 'us-east-1'], data_residency: ['EU', 'US'], content_policy: 'moderate' },
  },

  'codestral': {
    name: 'Codestral',
    provider: 'mistral',
    base: 'mistral',
    modality: ['text', 'code'],
    context_length: 32768,
    max_output_tokens: 4096,
    parameter_count: '22B',
    architecture: 'transformer',
    knowledge_cutoff: '2024-11',
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'tools', 'code_execution'],
    pricing: { input_per_mtok: 0.30, output_per_mtok: 0.90, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['eu-west-1'], data_residency: ['EU'], content_policy: 'permissive' },
  },

  // =====================================================================
  // Perplexity (search-augmented)
  // =====================================================================

  'perplexity-sonar-small': {
    name: 'Perplexity Sonar',
    provider: 'perplexity',
    base: 'perplexity',
    modality: ['text'],
    context_length: 127000,
    max_output_tokens: 4096,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: null,
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'web_search'],
    pricing: { input_per_mtok: 1.00, output_per_mtok: 1.00, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['us-east-1'], data_residency: ['US'], content_policy: 'moderate' },
  },

  'perplexity-sonar-pro': {
    name: 'Perplexity Sonar Pro',
    provider: 'perplexity',
    base: 'perplexity',
    modality: ['text'],
    context_length: 200000,
    max_output_tokens: 8192,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: null,
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'web_search'],
    pricing: { input_per_mtok: 3.00, output_per_mtok: 15.00, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['us-east-1'], data_residency: ['US'], content_policy: 'moderate' },
  },

  // =====================================================================
  // xAI (Grok)
  // =====================================================================

  'grok-2': {
    name: 'Grok 2',
    provider: 'xai',
    base: 'xai',
    modality: ['text', 'vision'],
    context_length: 131072,
    max_output_tokens: 4096,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2025-01',
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'tools', 'vision'],
    pricing: { input_per_mtok: 2.00, output_per_mtok: 10.00, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['us-east-1'], data_residency: ['US'], content_policy: 'permissive' },
  },

  'grok-2-mini': {
    name: 'Grok 2 Mini',
    provider: 'xai',
    base: 'xai',
    modality: ['text'],
    context_length: 131072,
    max_output_tokens: 4096,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2025-01',
    license: 'proprietary',
    languages: ['en', 'multilingual'],
    capabilities: ['streaming', 'tools'],
    pricing: { input_per_mtok: 0.30, output_per_mtok: 0.50, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['us-east-1'], data_residency: ['US'], content_policy: 'permissive' },
  },

  // =====================================================================
  // DeepSeek
  // =====================================================================

  'deepseek-chat': {
    name: 'DeepSeek V3',
    provider: 'deepseek',
    base: 'deepseek',
    modality: ['text', 'code'],
    context_length: 128000,
    max_output_tokens: 8192,
    parameter_count: '671B',
    architecture: 'moe',
    knowledge_cutoff: '2024-07',
    license: 'proprietary',
    languages: ['en', 'zh', 'multilingual'],
    capabilities: ['streaming', 'tools', 'json_mode'],
    pricing: { input_per_mtok: 0.27, output_per_mtok: 1.10, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['cn-east-1'], data_residency: ['CN'], content_policy: 'strict' },
  },

  'deepseek-reasoner': {
    name: 'DeepSeek R1',
    provider: 'deepseek',
    base: 'deepseek',
    modality: ['text', 'reasoning', 'code'],
    context_length: 128000,
    max_output_tokens: 8192,
    parameter_count: '671B',
    architecture: 'moe',
    knowledge_cutoff: '2024-07',
    license: 'mit',
    languages: ['en', 'zh', 'multilingual'],
    capabilities: ['streaming', 'reasoning'],
    pricing: { input_per_mtok: 0.55, output_per_mtok: 2.19, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['cn-east-1'], data_residency: ['CN'], content_policy: 'strict' },
  },

  // =====================================================================
  // MiniMax
  // =====================================================================

  'minimax-m2.1': {
    name: 'MiniMax M2.1',
    provider: 'minimax',
    base: 'minimax',
    modality: ['text', 'reasoning'],
    context_length: 1000000,
    max_output_tokens: 8192,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2025-01',
    license: 'proprietary',
    languages: ['en', 'zh', 'multilingual'],
    capabilities: ['streaming', 'tools', 'reasoning'],
    pricing: { input_per_mtok: 0.50, output_per_mtok: 2.00, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['cn-east-1', 'us-east-1'], data_residency: ['CN', 'US'], content_policy: 'moderate' },
  },

  // =====================================================================
  // Moonshot / Kimi
  // =====================================================================

  'kimi-moonshot-v1-8k': {
    name: 'Kimi Moonshot V1 8K',
    provider: 'moonshot',
    base: 'moonshot',
    modality: ['text'],
    context_length: 8192,
    max_output_tokens: 2048,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2024-06',
    license: 'proprietary',
    languages: ['zh', 'en', 'multilingual'],
    capabilities: ['streaming', 'tools'],
    pricing: { input_per_mtok: 1.50, output_per_mtok: 2.00, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['cn-east-1'], data_residency: ['CN'], content_policy: 'strict' },
  },

  'kimi-moonshot-v1-32k': {
    name: 'Kimi Moonshot V1 32K',
    provider: 'moonshot',
    base: 'moonshot',
    modality: ['text'],
    context_length: 32768,
    max_output_tokens: 4096,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2024-06',
    license: 'proprietary',
    languages: ['zh', 'en', 'multilingual'],
    capabilities: ['streaming', 'tools'],
    pricing: { input_per_mtok: 3.00, output_per_mtok: 4.00, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['cn-east-1'], data_residency: ['CN'], content_policy: 'strict' },
  },

  'kimi-moonshot-v1-128k': {
    name: 'Kimi Moonshot V1 128K',
    provider: 'moonshot',
    base: 'moonshot',
    modality: ['text'],
    context_length: 131072,
    max_output_tokens: 4096,
    parameter_count: null,
    architecture: 'transformer',
    knowledge_cutoff: '2024-06',
    license: 'proprietary',
    languages: ['zh', 'en', 'multilingual'],
    capabilities: ['streaming', 'tools'],
    pricing: { input_per_mtok: 8.50, output_per_mtok: 8.50, currency: 'usd', free_tier: false },
    infrastructure: { regions: ['cn-east-1'], data_residency: ['CN'], content_policy: 'strict' },
  },
};
