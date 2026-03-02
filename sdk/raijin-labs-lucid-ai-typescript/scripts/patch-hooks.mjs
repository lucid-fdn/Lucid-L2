#!/usr/bin/env node
/**
 * Post-generation patch for hooks.ts
 *
 * After `speakeasy run` regenerates hooks.ts, this script re-applies
 * the custom initHooks wiring that connects registration.ts hooks.
 *
 * Usage: node scripts/patch-hooks.mjs
 * Or:    npm run postgen
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hooksPath = resolve(__dirname, '../src/hooks/hooks.ts');

let content = readFileSync(hooksPath, 'utf-8');

const IMPORT_LINE = 'import { initHooks } from "./registration.js";';
const INIT_LINE = '    initHooks(this);';

let patched = false;

// 1. Add import if missing
if (!content.includes('initHooks')) {
  // Insert after the last import line
  const lastImportIdx = content.lastIndexOf('} from "');
  if (lastImportIdx === -1) {
    console.error('Could not find import block in hooks.ts');
    process.exit(1);
  }
  const insertPoint = content.indexOf('\n', lastImportIdx) + 1;
  content = content.slice(0, insertPoint) + IMPORT_LINE + '\n' + content.slice(insertPoint);
  patched = true;
}

// 2. Add initHooks(this) in constructor if missing
if (!content.includes('initHooks(this)')) {
  const constructorMatch = content.indexOf('const presetHooks');
  if (constructorMatch === -1) {
    console.error('Could not find constructor in hooks.ts');
    process.exit(1);
  }
  const insertPoint = content.indexOf('\n', constructorMatch) + 1;
  content = content.slice(0, insertPoint) + INIT_LINE + '\n' + content.slice(insertPoint);
  patched = true;
}

if (patched) {
  writeFileSync(hooksPath, content);
  console.log('hooks.ts patched successfully');
} else {
  console.log('hooks.ts already patched, no changes needed');
}
