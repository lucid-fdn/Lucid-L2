#!/usr/bin/env node

/**
 * Test script for Supabase PostgREST connectivity
 * 
 * Usage:
 *   node test-supabase-connection.js [SERVER_IP]
 * 
 * Example:
 *   node test-supabase-connection.js localhost
 *   node test-supabase-connection.js 54.123.45.67
 */

const SERVER_IP = process.argv[2] || 'localhost'
const SUPABASE_URL = `http://${SERVER_IP}:3000`
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1sb2NhbCIsInJvbGUiOiJhbm9uIiwiZXhwIjoxOTgzODEyOTk2fQ.z0ZM6XeVdZtyR1nhfFyaB0wFlzobe8_IZXvhqUCZPFg'

console.log('🧪 Testing Supabase Connection...\n')
console.log(`📍 Server: ${SERVER_IP}`)
console.log(`🔗 URL: ${SUPABASE_URL}\n`)

async function testConnection() {
  const tests = [
    {
      name: '1. Check PostgREST is running',
      test: async () => {
        const response = await fetch(`${SUPABASE_URL}/`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        return `PostgREST v${data.info.version} is running`
      }
    },
    {
      name: '2. Test API key authentication',
      test: async () => {
        const response = await fetch(`${SUPABASE_URL}/workflows?limit=1`, {
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
          }
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        return `Authentication successful (${Array.isArray(data) ? data.length : 0} workflows found)`
      }
    },
    {
      name: '3. List all available tables',
      test: async () => {
        const response = await fetch(`${SUPABASE_URL}/`, {
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY
          }
        })
        const spec = await response.json()
        const tables = Object.keys(spec.definitions || {})
        return `${tables.length} tables available: ${tables.slice(0, 5).join(', ')}...`
      }
    },
    {
      name: '4. Test organizations table',
      test: async () => {
        const response = await fetch(`${SUPABASE_URL}/organizations?limit=1`, {
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY
          }
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        return `Organizations table accessible (${data.length} record(s))`
      }
    },
    {
      name: '5. Test RPC functions',
      test: async () => {
        const response = await fetch(`${SUPABASE_URL}/`)
        const spec = await response.json()
        const rpcFunctions = Object.keys(spec.paths).filter(p => p.startsWith('/rpc/'))
        return `${rpcFunctions.length} RPC functions available`
      }
    },
    {
      name: '6. Test Kong Gateway',
      test: async () => {
        const response = await fetch(`http://${SERVER_IP}:8000/`, {
          headers: { 'Accept': 'application/json' }
        })
        return `Kong Gateway is ${response.ok ? 'accessible' : 'not responding'}`
      }
    }
  ]

  let passed = 0
  let failed = 0

  for (const { name, test } of tests) {
    try {
      const result = await test()
      console.log(`✅ ${name}`)
      console.log(`   ${result}\n`)
      passed++
    } catch (error) {
      console.log(`❌ ${name}`)
      console.log(`   Error: ${error.message}\n`)
      failed++
    }
  }

  console.log('━'.repeat(60))
  console.log(`📊 Results: ${passed} passed, ${failed} failed`)
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! Your Supabase instance is ready for serverless connections.')
    console.log(`\n📝 Next steps:`)
    console.log(`   1. Replace YOUR_SERVER_IP in the connection guide with: ${SERVER_IP}`)
    console.log(`   2. Install @supabase/supabase-js in your serverless project`)
    console.log(`   3. Use the examples in SERVERLESS-SUPABASE-CONNECTION-GUIDE.md`)
  } else {
    console.log('\n⚠️  Some tests failed. Check the errors above.')
    console.log('\n💡 Common issues:')
    console.log('   - Ensure docker containers are running: docker compose ps')
    console.log('   - Check firewall allows connections on ports 3000 and 8000')
    console.log('   - Verify .env file has correct configuration')
  }
}

testConnection().catch(err => {
  console.error('❌ Fatal error:', err)
  process.exit(1)
})
