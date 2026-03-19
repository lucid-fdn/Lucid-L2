/**
 * Register OpenClaw (or any agent's) skills as Lucid tool passports.
 * Reads skill metadata from catalog API and creates passports via Lucid API.
 *
 * Skills become discoverable at GET /v1/passports?type=tool&tags=openclaw
 *
 * Usage:
 *   lucid agent skills register <passport_id>     — register all skills for an agent
 *   lucid agent skills list <passport_id>          — list registered tool passports
 */

import { logger } from '../../packages/engine/src/shared/lib/logger';

const CATALOG_URL = process.env.LUCID_CATALOG_URL || 'https://raw.githubusercontent.com/lucid-fdn/lucid-agents/main/catalog.json';

interface CatalogSkill {
  slug: string;
  name?: string;
  description?: string;
  env?: string;
  bundled?: boolean;
}

// Map OpenClaw skill metadata to ToolMeta schema
function skillToToolMeta(skill: CatalogSkill, agentSlug: string) {
  const name = skill.name || skill.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // Infer category from slug/description
  const desc = (skill.description || '').toLowerCase();
  let category = 'other';
  if (desc.includes('code') || desc.includes('github') || desc.includes('git')) category = 'code';
  else if (desc.includes('search') || desc.includes('browse') || desc.includes('web')) category = 'search';
  else if (desc.includes('email') || desc.includes('slack') || desc.includes('discord') || desc.includes('message')) category = 'communication';
  else if (desc.includes('data') || desc.includes('notion') || desc.includes('trello') || desc.includes('pdf')) category = 'data';
  else if (desc.includes('voice') || desc.includes('tts') || desc.includes('speech') || desc.includes('audio')) category = 'analytics';
  else if (desc.includes('image') || desc.includes('video') || desc.includes('gif')) category = 'analytics';
  else if (desc.includes('password') || desc.includes('security')) category = 'security';
  else if (desc.includes('weather') || desc.includes('place')) category = 'data';

  // Infer auth mode
  let authMode: string = 'none';
  if (skill.env) {
    authMode = skill.env.includes('TOKEN') ? 'bearer' : 'api_key';
  }

  return {
    schema_version: '2.0',
    tool_passport_id: `tool_${agentSlug}_${skill.slug}`,
    name,
    description: skill.description || name,
    provider: agentSlug,
    protocol: 'custom' as const,
    category,
    operations: [{ name: skill.slug, description: skill.description || name }],
    auth: { mode: authMode },
    tags: [agentSlug, skill.slug, category, ...(skill.bundled ? ['bundled'] : [])],
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

  // Fetch catalog
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error('Failed to fetch catalog');
  const catalog = await res.json() as any;

  const agent = catalog.agents?.find((a: any) => a.name === opts.agentSlug);
  if (!agent?.skills) throw new Error(`Agent "${opts.agentSlug}" not found or has no skills`);

  const skills = agent.skills as CatalogSkill[];
  const apiUrl = opts.apiUrl || process.env.LUCID_API_URL || 'http://localhost:3001';

  logger.info(`[Skills] Registering ${skills.length} skills from ${opts.agentSlug} as tool passports`);

  for (const skill of skills) {
    const meta = skillToToolMeta(skill, opts.agentSlug);

    if (opts.dryRun) {
      console.log(`  [dry-run] ${meta.tool_passport_id}: ${meta.name} (${meta.category})`);
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
        logger.info(`  ✓ ${meta.tool_passport_id}: ${meta.name}`);
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

  return stats;
}

export async function listAgentSkillPassports(opts: {
  agentSlug: string;
  apiUrl?: string;
  apiKey?: string;
}): Promise<void> {
  const apiUrl = opts.apiUrl || process.env.LUCID_API_URL || 'http://localhost:3001';

  const res = await fetch(`${apiUrl}/v1/passports?type=tool&tags=${opts.agentSlug}&per_page=100`, {
    headers: opts.apiKey ? { 'Authorization': `Bearer ${opts.apiKey}` } : {},
  });

  if (!res.ok) {
    console.error('Failed to fetch tool passports');
    return;
  }

  const data = await res.json() as any;
  const passports = data.passports || [];

  if (passports.length === 0) {
    console.log(`No tool passports found for ${opts.agentSlug}. Run: lucid agent skills register <passport_id>`);
    return;
  }

  console.log(`Tool passports for ${opts.agentSlug} (${passports.length}):\n`);
  for (const p of passports) {
    const meta = p.metadata || {};
    console.log(`  ${p.passport_id.padEnd(40)} ${meta.name || p.name} (${meta.category || '?'})`);
  }
}
