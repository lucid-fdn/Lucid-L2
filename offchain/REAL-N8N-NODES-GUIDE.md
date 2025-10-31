# Using Real n8n Nodes in FlowSpec Workflows

This guide explains how to create and test FlowSpec workflows using actual n8n nodes (not just transform nodes), enabling you to build workflows that interact with real external services like APIs, email, databases, and more.

## Overview

FlowSpec supports using any of the **847+ n8n nodes** available in the n8n registry. These include:
- HTTP Request nodes for API calls
- Email nodes for sending emails
- Database nodes (PostgreSQL, MongoDB, etc.)
- Cloud service nodes (AWS, Google Cloud, Azure)
- Communication nodes (Slack, Discord, Teams)
- AI/ML nodes (OpenAI, Anthropic, etc.)
- And many more...

## Quick Start

### 1. Discover Available Nodes

Use the `/api/flow/nodes` endpoint to discover what nodes are available:

```bash
# Search for specific nodes
curl "http://localhost:3001/api/flow/nodes?search=email&limit=10"

# Filter by category
curl "http://localhost:3001/api/flow/nodes?category=Communication"

# Find AI nodes
curl "http://localhost:3001/api/flow/nodes?codexCategory=AI&limit=20"
```

### 2. Use Node Type Names Directly

When creating FlowSpec workflows, use the actual n8n node type name (found in the `name` field from the API response):

```javascript
const flowspec = {
  name: 'My Workflow',
  nodes: [
    {
      id: 'trigger',
      type: 'webhook',
      config: { path: 'test', method: 'POST' }
    },
    {
      id: 'fetch_data',
      type: 'n8n-nodes-base.httpRequest',  // ← Actual n8n node type
      config: {
        method: 'GET',
        url: 'https://api.example.com/data',
        responseFormat: 'json'
      }
    }
  ],
  edges: [
    { from: 'trigger', to: 'fetch_data' }
  ]
};
```

## Node Types: Credentials vs. No Credentials

### Nodes Without Credentials (Easy to Use)

These nodes work immediately without any setup:

#### HTTP Request
```javascript
{
  id: 'http_call',
  type: 'n8n-nodes-base.httpRequest',
  config: {
    method: 'GET',
    url: 'https://api.github.com/repos/n8n-io/n8n',
    responseFormat: 'json',
    options: {}
  }
}
```

#### RSS Feed Reader
```javascript
{
  id: 'rss_reader',
  type: 'n8n-nodes-base.rssFeed',
  config: {
    url: 'https://hnrss.org/newest?limit=5'
  }
}
```

#### HTML Extract
```javascript
{
  id: 'extract_html',
  type: 'n8n-nodes-base.html',
  config: {
    operation: 'extractHtmlContent',
    cssSelector: 'h1, p'
  }
}
```

#### Date & Time
```javascript
{
  id: 'format_date',
  type: 'n8n-nodes-base.dateTime',
  config: {
    operation: 'format',
    format: 'YYYY-MM-DD HH:mm:ss'
  }
}
```

### Nodes With Credentials (Require Setup)

These nodes require credentials to be set up in n8n first:

#### Email Send (SMTP)
```javascript
{
  id: 'send_email',
  type: 'n8n-nodes-base.emailSend',
  config: {
    credentials: {
      smtp: 'my-smtp-credentials'  // Name from n8n credentials
    },
    fromEmail: 'sender@example.com',
    toEmail: 'recipient@example.com',
    subject: 'Test Email',
    text: 'Email body here'
  }
}
```

**Setup Steps:**
1. Go to n8n UI: `http://localhost:5678`
2. Click Settings → Credentials
3. Add SMTP credential with your email settings
4. Name it `my-smtp-credentials`
5. Use that name in your FlowSpec config

#### Slack
```javascript
{
  id: 'post_slack',
  type: 'n8n-nodes-base.slack',
  config: {
    credentials: {
      slackApi: 'my-slack-token'
    },
    operation: 'postMessage',
    channel: '#general',
    text: 'Hello from FlowSpec!'
  }
}
```

#### Gmail
```javascript
{
  id: 'send_gmail',
  type: 'n8n-nodes-base.gmail',
  config: {
    credentials: {
      gmailOAuth2: 'my-gmail-oauth'
    },
    operation: 'send',
    to: 'recipient@example.com',
    subject: 'Test from FlowSpec',
    message: 'Email body'
  }
}
```

## Example Workflows

### Example 1: Fetch Data from Public API

