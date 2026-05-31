/**
 * Dashboard API contract (Engram dashboard adaptation, Phase 1, server side).
 *
 * Pins the response shapes the Vue dashboard depends on so the UI can't silently
 * go stale again (collaboration Decision C with codex-desktop):
 *  - /api/agent-status returns a CANONICAL roster by default (one entry per
 *    logical agent) with isEphemeral/canonicalAgentId/displayName; ?raw=true
 *    returns per-registration rows.
 *  - /api/analytics.overview exposes actualDbBytes/dbSizeSource/dbSizeAt
 *    (real PRAGMA size, not a client estimate).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import supertest from 'supertest';
import { NeuralMCPServer } from '../src/unified-neural-mcp-server.js';

const API_KEY = 'test-dashboard-key-' + 'a'.repeat(32);

describe('Dashboard API contract', () => {
  const originalEnv = { ...process.env };
  let tmpDir: string;
  let server: NeuralMCPServer;
  let app: any;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.API_KEY = API_KEY;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neural-dash-'));
    server = new NeuralMCPServer(0, path.join(tmpDir, 'test.db'));
    app = server.getExpressApp();

    // Seed a stable agent and an ephemeral bridge registration.
    const db = server.getMemoryManager().getDb();
    const now = new Date().toISOString();
    const ins = db.prepare(`
      INSERT INTO agent_registrations
        (agent_id, tenant_id, name, capabilities_json, endpoint, metadata_json, status, registered_by, created_at, updated_at)
      VALUES (?, 'default', ?, ?, NULL, '{}', 'active', 'test', ?, ?)
    `);
    ins.run('codex-desktop', 'Codex Desktop', JSON.stringify(['coding']), now, now);
    ins.run('agent-ErikaDesktop-12345-abc', 'stdio-bridge-ErikaDesktop', '[]', now, now);
    ins.run('agent-ErikaDesktop-67890-def', 'stdio-bridge-ErikaDesktop', '[]', now, now);
  });

  afterEach(() => {
    server?.close();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  async function getJson(path: string) {
    const res = await supertest(app).get(path).set('X-API-Key', API_KEY).expect(200);
    return res.body;
  }

  it('/api/agent-status returns a canonical roster by default with isEphemeral flags', async () => {
    const body = await getJson('/api/agent-status');
    expect(body.raw).toBe(false);
    expect(typeof body.totalCanonicalAgents).toBe('number');
    expect(Array.isArray(body.agents)).toBe(true);

    const a = body.agents[0];
    expect(a).toHaveProperty('canonicalAgentId');
    expect(a).toHaveProperty('displayName');
    expect(a).toHaveProperty('status');
    expect(a).toHaveProperty('lastSeen');
    expect(typeof a.isEphemeral).toBe('boolean');

    // The stable named agent is present and NOT ephemeral.
    const codex = body.agents.find((x: any) => x.canonicalAgentId === 'codex-desktop');
    expect(codex).toBeDefined();
    expect(codex.isEphemeral).toBe(false);

    // The two ephemeral bridge registrations are flagged ephemeral.
    const ephemerals = body.agents.filter((x: any) => x.isEphemeral);
    expect(ephemerals.length).toBeGreaterThanOrEqual(1);
    for (const e of ephemerals) expect(/^agent-.+-\d+-.+$/.test(e.canonicalAgentId)).toBe(true);
  });

  it('/api/agent-status?raw=true returns per-registration rows', async () => {
    const body = await getJson('/api/agent-status?raw=true');
    expect(body.raw).toBe(true);
    expect(typeof body.returnedRegistrations).toBe('number');
    // 3 seeded registrations, raw exposes them all (no canonical folding).
    expect(body.agents.length).toBe(3);
  });

  it('/api/analytics exposes real DB size (actualDbBytes via pragma)', async () => {
    const body = await getJson('/api/analytics');
    const o = body.overview;
    expect(typeof o.actualDbBytes).toBe('number');
    expect(o.actualDbBytes).toBeGreaterThan(0);
    expect(o.dbSizeSource).toBe('pragma');
    expect(typeof o.dbSizeAt).toBe('string');
  });
});
