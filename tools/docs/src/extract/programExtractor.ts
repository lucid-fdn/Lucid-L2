import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Public snapshot types
// ---------------------------------------------------------------------------

export interface ProgramSnapshot {
  programName: string;
  sourcePath: string;
  instructions: { name: string; params: string[] }[];
  accountStructs: { name: string; fields: string[] }[];
  sourceContent: string;
  contentHash: string;
}

export interface ContractSnapshot {
  contractName: string;
  sourcePath: string;
  functions: { name: string; visibility: string; params: string }[];
  events: { name: string; params: string }[];
  sourceContent: string;
  contentHash: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256Hex(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Strip single-line (`//`) and block (`/* ... *\/`) comments from a Rust
 * source string so that regex passes do not accidentally match inside comments.
 * Simple approach: works well for Anchor's consistent code style.
 */
function stripRustComments(src: string): string {
  // Remove block comments (non-greedy)
  let out = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Remove single-line comments but keep the newline
  out = out.replace(/\/\/[^\n]*/g, '');
  return out;
}

/**
 * Extract the body of a `pub mod <name> { ... }` block from Rust source.
 * Handles nested braces.
 */
function extractModBody(src: string, modName: string): string | null {
  // Match `pub mod <name>` (with optional whitespace)
  const headerRe = new RegExp(`pub\\s+mod\\s+${modName}\\s*\\{`);
  const match = headerRe.exec(src);
  if (!match) return null;

  const start = match.index + match[0].length;
  let depth = 1;
  let i = start;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return src.slice(start, i - 1);
}

/**
 * Normalise whitespace in a multi-line string to a single line so that
 * multi-line function signatures can be matched with simple regexes.
 */
function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Solana / Anchor extraction
// ---------------------------------------------------------------------------

/**
 * Given a collapsed single-line representation of a `pub fn` signature,
 * extract the bare parameter names (excluding `ctx`).
 *
 * Example input:
 *   "pub fn register_passport ( ctx : Context < RegisterPassport > , asset_type : AssetType , slug : String ) -> Result < ( ) >"
 */
function extractRustParams(collapsed: string): string[] {
  // Find the opening paren of the parameter list
  const parenOpen = collapsed.indexOf('(');
  const parenClose = collapsed.lastIndexOf(')');
  if (parenOpen === -1 || parenClose === -1) return [];

  const paramStr = collapsed.slice(parenOpen + 1, parenClose).trim();
  if (!paramStr) return [];

  // Split on commas that are not inside angle brackets (generic types)
  const params: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of paramStr) {
    if (ch === '<') depth++;
    else if (ch === '>') depth--;
    else if (ch === ',' && depth === 0) {
      params.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) params.push(current.trim());

  // Each param is `name : Type` — extract name, skip `ctx` and `self`
  const names: string[] = [];
  for (const p of params) {
    const colonIdx = p.indexOf(':');
    const name = colonIdx !== -1 ? p.slice(0, colonIdx).trim() : p.trim();
    if (name && name !== 'ctx' && name !== 'self' && name !== '_ctx') {
      names.push(name);
    }
  }
  return names;
}

/**
 * Extract all `pub fn` instructions from inside the `#[program]` module body.
 *
 * Anchor guarantees that every public function in the `#[program]` mod is an
 * instruction handler.  The `ctx` parameter is implicit infrastructure, so we
 * strip it and return only the "real" program parameters.
 */
function extractInstructions(
  modBody: string,
): { name: string; params: string[] }[] {
  const instructions: { name: string; params: string[] }[] = [];

  // We scan line by line, collecting a full `pub fn` signature (which may
  // span multiple lines) until we see the opening `{` of the function body.
  const lines = modBody.split('\n');
  let accumulating = false;
  let accumulated = '';

  for (const line of lines) {
    const trimmed = line.trim();

    if (!accumulating && /^pub\s+fn\s+/.test(trimmed)) {
      accumulating = true;
      accumulated = trimmed;
    } else if (accumulating) {
      accumulated += ' ' + trimmed;
    }

    if (accumulating && accumulated.includes('{')) {
      // We have the full signature up to the body opening brace
      const collapsed = collapseWhitespace(accumulated);
      // Extract function name
      const nameMatch = /pub\s+fn\s+(\w+)/.exec(collapsed);
      if (nameMatch) {
        const name = nameMatch[1];
        const params = extractRustParams(collapsed);
        instructions.push({ name, params });
      }
      accumulating = false;
      accumulated = '';
    }
  }

  return instructions;
}

/**
 * Extract `#[derive(Accounts)]` structs from Rust source.
 *
 * Returns the struct name and a list of public field names (the non-macro,
 * non-comment lines that contain `pub <name>:`).
 */
function extractAccountStructs(
  src: string,
): { name: string; fields: string[] }[] {
  const structs: { name: string; fields: string[] }[] = [];

  // Find each `#[derive(Accounts)]` annotation
  const deriveRe = /#\[derive\(Accounts\)\]/g;
  let m: RegExpExecArray | null;

  while ((m = deriveRe.exec(src)) !== null) {
    // After the annotation (and optional additional `#[instruction(...)]` lines),
    // find the `pub struct <Name>` declaration
    const afterAnnotation = src.slice(m.index + m[0].length);
    const structHeaderMatch = /pub\s+struct\s+(\w+)/.exec(afterAnnotation);
    if (!structHeaderMatch) continue;

    const structName = structHeaderMatch[1];
    const braceStart = afterAnnotation.indexOf('{', structHeaderMatch.index);
    if (braceStart === -1) continue;

    // Extract the struct body (handling nested braces for account constraints)
    let depth = 1;
    let i = braceStart + 1;
    while (i < afterAnnotation.length && depth > 0) {
      if (afterAnnotation[i] === '{') depth++;
      else if (afterAnnotation[i] === '}') depth--;
      i++;
    }
    const body = afterAnnotation.slice(braceStart + 1, i - 1);

    // Extract `pub <field_name>:` patterns
    const fieldRe = /pub\s+(\w+)\s*:/g;
    const fields: string[] = [];
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(body)) !== null) {
      fields.push(fm[1]);
    }

    structs.push({ name: structName, fields });
  }

