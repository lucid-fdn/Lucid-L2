#!/usr/bin/env node

/**
 * MMR Test Script
 * 
 * Demonstrates the Merkle Mountain Range functionality integrated
 * with Lucid L2's thought-epoch system.
 */

const { execSync } = require('child_process');

console.log('🎬 MMR Integration Test for Lucid L2');
console.log('=====================================\n');

async function runCommand(command, description) {
  console.log(`📋 ${description}`);
  console.log(`💻 Command: ${command}`);
  console.log('---');
  
  try {
    const output = execSync(command, { 
      cwd: './offchain',
      encoding: 'utf8',
      stdio: 'pipe'
    });
    console.log(output);
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stdout) console.log('stdout:', error.stdout);
    if (error.stderr) console.log('stderr:', error.stderr);
    return false;
  }
}

async function main() {
  console.log('🔧 Testing MMR functionality...\n');

  // Test 1: Check IPFS connectivity
  console.log('1️⃣ Checking IPFS connectivity');
  await runCommand('npm run cli mmr:ipfs', 'Check IPFS node status');
  console.log('\n');

  // Test 2: Initialize an agent
  console.log('2️⃣ Initializing test agent');
  await runCommand('npm run cli mmr:init test-agent-1', 'Initialize MMR for test-agent-1');
  console.log('\n');

  // Test 3: Process first epoch
  console.log('3️⃣ Processing first epoch');
  await runCommand('npm run cli mmr:epoch test-agent-1 "Hello" "World" "MMR" --epoch 1', 'Process epoch 1 with 3 vectors');
  console.log('\n');

  // Test 4: Process second epoch
  console.log('4️⃣ Processing second epoch');
  await runCommand('npm run cli mmr:epoch test-agent-1 "Lucid" "L2" "Blockchain" --epoch 2', 'Process epoch 2 with 3 vectors');
  console.log('\n');

  // Test 5: Get agent statistics
  console.log('5️⃣ Getting agent statistics');
  await runCommand('npm run cli mmr:stats test-agent-1', 'Get MMR statistics for test-agent-1');
  console.log('\n');

  // Test 6: Get agent history
  console.log('6️⃣ Getting agent history');
  await runCommand('npm run cli mmr:history test-agent-1', 'Get MMR root history for test-agent-1');
  console.log('\n');

  // Test 7: Generate contribution proof
  console.log('7️⃣ Generating contribution proof');
  await runCommand('npm run cli mmr:proof test-agent-1 "Hello" 1', 'Generate proof that "Hello" was in epoch 1');
  console.log('\n');

  // Test 8: Verify MMR integrity
  console.log('8️⃣ Verifying MMR integrity');
  await runCommand('npm run cli mmr:verify test-agent-1', 'Verify MMR integrity for test-agent-1');
  console.log('\n');

  // Test 9: List all agents
  console.log('9️⃣ Listing all agents');
  await runCommand('npm run cli mmr:list', 'List all registered agents');
  console.log('\n');

  // Test 10: Run full demo
  console.log('🔟 Running full MMR demo');
  await runCommand('npm run cli mmr:demo', 'Run complete MMR demonstration');
  console.log('\n');

  console.log('✅ MMR Integration Test Complete!');
  console.log('\n🎯 Key Features Demonstrated:');
  console.log('   • Per-agent MMR management');
  console.log('   • IPFS off-chain storage');
  console.log('   • On-chain root commitment');
  console.log('   • Proof-of-contribution generation');
  console.log('   • Immutable epoch timeline');
  console.log('   • Gas cost calculation');
  console.log('\n📚 Usage Examples:');
  console.log('   cd offchain && npm run cli mmr:init my-agent');
  console.log('   cd offchain && npm run cli mmr:epoch my-agent "vector1" "vector2"');
  console.log('   cd offchain && npm run cli mmr:proof my-agent "vector1" 1');
  console.log('   cd offchain && npm run cli mmr:stats my-agent');
}

main().catch(console.error);
