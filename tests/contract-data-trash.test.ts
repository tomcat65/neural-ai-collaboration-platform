import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import supertest from 'supertest';
import { NeuralMCPServer } from '../src/unified-neural-mcp-server.js';

/**
 * Phase 2b durable server-side Trash. `retire` writes a VERIFIED data_trash entry
 * BEFORE hard-deleting (atomic, rolls back on trash-write failure), returns a
 * trashId; trash list/restore/purge are server-derived and keyed by trashId; the
 * audit log links the trashId. See docs/PLAN-Dashboard-Redesign-Phase-2-Data-Steward.md §5.
 */
describe('/api/data trash lifecycle (Phase 2b)', () => {
  const API_KEY = 'test-trash-key-' + 'b'.repeat(32);
  const originalEnv = { ...process.env };
  let tmpDir: string;
  let server: NeuralMCPServer;
  let app: any;

  function boot() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neural-trash-'));
    process.env.API_KEY = API_KEY;
    process.env.ENABLE_DATA_MANAGEMENT = '1';
    server = new NeuralMCPServer(0, path.join(tmpDir, 'test.db'));
    app = server.getExpressApp();
  }
  function db() {
    return server.getMemoryManager().getDb();
  }
  function seedEntity(id: string, name: string) {
    db().prepare(
      `INSERT INTO shared_memory (id, tenant_id, memory_type, content, created_by, tags)
       VALUES (?, 'default', 'entity', ?, 'test', '[]')`
    ).run(id, JSON.stringify({ name, type: 'project' }));
  }
  function liveCount(name: string): number {
    const rows = db().prepare(
      `SELECT content FROM shared_memory WHERE memory_type = 'entity' AND tenant_id = 'default'`
    ).all() as any[];
    return rows.filter((r) => {
      try { return JSON.parse(r.content).name === name; } catch { return false; }
    }).length;
  }
  function trashCount(): number {
    return (db().prepare('SELECT COUNT(*) AS n FROM data_trash').get() as any).n;
  }
  const auth = (r: any) => r.set('X-API-Key', API_KEY);

  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => {
    server?.close();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it('retire writes a verified trash entry, hard-deletes, returns trashId, links audit', async () => {
    boot();
    seedEntity('trash-ent-1', 'Trash-Target');
    expect(liveCount('Trash-Target')).toBe(1);

    const res = await auth(
      supertest(app).delete('/api/data/retire').send({ entityNames: ['Trash-Target'], reason: 'test' })
    ).expect(200);

    expect(res.body.trashId).toBeTruthy();
    expect(res.body.counts.entities).toBe(1);
    expect(res.body.deleted).toBeGreaterThanOrEqual(1);
    expect(liveCount('Trash-Target')).toBe(0);          // hard-deleted from the live store
    expect(trashCount()).toBe(1);                        // durable trash row exists

    // audit links the trashId (entity_name == trashId)
    const audit = server.getMemoryManager().queryAuditLog(undefined, 'data_retire', 10);
    expect(audit.some((a: any) => a.entity_name === res.body.trashId)).toBe(true);
  });

  it('trash list is server-derived (metadata only, no payload), keyed by trashId', async () => {
    boot();
    seedEntity('trash-ent-2', 'Listed');
    const retire = await auth(supertest(app).delete('/api/data/retire').send({ entityNames: ['Listed'] })).expect(200);

    const list = await auth(supertest(app).get('/api/data/trash')).expect(200);
    const entry = list.body.trash.find((t: any) => t.trashId === retire.body.trashId);
    expect(entry).toBeTruthy();
    expect(entry.counts.entities).toBe(1);
    expect(entry.backup).toBeUndefined(); // full payload is not exposed in the list
  });

  it('restore by trashId brings the entity back and removes the trash entry', async () => {
    boot();
    seedEntity('trash-ent-3', 'Recoverable');
    const retire = await auth(supertest(app).delete('/api/data/retire').send({ entityNames: ['Recoverable'] })).expect(200);
    expect(liveCount('Recoverable')).toBe(0);

    await auth(supertest(app).post(`/api/data/trash/${retire.body.trashId}/restore`)).expect(200);
    expect(liveCount('Recoverable')).toBe(1);  // back in the live store
    expect(trashCount()).toBe(0);              // trash entry consumed
  });

  it('purge removes a trash entry permanently', async () => {
    boot();
    seedEntity('trash-ent-4', 'Purgeable');
    const retire = await auth(supertest(app).delete('/api/data/retire').send({ entityNames: ['Purgeable'] })).expect(200);

    const purge = await auth(supertest(app).delete(`/api/data/trash/${retire.body.trashId}`)).expect(200);
    expect(purge.body.purged).toBe(1);
    expect(trashCount()).toBe(0);
  });

  it('retire of a non-existent entity is a no-op: 404, nothing deleted, nothing trashed', async () => {
    boot();
    seedEntity('trash-ent-5', 'Keeper');
    await auth(supertest(app).delete('/api/data/retire').send({ entityNames: ['Does-Not-Exist'] })).expect(404);
    expect(liveCount('Keeper')).toBe(1); // unaffected
    expect(trashCount()).toBe(0);        // no trash entry created
  });

  it('restore of an unknown trashId is 404', async () => {
    boot();
    await auth(supertest(app).post('/api/data/trash/nope-not-real/restore')).expect(404);
  });
});
