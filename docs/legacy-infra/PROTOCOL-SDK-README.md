# Protocol Integration SDK 🚀

A modular, community-driven framework for integrating blockchain protocols and DeFi platforms into the Lucid ecosystem.

## 🎯 Overview

The Protocol SDK enables seamless integration of external protocols (DEXs, DeFi platforms, bridges, etc.) through a standardized adapter interface. Each protocol adapter is self-contained and can be developed independently by the community.

## ✨ Features

- **🔌 Plug & Play**: Add new protocols without modifying core code
- **🔒 Secure**: Built-in credential management and validation
- **⚡ Fast**: Lazy loading, instance pooling, and efficient execution
- **🧪 Type-Safe**: Full TypeScript support with runtime validation
- **📊 Observable**: Built-in health checks and performance metrics
- **🌍 Multi-Network**: Support for mainnet, testnet, and custom networks
- **🎨 Developer-Friendly**: Clear interfaces and comprehensive documentation

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Protocol Manager                          │
│  (Orchestrates execution, credentials, and routing)          │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┴──────────┐
         │                      │
┌────────▼──────┐    ┌──────────▼────────┐
│   Protocol    │    │   Credential      │
│   Registry    │    │   Service         │
│  (Discovery)  │    │  (Encryption)     │
└────────┬──────┘    └───────────────────┘
         │
    ┌────┴────┬─────────┬──────────┬──────────┐
    │         │         │          │          │
┌───▼───┐ ┌──▼───┐ ┌───▼────┐ ┌───▼────┐ ┌──▼───┐
│Hyper- │ │Solan │ │Jupiter │ │Wormhol │ │ ...  │
│liquid │ │  a   │ │        │ │   e    │ │      │
└───────┘ └──────┘ └────────┘ └────────┘ └──────┘
```

## 🚀 Quick Start

### Installation

```bash
cd Lucid-L2/offchain
npm install
```

### Basic Usage

```typescript
import { protocolManager } from './src/services/protocolManager';
import './src/protocols/adapters'; // Auto-registers all adapters

// Execute a protocol operation
const result = await protocolManager.execute({
  protocolId: 'hyperliquid',
  operationId: 'getL2Book',
  parameters: { symbol: 'BTC' },
  userId: 'user-123',
  config: { network: 'testnet' }
});

if (result.success) {
  console.log('Order book:', result.data);
} else {
  console.error('Error:', result.error);
}
```

### Test the Implementation

```bash
npm run build
node test-hyperliquid-protocol.js
```

## 📚 Core Concepts

### 1. Protocol Adapter

Every protocol adapter extends `BaseProtocolAdapter` and implements:

```typescript
class MyProtocolAdapter extends BaseProtocolAdapter {
  // Define protocol metadata
  getMetadata(): ProtocolMetadata { ... }
  
  // Define available operations
  getOperations(): OperationDefinition[] { ... }
  
  // Define credential requirements
  getCredentialSchema(): CredentialSchema { ... }
  
  // Execute operations
  async execute(operationId, parameters, context): Promise<ExecutionResult> { ... }
}
```

### 2. Operations

Operations are the actions your protocol can perform:

```typescript
{
  id: 'getL2Book',
  name: 'Get L2 Order Book',
  description: 'Fetch order book with bid/ask prices',
  parameters: [
    {
      name: 'symbol',
      type: 'select',
      required: true,
      options: [
        { label: 'BTC-USD', value: 'BTC' },
        { label: 'ETH-USD', value: 'ETH' }
      ]
    }
  ],
  requiresAuth: false,
  isWrite: false
}
```

### 3. Execution Flow

```
User Request
    ↓
Protocol Manager (validates & routes)
    ↓
Protocol Registry (finds adapter)
    ↓
Credential Service (resolves credentials)
    ↓
Protocol Adapter (executes operation)
    ↓
