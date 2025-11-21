/**
 * Script to create a Privy Key Quorum
 * 
 * This script:
 * 1. Extracts the public key from the private key file
 * 2. Creates a Key Quorum via Privy API
 * 3. Outputs the Quorum ID for your .env file
 * 
 * Usage: ts-node scripts/create-privy-key-quorum.ts
 */

import { PrivyClient } from '@privy-io/server-auth';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function createKeyQuorum() {
  try {
    console.log('🔑 Creating Privy Key Quorum...\n');

    // Get credentials from .env
    const appId = process.env.PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    const privateKeyPath = process.env.PRIVY_AUTH_PRIVATE_KEY;

    if (!appId || !appSecret || !privateKeyPath) {
      throw new Error('Missing required environment variables: PRIVY_APP_ID, PRIVY_APP_SECRET, or PRIVY_AUTH_PRIVATE_KEY');
    }

    console.log(`📄 App ID: ${appId.substring(0, 10)}...`);
    console.log(`📄 Private Key Path: ${privateKeyPath}\n`);

    // Read private key file
    const privateKeyPEM = fs.readFileSync(privateKeyPath, 'utf8');
    console.log('✅ Private key file loaded successfully\n');

    // Extract public key from private key using Node.js crypto
    const privateKeyObj = crypto.createPrivateKey(privateKeyPEM);
    const publicKeyPEM = crypto.createPublicKey(privateKeyObj).export({
      type: 'spki',
      format: 'pem'
    }) as string;

    console.log('📋 Public Key (PEM format):');
    console.log(publicKeyPEM);

    // Initialize Privy client
    const privy = new PrivyClient(appId, appSecret);

    console.log('\n🌐 Connecting to Privy API...');

    // Note: The Privy SDK might not have a direct method to create key quorums
    // This would typically be done via the Privy Dashboard or REST API
    // Let's try using the REST API directly

    const axios = require('axios');
    const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64');

    const response = await axios.post(
      'https://api.privy.io/v1/key-quorums',
      {
        name: 'Lucid Server Key Quorum',
        threshold: 1,
        keys: [
          {
            public_key: publicKeyPEM,
            name: 'Lucid Server Authorization Key'
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${basicAuth}`,
          'privy-app-id': appId
        }
      }
    );

    const quorumId = response.data.id;

    console.log('\n✅ Key Quorum created successfully!');
    console.log('━'.repeat(60));
    console.log(`\n📋 Quorum ID: ${quorumId}\n`);
    console.log('━'.repeat(60));
    console.log('\n📝 Update your .env file with:');
    console.log(`PRIVY_KEY_QUORUM_ID=${quorumId}`);
    console.log('\n');

    return quorumId;

  } catch (error: any) {
    console.error('\n❌ Error creating key quorum:');
    
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Error:`, error.response.data);
      
      if (error.response.status === 401) {
        console.error('\n💡 Tip: Check that your PRIVY_APP_ID and PRIVY_APP_SECRET are correct');
      } else if (error.response.status === 409) {
        console.error('\n💡 Tip: A key quorum with this public key may already exist');
        console.error('    Check your Privy Dashboard: https://dashboard.privy.io');
      }
    } else {
      console.error(error.message);
    }
    
    process.exit(1);
  }
}

// Run the script
createKeyQuorum();
