/**
 * Beautiful CLI launch UI for Lucid agents.
 * Uses @clack/prompts for interactive wizard-style experience.
 * Provider-agnostic: driven by manifest, works with any agent.
 */

import * as p from '@clack/prompts';
import color from 'picocolors';

export interface AgentManifest {
  name: string;
  display_name?: string;
  description?: string;
  version?: string;
  trust_tier?: string;
  image?: string;
  defaults?: { model?: string; port?: number };
  required_env?: Array<{ name: string; description?: string; default?: string }>;
  optional_env?: Array<{ name: string; description?: string; default?: string }>;
  skills_enabled?: boolean;
  skills?: {
    bundled?: string[];
    optional?: Array<{
      slug: string;
      display_name?: string;
      description?: string;
      env?: string;
      env_description?: string;
    }>;
  };
}

export interface LaunchUIResult {
  useLucidInference: boolean;
  channels: Array<{ platform: string; mode: 'managed' | 'byo' | 'skip'; token?: string }>;
  envVars: Record<string, string>;
  cancelled: boolean;
}

const LLM_KEY_NAMES = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'LLM_API_KEY'];
const CHANNEL_MAP: Record<string, string> = {
  TELEGRAM_BOT_TOKEN: 'Telegram',
  DISCORD_BOT_TOKEN: 'Discord',
  SLACK_BOT_TOKEN: 'Slack',
};

/**
 * Run the full interactive launch UI.
 * Returns collected env vars, channel choices, and inference mode.
 */
