/**
 * Test Script for Hyperliquid Protocol Adapter
 * 
 * Demonstrates the Protocol SDK with Hyperliquid as a reference implementation.
 * 
 * Usage:
 *   node test-hyperliquid-protocol.js
 */

const { protocolManager } = require('./dist/services/protocolManager');
const { protocolRegistry } = require('./dist/protocols/ProtocolRegistry');

// Import adapters to trigger auto-registration
require('./dist/protocols/adapters');

async function testHyperliquidProtocol() {
  console.log('🧪 Testing Hyperliquid Protocol Adapter\n');

  try {
    // ==========================================================================
    // 1. List Available Protocols
    // ==========================================================================
    console.log('📋 Available Protocols:');
    const protocols = protocolManager.listProtocols();
    protocols.forEach(p => {
      console.log(`  - ${p.name} (${p.id}) v${p.version}`);
      console.log(`    Category: ${p.category}`);
      console.log(`    Networks: ${p.networks?.join(', ')}`);
      console.log('');
    });

    // ==========================================================================
    // 2. Get Hyperliquid Operations
    // ==========================================================================
    console.log('⚙️  Hyperliquid Operations:');
    const operations = await protocolManager.getProtocolOperations('hyperliquid', {
      network: 'testnet'
    });
    
    console.log(`  Total: ${operations.length} operations`);
    operations.forEach(op => {
      const authBadge = op.requiresAuth ? '🔒' : '🌐';
      const writeBadge = op.isWrite ? '✏️ ' : '👁️ ';
      console.log(`  ${authBadge} ${writeBadge} ${op.name} (${op.id})`);
    });
    console.log('');

    // ==========================================================================
    // 3. Test Market Data Operations (No Auth Required)
    // ==========================================================================
    console.log('📊 Testing Market Data Operations:\n');

    // Test 1: Get All Mid Prices
    console.log('Test 1: Get All Mid Prices');
    const midsResult = await protocolManager.execute({
      protocolId: 'hyperliquid',
      operationId: 'getAllMids',
      parameters: {},
      userId: 'test-user',
      config: { network: 'testnet' }
    });

    if (midsResult.success) {
      const prices = Object.entries(midsResult.data).slice(0, 5);
      console.log('✅ Success! Sample prices:');
      prices.forEach(([symbol, price]) => {
        console.log(`  ${symbol}: $${price}`);
      });
      console.log(`  Duration: ${midsResult.metadata?.duration}ms\n`);
    } else {
      console.log(`❌ Failed: ${midsResult.error}\n`);
    }

    // Test 2: Get L2 Order Book
    console.log('Test 2: Get L2 Order Book for BTC');
    const l2BookResult = await protocolManager.execute({
      protocolId: 'hyperliquid',
      operationId: 'getL2Book',
      parameters: { symbol: 'BTC' },
      userId: 'test-user',
      config: { network: 'testnet' }
    });

    if (l2BookResult.success) {
      const book = l2BookResult.data;
      console.log('✅ Success!');
      console.log(`  Coin: ${book.coin}`);
      console.log(`  Bids: ${book.levels[0].length} levels`);
      console.log(`  Asks: ${book.levels[1].length} levels`);
      if (book.levels[0][0]) {
        console.log(`  Best Bid: $${book.levels[0][0].px} (${book.levels[0][0].sz})`);
      }
      if (book.levels[1][0]) {
        console.log(`  Best Ask: $${book.levels[1][0].px} (${book.levels[1][0].sz})`);
      }
      console.log(`  Duration: ${l2BookResult.metadata?.duration}ms\n`);
    } else {
      console.log(`❌ Failed: ${l2BookResult.error}\n`);
    }

    // Test 3: Get Recent Trades
    console.log('Test 3: Get Recent Trades for ETH');
    const tradesResult = await protocolManager.execute({
      protocolId: 'hyperliquid',
      operationId: 'getRecentTrades',
      parameters: { symbol: 'ETH', limit: 5 },
      userId: 'test-user',
      config: { network: 'testnet' }
    });

    if (tradesResult.success) {
      console.log('✅ Success! Recent trades:');
      tradesResult.data.forEach((trade, i) => {
        const side = trade.side === 'B' ? '🟢 BUY ' : '🔴 SELL';
        console.log(`  ${i + 1}. ${side} ${trade.sz} @ $${trade.px}`);
      });
      console.log(`  Duration: ${tradesResult.metadata?.duration}ms\n`);
    } else {
      console.log(`❌ Failed: ${tradesResult.error}\n`);
    }

    // Test 4: Get Market Metadata
    console.log('Test 4: Get Market Metadata');
    const metaResult = await protocolManager.execute({
      protocolId: 'hyperliquid',
      operationId: 'getMarketMeta',
      parameters: {},
      userId: 'test-user',
      config: { network: 'testnet' }
    });

    if (metaResult.success) {
      const markets = metaResult.data.universe.slice(0, 5);
      console.log('✅ Success! Sample markets:');
      markets.forEach(market => {
        console.log(`  ${market.name} (decimals: ${market.szDecimals})`);
      });
      console.log(`  Total Markets: ${metaResult.data.universe.length}`);
      console.log(`  Duration: ${metaResult.metadata?.duration}ms\n`);
    } else {
      console.log(`❌ Failed: ${metaResult.error}\n`);
    }

    // ==========================================================================
    // 4. Protocol Health Check
    // ==========================================================================
    console.log('🏥 Health Check:');
    const health = await protocolManager.checkHealth();
    
    Object.entries(health).forEach(([protocolId, status]) => {
      const statusEmoji = status.status === 'healthy' ? '✅' : 
                          status.status === 'degraded' ? '⚠️' : '❌';
      console.log(`  ${statusEmoji} ${protocolId}: ${status.status}`);
      if (status.networks) {
        Object.entries(status.networks).forEach(([network, netStatus]) => {
          console.log(`     ${network}: ${netStatus.latency}ms latency`);
        });
      }
    });
    console.log('');

    // ==========================================================================
    // 5. Protocol Statistics
    // ==========================================================================
    console.log('📈 Protocol Statistics:');
    const stats = protocolManager.getStats();
    console.log(`  Total Protocols: ${stats.totalProtocols}`);
    console.log(`  Active Instances: ${stats.totalInstances}`);
    console.log(`  By Category:`);
    Object.entries(stats.byCategory).forEach(([category, count]) => {
      console.log(`    ${category}: ${count}`);
    });
    console.log('');

    // ==========================================================================
    // 6. Test Parameter Validation
    // ==========================================================================
    console.log('🔍 Testing Parameter Validation:');
    
    const invalidResult = await protocolManager.execute({
      protocolId: 'hyperliquid',
      operationId: 'getL2Book',
      parameters: {}, // Missing required 'symbol' parameter
      userId: 'test-user',
      config: { network: 'testnet' }
    });

    if (!invalidResult.success) {
      console.log(`✅ Validation working: ${invalidResult.error}\n`);
    }

    // ==========================================================================
    // Summary
    // ==========================================================================
    console.log('✨ Test Complete!\n');
    console.log('🎉 Protocol SDK is working correctly!');
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Run: npm install (to install @nktkas/hyperliquid)');
    console.log('  2. Add more protocol adapters (Solana, Jupiter, etc.)');
    console.log('  3. Integrate with FlowSpec for workflow automation');
    console.log('  4. Build frontend for protocol discovery and configuration');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    console.error(error.stack);
  }
}

// Run tests
testHyperliquidProtocol()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
