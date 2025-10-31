# How to Test FlowSpec Workflows with Real n8n Nodes

This guide explains how to create and test workflows using actual n8n nodes (from the 847+ available) that produce real, verifiable results.

## Quick Summary

You have **3 ways** to execute workflows and see real results:

1. **Manual Execution in n8n UI** (Easiest for testing)
2. **Test Webhook URLs** (For webhook-based workflows)  
3. **Production Webhook URLs** (Requires activation)

## Method 1: Manual Execution in n8n UI (RECOMMENDED for Testing)

### How It Works:
1. Create workflow via FlowSpec API
2. Open workflow in n8n UI
3. Click "Execute Workflow" button
4. See results directly in the UI
5. Optionally fetch results via API

### Example Code:

```javascript
const flowspec = {
  name: 'GitHub API Test',
  nodes: [
    {
      id: 'start',
      type: 'n8n-nodes-base.manualTrigger',  // For manual execution
      config: {}
    },
    {
      id: 'fetch_data',
