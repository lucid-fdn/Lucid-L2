/**
 * Register agent skills as Lucid tool passports with full metadata.
 *
 * Extracts rich setup data (env vars, binaries, install steps, OS restrictions)
 * directly from the Docker image's SKILL.md frontmatter.
 * Falls back to catalog.json if Docker is unavailable.
 *
 * Usage:
 *   lucid agent skills register openclaw
 *   lucid agent skills register openclaw --dry-run
 *   lucid agent skills list openclaw
 */

import { logger } from '../../packages/engine/src/shared/lib/logger';

const CATALOG_URL = process.env.LUCID_CATALOG_URL || 'https://raw.githubusercontent.com/lucid-fdn/lucid-agents/main/catalog.json';

interface SkillMeta {
  slug: string;
  name: string;
  description: string;
  homepage?: string;
  emoji?: string;
  env?: string[];
  primaryEnv?: string;
  bins?: string[];
  os?: string[];
  install?: Array<{ kind: string; formula?: string; package?: string; label?: string }>;
  bundled?: boolean;
}

/**
 * Extract full skill metadata from Docker image SKILL.md frontmatter.
 * Returns rich data: env vars, binaries, install instructions, OS restrictions.
 */
async function extractSkillsFromImage(image: string): Promise<SkillMeta[]> {
  const { execFileSync } = await import('child_process');

  // Extract all SKILL.md frontmatter in one docker run
  const raw = execFileSync('docker', [
    'run', '--rm', image, 'sh', '-c',
    `for dir in /usr/local/lib/node_modules/openclaw/skills/*/; do
      name=$(basename "$dir")
      echo "===SKILL:$name==="
      awk '/^---$/{n++; next} n==1{print}' "$dir/SKILL.md" 2>/dev/null
    done`,
  ], { timeout: 30000, stdio: 'pipe' }).toString();

  const skills: SkillMeta[] = [];
  const blocks = raw.split(/===SKILL:([^=]+)===/);

  for (let i = 1; i < blocks.length; i += 2) {
    const slug = blocks[i].trim();
    const yaml = blocks[i + 1] || '';

    // Parse YAML-ish frontmatter (simple extraction, not full YAML parser)
    const desc = yaml.match(/^description:\s*"?(.+?)"?\s*$/m)?.[1] || slug;
    const homepage = yaml.match(/^homepage:\s*(.+)$/m)?.[1]?.trim();

    // Parse metadata JSON block
    let env: string[] = [];
    let primaryEnv: string | undefined;
    let bins: string[] = [];
    let os: string[] = [];
    let emoji: string | undefined;
    let install: SkillMeta['install'] = [];

    const metaMatch = yaml.match(/"openclaw"\s*:\s*\{([\s\S]*?)\}\s*,?\s*\}/);
    if (metaMatch) {
      const meta = metaMatch[0];
      // Extract env
      const envMatch = meta.match(/"env"\s*:\s*\[([^\]]*)\]/);
      if (envMatch) {
        env = envMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
      }
      // Extract primaryEnv
      const primaryMatch = meta.match(/"primaryEnv"\s*:\s*"([^"]+)"/);
      if (primaryMatch) primaryEnv = primaryMatch[1];
      // Extract bins
      const binsMatch = meta.match(/"bins"\s*:\s*\[([^\]]*)\]/);
      if (binsMatch) {
        bins = binsMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
      }
      // Extract emoji
      const emojiMatch = meta.match(/"emoji"\s*:\s*"([^"]+)"/);
      if (emojiMatch) emoji = emojiMatch[1];
      // Extract OS
      const osMatch = meta.match(/"os"\s*:\s*\[([^\]]*)\]/);
      if (osMatch) {
        os = osMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
      }
      // Extract install instructions
      const installMatches = meta.matchAll(/"kind"\s*:\s*"([^"]+)"[^}]*?"label"\s*:\s*"([^"]+)"/g);
      for (const m of installMatches) {
        install.push({ kind: m[1], label: m[2] });
      }
    }

    skills.push({
      slug,
      name: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      description: desc.replace(/"/g, '').substring(0, 200),
      homepage,
      emoji,
      env: env.length > 0 ? env : undefined,
      primaryEnv: primaryEnv || (env.length > 0 ? env[0] : undefined),
      bins: bins.length > 0 ? bins : undefined,
      os: os.length > 0 ? os : undefined,
      install: install.length > 0 ? install : undefined,
    });
  }

  return skills;
}

/**
 * Fall back to catalog.json for skill list (no rich metadata).
 */
async function fetchSkillsFromCatalog(agentSlug: string): Promise<SkillMeta[]> {
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error('Failed to fetch catalog');
  const catalog = await res.json() as any;
  const agent = catalog.agents?.find((a: any) => a.name === agentSlug);
  if (!agent?.skills) throw new Error(`Agent "${agentSlug}" not found or has no skills`);

  return agent.skills.map((s: any) => ({
    slug: s.slug,
    name: s.name || s.slug,
    description: s.description || '',
    primaryEnv: s.env,
    env: s.env ? [s.env] : undefined,
    bundled: s.bundled,
  }));
}

function inferCategory(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes('code') || d.includes('github') || d.includes('git')) return 'code';
  if (d.includes('search') || d.includes('browse') || d.includes('web') || d.includes('crawl')) return 'search';
  if (d.includes('email') || d.includes('slack') || d.includes('discord') || d.includes('message')) return 'communication';
  if (d.includes('data') || d.includes('notion') || d.includes('trello') || d.includes('pdf')) return 'data';
  if (d.includes('voice') || d.includes('tts') || d.includes('speech') || d.includes('audio')) return 'analytics';
  if (d.includes('image') || d.includes('video') || d.includes('gif')) return 'analytics';
  if (d.includes('password') || d.includes('security')) return 'security';
  return 'other';
}

