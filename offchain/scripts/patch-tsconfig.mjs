#!/usr/bin/env node
/**
 * Patch tsconfig.json after Speakeasy regenerates it
 * 
 * This script adds exclusions for custom backend code that shouldn't
 * be compiled with Speakeasy's strict TypeScript settings.
 * 
 * Run this after `speakeasy run` or add to your CI/CD pipeline.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TSCONFIG_PATH = path.resolve(__dirname, '../tsconfig.json');

// Custom directories and files to exclude from Speakeasy's strict compilation
const CUSTOM_CODE_EXCLUSIONS = [
  // Directories with custom backend code
  "src/__tests__",
  "src/commands",
  "src/data",
  "src/flowspec",
  "src/jobs",
  "src/mcp",
  "src/middleware",
  "src/protocols",
  "src/providers",
  "src/routes",
  "src/services",
  "src/solana",
  "src/storage",
  "src/utils",
  // Root-level custom files
  "src/cli.ts",
  "src/heliusHelpers.ts",
  "src/index.ts",
  "src/indexer.ts",
  "src/memoryWallet.ts",
  "src/solanaClient.ts",
  // Specific paths with custom code
  "src/lib/auth",
  "src/types/lucid_passports.ts"
];

function patchTsConfig() {
  console.log('📝 Patching tsconfig.json...');
  
  if (!fs.existsSync(TSCONFIG_PATH)) {
    console.error('❌ tsconfig.json not found at:', TSCONFIG_PATH);
    process.exit(1);
  }
  
  // Read the current tsconfig
  const content = fs.readFileSync(TSCONFIG_PATH, 'utf-8');
  let tsconfig;
  
  try {
    // Handle JSON with trailing commas (TypeScript tsconfig allows this)
    tsconfig = JSON.parse(content.replace(/,(\s*[}\]])/g, '$1'));
  } catch (err) {
    console.error('❌ Failed to parse tsconfig.json:', err.message);
    process.exit(1);
  }
  
  // Ensure exclude array exists
  if (!tsconfig.exclude) {
    tsconfig.exclude = ['node_modules'];
  }
  
  // Add custom exclusions if not already present
  let modified = false;
  for (const exclusion of CUSTOM_CODE_EXCLUSIONS) {
    if (!tsconfig.exclude.includes(exclusion)) {
      tsconfig.exclude.push(exclusion);
      modified = true;
    }
  }
  
  if (modified) {
    // Write back with pretty formatting
    fs.writeFileSync(TSCONFIG_PATH, JSON.stringify(tsconfig, null, 2) + '\n');
    console.log('✅ tsconfig.json patched successfully!');
    console.log(`   Added ${CUSTOM_CODE_EXCLUSIONS.length} exclusions for custom code`);
  } else {
    console.log('✅ tsconfig.json already has all exclusions');
  }
}

// Run the patch
patchTsConfig();
