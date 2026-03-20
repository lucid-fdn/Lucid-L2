import { enrichDomain } from '../enrich/enricher';

export async function enrichPage(title: string, description: string, rawContent: string, sourceFile: string): Promise<string> {
  const system = `You are converting internal developer documentation into a public-facing doc page for docs.lucid.foundation (Mintlify).

Rules:
- Rewrite for a developer who has never seen Lucid before
- Remove internal file paths and implementation details unless they help the reader
- Keep code examples, CLI commands, and API examples
- Keep tables
- Add context where the source assumes prior knowledge
- Tone: clear, direct, practical
- Output ONLY the page body content as MDX (no frontmatter, no import statements)
- Do NOT wrap output in code fences`;

  const user = `Convert this internal documentation into a public doc page.

Target page: "${title}"
Description: "${description}"
Source: ${sourceFile}

---
${rawContent}
---

Write the page body only. No frontmatter. No import statements.`;

  return enrichDomain(system, user);
}
