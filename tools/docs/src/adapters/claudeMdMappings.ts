/**
 * Section-to-page mappings for CLAUDE.md extraction.
 *
 * Each entry maps a heading (or sub-section) in a CLAUDE.md file
 * to a target page in the public docs site.
 */

export interface ClaudeMdMapping {
  /** Heading text in the source CLAUDE.md (exact match after stripping leading `#+ `) */
  heading: string;
  /** If set, extract only the sub-section matching this text within the heading's content */
  subHeading?: string;
  /** Target page path in lucid-docs (no leading slash, no extension) */
  pagePath: string;
  /** Page title for the generated doc */
  title: string;
  /** Short description for frontmatter / SEO */
  description: string;
  /** If true, rawContent is used as-is; if false, AI enrichment is applied */
  needsEnrichment: boolean;
}

// ---------------------------------------------------------------------------
// Lucid-L2 CLAUDE.md mappings
// ---------------------------------------------------------------------------

export const lucidL2Mappings: ClaudeMdMapping[] = [
  {
    heading: 'Agent Activation (5 Paths)',
    subHeading: 'Path A: Bring Your Own Image (developers)',
    pagePath: 'deploy/from-image',
    title: 'Deploy from Image (BYOI)',
    description: 'Deploy a pre-built Docker image into the Lucid verified network.',
    needsEnrichment: true,
  },
  {
    heading: 'Agent Activation (5 Paths)',
    subHeading: 'Path B: Base Runtime (no-code)',
    pagePath: 'deploy/from-cli',
    title: 'Deploy from CLI',
    description: 'Launch an agent using the base runtime from the command line.',
    needsEnrichment: true,
  },
  {
    heading: 'Agent Activation (5 Paths)',
    subHeading: 'Path C: Build from Source (developers with source code)',
    pagePath: 'deploy/from-source',
    title: 'Deploy from Source',
    description: 'Build and deploy an agent directly from source code.',
    needsEnrichment: true,
  },
  {
    heading: 'Agent Activation (5 Paths)',
    subHeading: 'Path D: Marketplace Catalog (one-command deploy)',
    pagePath: 'deploy/from-catalog',
    title: 'Deploy from Catalog',
    description: 'Deploy a pre-configured agent from the marketplace catalog.',
    needsEnrichment: true,
  },
  {
    heading: 'Agent Activation (5 Paths)',
    subHeading: 'Launch UI',
    pagePath: 'deploy/setup-wizard',
    title: 'Interactive Setup',
    description: 'Interactive clack-based setup wizard for agent deployment.',
    needsEnrichment: true,
  },
  {
    heading: 'Base Runtime (`packages/agent-runtime/`)',
    pagePath: 'how/execution-runtime',
    title: 'Agent Runtime',
    description: 'Pre-built Docker runtime for no-code agent deployment.',
    needsEnrichment: true,
  },
  {
    heading: 'Key Algorithms',
    pagePath: 'how/settlement-receipts',
    title: 'Receipts & Proofs',
    description: 'Cryptographic receipt creation, MMR proofs, and epoch settlement.',
    needsEnrichment: true,
  },
  {
    heading: 'DePIN & Anchoring (Unified)',
    pagePath: 'how/settlement-anchoring',
    title: 'Anchoring',
    description: 'Unified DePIN anchoring control plane for permanent data availability.',
    needsEnrichment: true,
  },
  {
    heading: 'DePIN & Anchoring (Unified)',
    pagePath: 'deploy/depin',
    title: 'DePIN Providers',
    description: 'Decentralized storage providers for data availability and anchoring.',
    needsEnrichment: true,
  },
  {
    heading: 'MemoryMap (Agent Memory System)',
    pagePath: 'concepts/memory',
    title: 'Portable Memory',
    description: 'Local-first, portable, provable agent memory with 6 memory types.',
    needsEnrichment: true,
  },
  {
    heading: 'Compute Heartbeat System',
    pagePath: 'deploy/compute-selection',
    title: 'Compute Selection',
    description: 'In-memory compute registry with heartbeat-based health tracking.',
    needsEnrichment: true,
  },
  {
    heading: 'NFT Provider Layer (Chain-Agnostic)',
    pagePath: 'how/settlement-identity',
    title: 'Identity (Passports)',
    description: 'Chain-agnostic NFT minting for AI asset identity.',
    needsEnrichment: true,
  },
  {
    heading: 'Deployment Control Plane',
    pagePath: 'concepts/agent-deployment',
    title: 'Agent Deployment Lifecycle',
    description: 'Durable deployment state machine with reconciliation and blue-green rollout.',
    needsEnrichment: true,
  },
  {
    heading: 'Agent Activation (5 Paths)',
    subHeading: '6 Deployers',
    pagePath: 'deploy/gpu-routing',
    title: 'GPU vs CPU Routing',
    description: 'Six deployment providers for GPU and CPU workloads.',
    needsEnrichment: true,
  },
  {
    heading: 'Model Availability Filter (`?available=true|false`)',
    pagePath: 'how/execution-models',
    title: 'Models',
    description: 'Model availability filtering, compute matching, and format-aware routing.',
    needsEnrichment: true,
  },
  {
    heading: 'Schema Validation',
    pagePath: 'how/execution-compute',
    title: 'Compute',
    description: 'Schema validation for passport metadata across all asset types.',
    needsEnrichment: true,
  },
];

// ---------------------------------------------------------------------------
// platform-core CLAUDE.md mappings
// ---------------------------------------------------------------------------

export const platformCoreMappings: ClaudeMdMapping[] = [
  {
    heading: 'TrustGate Flow',
    pagePath: 'gateway/trustgate',
    title: 'TrustGate (LLM Gateway)',
    description: 'OpenAI-compatible LLM proxy with tenant auth, quota, and payment enforcement.',
    needsEnrichment: true,
  },
  {
    heading: 'MCPGate Flow',
    pagePath: 'gateway/mcpgate',
    title: 'MCPGate (Tool Gateway)',
    description: 'MCP tool gateway with RBAC, audit logging, and credential injection.',
    needsEnrichment: true,
  },
  {
    heading: 'Control-Plane Admin API (port 4030)',
    pagePath: 'gateway/control-plane',
    title: 'Control Plane',
    description: 'Admin API for tenant, key, quota, and plan management.',
    needsEnrichment: true,
  },
  {
    heading: 'x402 Payment System',
    pagePath: 'concepts/payments',
    title: 'Payments (x402)',
    description: 'HTTP 402 payment protocol with multi-chain support and session credit.',
    needsEnrichment: true,
  },
  {
    heading: 'Telegram Bot (port 4050)',
    pagePath: 'deploy/from-telegram',
    title: 'Deploy from Telegram',
    description: 'Deploy and manage AI agents directly from Telegram.',
    needsEnrichment: true,
  },
  {
    heading: 'Telegram Bot (port 4050)',
    pagePath: 'gateway/channels',
    title: 'Managed Channels',
    description: 'Managed channel integrations for agent deployment and interaction.',
    needsEnrichment: true,
  },
  {
    heading: 'Credential Adapter System',
    pagePath: 'deploy/secrets',
    title: 'Secrets & API Keys',
    description: 'Pluggable credential injection for MCP tool authentication.',
    needsEnrichment: true,
  },
  {
    heading: 'Plan Tiers & Enforcement',
    pagePath: 'how/coordination-gateway',
    title: 'Gateway (TrustGate)',
    description: 'Plan-based quota enforcement and feature gating.',
    needsEnrichment: true,
  },
];
