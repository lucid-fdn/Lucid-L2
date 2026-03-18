export interface AssembleParams {
  domain: string;
  commitSha: string;
  aiContent: string;
  keyInterfacesSection: string;
  crossDepsSection: string;
  symbolWarnings: string[];
}

/**
 * Extract the body of a named `## heading` section from raw AI content.
 * Returns the trimmed content between the heading and the next `##` heading (or EOF).
 */
function extractSection(aiContent: string, heading: string): string {
  const pattern = new RegExp(
    `## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`,
  );
  const match = aiContent.match(pattern);
  if (!match) return '';
  return match[1].trim();
}

/**
 * Capitalize the first character of a string.
 */
function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Assemble a final module documentation markdown string from deterministic
 * sections and AI-generated narrative content.
 */
export function assembleModuleDoc(params: AssembleParams): string {
  const { domain, commitSha, aiContent, keyInterfacesSection, crossDepsSection, symbolWarnings } =
    params;

  const timestamp = new Date().toISOString();
  const title = capitalizeFirst(domain);

  const purpose = extractSection(aiContent, 'Purpose');
  const architecture = extractSection(aiContent, 'Architecture');
  const dataFlow = extractSection(aiContent, 'Data Flow');
  const patternsAndGotchas = extractSection(aiContent, 'Patterns & Gotchas');

  const lines: string[] = [];

  // Generation comment
  lines.push(`<!-- generated: commit ${commitSha}, ${timestamp} -->`);

  // Optional symbol warning comment
  if (symbolWarnings.length > 0) {
    lines.push(`<!-- WARNING: unverified identifiers: ${symbolWarnings.join(', ')} -->`);
  }

  // Title
  lines.push(`# ${title}`);
  lines.push('');

  // Purpose
  lines.push('## Purpose');
  lines.push(purpose);
  lines.push('');

  // Architecture
  lines.push('## Architecture');
  lines.push(architecture);
  lines.push('');

  // Data Flow
  lines.push('## Data Flow');
  lines.push(dataFlow);
  lines.push('');

  // Deterministic: Key Interfaces
  lines.push(keyInterfacesSection);
  lines.push('');

  // Deterministic: Cross-Domain Dependencies
  lines.push(crossDepsSection);
  lines.push('');

  // Patterns & Gotchas
  lines.push('## Patterns & Gotchas');
  lines.push(patternsAndGotchas);

  return lines.join('\n');
}
