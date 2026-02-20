/**
 * Task 1100: User Profile + Timezone Utility Contract Tests
 *
 * Verifies get_user_profile, update_user_profile tools,
 * HOT tier user block in get_agent_context/begin_session,
 * and tool registration.
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

async function toolsList(): Promise<any[]> {
  const res = await fetch(`${BASE_URL}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  const json = await res.json();
  return json.result?.tools || [];
}

describe('User Profile + Timezone (Task 1100)', () => {
  describe('tool registration', () => {
    it('get_user_profile is listed in tools/list', async () => {
      const tools = await toolsList();
      expect(tools.some((t: any) => t.name === 'get_user_profile')).toBe(true);
    });

    it('update_user_profile is listed in tools/list', async () => {
      const tools = await toolsList();
      expect(tools.some((t: any) => t.name === 'update_user_profile')).toBe(true);
    });
  });

  describe('get_user_profile', () => {
    it('returns profile for bootstrap user tommy', async () => {
      const profile = await mcpCall('get_user_profile', { userId: 'tommy' });
      expect(profile.id).toBe('tommy');
      expect(profile.tenantId).toBe('default');
      expect(profile.timezone).toBe('America/Chicago');
      expect(profile.locale).toBe('en-US');
      expect(typeof profile.prefsVersion).toBe('number');
    });

    it('returns error for non-existent user', async () => {
      // mcpCall throws on isError, but we parse the error response
      const res = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'tools/call',
          params: { name: 'get_user_profile', arguments: { userId: 'nonexistent_user_xyz' } },
        }),
      });
      const json = await res.json();
      const text = json.result?.content?.[0]?.text;
      const parsed = JSON.parse(text);
      expect(parsed.error).toBe('Not Found');
    });
  });

  describe('update_user_profile', () => {
    it('updates timezone and bumps prefs_version', async () => {
      // Get current version
      const before = await mcpCall('get_user_profile', { userId: 'tommy' });
      const prevVersion = before.prefsVersion;

      // Update timezone
      const result = await mcpCall('update_user_profile', {
        userId: 'tommy',
        timezone: 'America/New_York',
      });

      expect(result.status).toBe('updated');
      expect(result.profile.timezone).toBe('America/New_York');
      expect(result.profile.prefsVersion).toBe(prevVersion + 1);

      // Restore
      await mcpCall('update_user_profile', {
        userId: 'tommy',
        timezone: 'America/Chicago',
      });
    });
  });

  describe('HOT tier user block', () => {
    it('get_agent_context includes user block when userId provided', async () => {
      const bundle = await mcpCall('get_agent_context', {
        agentId: 'test-agent',
        userId: 'tommy',
      });

      expect(bundle.user).toBeDefined();
      expect(bundle.user).not.toBeNull();
      expect(bundle.user._wrapped).toContain('tommy');
    });

    it('get_agent_context has no user block when userId omitted', async () => {
      const bundle = await mcpCall('get_agent_context', {
        agentId: 'test-agent',
      });

      expect(bundle.user).toBeNull();
    });

    it('begin_session includes user block when userId provided', async () => {
      const result = await mcpCall('begin_session', {
        agentId: 'test-agent',
        projectId: `user_proj_${Date.now()}`,
        userId: 'tommy',
      });

      expect(result.status).toBe('session_opened');
      expect(result.context.user).toBeDefined();
      expect(result.context.user).not.toBeNull();
    });
  });
});
