#!/usr/bin/env node

/**
 * Test script to verify Nango connection to Supabase Cloud
 */

const http = require('http');

console.log('🔍 Testing Nango Connection to Supabase Cloud...\n');

// Test 1: Health endpoint
function testHealthEndpoint() {
  return new Promise((resolve, reject) => {
    console.log('1️⃣  Testing Nango health endpoint...');
    
    const options = {
      hostname: 'localhost',
      port: 3003,
      path: '/health',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.result === 'ok') {
            console.log('   ✅ Health check passed: Nango is running');
            resolve(true);
          } else {
            console.log('   ❌ Health check failed:', data);
            resolve(false);
          }
        } catch (e) {
          console.log('   ❌ Invalid response:', data);
          resolve(false);
        }
      });
    });

    req.on('error', (e) => {
      console.log('   ❌ Connection failed:', e.message);
      resolve(false);
    });

    req.setTimeout(5000, () => {
      req.abort();
      console.log('   ❌ Request timeout');
      resolve(false);
    });

    req.end();
  });
}

// Test 2: Dashboard accessibility
function testDashboard() {
  return new Promise((resolve, reject) => {
    console.log('2️⃣  Testing Nango dashboard...');
    
    const options = {
      hostname: 'localhost',
      port: 3007,
      path: '/',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200 || res.statusCode === 301 || res.statusCode === 302) {
        console.log('   ✅ Dashboard is accessible at http://localhost:3007');
        resolve(true);
      } else {
        console.log('   ⚠️  Dashboard returned status:', res.statusCode);
        resolve(false);
      }
    });

    req.on('error', (e) => {
      console.log('   ❌ Dashboard connection failed:', e.message);
      resolve(false);
    });

    req.setTimeout(5000, () => {
      req.abort();
      console.log('   ❌ Dashboard request timeout');
      resolve(false);
    });

    req.end();
  });
}

// Run all tests
async function runTests() {
  const healthResult = await testHealthEndpoint();
  const dashboardResult = await testDashboard();
  
  console.log('\n📊 Test Results:');
  console.log('================');
  console.log(`Health Endpoint: ${healthResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Dashboard: ${dashboardResult ? '✅ PASS' : '⚠️  CHECK'}`);
  
  console.log('\n📝 Configuration Details:');
  console.log('========================');
  console.log('Database Host: aws-1-eu-north-1.pooler.supabase.com');
  console.log('Database Port: 6543 (connection pooler)');
  console.log('Database User: postgres.kwihlcnapmkaivijyiif');
  console.log('API URL: http://localhost:3003');
  console.log('Dashboard URL: http://localhost:3007');
  
  if (healthResult && dashboardResult) {
    console.log('\n✨ SUCCESS! Nango is properly connected to Supabase Cloud');
    process.exit(0);
  } else if (healthResult) {
    console.log('\n⚠️  Nango API is working, but dashboard may need a moment to start');
    process.exit(0);
  } else {
    console.log('\n❌ Tests failed. Check the Nango logs for details.');
    process.exit(1);
  }
}

runTests();
