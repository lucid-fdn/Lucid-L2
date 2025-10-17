/**
 * FlowSpec DSL - Example Usage
 * 
 * This file demonstrates how to use the FlowSpec DSL to create
 * and execute n8n workflows programmatically.
 */

const axios = require('axios');

const API_URL = 'http://localhost:3001';

// ============================================================================
// Example 1: Simple LLM Chat Workflow
// ============================================================================

async function example1_SimpleLLMChat() {
  console.log('\n=== Example 1: Simple LLM Chat Workflow ===\n');

  const flowSpec = {
    name: 'Simple LLM Chat',
    description: 'A basic workflow that sends a prompt to an LLM',
    nodes: [
      {
        id: 'trigger',
        type: 'webhook',
        config: {
          path: 'simple-chat',
          method: 'POST'
        }
      },
      {
        id: 'llm',
        type: 'llm.chat',
        input: {
          prompt: '{{ $json.text }}'
        },
        config: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          temperature: 0.7
        }
      }
    ],
    edges: [
      {
        from: 'trigger',
        to: 'llm'
      }
    ]
  };

  try {
    // Create the workflow
    const createResponse = await axios.post(`${API_URL}/flowspec/create`, flowSpec);
    console.log('✅ Workflow created:', createResponse.data);

    const workflowId = createResponse.data.workflowId;

    // Execute the workflow
    const executeResponse = await axios.post(`${API_URL}/flowspec/execute`, {
      workflowId,
      context: {
        tenantId: 'test-tenant',
        variables: {
          text: 'Hello, how are you?'
        }
      }
    });
    console.log('✅ Workflow executed:', executeResponse.data);

    return workflowId;
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

// ============================================================================
// Example 2: Multi-Step AI Agent Workflow
// ============================================================================

async function example2_MultiStepAIAgent() {
  console.log('\n=== Example 2: Multi-Step AI Agent Workflow ===\n');

  const flowSpec = {
    name: 'AI Agent with Memory',
    description: 'An agent that processes input, retrieves context, and generates a response',
    nodes: [
      {
        id: 'trigger',
        type: 'webhook',
        config: {
          path: 'ai-agent',
          method: 'POST'
        }
      },
      {
        id: 'embed',
        type: 'embed',
        input: {
          text: '{{ $json.query }}'
        },
        config: {
          model: 'text-embedding-ada-002'
        }
      },
      {
        id: 'search',
        type: 'search',
        input: {
          vector: '{{ $json.embedding }}',
          query: '{{ $json.query }}'
        },
        config: {
          index: 'agent-memory',
          topK: 5
        }
      },
      {
        id: 'llm',
        type: 'llm.chat',
        input: {
          prompt: 'Context: {{ $json.context }}\n\nUser: {{ $json.query }}\n\nAssistant:'
        },
        config: {
          model: 'gpt-4',
          temperature: 0.8,
          maxTokens: 500
        }
      },
      {
        id: 'commit',
        type: 'solana.write',
        input: {
          data: '{{ $json.response }}'
        },
        config: {
          network: 'devnet',
          instruction: 'custom'
        }
      }
    ],
    edges: [
      { from: 'trigger', to: 'embed' },
      { from: 'embed', to: 'search' },
      { from: 'search', to: 'llm' },
      { from: 'llm', to: 'commit' }
    ]
  };

  try {
    const createResponse = await axios.post(`${API_URL}/flowspec/create`, flowSpec);
    console.log('✅ Workflow created:', createResponse.data);

    const workflowId = createResponse.data.workflowId;

    // Execute the workflow
    const executeResponse = await axios.post(`${API_URL}/flowspec/execute`, {
      workflowId,
      context: {
        tenantId: 'agent-001',
        userId: 'user-123',
        variables: {
          query: 'What did we discuss about blockchain yesterday?'
        }
      }
    });
    console.log('✅ Workflow executed:', executeResponse.data);

    return workflowId;
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

// ============================================================================
// Example 3: Conditional Branching Workflow
// ============================================================================

async function example3_ConditionalBranching() {
  console.log('\n=== Example 3: Conditional Branching Workflow ===\n');

  const flowSpec = {
    name: 'Smart Router',
    description: 'Routes requests based on content type',
    nodes: [
      {
        id: 'trigger',
        type: 'webhook',
        config: {
          path: 'smart-router',
          method: 'POST'
        }
      },
      {
        id: 'classifier',
        type: 'llm.chat',
        input: {
          prompt: 'Classify this as "code", "text", or "question": {{ $json.input }}'
        },
        config: {
          model: 'gpt-3.5-turbo',
          maxTokens: 10
        }
      },
      {
        id: 'branch',
        type: 'branch',
        config: {
          condition: '{{ $json.classification }}'
        }
      },
      {
        id: 'code_handler',
        type: 'tool.http',
        input: {
          code: '{{ $json.input }}'
        },
        config: {
          url: 'http://localhost:8000/analyze-code',
          method: 'POST'
        }
      },
      {
        id: 'qa_handler',
        type: 'llm.chat',
        input: {
          prompt: '{{ $json.input }}'
        },
        config: {
          model: 'gpt-4',
          systemPrompt: 'You are a helpful assistant that answers questions.'
        }
      }
    ],
    edges: [
      { from: 'trigger', to: 'classifier' },
      { from: 'classifier', to: 'branch' },
      { from: 'branch', to: 'code_handler', when: 'code', label: 'Code' },
      { from: 'branch', to: 'qa_handler', when: 'question', label: 'Q&A' }
    ]
  };

  try {
    const createResponse = await axios.post(`${API_URL}/flowspec/create`, flowSpec);
    console.log('✅ Workflow created:', createResponse.data);
    return createResponse.data.workflowId;
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

// ============================================================================
// Example 4: Batch Processing Workflow
// ============================================================================

async function example4_BatchProcessing() {
  console.log('\n=== Example 4: Batch Processing Workflow ===\n');

  const flowSpec = {
    name: 'Batch Document Processor',
    description: 'Process multiple documents in parallel',
    nodes: [
      {
        id: 'trigger',
        type: 'webhook',
        config: {
          path: 'batch-process',
          method: 'POST'
        }
      },
      {
        id: 'transform',
        type: 'transform',
        config: {
          code: `
            // Split documents for parallel processing
            return items.map(doc => ({
              json: { document: doc, index: doc.index }
            }));
          `
        }
      },
      {
        id: 'process',
        type: 'llm.chat',
        input: {
          prompt: 'Summarize this document: {{ $json.document }}'
        },
        config: {
          model: 'gpt-3.5-turbo',
          maxTokens: 200
        }
      },
      {
        id: 'ipfs',
        type: 'ipfs.pin',
        input: {
          content: '{{ $json.summary }}'
        },
        config: {
          endpoint: 'http://localhost:5001'
        }
      }
    ],
    edges: [
      { from: 'trigger', to: 'transform' },
      { from: 'transform', to: 'process' },
      { from: 'process', to: 'ipfs' }
    ],
    metadata: {
      tags: ['batch', 'documents', 'ipfs'],
      author: 'FlowSpec Example'
    }
  };

  try {
    const createResponse = await axios.post(`${API_URL}/flowspec/create`, flowSpec);
    console.log('✅ Workflow created:', createResponse.data);
    return createResponse.data.workflowId;
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

// ============================================================================
// Example 5: List and Manage Workflows
// ============================================================================

async function example5_ManageWorkflows() {
  console.log('\n=== Example 5: List and Manage Workflows ===\n');

  try {
    // List all workflows
    const listResponse = await axios.get(`${API_URL}/flowspec/list`);
    console.log('📋 All workflows:', JSON.stringify(listResponse.data, null, 2));

    if (listResponse.data.workflows && listResponse.data.workflows.length > 0) {
      const workflowId = listResponse.data.workflows[0].id;

      // Get execution history
      const historyResponse = await axios.get(`${API_URL}/flowspec/history/${workflowId}?limit=5`);
      console.log(`\n📊 Execution history for ${workflowId}:`, JSON.stringify(historyResponse.data, null, 2));
    }
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

// ============================================================================
// Run All Examples
// ============================================================================

async function runAllExamples() {
  console.log('🚀 Starting FlowSpec DSL Examples\n');
  console.log('Make sure the API is running on http://localhost:3001');
  console.log('and n8n is running on http://localhost:5678\n');

  await example1_SimpleLLMChat();
  await new Promise(resolve => setTimeout(resolve, 2000));

  await example2_MultiStepAIAgent();
  await new Promise(resolve => setTimeout(resolve, 2000));

  await example3_ConditionalBranching();
  await new Promise(resolve => setTimeout(resolve, 2000));

  await example4_BatchProcessing();
  await new Promise(resolve => setTimeout(resolve, 2000));

  await example5_ManageWorkflows();

  console.log('\n✅ All examples completed!\n');
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}

module.exports = {
  example1_SimpleLLMChat,
  example2_MultiStepAIAgent,
  example3_ConditionalBranching,
  example4_BatchProcessing,
  example5_ManageWorkflows,
  runAllExamples
};