function skillToToolMeta(skill: SkillMeta, agentSlug: string) {
  const category = inferCategory(skill.description);
  let authMode: string = 'none';
  if (skill.primaryEnv || (skill.env && skill.env.length > 0)) {
    const envName = skill.primaryEnv || skill.env![0];
    authMode = envName.includes('TOKEN') ? 'bearer' : 'api_key';
  }

  return {
    schema_version: '2.0',
    tool_passport_id: `tool_${agentSlug}_${skill.slug}`,
    name: skill.name,
    description: skill.description,
    provider: agentSlug,
    protocol: 'custom' as const,
    category,
    operations: [{ name: skill.slug, description: skill.description }],
    auth: {
      mode: authMode,
      ...(skill.primaryEnv ? { env: skill.primaryEnv } : {}),
      ...(skill.env ? { required_env: skill.env } : {}),
    },
    endpoints: {
      ...(skill.homepage ? { base_url: skill.homepage } : {}),
    },
    tags: [agentSlug, skill.slug, category, ...(skill.bundled ? ['bundled'] : [])],
    // Rich metadata for launch UI
    setup: {
      ...(skill.emoji ? { emoji: skill.emoji } : {}),
      ...(skill.bins ? { requires_bins: skill.bins } : {}),
      ...(skill.os ? { requires_os: skill.os } : {}),
      ...(skill.install ? { install_instructions: skill.install } : {}),
    },
  };
}

export async function registerAgentSkills(opts: {
  agentSlug: string;
  owner: string;
  apiUrl?: string;
  apiKey?: string;
  dryRun?: boolean;
}): Promise<{ registered: number; skipped: number; errors: number }> {
  const stats = { registered: 0, skipped: 0, errors: 0 };

  // Try extracting from Docker image first (rich metadata), fall back to catalog
  let skills: SkillMeta[];
  try {
    const catalogRes = await fetch(CATALOG_URL);
    const catalog = await catalogRes.json() as any;
    const agent = catalog.agents?.find((a: any) => a.name === opts.agentSlug);
    const image = agent?.image;

    if (image) {
      logger.info(`[Skills] Extracting from Docker image: ${image}`);
      skills = await extractSkillsFromImage(image);
      logger.info(`[Skills] Found ${skills.length} skills with rich metadata`);
    } else {
      skills = await fetchSkillsFromCatalog(opts.agentSlug);
    }
  } catch (err: any) {
    logger.warn(`[Skills] Docker extraction failed (${err.message}), using catalog`);
    skills = await fetchSkillsFromCatalog(opts.agentSlug);
  }

  const apiUrl = opts.apiUrl || process.env.LUCID_API_URL || 'http://localhost:3001';
  logger.info(`[Skills] Registering ${skills.length} skills from ${opts.agentSlug}`);

  for (const skill of skills) {
    const meta = skillToToolMeta(skill, opts.agentSlug);

    if (opts.dryRun) {
      const envInfo = skill.primaryEnv ? ` [${skill.primaryEnv}]` : '';
      const osInfo = skill.os ? ` (${skill.os.join('/')})` : '';
      console.log(`  ${meta.setup?.emoji || '•'} ${meta.tool_passport_id}: ${meta.name}${envInfo}${osInfo}`);
      stats.registered++;
      continue;
    }

    try {
      const createRes = await fetch(`${apiUrl}/v1/passports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(opts.apiKey ? { 'Authorization': `Bearer ${opts.apiKey}` } : {}),
        },
        body: JSON.stringify({
          type: 'tool',
          owner: opts.owner,
          name: meta.name,
          description: meta.description,
          metadata: meta,
          tags: meta.tags,
        }),
      });

      if (createRes.ok) {
        stats.registered++;
      } else {
        const err = await createRes.text();
        if (err.includes('already exists') || err.includes('duplicate')) {
          stats.skipped++;
        } else {
          stats.errors++;
          logger.warn(`  ✗ ${meta.tool_passport_id}: ${err.substring(0, 80)}`);
        }
      }
    } catch (err: any) {
      stats.errors++;
      logger.warn(`  ✗ ${meta.tool_passport_id}: ${err.message}`);
    }
  }

  logger.info(`[Skills] Done: ${stats.registered} registered, ${stats.skipped} skipped, ${stats.errors} errors`);
  return stats;
}

export async function listAgentSkillPassports(opts: {
  agentSlug: string;
  apiUrl?: string;
  apiKey?: string;
}): Promise<void> {
  const apiUrl = opts.apiUrl || process.env.LUCID_API_URL || 'http://localhost:3001';

  const res = await fetch(`${apiUrl}/v1/passports?type=tool&provider=${opts.agentSlug}&per_page=100`, {
    headers: opts.apiKey ? { 'Authorization': `Bearer ${opts.apiKey}` } : {},
  });

  if (!res.ok) {
    console.error('Failed to fetch tool passports');
    return;
  }

  const data = await res.json() as any;
  const passports = data.passports || [];

  if (passports.length === 0) {
    console.log(`No tool passports found for ${opts.agentSlug}. Run: lucid agent skills register ${opts.agentSlug}`);
    return;
  }

  console.log(`Tool passports for ${opts.agentSlug} (${passports.length}):\n`);
  for (const p of passports) {
    const meta = p.metadata || {};
    const setup = meta.setup || {};
    const envInfo = meta.auth?.env ? ` [${meta.auth.env}]` : '';
    const osInfo = setup.requires_os ? ` (${setup.requires_os.join('/')})` : '';
    console.log(`  ${setup.emoji || '•'} ${(meta.name || p.name).padEnd(25)} ${meta.category || '?'}${envInfo}${osInfo}`);
  }
}