```javascript
const flowspec = {
  name: 'GitHub Repo Stats',
  description: 'Fetches repository statistics from GitHub',
  nodes: [
    {
      id: 'trigger',
      type: 'webhook',
      config: {
        path: 'github-stats',
        method: 'POST'
      }
    },
    {
      id: 'fetch_repo',
      type: 'n8n-nodes-base.httpRequest',
      config: {
        method: 'GET',
        url: '={{ $json.repo_url }}',  // From webhook input
        responseFormat: 'json'
      }
    },
    {
      id: 'format_output',
      type: 'transform',
      config: {
        code: `
          const repo = items[0].json;
          return [{
            json: {
              name: repo.full_name,
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              language: repo.language,
              url: repo.html_url
            }
          }];
        `
      }
    }
  ],
  edges: [
    { from: 'trigger', to: 'fetch_repo' },
    { from: 'fetch_repo', to: 'format_output' }
  ]
};
```

### Example 2: RSS Feed to Email

```javascript
const flowspec = {
  name: 'RSS to Email Digest',
  description: 'Fetches RSS feed and sends top stories via email',
  nodes: [
    {
      id: 'trigger',
      type: 'schedule',
      config: {
        cronExpression: '0 9 * * *'  // Daily at 9 AM
      }
    },
    {
      id: 'fetch_rss',
      type: 'n8n-nodes-base.rssFeed',
      config: {
        url: 'https://hnrss.org/newest?limit=10'
      }
    },
    {
      id: 'format_email',
      type: 'transform',
      config: {
        code: `
          const stories = items.slice(0, 5);
          const emailBody = stories.map((item, idx) => 
            \`\${idx + 1}. \${item.json.title}\\n   \${item.json.link}\\n\`
          ).join('\\n');
          
          return [{
            json: {
              subject: 'Top 5 HN Stories - ' + new Date().toDateString(),
              body: emailBody
            }
          }];
        `
      }
    },
    {
      id: 'send_email',
      type: 'n8n-nodes-base.emailSend',
      config: {
        credentials: {
          smtp: 'my-smtp'
        },
        fromEmail: 'digest@example.com',
        toEmail: 'you@example.com',
        subject: '={{ $json.subject }}',
        text: '={{ $json.body }}'
      }
    }
  ],
  edges: [
    { from: 'trigger', to: 'fetch_rss' },
    { from: 'fetch_rss', to: 'format_email' },
    { from: 'format_email', to: 'send_email' }
  ]
};
```

### Example 3: Multi-Step API Processing

```javascript
const flowspec = {
  name: 'Weather Report Generator',
  description: 'Fetches weather data and sends formatted report',
  nodes: [
    {
      id: 'trigger',
      type: 'webhook',
      config: {
        path: 'weather-report',
        method: 'POST'
      }
    },
    {
      id: 'get_weather',
      type: 'n8n-nodes-base.httpRequest',
      config: {
        method: 'GET',
        url: 'https://api.openweathermap.org/data/2.5/weather',
        queryParameters: {
          q: '={{ $json.city }}',
          appid: '={{ $json.api_key }}',
          units: 'metric'
        },
        responseFormat: 'json'
      }
    },
    {
      id: 'format_report',
      type: 'transform',
      config: {
        code: `
          const weather = items[0].json;
          return [{
            json: {
              city: weather.name,
              temperature: weather.main.temp,
              condition: weather.weather[0].description,
              humidity: weather.main.humidity,
              report: \`Weather in \${weather.name}:
                Temperature: \${weather.main.temp}°C
                Condition: \${weather.weather[0].description}
                Humidity: \${weather.main.humidity}%\`
            }
          }];
        `
      }
    }
  ],
  edges: [
    { from: 'trigger', to: 'get_weather' },
    { from: 'get_weather', to: 'format_report' }
  ]
};
```

## Testing Your Workflows

### Run the Test Suite

```bash
cd Lucid-L2/offchain

# Make the test executable
chmod +x test-flowspec-with-real-n8n-nodes.js

# Run all tests
node test-flowspec-with-real-n8n-nodes.js
```

### Enable Email Testing (Optional)

To test the email node:

1. Set up SMTP credentials in n8n UI
2. Add to your `.env` file:
```bash
TEST_EMAIL_ENABLED=true
TEST_EMAIL_RECIPIENT=your-email@example.com
TEST_EMAIL_FROM=sender@example.com
```

## Discovering Node Configuration

### Method 1: Use the API

```javascript
// Get details about a specific node
const response = await axios.get(
  'http://localhost:3001/api/flow/nodes/n8n-nodes-base.slack'
);