Result (with metadata & duration)
```

## 🎨 Creating a New Protocol Adapter

### Step 1: Create Directory Structure

```bash
mkdir -p src/protocols/adapters/myprotocol
cd src/protocols/adapters/myprotocol
```

### Step 2: Define Types

```typescript
// types.ts
export interface MyProtocolCredentials {
  apiKey: string;
  network: 'mainnet' | 'testnet';
}

export interface MyOperationParams {
  // Define your operation parameters
}
```

### Step 3: Define Operations

```typescript
// operations.ts
import { OperationDefinition } from '../../types';

export const MY_PROTOCOL_OPERATIONS: OperationDefinition[] = [
  {
    id: 'myOperation',
    name: 'My Operation',
    description: 'Does something cool',
    parameters: [
      {
        name: 'param1',
        type: 'string',
        required: true,
        description: 'First parameter'
      }
    ],
    requiresAuth: true,
    isWrite: false
  }
];
```

### Step 4: Implement Adapter

```typescript
// MyProtocolAdapter.ts
import { BaseProtocolAdapter } from '../../BaseProtocolAdapter';
import { MY_PROTOCOL_OPERATIONS } from './operations';

export class MyProtocolAdapter extends BaseProtocolAdapter {
  getMetadata() {
    return {
      id: 'myprotocol',
      name: 'My Protocol',
      category: 'dex', // or 'defi', 'bridge', etc.
      version: '1.0.0',
      description: 'My awesome protocol integration',
      networks: ['mainnet', 'testnet'],
      tags: ['dex', 'trading']
    };
  }

  getOperations() {
    return MY_PROTOCOL_OPERATIONS;
  }

  getCredentialSchema() {
    return {
      fields: [
        {
          name: 'apiKey',
          label: 'API Key',
          type: 'apiKey',
          required: true,
          encrypted: true
        }
      ]
    };
  }

  async execute(operationId, parameters, context) {
    switch (operationId) {
      case 'myOperation':
        return await this.handleMyOperation(parameters, context);
      default:
        return this.error('Unknown operation', 'UNKNOWN_OPERATION');
    }
  }

  private async handleMyOperation(params, context) {
    // Implement your operation logic
    const result = await someApiCall(params);
    return this.success(result);
  }
}
```

### Step 5: Export and Register

```typescript
// index.ts
export { MyProtocolAdapter } from './MyProtocolAdapter';
export * from './types';
export * from './operations';
```

```typescript
// src/protocols/adapters/index.ts
import { MyProtocolAdapter } from './myprotocol';

export function registerAllAdapters(): void {
  protocolRegistry.register(new HyperliquidAdapter());
  protocolRegistry.register(new MyProtocolAdapter()); // Add your adapter
}
```

## 📖 API Reference

### Protocol Manager

```typescript
// List all protocols
const protocols = protocolManager.listProtocols();

// Get protocol metadata
const metadata = protocolManager.getProtocolMetadata('hyperliquid');

// Get available operations
const operations = await protocolManager.getProtocolOperations('hyperliquid');

// Execute an operation
const result = await protocolManager.execute({
  protocolId: 'hyperliquid',
  operationId: 'getL2Book',
  parameters: { symbol: 'BTC' },
  userId: 'user-123',
  credentialId: 'cred-456', // optional
  config: { network: 'mainnet' }
});

// Check health
const health = await protocolManager.checkHealth();

// Get statistics
const stats = protocolManager.getStats();
```

### Base Protocol Adapter Helpers

```typescript
// Success result
return this.success(data, { customMetadata: 'value' });

// Error result
return this.error('Something went wrong', 'ERROR_CODE');

// Measure execution time
const { result, duration } = await this.measure(async () => {
  return await someAsyncOperation();
});

// Get current network
const network = this.getCurrentNetwork();

// Extract credentials
const creds = this.getCredentials(context);
```

## 🔐 Credential Management

Credentials are stored securely in Supabase with encryption:

```typescript
// Credential schema defines what users need to provide
getCredentialSchema() {
  return {
    fields
