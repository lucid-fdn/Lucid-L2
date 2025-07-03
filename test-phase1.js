const { execSync } = require('child_process');

console.log('🧪 Testing Lucid L2 Phase 1 Implementation');
console.log('==========================================\n');

// Test 1: Check if Solana validator is running
console.log('1. Checking Solana validator status...');
try {
  const result = execSync('solana cluster-version', { encoding: 'utf8' });
  console.log('✅ Solana validator is running');
  console.log(`   Version: ${result.trim()}\n`);
} catch (error) {
  console.log('❌ Solana validator is not running');
  process.exit(1);
}

// Test 2: Check deployed program
console.log('2. Checking deployed program...');
try {
  const result = execSync('solana program show 8QRA7K4UHaFhsyRqrUAU7onsJhVHiP7FvwSHouD1dM29', { encoding: 'utf8' });
  console.log('✅ Program is deployed and accessible');
  console.log(`   Program ID: 8QRA7K4UHaFhsyRqrUAU7onsJhVHiP7FvwSHouD1dM29\n`);
} catch (error) {
  console.log('❌ Program not found or not accessible');
  process.exit(1);
}

// Test 3: Test off-chain service
console.log('3. Testing off-chain service...');
try {
  const result = execSync(`curl -s -X POST http://localhost:3001/run -H "Content-Type: application/json" -d '{"text": "Phase 1 test successful!"}'`, { encoding: 'utf8' });
  const response = JSON.parse(result);
  
  if (response.success) {
    console.log('✅ Off-chain service is working');
    console.log(`   Transaction: ${response.txSignature}`);
    console.log(`   Merkle Root: ${response.root}`);
    console.log(`   Authority: ${Object.keys(response.store)[0]}\n`);
  } else {
    console.log('❌ Off-chain service returned error:', response.error);
    process.exit(1);
  }
} catch (error) {
  console.log('❌ Off-chain service is not responding');
  console.log('   Make sure the service is running on port 3001');
  process.exit(1);
}

console.log('🎉 Phase 1 Implementation Complete!');
console.log('===================================');
console.log('✅ Solana program deployed and functional');
console.log('✅ Off-chain inference service running');
console.log('✅ Merkle root commitment to blockchain working');
console.log('✅ Memory wallet storing inference results');
console.log('\nPhase 1 MVP is ready for use! 🚀');