export async function runLaunchUI(
  manifest: AgentManifest,
  opts: {
    isLoggedIn: boolean;
    hasProviderUrl: boolean;
    lucidToken?: string;
  },
): Promise<LaunchUIResult> {
  const result: LaunchUIResult = {
    useLucidInference: false,
    channels: [],
    envVars: {},
    cancelled: false,
  };

  // --- Agent card ---
  p.intro(color.bgCyan(color.black(' ◈ Lucid · Internet of AI ')));

  p.note(
    [
      `${color.bold(manifest.display_name || manifest.name)}`,
      '',
      'An autonomous citizen of the Internet of AI.',
      'It thinks, acts, earns, proves, and remembers —',
      'independently, on-chain, 24/7.',
      '',
      `${manifest.description || ''}`,
      '',
      `${manifest.version ? `v${manifest.version}` : ''} · ${manifest.trust_tier || 'community'}`,
    ].join('\n'),
    'Launching',
  );

  // --- Step 1: Intelligence ---
  const required = manifest.required_env || [];
  const optional = manifest.optional_env || [];
  const hasLLMKey = required.some(v => LLM_KEY_NAMES.includes(v.name));

  if (hasLLMKey && opts.isLoggedIn && opts.hasProviderUrl) {
    const inference = await p.select({
      message: 'Step 1/3 · How should your agent think?',
      options: [
        { value: 'lucid', label: 'Lucid Inference Gateway', hint: 'no key needed — uses your Lucid account' },
        { value: 'byok', label: 'Bring your own key', hint: 'Anthropic, OpenAI, or any provider' },
      ],
    });

    if (p.isCancel(inference)) {
      p.cancel('Launch cancelled.');
      result.cancelled = true;
      return result;
    }

    if (inference === 'lucid') {
      result.useLucidInference = true;
      result.envVars.PROVIDER_API_KEY = opts.lucidToken || '';
      p.log.success('Using Lucid Inference Gateway');
    }
  }

  // Collect remaining required env vars (skip LLM keys if Lucid inference chosen)
  const remainingRequired = result.useLucidInference
    ? required.filter(v => !LLM_KEY_NAMES.includes(v.name))
    : required;

  for (const v of remainingRequired) {
    const value = await p.text({
      message: `${v.name}`,
      placeholder: v.description || '',
      validate: (val) => {
        if (!val) return `${v.name} is required`;
      },
    });
    if (p.isCancel(value)) {
      p.cancel('Launch cancelled.');
      result.cancelled = true;
      return result;
    }
    result.envVars[v.name] = value as string;
  }

  // --- Step 2: Distribution (channels) ---
  const channelVars = optional.filter(v => CHANNEL_MAP[v.name]);

  if (channelVars.length > 0) {
    p.log.step('Step 2/3 · Where should people reach your agent?');

    for (const v of channelVars) {
      const platform = CHANNEL_MAP[v.name];
      const botName = platform === 'Telegram'
        ? (process.env.LUCID_TELEGRAM_BOT_USERNAME || 'LucidAgents')
        : 'Lucid Bot';

      const choice = await p.select({
        message: `${platform}`,
        options: [
          { value: 'managed', label: `@${botName}`, hint: 'instant — zero setup' },
          { value: 'byo', label: 'Bring your own bot', hint: v.description || '' },
          { value: 'skip', label: 'Skip' },
        ],
        initialValue: 'skip',
      });

      if (p.isCancel(choice)) {
        p.cancel('Launch cancelled.');
        result.cancelled = true;
        return result;
      }

      if (choice === 'managed') {
        result.channels.push({ platform: platform.toLowerCase(), mode: 'managed' });
      } else if (choice === 'byo') {
        const token = await p.text({
          message: `${v.name}`,
          placeholder: v.description || 'Paste your token',
        });
        if (p.isCancel(token)) {
          p.cancel('Launch cancelled.');
          result.cancelled = true;
          return result;
        }
        if (token) {
          result.channels.push({ platform: platform.toLowerCase(), mode: 'byo', token: token as string });
          result.envVars[v.name] = token as string;
        }
      } else {
        result.channels.push({ platform: platform.toLowerCase(), mode: 'skip' });
      }
    }
  }

  // --- Step 3: Capabilities (optional env excluding channels) ---
  const capabilityVars = optional.filter(v => !CHANNEL_MAP[v.name]);

  if (capabilityVars.length > 0) {
    p.log.step('Step 3/3 · Capabilities');

    for (const v of capabilityVars) {
      // Skip if already set by Lucid inference
      if (result.envVars[v.name]) continue;

      const value = await p.text({
        message: `${v.name}`,
        placeholder: v.description || '',
        defaultValue: v.default || '',
      });

      if (p.isCancel(value)) {
        p.cancel('Launch cancelled.');
        result.cancelled = true;
        return result;
      }

      if (value) {
        result.envVars[v.name] = value as string;
      } else if (v.default) {
        result.envVars[v.name] = v.default;
      }
    }
  }

  // --- Skills selection ---
  // Skills come from Lucid passport API: GET /v1/passports?type=tool&tags=<agent>
  // Registered via: lucid agent skills register <agent>
  // Falls back to catalog.json if API unavailable.
  const agentSlug = manifest.name || '';
  const apiUrl = process.env.LUCID_API_URL || 'http://localhost:3001';

  let bundledSkills: string[] = [];
  let optionalSkills: Array<{ slug: string; display_name?: string; description?: string; env?: string; env_description?: string }> = [];

  try {
    const skillsRes = await fetch(`${apiUrl}/v1/passports?type=tool&tags=${agentSlug}&per_page=100`);
    if (skillsRes.ok) {
      const data = await skillsRes.json() as any;
      const passports = data.passports || [];
      if (passports.length > 0) {
        for (const pp of passports) {
          const meta = pp.metadata || {};
          const slug = meta.operations?.[0]?.name || pp.name || '';
          const tags: string[] = meta.tags || pp.tags || [];
          if (tags.includes('bundled')) {
            bundledSkills.push(slug);
          } else {
            optionalSkills.push({
              slug,
              display_name: meta.name || pp.name,
              description: meta.description || pp.description,
              env: meta.auth?.mode !== 'none' ? meta.auth?.env || undefined : undefined,
            });
          }
        }
      }
    }
  } catch {
    // API unavailable — fall back to catalog or manifest
  }

  // Fallback to catalog skills if API returned nothing
  if (bundledSkills.length === 0 && optionalSkills.length === 0) {
    const catalogSkills: Array<{ slug: string; name?: string; description?: string; env?: string; bundled?: boolean }> = (manifest as any)._catalogSkills || [];
    const skills = manifest.skills || { bundled: [], optional: [] };

    if (catalogSkills.length > 0) {
      bundledSkills = catalogSkills.filter(s => s.bundled).map(s => s.slug);
      optionalSkills = catalogSkills.filter(s => !s.bundled).map(s => ({
        slug: s.slug,
        display_name: s.name,
        description: s.description,
        env: s.env,
      }));
    } else {
      bundledSkills = skills.bundled || [];
      optionalSkills = skills.optional || [];
    }
  }

  if (bundledSkills.length > 0 || optionalSkills.length > 0) {
    p.log.step('Skills');

    if (bundledSkills.length > 0) {
      p.log.info(`Included: ${bundledSkills.join(', ')}`);
    }

    const selectedSlugs: string[] = [];

    if (optionalSkills.length > 0) {
      const wantSkills = await p.confirm({
        message: `Browse ${optionalSkills.length} optional skills?`,
        initialValue: false,
      });

      if (!p.isCancel(wantSkills) && wantSkills) {
        // Search/filter loop
        let browsing = true;
        while (browsing) {
          const query = await p.text({
            message: 'Search skills (or Enter to see all):',
            placeholder: 'e.g., github, voice, browser...',
            defaultValue: '',
          });

          if (p.isCancel(query)) break;

          const q = ((query as string) || '').toLowerCase();
          const filtered = q
            ? optionalSkills.filter((s: any) =>
                s.slug.includes(q) ||
                (s.display_name || '').toLowerCase().includes(q) ||
                (s.description || '').toLowerCase().includes(q)
              )
            : optionalSkills;

          if (filtered.length === 0) {
            p.log.warn(`No skills matching "${q}"`);
            continue;
          }

          const selected = await p.multiselect({
            message: `Select skills${q ? ` matching "${q}"` : ''}:`,
            options: filtered.map((s: any) => ({
              value: s.slug,
              label: `${s.display_name || s.slug}${s.env ? ' (needs key)' : ''}`,
              hint: s.description || '',
            })),
            required: false,
          });

          if (!p.isCancel(selected)) {
            for (const slug of selected as string[]) {
              if (!selectedSlugs.includes(slug)) selectedSlugs.push(slug);
            }
          }

          if (selectedSlugs.length > 0) {
            p.log.info(`Selected: ${selectedSlugs.join(', ')}`);
          }

          const more = await p.confirm({
            message: 'Search for more skills?',
            initialValue: false,
          });

          if (p.isCancel(more) || !more) browsing = false;
        }

        // Prompt for env vars required by selected skills
        for (const slug of selectedSlugs) {
          const skill = optionalSkills.find((s: any) => s.slug === slug);
          if (skill?.env) {
            const value = await p.text({
              message: `${skill.env}`,
              placeholder: skill.env_description || `Required for ${skill.display_name || slug}`,
            });
            if (!p.isCancel(value) && value) {
              result.envVars[skill.env] = value as string;
            }
          }
        }
      }
    }

    // Store all skills (bundled + selected) as LUCID_SKILLS env var
    const allSkills = [...bundledSkills, ...selectedSlugs];
    if (allSkills.length > 0) {
      result.envVars.LUCID_SKILLS = allSkills.join(',');
    }
  }

  return result;
}

