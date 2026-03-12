# HuggingFace Passport Sync - Complete Guide

> **Comprehensive sync system for registering HuggingFace models and datasets as Lucid passports on Solana devnet**

[![Status](https://img.shields.io/badge/Status-Production%20Ready-green)]()
[![Network](https://img.shields.io/badge/Network-Devnet-blue)]()

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [Configuration](#configuration)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

The HuggingFace Passport Sync system provides a comprehensive solution for syncing all HuggingFace models and datasets to the Lucid L2 blockchain as passports. It features:

- **Scalable Architecture**: Handles 100,000+ assets with batch processing
- **State Management**: Checkpoint system for pause/resume functionality
- **Concurrency Control**: Configurable parallel processing (up to 20 workers)
- **Error Handling**: Automatic retry logic with failure tracking
- **Real-time Monitoring**: Progress tracking and performance metrics
- **Background Processing**: Non-blocking API with status endpoints

### Key Features

✅ **Comprehensive Coverage** - Sync all accessible HF assets  
✅ **Batch Processing** - Process 100-500 assets per batch  
✅ **Parallel Execution** - 10-20 concurrent workers for maximum throughput  
✅ **Checkpoint System** - Resume from any point after interruption  
✅ **Progress Tracking** - Real-time metrics and ETA calculations  
✅ **Error Recovery** - Automatic retry with configurable attempts  
✅ **Devnet Optimized** - Tuned for devnet testing without cost concerns  

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    API Layer (api.ts)                   │
│                                                         │
│  POST /passports/sync-all-hf    - Start sync           │
│  GET  /passports/sync-progress  - Check progress       │
│  POST /passports/sync-resume    - Resume from checkpoint│
│  POST /passports/sync-stop      - Stop gracefully      │
│  GET  /passports/sync-report    - Generate report      │
│  GET  /passports/sync-status    - Get current status   │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│          HFSyncOrchestrator (hfSyncOrchestrator.ts)     │
│                                                         │
│  • Batch processing with concurrency control           │
│  • State management and checkpointing                  │
│  • Progress tracking and metrics calculation           │
│  • Error handling and retry logic                      │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
┌──────────────┐    ┌──────────────────┐
│ SyncState    │    │  HFBridgeService │
│ Manager      │    │                  │
│              │    │  • Fetch HF data │
│ • Load state │    │  • Register      │
│ • Save state │    │    passports     │
│ • Checkpoint │    │  • Parse metadata│
└──────────────┘    └──────────────────┘
        │                     │
        ▼                     ▼
┌──────────────┐    ┌──────────────────┐
│ sync-state   │    │  llm_proxy       │
│ .json        │    │  (port 8000)     │
└──────────────┘    └──────────────────┘
```

### Components

1. **HFSyncOrchestrator**: Main orchestration service
   - Manages sync lifecycle
   - Coordinates batch processing
   - Handles state persistence

2. **SyncStateManager**: State persistence layer
   - Saves/loads sync progress
   - Creates checkpoints
   - Tracks failed assets

3. **HFBridgeService**: HuggingFace integration
   - Fetches model/dataset metadata
   - Registers passports on blockchain
   - Handles IPFS uploads

---

## 🚀 Quick Start

### Prerequisites

```bash
# 1. Ensure services are running
cd Lucid-L2/llm-proxy
uvicorn main:app --reload --port 8000

# 2. In another terminal, start Lucid API
cd Lucid-L2/offchain
npm install
npm start

# 3. Verify llm_proxy is accessible
curl http://localhost:8000/models?limit=1
```

### Start a Sync

```bash
# Sync 100 models with 10 concurrent workers
curl -X POST http://localhost:3001/api/passports/sync-all-hf \
  -H "Content-Type: application/json" \
  -d '{
    "types": ["models"],
    "batchSize": 100,
    "concurrency": 10,
    "checkpointInterval": 100
  }'
```

### Monitor Progress

```bash
# Check progress
curl http://localhost:3001/api/passports/sync-progress

# Get detailed report
curl http://localhost:3001/api/passports/sync-report

# Check status
curl http://localhost:3001/api/passports/sync-status
```

---

## 📡 API Reference

### Start Comprehensive Sync

**Endpoint:** `POST /passports/sync-all-hf`

**Request Body:**
```json
{
  "types": ["models", "datasets", "all"],
  "batchSize": 100,
  "concurrency": 10,
  "llmProxyUrl": "http://localhost:8000",
  "checkpointInterval": 100,
  "maxRetries": 3
}
```

**Parameters:**
- `types`: Asset types to sync (default: `["all"]`)
- `batchSize`: Assets per batch (default: `100`, recommended: 50-200)
- `concurrency`: Parallel workers (default: `10`, max: `20`)
- `llmProxyUrl`: Optional custom proxy URL
- `checkpointInterval`: Save checkpoint every N assets (default: `100`)
- `maxRetries`: Max retry attempts for failed assets (default: `3`)

**Response:**
```json
{
  "success": true,
  "message": "Comprehensive sync started in background",
  "config": {
    "types": ["models"],
    "batchSize": 100,
    "concurrency": 10,
    "checkpointInterval": 100
  }
}
```

### Get Progress

**Endpoint:** `GET /passports/sync-progress`

**Response:**
```json
{
  "success": true,
  "progress": {
    "models": {
      "synced": 5000,
      "total": 150000,
      "progress": "3.3%"
    },
    "datasets": {
      "synced": 0,
      "total": 0,
      "progress": "0.0%"
    },
    "overall": {
      "synced": 5000,
      "total": 150000,
      "progress": "3.3%"
    },
    "failed": 25,
    "throughput": 450,
    "eta": "2025-10-20T18:30:00Z"
  }
}
```

### Resume Sync

**Endpoint:** `POST /passports/sync-resume`

**Request Body:**
```json
{
  "batchSize": 50,
  "concurrency": 5
}
```

**Response:**
```json
{
  "success": true,
  "message": "Sync resumed from last checkpoint"
}
```

### Stop Sync

**Endpoint:** `POST /passports/sync-stop`

**Response:**
```json
{
  "success": true,
  "message": "Sync stop requested, will complete current batch"
}
```

### Get Sync Report

**Endpoint:** `GET /passports/sync-report`

**Response:**
```json
{
  "success": true,
  "report": {
    "summary": {
      "totalSynced": 5000,
      "totalFailed": 25,
      "successRate": "99.50"
    },
    "models": {
      "synced": 5000,
      "failed": 25,
      "total": 150000,
      "progress": "3.3%"
    },
    "performance": {
      "throughput": 450,
      "avgProcessingTime": 2.2,
      "totalTransactions": 5000
    },
    "timing": {
      "startTime": "2025-10-19T10:00:00Z",
      "lastUpdate": "2025-10-19T10:11:06Z",
      "estimatedCompletion": "2025-10-20T18:30:00Z"
    },
    "errors": {
      "count": 25,
      "topErrors": [
        { "error": "Invalid license format", "count": 15 },
        { "error": "Timeout", "count": 10 }
      ]
    }
  }
}
```

### Retry Failed Assets

**Endpoint:** `POST /passports/sync-retry-failed`

**Request Body:**
```json
{
  "maxAttempts": 3,
  "concurrency": 5
}
```

---

## 💡 Usage Examples

### Example 1: Quick Test (10 Models)

```bash
# Start test sync
curl -X POST http://localhost:3001/passports/sync-all-hf \
  -H "Content-Type: application/json" \
  -d '{
    "types": ["models"],
    "batchSize": 10,
    "concurrency": 3
  }'

# Monitor for 30 seconds
for i in {1..6}; do
  curl http://localhost:3001/passports/sync-progress
  sleep 5
done
```

### Example 2: Full Model Sync

```bash
# Sync all models with optimal settings
curl -X POST http://localhost:3001/passports/sync-all-hf \
  -H "Content-Type: application/json" \
  -d '{
    "types": ["models"],
    "batchSize": 100,
    "concurrency": 10,
    "checkpointInterval": 100
  }'
```

### Example 3: Sync Both Models and Datasets

```bash
curl -X POST http://localhost:3001/passports/sync-all-hf \
  -H "Content-Type: application/json" \
  -d '{
    "types": ["all"],
    "batchSize": 100,
    "concurrency": 10
  }'
```

### Example 4: Using Test Script

```bash
# Run full test workflow
cd Lucid-L2/offchain
node test-hf-sync.js full

# Or run individual tests
node test-hf-sync.js batch      # Test small batch
node test-hf-sync.js progress   # Monitor progress
node test-hf-sync.js report     # Generate report
node test-hf-sync.js status     # Check status
```

### Example 5: Programmatic Usage (TypeScript)

```typescript
import { getHFSyncOrchestrator } from './services/hfSyncOrchestrator';

const orchestrator = getHFSyncOrchestrator();

// Start sync
await orchestrator.startFullSync({
  types: ['models'],
  batchSize: 100,
  concurrency: 10,
  checkpointInterval: 100,
  maxRetries: 3
});

// Monitor progress
const progress = orchestrator.getProgress();
console.log(`Progress: ${progress.overall.progress}`);

// Generate report
const report = orchestrator.generateReport();
console.log('Report:', report);
```

---

## ⚙️ Configuration

### Recommended Settings

#### For Quick Testing (Devnet)
```json
{
  "types": ["models"],
  "batchSize": 50,
  "concurrency": 5,
  "checkpointInterval": 50
}
```

#### For Maximum Throughput (Devnet)
```json
{
  "types": ["all"],
  "batchSize": 200,
  "concurrency": 15,
  "checkpointInterval": 100
}
```

#### For Comprehensive Coverage
```json
{
  "types": ["all"],
  "batchSize": 100,
  "concurrency": 10,
  "checkpointInterval": 100,
  "maxRetries": 5
}
```

### Performance Tuning

| Setting | Low | Medium | High | Ultra |
|---------|-----|--------|------|-------|
| batchSize | 50 | 100 | 150 | 200 |
| concurrency | 5 | 10 | 15 | 20 |
| checkpointInterval | 50 | 100 | 150 | 200 |

**Guidelines:**
- **batchSize**: Larger batches = fewer API calls but more memory
- **concurrency**: More workers = faster but higher resource usage
- **checkpointInterval**: Smaller interval = more frequent saves, safer but slower

---

## 📊 Monitoring

### Real-time Monitoring

Use the progress endpoint in a loop:

```bash
#!/bin/bash
while true; do
  clear
  echo "=== HF Passport Sync Monitor ==="
  curl -s http://localhost:3001/passports/sync-progress | jq .
  sleep 10
done
```

### Console Output

The orchestrator provides detailed console output:

```
🚀 Starting Comprehensive HuggingFace Passport Sync
================================================

📚 Syncing Models...

📦 Processing batch: 0-100

📊 Progress Update:
─────────────────────────────────────────
Models:   100/150000 (0.1%)
Datasets: 0/0 (0.0%)
Overall:  100/150000 (0.1%)
Failed:   2
Speed:    450 assets/min
ETA:      10/20/2025, 6:30:00 PM
─────────────────────────────────────────

💾 Checkpoint saved at batch 100
```

### State File

Monitor the state file directly:

```bash
cat Lucid-L2/offchain/sync-state.json | jq .
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. "llm_proxy connection failed"

**Problem:** Cannot connect to llm_proxy service

**Solution:**
```bash
# Ensure llm_proxy is running
cd Lucid-L2/llm-proxy
uvicorn main:app --reload --port 8000

# Test connection
curl http://localhost:8000/models?limit=1
```

#### 2. "Sync is already running"

**Problem:** Attempted to start sync while one is active

**Solution:**
```bash
# Stop current sync
curl -X POST http://localhost:3001/passports/sync-stop

# Wait for it to stop, then start new sync
curl -X POST http://localhost:3001/passports/sync-all-hf -d '...'
```

#### 3. High failure rate

**Problem:** Many assets failing to sync

**Solution:**
```bash
# Check error report
curl http://localhost:3001/passports/sync-report | jq .report.errors

# Retry failed assets
curl -X POST http://localhost:3001/passports/sync-retry-failed \
  -H "Content-Type: application/json" \
  -d '{"maxAttempts": 5, "concurrency": 3}'
```

#### 4. Sync stuck / not progressing

**Problem:** Progress hasn't updated in a while

**Solution:**
```bash
# Stop and resume
curl -X POST http://localhost:3001/passports/sync-stop
sleep 5
curl -X POST http://localhost:3001/passports/sync-resume
```

#### 5. Out of memory

**Problem:** Node process crashes with memory error

**Solution:**
```bash
# Reduce batch size and concurrency
curl -X POST http://localhost:3001/passports/sync-resume \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 50, "concurrency": 5}'
```

### Debug Mode

Enable verbose logging:

```bash
# Set debug environment variable
export DEBUG=hf-sync:*

# Start API
npm start
```

---

## 📈 Performance Metrics

### Expected Performance (Devnet)

| Assets | Batch Size | Concurrency | Time | Throughput |
|--------|------------|-------------|------|------------|
| 1,000 | 100 | 10 | ~3 min | 300-400/min |
| 10,000 | 100 | 10 | ~25 min | 400-450/min |
| 50,000 | 150 | 15 | ~2 hours | 400-500/min |
| 150,000 | 200 | 20 | ~6 hours | 400-500/min |

### Resource Usage

- **Memory**: 500MB - 2GB (depending on batch size)
- **CPU**: Moderate (mostly I/O bound)
- **Network**: High (continuous API calls)
- **Disk**: Minimal (state file + logs)

---

## 🔧 Advanced Usage

### Custom Filtering

To implement custom filtering (e.g., only popular models):

```typescript
// Modify hfBridgeService.ts
private async shouldSync(asset: any): Promise<boolean> {
  // Only sync assets with >1000 downloads
  return asset.downloads > 1000;
}
```

### Batch Transaction Optimization

Currently each passport is a separate transaction. For even better performance, batch multiple registrations:

```typescript
// Future enhancement: batch 10 passports per transaction
const batchSize = 10;
// Reduces transaction count by 90%
```

---

## 📚 Additional Resources

- [Lucid Passports Guide](./LUCID-PASSPORTS-GUIDE.md)
- [HF Bridge Service](./offchain/src/services/hfBridgeService.ts)
- [Sync Orchestrator](./offchain/src/services/hfSyncOrchestrator.ts)
- [State Manager](./offchain/src/services/syncStateManager.ts)

---

## 🤝 Support

For issues or questions:
- Check [Troubleshooting](#troubleshooting) section
- Review console logs
- Inspect `sync-state.json` file
- Check API error responses

---

**Built for comprehensive HuggingFace asset registration on Lucid L2** 🚀
