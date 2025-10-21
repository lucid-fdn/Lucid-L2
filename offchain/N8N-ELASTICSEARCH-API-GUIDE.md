# n8n Nodes Elasticsearch API Guide

## Overview

The n8n nodes API now uses Elasticsearch for fast, scalable searching and filtering. This replaces the slow CLI-based approach with millisecond-response queries.

## API Endpoints

### 1. Search & List Nodes

**Endpoint:** `GET /api/flow/nodes`

**Query Parameters:**

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `search` | string | Full-text search across name, displayName, description, codex categories, credentials | `slack` |
| `category` | string | Filter by exact node group/category | `Communication` |
| `codexCategory` | string | Filter by codex category (AI, Sales, Marketing, etc.) | `AI` |
| `credentialName` | string | Filter by required credential name | `slackApi` |
| `limit` | number | Max results to return (default: 100, max: 1000) | `20` |
| `offset` | number | Pagination offset (default: 0) | `20` |

**Examples:**

```bash
# Basic search - find nodes mentioning "slack"
curl "http://54.204.114.86:3001/api/flow/nodes?search=slack"

# Search with limit
curl "http://54.204.114.86:3001/api/flow/nodes?search=email&limit=10"

# Filter by category
curl "http://54.204.114.86:3001/api/flow/nodes?category=Communication"

# Combined search + category filter
curl "http://54.204.114.86:3001/api/flow/nodes?search=api&category=Development"

# Pagination - get next 20 results
curl "http://54.204.114.86:3001/api/flow/nodes?search=data&limit=20&offset=20"

# Filter by codex category (e.g., AI tools)
curl "http://54.204.114.86:3001/api/flow/nodes?codexCategory=AI"

# Filter by credential requirement
curl "http://54.204.114.86:3001/api/flow/nodes?credentialName=googleSheetsOAuth2Api"

# Complex filter: Search + Category + Credential
curl "http://54.204.114.86:3001/api/flow/nodes?search=send&category=Communication&credentialName=slackApi"

# Get all nodes (no search, just list)
curl "http://54.204.114.86:3001/api/flow/nodes?limit=100"
```

### Advanced Query Examples

```bash
# Find all AI-related nodes
curl "http://54.204.114.86:3001/api/flow/nodes?codexCategory=AI&limit=50"

# Find Gmail nodes specifically
curl "http://54.204.114.86:3001/api/flow/nodes?search=gmail"

# Nodes that need Slack credentials
curl "http://54.204.114.86:3001/api/flow/nodes?credentialName=slackApi"

# Combine search with codex category
curl "http://54.204.114.86:3001/api/flow/nodes?search=generate&codexCategory=AI"

# Page through AI tools
curl "http://54.204.114.86:3001/api/flow/nodes?codexCategory=AI&limit=20&offset=0"  # Page 1
curl "http://54.204.114.86:3001/api/flow/nodes?codexCategory=AI&limit=20&offset=20" # Page 2
```

**Response Format:**

```json
{
  "success": true,
  "count": 5,
  "total": 847,
  "nodes": [
    {
      "name": "n8n-nodes-base.slack",
      "displayName": "Slack",
      "description": "Send messages and manage channels",
      "version": 2,
      "group": ["communication"],
      "icon": "file:slack.svg",
      "usableAsTool": true,
      "_score": 5.23,
      "_highlight": {
        "displayName": ["<em>Slack</em>"]
      }
    }
  ],
  "facets": {
    "categories": {
      "Communication": 45,
      "Marketing": 32,
      "Development": 28
    },
    "codexCategories": {
      "AI": 67,
      "Sales": 23,
      "Marketing": 45
    },
    "credentials": {
      "slackApi": 15,
      "googleSheetsOAuth2Api": 12,
      "httpBasicAuth": 89
    }
  },
  "executionTimeMs": 35,
  "source": "elasticsearch"
}
```

### 2. Get Node Details

**Endpoint:** `GET /api/flow/nodes/:nodeName`

**Example:**

```bash
curl "http://54.204.114.86:3001/api/flow/nodes/n8n-nodes-base.slack"
```

### 3. Get Categories

**Endpoint:** `GET /api/flow/categories`

**Example:**

```bash
curl "http://54.204.114.86:3001/api/flow/categories"
```

Response:
```json
{
  "success": true,
  "count": 25,
  "categories": [
    { "name": "Communication", "count": 45 },
    { "name": "Marketing", "count": 32 }
  ]
}
```

## Admin Endpoints

### 1. Reindex All Nodes

**Endpoint:** `POST /api/flow/admin/reindex`

Fetches all nodes from n8n CLI and indexes them into Elasticsearch.

```bash
curl -X POST "http://54.204.114.86:3001/api/flow/admin/reindex"
```

**Body (optional):**
```json
{
  "forceRefresh": true  // Force re-fetch from CLI
}
```

**Response:**
```json
{
  "success": true,
  "totalNodes": 847,
  "indexed": 847,
  "failed": 0,
  "executionTimeMs": 7000
}
```

### 2. Get Index Statistics

**Endpoint:** `GET /api/flow/admin/stats`

