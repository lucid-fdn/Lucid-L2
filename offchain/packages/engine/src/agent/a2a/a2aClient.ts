/**
 * A2A Protocol Client
 *
 * Discovers and communicates with external A2A-compatible agents.
 */

import { AgentCard, validateAgentCard } from './agentCard';
import { A2ATask, A2AMessage, A2APart } from './a2aServer';

export interface A2AClientOptions {
  timeout_ms?: number;
  auth_token?: string;
}

/**
 * Discover an agent by fetching its Agent Card.
 */
export async function discoverAgent(agentUrl: string, options?: A2AClientOptions): Promise<AgentCard | null> {
  const timeout = options?.timeout_ms || 10000;
  const cardUrl = agentUrl.replace(/\/$/, '') + '/.well-known/agent.json';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(cardUrl, {
      signal: controller.signal,
      headers: options?.auth_token
        ? { 'Authorization': `Bearer ${options.auth_token}` }
        : undefined,
    });

    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const card = await res.json();
    const validation = validateAgentCard(card);
    if (!validation.valid) {
      console.warn(`Invalid Agent Card from ${agentUrl}:`, validation.errors);
      return null;
    }

    return card as AgentCard;
  } catch (error) {
    console.error(`Failed to discover agent at ${agentUrl}:`, error);
    return null;
  }
}

/**
 * Send a task to an external A2A agent.
 */
export async function sendTask(
  agentUrl: string,
  text: string,
  options?: A2AClientOptions
): Promise<A2ATask | null> {
  const timeout = options?.timeout_ms || 30000;
  const taskUrl = agentUrl.replace(/\/$/, '') + '/tasks/send';

  const message: A2AMessage = {
    role: 'user',
    parts: [{ type: 'text', text }],
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options?.auth_token) headers['Authorization'] = `Bearer ${options.auth_token}`;

    const res = await fetch(taskUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!res.ok) {
      console.error(`A2A task failed: ${res.status}`);
      return null;
    }

    return await res.json() as A2ATask;
  } catch (error) {
    console.error(`Failed to send A2A task to ${agentUrl}:`, error);
    return null;
  }
}

/**
 * Get the status of an existing task.
 */
export async function getTaskStatus(
  agentUrl: string,
  taskId: string,
  options?: A2AClientOptions
): Promise<A2ATask | null> {
  const timeout = options?.timeout_ms || 10000;
  const statusUrl = agentUrl.replace(/\/$/, '') + `/tasks/${taskId}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const headers: Record<string, string> = {};
    if (options?.auth_token) headers['Authorization'] = `Bearer ${options.auth_token}`;

    const res = await fetch(statusUrl, { headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    return await res.json() as A2ATask;
  } catch {
    return null;
  }
}

/**
 * Cancel a task on an external agent.
 */
export async function cancelTask(
  agentUrl: string,
  taskId: string,
  options?: A2AClientOptions
): Promise<boolean> {
  const cancelUrl = agentUrl.replace(/\/$/, '') + `/tasks/${taskId}`;

  try {
    const headers: Record<string, string> = {};
    if (options?.auth_token) headers['Authorization'] = `Bearer ${options.auth_token}`;

    const res = await fetch(cancelUrl, { method: 'DELETE', headers });
    return res.ok;
  } catch {
    return false;
  }
}