  return structs;
}

// ---------------------------------------------------------------------------
// Public API: Solana
// ---------------------------------------------------------------------------

/**
 * Extract a ProgramSnapshot from an Anchor Rust program directory.
 *
 * Reads `<programDir>/src/lib.rs`, parses the `#[program]` module for
 * instruction handlers, and locates `#[derive(Accounts)]` structs.
 *
 * No Rust toolchain or `anchor` CLI required — pure regex over source text.
 */
export function extractSolanaProgram(programDir: string): ProgramSnapshot {
  const libRsPath = path.join(programDir, 'src', 'lib.rs');
  const sourceContent = fs.readFileSync(libRsPath, 'utf8');
  const contentHash = sha256Hex(sourceContent);

  // Infer program name: prefer the `pub mod <name>` inside `#[program]`
  // annotation, fall back to directory basename.
  const stripped = stripRustComments(sourceContent);
  const programAnnotationIdx = stripped.indexOf('#[program]');
  let programName = path.basename(programDir);

  if (programAnnotationIdx !== -1) {
    const afterAnnotation = stripped.slice(programAnnotationIdx + '#[program]'.length);
    const modMatch = /pub\s+mod\s+(\w+)/.exec(afterAnnotation);
    if (modMatch) {
      // Convert snake_case mod name to a display name
      programName = modMatch[1];
    }
  }

  // Extract instructions from the #[program] module body
  const modBodyRaw = extractModBody(stripped, programName) ?? '';
  const instructions = extractInstructions(modBodyRaw);

  // Extract account structs from the full source (they live outside the mod)
  const accountStructs = extractAccountStructs(stripped);

  return {
    programName,
    sourcePath: libRsPath,
    instructions,
    accountStructs,
    sourceContent,
    contentHash,
  };
}

// ---------------------------------------------------------------------------
// Solidity extraction helpers
// ---------------------------------------------------------------------------

/**
 * Strip Solidity single-line and block comments.
 */
