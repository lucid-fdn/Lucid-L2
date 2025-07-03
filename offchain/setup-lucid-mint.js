#!/usr/bin/env node

/**
 * Setup script to configure LUCID mint address in gas.ts
 * Usage: node setup-lucid-mint.js <MINT_ADDRESS>
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('Usage: node setup-lucid-mint.js <MINT_ADDRESS>');
  console.error('Example: node setup-lucid-mint.js So11111111111111111111111111111111111111112');
  process.exit(1);
}

const mintAddress = args[0];
const gasFilePath = path.join(__dirname, 'src', 'gas.ts');

try {
  // Validate the mint address by trying to create a PublicKey
  const { PublicKey } = require('@solana/web3.js');
  new PublicKey(mintAddress);
  
  // Read the current gas.ts file
  let gasContent = fs.readFileSync(gasFilePath, 'utf8');
  
  // Replace the placeholder with the actual mint address
  gasContent = gasContent.replace(
    /export const LUCID_MINT = new PublicKey\('.*?'\);/,
    `export const LUCID_MINT = new PublicKey('${mintAddress}');`
  );
  
  // Update the comment
  gasContent = gasContent.replace(
    /\/\/ TODO: Replace with your actual LUCID mint address/,
    `// LUCID mint address configured: ${mintAddress}`
  );
  
  // Write the updated content back
  fs.writeFileSync(gasFilePath, gasContent);
  
  console.log('✅ Successfully configured LUCID mint address in gas.ts');
  console.log(`   Mint: ${mintAddress}`);
  console.log('');
  console.log('Next steps:');
  console.log('1. Ensure your wallet has LUCID tokens');
  console.log('2. Test with: npm run cli run "Hello Lucid!"');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
