/**
 * NE-S4: Contract Tests for Session Protocol Tools
 *
 * Exercises get_agent_context, begin_session, end_session against the live neural server.
 * Includes round-trip handoff persistence test.
 *
 * Requires: live server at http://localhost:6174 with API_KEY set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE_URL = process.env.NEURAL_URL || 'http://localhost:6174';
const API_KEY = process.env.NEURAL_API_KEY || 'IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=';

const timings: Record<string, number> = {};

async function mcpCall(toolName: string, args: Record<string, any> = {}): Promise<any> {
  const start = Date.now();
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

  const elapsed = Date.now() - start;
  timings[toolName] = elapsed;

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

async function httpGet(path: string): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-API-Key': API_KEY },
  });
  return res.json();
}

const TEST_PREFIX = '_session_test_';
const testAgentId = `${TEST_PREFIX}agent_${Date.now()}`;
const testProjectId = `${TEST_PREFIX}project_${Date.now()}`;

describe('Session Protocol Contract Tests', () => {
  beforeAll(async () => {
    const health = await httpGet('/health');
    expect(health.status).toBe('healthy');

    // Pre-register agent with learnings + preferences so context has data
    await mcpCall('register_agent', {
      agentId: testAgentId,
      name: 'Session Test Agent',
      capabilities: ['testing', 'session-protocol'],
    });

    await mcpCall('record_learning', {
      agentId: testAgentId,
      context: 'session protocol testing',
      lesson: 'always verify handoff round-trip',
      confidence: 0.95,
    });

    await mcpCall('set_preferences', {
      agentId: testAgentId,
      preferences: { verbosity: 'detailed', theme: 'dark' },
    });
  });

  afterAll(() => {
    console.log('\n--- Session Protocol Response Times ---');
    for (const [tool, ms] of Object.entries(timings).sort((a, b) => a[1] - b[1])) {
      console.log(`  ${tool}: ${ms}ms`);
    }
  });

  // === get_agent_context ===

  describe('get_agent_context', () => {
    it('returns structured HOT bundle with identity + meta', async () => {
      const bundle = await mcpCall('get_agent_context', {
        agentId: testAgentId,
      });

      // Structure checks
      expect(bundle.identity).toBeDefined();
      expect(bundle.identity.learnings).toBeDefined();
      expect(bundle.identity._preferencesWrapped).toBeDefined();
      expect(bundle.unreadMessages).toBeDefined();
      expect(bundle.guardrails).toBeDefined();
      expect(bundle.meta).toBeDefined();
      expect(bundle.meta.depth).toBe('hot');
      expect(bundle.meta.tokenEstimate).toBeGreaterThan(0);
    });

    it('returns WARM tier with project context when projectId given', async () => {
      const bundle = await mcpCall('get_agent_context', {
        agentId: testAgentId,
        projectId: testProjectId,
      });

      expect(bundle.meta.depth).toBe('warm');
      expect(bundle.identity).toBeDefined();
      expect(bundle.meta.tokenEstimate).toBeGreaterThan(0);
    });

    it('returns COLD tier with all data when depth=cold', async () => {
      const bundle = await mcpCall('get_agent_context', {
        agentId: testAgentId,
        projectId: testProjectId,
        depth: 'cold',
      });

      expect(bundle.meta.depth).toBe('cold');
      expect(bundle.identity).toBeDefined();
      expect(bundle.meta.tokenEstimate).toBeGreaterThan(0);
    });

    it('defaults to hot when no projectId given', async () => {
      const bundle = await mcpCall('get_agent_context', {
        agentId: testAgentId,
      });
      expect(bundle.meta.depth).toBe('hot');
    });

    it('defaults to warm when projectId is given', async () => {
      const bundle = await mcpCall('get_agent_context', {
        agentId: testAgentId,
        projectId: testProjectId,
      });
      expect(bundle.meta.depth).toBe('warm');
    });
  });

  // === begin_session ===

  describe('begin_session', () => {
    it('opens a session and returns structured response', async () => {
      const result = await mcpCall('begin_session', {
        agentId: testAgentId,
        projectId: testProjectId,
      });

      expect(result.status).toBe('session_opened');
      expect(result.agentId).toBe(testAgentId);
      expect(result.projectId).toBe(testProjectId);
      expect(result.context).toBeDefined();
      expect(result.context.meta).toBeDefined();
      expect(result.context.identity).toBeDefined();
      // notificationStatus should be present (skipped if no Slack URL)
      expect(['sent', 'skipped', 'failed']).toContain(result.notificationStatus);
    });

    it('creates project skeleton if project entity missing', async () => {
      const freshProject = `${TEST_PREFIX}fresh_${Date.now()}`;

      const result = await mcpCall('begin_session', {
        agentId: testAgentId,
        projectId: freshProject,
      });

      expect(result.status).toBe('session_opened');
      expect(result.projectId).toBe(freshProject);

      // Verify project entity was created by searching for it
      const search = await mcpCall('search_entities', {
        query: freshProject,
        searchType: 'exact',
        limit: 5,
      });

      const found = search.results?.some((r: any) =>
        JSON.stringify(r.content).includes(freshProject)
      );
      expect(found).toBe(true);
    });

    it('returns null handoff on first session (no prior end_session)', async () => {
      const virginProject = `${TEST_PREFIX}virgin_${Date.now()}`;

      const result = await mcpCall('begin_session', {
        agentId: testAgentId,
        projectId: virginProject,
      });

      expect(result.handoff).toBeNull();
    });
  });

  // === end_session ===

  describe('end_session', () => {
    it('closes a session and writes handoff flag', async () => {
      const result = await mcpCall('end_session', {
        agentId: testAgentId,
        projectId: testProjectId,
        summary: 'Completed session protocol contract tests',
        openItems: ['verify round-trip', 'check token budget'],
      });

      expect(result.status).toBe('session_closed');
      expect(result.agentId).toBe(testAgentId);
      expect(result.projectId).toBe(testProjectId);
      expect(result.handoffId).toBeTruthy();
      expect(result.summary).toBe('Completed session protocol contract tests');
      expect(result.openItems).toEqual(['verify round-trip', 'check token budget']);
      expect(result.learningsRecorded).toBe(0);
      expect(['sent', 'skipped', 'failed']).toContain(result.notificationStatus);
    });

    it('records learnings when provided', async () => {
      const result = await mcpCall('end_session', {
        agentId: testAgentId,
        projectId: testProjectId,
        summary: 'Session with learnings',
        learnings: [
          { context: 'testing', lesson: 'session tests work well', confidence: 0.9 },
          { context: 'handoff', lesson: 'handoff flags persist correctly' },
        ],
      });

      expect(result.status).toBe('session_closed');
      expect(result.learningsRecorded).toBe(2);
    });
  });

  // === Round-trip handoff persistence ===

  describe('handoff round-trip', () => {
    const rtProjectId = `${TEST_PREFIX}roundtrip_${Date.now()}`;
    const rtSummary = 'Round-trip handoff test summary';
    const rtOpenItems = ['item-alpha', 'item-beta', 'item-gamma'];

    it('end_session writes handoff, begin_session retrieves it', async () => {
      // First: begin a session (creates project skeleton)
      const beginResult = await mcpCall('begin_session', {
        agentId: testAgentId,
        projectId: rtProjectId,
      });
      expect(beginResult.status).toBe('session_opened');
      expect(beginResult.handoff).toBeNull(); // no prior handoff

      // End session: write handoff flag
      const endResult = await mcpCall('end_session', {
        agentId: testAgentId,
        projectId: rtProjectId,
        summary: rtSummary,
        openItems: rtOpenItems,
      });
      expect(endResult.status).toBe('session_closed');
      expect(endResult.handoffId).toBeTruthy();

      // Begin second session: should retrieve the handoff
      const beginResult2 = await mcpCall('begin_session', {
        agentId: testAgentId,
        projectId: rtProjectId,
      });
      expect(beginResult2.status).toBe('session_opened');
      expect(beginResult2.handoff).not.toBeNull();
      expect(beginResult2.handoff._wrapped).toContain(rtSummary);
      expect(beginResult2.handoff._wrapped).toContain('trust="agent"');
      expect(beginResult2.handoff.openItems).toEqual(rtOpenItems);
      expect(beginResult2.handoff.fromAgent).toBe(testAgentId);
      expect(beginResult2.handoff.projectId).toBe(rtProjectId);
    });

    it('second end_session replaces handoff (only one active per project)', async () => {
      const secondSummary = 'Updated handoff after second session';
      const secondItems = ['new-item-1'];

      // End session again with new summary
      const endResult2 = await mcpCall('end_session', {
        agentId: testAgentId,
        projectId: rtProjectId,
        summary: secondSummary,
        openItems: secondItems,
      });
      expect(endResult2.status).toBe('session_closed');

      // Begin third session: should get the LATEST handoff
      const beginResult3 = await mcpCall('begin_session', {
        agentId: testAgentId,
        projectId: rtProjectId,
      });
      expect(beginResult3.handoff).not.toBeNull();
      expect(beginResult3.handoff._wrapped).toContain(secondSummary);
      expect(beginResult3.handoff.openItems).toEqual(secondItems);
    });
  });

  // === Tool registry includes session tools ===

  describe('tools/list includes session protocol tools', () => {
    it('lists get_agent_context, begin_session, end_session', async () => {
      const res = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });

      const json = await res.json();
      const tools = json.result?.tools || [];
      const toolNames = tools.map((t: any) => t.name);

      expect(toolNames).toContain('get_agent_context');
      expect(toolNames).toContain('begin_session');
      expect(toolNames).toContain('end_session');

      // Total tool count: 18 (15 original + 3 session protocol)
      expect(tools.length).toBeGreaterThanOrEqual(18);
    });
  });
});