/**
 * Show the pre-launch confirmation card.
 */
export async function showPreLaunchSummary(opts: {
  useLucidInference: boolean;
  channels: Array<{ platform: string; mode: string }>;
  target: string;
}): Promise<boolean> {
  const lines = [
    `${color.dim('Identity')}     On-chain passport (Solana & EVM)`,
    `${color.dim('Wallet')}       Auto-created (holds, sends, receives)`,
    `${color.dim('Intelligence')} ${opts.useLucidInference ? 'Lucid Inference Gateway' : 'Your own provider'}`,
    `${color.dim('Channels')}     ${formatChannels(opts.channels)}`,
    `${color.dim('Verification')} Every action → receipt → on-chain`,
    `${color.dim('Reputation')}   Builds from real traffic`,
    `${color.dim('Revenue')}      x402 payments ready`,
    `${color.dim('Memory')}       Portable, hash-chained, agent-owned`,
    `${color.dim('Target')}       ${opts.target}`,
  ];

  p.note(lines.join('\n'), 'Ready to bring your agent to life?');

  const confirm = await p.confirm({
    message: 'Launch?',
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('Launch cancelled.');
    return false;
  }

  return true;
}

/**
 * Show post-launch success card.
 */
export function showPostLaunchSuccess(opts: {
  passportId: string;
  url?: string;
  channels: Array<{ platform: string; mode: string }>;
}): void {
  const links: string[] = [];

  for (const ch of opts.channels.filter(c => c.mode === 'managed')) {
    if (ch.platform === 'telegram') {
      const bot = process.env.LUCID_TELEGRAM_BOT_USERNAME || 'LucidAgents';
      links.push(`${color.dim('Telegram')}     t.me/${bot}?start=${opts.passportId}`);
    } else if (ch.platform === 'discord') {
      links.push(`${color.dim('Discord')}      lucid.foundation/agent/${opts.passportId}/channels`);
    } else if (ch.platform === 'slack') {
      links.push(`${color.dim('Slack')}        lucid.foundation/agent/${opts.passportId}/channels`);
    }
  }

  if (opts.url) {
    links.push(`${color.dim('WebChat')}      ${opts.url}`);
  }

  links.push(`${color.dim('Passport')}     ${opts.passportId}`);
  links.push(`${color.dim('Explorer')}     lucid.foundation/agent/${opts.passportId}`);

  const capabilities = [
    '· Prove every action with cryptographic receipts',
    '· Build reputation from real conversations',
    '· Earn revenue autonomously (x402)',
    '· Hold and transact tokens in its own wallet',
    '· Remember across sessions (portable memory)',
    '· Deploy to any DePIN provider worldwide',
  ];

  p.note(
    [
      color.bold('Your agent is alive.'),
      '',
      'It can think, act, earn, and prove —',
      'autonomously, on-chain, 24/7.',
      '',
      ...links,
      '',
      color.dim('This agent can now:'),
      ...capabilities,
    ].join('\n'),
    '◈ Welcome to the Internet of AI.',
  );

  p.log.info(`${color.dim('lucid status')} ${opts.passportId}`);
  p.log.info(`${color.dim('lucid logs')} ${opts.passportId}`);

  p.outro('Agent launched successfully.');
}

function formatChannels(channels: Array<{ platform: string; mode: string }>): string {
  const active = channels.filter(c => c.mode !== 'skip').map(c => c.platform);
  if (active.length === 0) return 'WebChat only';
  return [...active, 'WebChat'].join(' + ');
}
