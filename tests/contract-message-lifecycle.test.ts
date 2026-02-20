/**
 * Task 1200: mark_messages_read + archive_messages Contract Tests
 *
 * Verifies mark_messages_read and archive_messages tools, plus
 * get_ai_messages excluding archived messages by default.
 */
import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = process.env.NEURAL_URL || 'http://localhost:6174';
const API_KEY = process.env.NEURAL_API_KEY || 'IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=';

async function mcpCall(toolName: string, args: Record<string, any> = {}): Promise<any> {
  const res = await fetch(`${BASE_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });

  const json = await res.json();
  if (json.error) throw new Error(`MCP error: ${JSON.stringify(json.error)}`);

  const text = json.result?.content?.[0]?.text;
  if (!text) return json.result;
  if (json.result?.isError) throw new Error(`Tool error: ${text}`);

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

describe('Message Lifecycle (Task 1200)', () => {
  const testAgent = `lifecycle_test_${Date.now()}`;
  const senderAgent = `sender_${Date.now()}`;

  beforeAll(async () => {
    // Send a few test messages
    for (let i = 0; i < 3; i++) {
      await mcpCall('send_ai_message', {
        from: senderAgent,
        to: testAgent,
        content: `lifecycle test message ${i}`,
        messageType: 'info',
      });
    }
  });

  describe('mark_messages_read', () => {
    it('is listed in tools/list', async () => {
      const res = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      });
      const json = await res.json();
      const tools = json.result?.tools || [];
      const found = tools.some((t: any) => t.name === 'mark_messages_read');
      expect(found).toBe(true);
    });

    it('marks all unread messages for an agent', async () => {
      const result = await mcpCall('mark_messages_read', { agentId: testAgent });
      expect(result.status).toBe('ok');
      expect(result.agentId).toBe(testAgent);
      expect(typeof result.markedAsRead).toBe('number');
      expect(result.scope).toBe('all_unread');
    });

    it('returns 0 when no unread messages remain', async () => {
      const result = await mcpCall('mark_messages_read', { agentId: testAgent });
      expect(result.markedAsRead).toBe(0);
    });
  });

  describe('archive_messages', () => {
    it('is listed in tools/list', async () => {
      const res = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      });
      const json = await res.json();
      const tools = json.result?.tools || [];
      const found = tools.some((t: any) => t.name === 'archive_messages');
      expect(found).toBe(true);
    });

    it('archives messages older than 0 days (all messages)', async () => {
      const result = await mcpCall('archive_messages', {
        agentId: testAgent,
        olderThanDays: 0,
      });
      expect(result.status).toBe('ok');
      expect(result.agentId).toBe(testAgent);
      expect(typeof result.archived).toBe('number');
    });

    it('get_ai_messages excludes archived by default', async () => {
      const result = await mcpCall('get_ai_messages', {
        agentId: testAgent,
      });
      // All messages were archived, so none should remain
      expect(result.totalMessages).toBe(0);
    });

    it('get_ai_messages includes archived when includeArchived=true', async () => {
      const result = await mcpCall('get_ai_messages', {
        agentId: testAgent,
        includeArchived: true,
      });
      // Should see the archived messages
      expect(result.totalMessages).toBeGreaterThanOrEqual(3);
    });
  });
});