console.log(response.data);
// Shows: properties, credentials required, operations available, etc.
```

### Method 2: Use n8n UI

1. Open n8n: `http://localhost:5678`
2. Create a new workflow
3. Add the node you want to use
4. Configure it in the UI
5. Click "View" → "Workflow JSON"
6. Copy the node configuration from the JSON

### Method 3: Check n8n Documentation

Visit: https://docs.n8n.io/integrations/builtin/

## Common Node Categories

### Communication
- `n8n-nodes-base.slack` - Slack messaging
- `n8n-nodes-base.discord` - Discord messaging
- `n8n-nodes-base.telegram` - Telegram bot
- `n8n-nodes-base.emailSend` - SMTP email

### Data Sources
- `n8n-nodes-base.httpRequest` - HTTP API calls
- `n8n-nodes-base.rssFeed` - RSS feed reader
- `n8n-nodes-base.postgres` - PostgreSQL database
- `n8n-nodes-base.mongodb` - MongoDB database

### Cloud Services
- `n8n-nodes-base.awsS3` - AWS S3 storage
- `n8n-nodes-base.googleSheets` - Google Sheets
- `n8n-nodes-base.googleDrive` - Google Drive
- `n8n-nodes-base.dropbox` - Dropbox storage

### AI/ML
- `n8n-nodes-langchain.lmChatOpenAi` - OpenAI Chat
- `n8n-nodes-langchain.lmChatAnthropic` - Anthropic Claude
- `n8n-nodes-base.openAi` - OpenAI API

### Data Processing
- `n8n-nodes-base.function` - JavaScript code
- `n8n-nodes-base.set` - Set data values
- `n8n-nodes-base.html` - HTML extraction
- `n8n-nodes-base.json` - JSON manipulation

## Best Practices

### 1. Start Simple
Begin with nodes that don't require credentials (HTTP Request, RSS Feed) to understand the workflow structure.

### 2. Test in n8n UI First
Before using a node in FlowSpec:
1. Create a simple workflow in n8n UI
2. Verify the node works as expected
3. Export the workflow JSON
4. Adapt the node config for FlowSpec

### 3. Use Transform Nodes for Processing
Combine real n8n nodes with transform nodes for data processing:
```javascript
// Fetch data with real node
{ id: 'fetch', type: 'n8n-nodes-base.httpRequest', ... }
// Process with transform node
{ id: 'process', type: 'transform', config: { code: '...' } }
```

### 4. Handle Errors
Add error handling in transform nodes:
```javascript
config: {
  code: `
    try {
      const data = items[0].json;
      // Process data...
      return [{ json: { success: true, data } }];
    } catch (error) {
      return [{ json: { success: false, error: error.message } }];
    }
  `
}
```

### 5. Use Environment Variables
Store credentials and API keys in environment variables:
```javascript
config: {
  url: process.env.API_URL,
  headers: {
    'Authorization': `Bearer ${process.env.API_KEY}`
  }
}
```

## Troubleshooting

### Node Not Found Error
```
Error: Node type 'n8n-nodes-base.xyz' not found
```
**Solution:** Check the node name is correct using `/api/flow/nodes`

### Credentials Required Error
```
Error: Missing credentials for node
```
**Solution:** Set up credentials in n8n UI first, then reference them in config

### Execution Timeout
```
Error: Execution timed out
```
**Solution:** Increase timeout in execution context:
```javascript
context: {
  tenantId: TENANT_ID,
  timeout: 120000  // 2 minutes
}
```

### Invalid Configuration
```
Error: Invalid node configuration
```
**Solution:** Verify the config matches the node's expected parameters

## Next Steps

1. **Explore Available Nodes**: Query `/api/flow/nodes` to see all 847+ nodes
2. **Run Test Suite**: Execute `test-flowspec-with-real-n8n-nodes.js`
3. **Create Your Workflow**: Build a workflow using real nodes
4. **Test & Iterate**: Execute and refine your workflow

## Additional Resources

- [n8n Node Documentation](https://docs.n8n.io/integrations/builtin/)
- [FlowSpec DSL Guide](./FLOWSPEC-DSL-GUIDE.md)
- [FlowSpec Testing Quickstart](./FLOWSPEC-TEST-QUICKSTART.md)
- [n8n Elasticsearch API Guide](./N8N-ELASTICSEARCH-API-GUIDE.md)

## Support

For issues or questions:
1. Check the n8n logs: `docker logs n8n-n8n-1`
2. Verify the API is running: `curl http://localhost:3001/api/health`
3. Test in n8n UI first to isolate issues
4. Review the test examples in `test-flowspec-with-real-n8n-nodes.js`
