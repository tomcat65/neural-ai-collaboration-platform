/**
 * Task 1400: Token Budget Ceiling Upgrade Contract Tests
 *
 * Verifies maxTokens parameter on get_agent_context and begin_session,
 * priority-based truncation, and meta.truncated / meta.sectionsDropped.
 */
import { describe, it, expect } from 'vitest';

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

describe('Token Budget Ceiling (Task 1400)', () => {
  const testAgent = `budget_test_${Date.now()}`;

  it('get_agent_context defaults to under 4000 tokens', async () => {
    const bundle = await mcpCall('get_agent_context', {
      agentId: testAgent,
    });
    expect(bundle.meta).toBeDefined();
    expect(bundle.meta.tokenEstimate).toBeLessThanOrEqual(4000);
    expect(bundle.meta.sectionsDropped).toBeDefined();
  });

  it('get_agent_context respects maxTokens parameter', async () => {
    const bundle = await mcpCall('get_agent_context', {
      agentId: testAgent,
      maxTokens: 8000,
    });
    expect(bundle.meta.tokenEstimate).toBeLessThanOrEqual(8000);
  });

  it('get_agent_context with very small maxTokens triggers truncation', async () => {
    const bundle = await mcpCall('get_agent_context', {
      agentId: testAgent,
      maxTokens: 50,
    });
    expect(bundle.meta.truncated).toBe(true);
    expect(bundle.meta.tokenEstimate).toBeDefined();
    // Identity should always survive (highest priority)
    expect(bundle.identity).toBeDefined();
  });

  it('begin_session accepts maxTokens parameter', async () => {
    const result = await mcpCall('begin_session', {
      agentId: testAgent,
      projectId: `budget_proj_${Date.now()}`,
      maxTokens: 4000,
    });
    expect(result.status).toBe('session_opened');
    expect(result.context).toBeDefined();
    expect(result.context.meta.tokenEstimate).toBeLessThanOrEqual(4000);
  });

  it('existing tests pass — default context is under 4000 tokens', async () => {
    // This verifies backward compatibility: existing callers without maxTokens
    // get the default 4000-token ceiling and should not see truncation
    const bundle = await mcpCall('get_agent_context', {
      agentId: 'unified-neural-mcp-server',
    });
    expect(bundle.meta.tokenEstimate).toBeLessThanOrEqual(4000);
  });
});