function stripSolidityComments(src: string): string {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  out = out.replace(/\/\/[^\n]*/g, '');
  return out;
}

/**
 * Extract the visibility keyword from a Solidity function declaration fragment.
 * Recognises: public, external, internal, private.
 * Defaults to 'public' if none found (e.g. constructor-style).
 */
function extractSolidityVisibility(sig: string): string {
  if (/\bexternal\b/.test(sig)) return 'external';
  if (/\bpublic\b/.test(sig)) return 'public';
  if (/\binternal\b/.test(sig)) return 'internal';
  if (/\bprivate\b/.test(sig)) return 'private';
  return 'public';
}

/**
 * Extract the raw parameter list string from a Solidity function or event
 * signature — the content between the outermost `(` and `)`.
 */
function extractParenContent(sig: string): string {
  const open = sig.indexOf('(');
  if (open === -1) return '';
  let depth = 1;
  let i = open + 1;
  while (i < sig.length && depth > 0) {
    if (sig[i] === '(') depth++;
    else if (sig[i] === ')') depth--;
    i++;
  }
  return sig.slice(open + 1, i - 1).trim();
}

// ---------------------------------------------------------------------------
// Public API: Solidity
// ---------------------------------------------------------------------------

/**
 * Extract a ContractSnapshot from a Solidity source file.
 *
 * Reads the `.sol` file, parses:
 * - Contract name from `contract Name`
 * - Functions: `function name(...) <visibility>` declarations
 * - Events: `event Name(...)` declarations
 *
 * No `solc` compiler required — pure regex over source text.
 */
export function extractSolidityContract(contractPath: string): ContractSnapshot {
  const sourceContent = fs.readFileSync(contractPath, 'utf8');
  const contentHash = sha256Hex(sourceContent);

  const stripped = stripSolidityComments(sourceContent);

  // --- Contract name ---
  const contractNameMatch = /\bcontract\s+(\w+)/.exec(stripped);
  const contractName = contractNameMatch ? contractNameMatch[1] : path.basename(contractPath, '.sol');

  // --- Functions ---
  // Match `function <name>(...)` declarations.  We collect the full signature
  // up to the opening `{` or `;` (for interface/abstract functions).
  const functions: { name: string; visibility: string; params: string }[] = [];

  // Tokenise into lines for multi-line signature accumulation
  const lines = stripped.split('\n');
  let accum = '';
  let inFn = false;

  for (const line of lines) {
    const t = line.trim();

    if (!inFn && /\bfunction\s+\w+/.test(t)) {
      inFn = true;
      accum = t;
    } else if (inFn) {
      accum += ' ' + t;
    }

    if (inFn && (accum.includes('{') || accum.includes(';'))) {
      const collapsed = collapseWhitespace(accum);
      const nameMatch = /function\s+(\w+)/.exec(collapsed);
      if (nameMatch) {
        const name = nameMatch[1];
        const visibility = extractSolidityVisibility(collapsed);
        const params = extractParenContent(collapsed);
        functions.push({ name, visibility, params });
      }
      inFn = false;
      accum = '';
    }
  }

  // --- Events ---
  const events: { name: string; params: string }[] = [];

  // Events are typically single-line but handle multi-line for safety
  const eventLines = stripped.split('\n');
  let eventAccum = '';
  let inEvent = false;

  for (const line of eventLines) {
    const t = line.trim();

    if (!inEvent && /\bevent\s+\w+/.test(t)) {
      inEvent = true;
      eventAccum = t;
    } else if (inEvent) {
      eventAccum += ' ' + t;
    }

    if (inEvent && eventAccum.includes(';')) {
      const collapsed = collapseWhitespace(eventAccum);
      const nameMatch = /event\s+(\w+)/.exec(collapsed);
      if (nameMatch) {
        const name = nameMatch[1];
        const params = extractParenContent(collapsed);
        events.push({ name, params });
      }
      inEvent = false;
      eventAccum = '';
    }
  }

  return {
    contractName,
    sourcePath: contractPath,
    functions,
    events,
    sourceContent,
    contentHash,
  };
}