```bash
curl "http://54.204.114.86:3001/api/flow/admin/stats"
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "enabled": true,
    "nodeCount": 847,
    "indexSize": "2.3mb"
  }
}
```

### 3. Get Indexer Status

**Endpoint:** `GET /api/flow/admin/status`

```bash
curl "http://54.204.114.86:3001/api/flow/admin/status"
```

**Response:**
```json
{
  "success": true,
  "indexer": {
    "isIndexing": false,
    "lastIndexTime": "2025-10-21T17:00:00.000Z",
    "cachedNodesCount": 847
  },
  "elasticsearch": {
    "enabled": true,
    "nodeCount": 847,
    "indexSize": "2.3mb"
  }
}
```

### 4. Delete Index

**Endpoint:** `DELETE /api/flow/admin/index`

```bash
curl -X DELETE "http://54.204.114.86:3001/api/flow/admin/index"
```

**Warning:** This deletes all indexed data. Run `/api/flow/admin/reindex` afterward to rebuild.

## Advanced Search Examples

### Complex Queries

```bash
# Search for nodes with "webhook" in name/description
curl "http://54.204.114.86:3001/api/flow/nodes?search=webhook"

# Find all "trigger" nodes
curl "http://54.204.114.86:3001/api/flow/nodes?search=trigger"

# Get first 10 communication tools
curl "http://54.204.114.86:3001/api/flow/nodes?category=Communication&limit=10"

# Search within a category
curl "http://54.204.114.86:3001/api/flow/nodes?search=send&category=Communication"

# Paginate through results
curl "http://54.204.114.86:3001/api/flow/nodes?search=data&limit=50&offset=0"  # Page 1
curl "http://54.204.114.86:3001/api/flow/nodes?search=data&limit=50&offset=50" # Page 2
```

### Building a UI

```javascript
// Example: Build a searchable node selector

// 1. Get all categories for filter dropdown
const categories = await fetch('/api/flow/categories').then(r => r.json());

// 2. Search as user types
const searchNodes = async (query, category, page = 0) => {
  const params = new URLSearchParams({
    search: query || '',
    limit: '20',
    offset: (page * 20).toString()
  });
  
  if (category) params.set('category', category);
  
  const response = await fetch(`/api/flow/nodes?${params}`);
  return response.json();
};

// 3. Display results with facets
const results = await searchNodes('email', 'Marketing', 0);
console.log(`Found ${results.total} nodes in ${results.executionTimeMs}ms`);
console.log('Categories:', results.facets.categories);
```

## Performance Comparison

| Operation | CLI Approach | Elasticsearch | Improvement |
|-----------|-------------|---------------|-------------|
| List all nodes | 10+ seconds | <50ms | 200x faster |
| Search nodes | 10+ seconds | <50ms | 200x faster |
| Filter by category | 10+ seconds | <30ms | 300x faster |
| Paginated results | 10+ seconds each | <50ms total | Instant |

## Indexed Fields (Searchable & Filterable)

✅ **name** (keyword) - Exact match, used in search with boost 2x
✅ **displayName** (text + keyword) - Full-text search with boost 3x, fuzzy matching
✅ **description** (text) - Full-text search, fuzzy matching
✅ **subtitle** (text) - Full-text search
✅ **group** (keyword) - Filter by node category, faceted
✅ **version** (integer) - Version filtering/sorting
✅ **icon** (keyword) - Icon name filtering
✅ **codex.categories** (keyword) - Filter by business category (AI, Sales, etc.), faceted
✅ **credentials.name** (keyword) - Filter by credential requirement, faceted

## Stored Fields (Not Searchable but Retrieved)

All other fields are stored but not indexed:
- properties (complex configurations)
- credentials (auth requirements)
- inputs/outputs (connection types)
- defaults (default values)
- codex (categorization metadata)
- iconUrl (icon paths)
- usableAsTool (tool compatibility)
- etc.

These fields are returned in query results but cannot be used for search/filtering.

## Automatic Refresh

The index automatically refreshes when:
- First API call (if never indexed)
- Cache is stale (>60 minutes old)
- Manual reindex triggered

## Fallback Behavior

If Elasticsearch is unavailable:
- API automatically falls back to CLI approach
- `"source": "cli-fallback"` in response
- Slower but still functional
- All filters work (in-memory)

## Troubleshooting

**Q: Getting "cli-fallback" instead of "elasticsearch"?**

```bash
# Check Elasticsearch is running
docker ps | grep elasticsearch

# Check index status
curl "http://54.204.114.86:3001/api/flow/admin/status"

# Trigger reindex
curl -X POST "http://54.204.114.86:3001/api/flow/admin/reindex"
```

**Q: Slow queries even with Elasticsearch?**

Index might be stale or empty. Force reindex:

```bash
curl -X DELETE "http://54.204.114.86:3001/api/flow/admin/index"
curl -X POST "http://54.204.114.86:3001/api/flow/admin/reindex"
```

**Q: Want to search on custom fields?**

For now, only predefined fields are searchable. To add more fields, update the mapping in `elasticsearchService.ts` and rebuild the index.
