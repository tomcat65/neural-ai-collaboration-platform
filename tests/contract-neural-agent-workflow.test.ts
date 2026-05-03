import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NeuralMCPServer } from '../src/unified-neural-mcp-server.js';

async function mcpCall(server: NeuralMCPServer, toolName: string, args: Record<string, any> = {}): Promise<any> {
  const result = await (server as any)._handleToolCall(toolName, args);
  const text = result?.content?.[0]?.text;
  if (!text) return result;
  if (result?.isError) throw new Error(`Tool error: ${text}`);

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function stableStringify(value: any): string {
  if (typeof value === 'undefined') return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function stripDryRunEphemeral(value: any): any {
  const ephemeral = new Set([
    'generatedAt',
    'durationMs',
    'estimatedTokens',
    'estimatedBytes',
    'canonicalHash',
    'artifactPath',
    'audit',
  ]);
  if (Array.isArray(value)) return value.map((item) => stripDryRunEphemeral(item));
  if (!value || typeof value !== 'object') return value;
  const result: any = {};
  for (const key of Object.keys(value)) {
    if (ephemeral.has(key)) continue;
    const stripped = stripDryRunEphemeral(value[key]);
    if (typeof stripped === 'undefined') continue;
    result[key] = stripped;
  }
  return result;
}

function canonicalDryRunHash(report: any): string {
  return createHash('sha256').update(stableStringify(stripDryRunEphemeral(report))).digest('hex');
}

function tableCount(server: NeuralMCPServer, tableName: string, tenantId?: string): number {
  const db = server.getMemoryManager().getDb();
  const exists = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ? LIMIT 1"
  ).get(tableName) as any;
  if (!exists) return 0;
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
  if (tenantId && cols.some((col: any) => col.name === 'tenant_id')) {
    return (db.prepare(`SELECT COUNT(*) as cnt FROM ${tableName} WHERE tenant_id = ?`).get(tenantId) as any).cnt;
  }
  return (db.prepare(`SELECT COUNT(*) as cnt FROM ${tableName}`).get() as any).cnt;
}

function pass2WatchedCounts(server: NeuralMCPServer, tenantId: string = 'default'): Record<string, number> {
  return {
    shared_memory: tableCount(server, 'shared_memory', tenantId),
    graph_lookup_keys: tableCount(server, 'graph_lookup_keys', tenantId),
    entity_identities: tableCount(server, 'entity_identities', tenantId),
    entity_context_facets: tableCount(server, 'entity_context_facets', tenantId),
    entity_lookup_identity_links: tableCount(server, 'entity_lookup_identity_links', tenantId),
    neural_vec_index: tableCount(server, 'neural_vec_index', tenantId),
    shared_memory_vec: tableCount(server, 'shared_memory_vec', tenantId),
    neural_audit_log: tableCount(server, 'neural_audit_log', tenantId),
  };
}

describe('Neural agent workflow metadata', () => {
  let server: NeuralMCPServer;

  beforeAll(() => {
    process.env.ENABLE_ADVANCED_MEMORY = 'false';
    server = new NeuralMCPServer(0, ':memory:');
  });

  afterAll(() => {
    server.close();
    delete process.env.ENABLE_ADVANCED_MEMORY;
  });

  it('resolves entity aliases and preserves agent bootstrap metadata', async () => {
    const ts = Date.now();
    const entityName = `workflow-project-${ts}-llc`;
    const alias = `workflow-project-${ts}`;

    const created = await mcpCall(server, 'create_entities', {
      entities: [
        {
          name: entityName,
          entityType: 'project',
          aliases: [alias],
          agentBootstrap: ['Read latest observations before taking next action.'],
          metadata: { owner: 'contract-test' },
          observations: ['Initial project context.'],
        },
      ],
    });

    expect(created.created).toBe(1);
    expect(created.entities[0].aliases).toContain(alias);
    expect(created.entities[0].agentBootstrap).toContain('Read latest observations before taking next action.');
    expect(created.entities[0].metadata.owner).toBe('contract-test');

    const searched = await mcpCall(server, 'search_entities', {
      query: alias,
      searchType: 'exact',
      limit: 10,
      compact: false,
    });

    expect(searched.exactEntityMatches).toBeGreaterThanOrEqual(1);
    expect(searched.exactOnly).toBe(true);
    expect(searched.results[0].content.name).toBe(entityName);
    expect(searched.results[0].searchScore).toBe(1.1);
  });

  it('stores structured correction metadata on observations', async () => {
    const ts = Date.now();
    const entityName = `workflow-corrections-${ts}`;

    await mcpCall(server, 'create_entities', {
      entities: [
        {
          name: entityName,
          entityType: 'project',
          observations: ['Old project fact.'],
        },
      ],
    });

    const added = await mcpCall(server, 'add_observations', {
      observations: [
        {
          entityName,
          contents: ['Current project fact.'],
          kind: 'correction',
          canonicalFact: 'Current project fact.',
          supersedes: ['old-project-fact'],
          appliesTo: [entityName],
          severity: 'high',
        },
      ],
    });

    const metadata = added.observations[0].metadata;
    expect(metadata.kind).toBe('correction');
    expect(metadata.canonicalFact).toBe('Current project fact.');
    expect(metadata.supersedes).toContain('old-project-fact');
    expect(metadata.appliesTo).toContain(entityName);
    expect(metadata.severity).toBe('high');
    expect(metadata.source).toBe('add_observations');
    expect(metadata.canonicalEntityKey).toBe(entityName.toLowerCase());
    expect(metadata.contentHash).toBe(createHash('sha256').update('Current project fact.').digest('hex'));

    const db = server.getMemoryManager().getDb();
    const row = db.prepare(
      "SELECT content FROM shared_memory WHERE id = ? AND memory_type = 'observation'"
    ).get(added.observations[0].id) as any;
    const persisted = JSON.parse(row.content);
    expect(persisted.metadata).toMatchObject({
      kind: 'correction',
      canonicalFact: 'Current project fact.',
      source: 'add_observations',
      canonicalEntityKey: entityName.toLowerCase(),
      contentHash: createHash('sha256').update('Current project fact.').digest('hex'),
    });

    const searched = await mcpCall(server, 'search_entities', {
      query: entityName,
      searchType: 'exact',
      memoryType: 'observation',
      limit: 10,
      compact: false,
    });

    const structuredResult = searched.results.find((result: any) => result.structuredObservation?.kind === 'correction');
    expect(searched.exactOnly).toBe(true);
    expect(searched.exactObservationMatches).toBeGreaterThanOrEqual(1);
    expect(structuredResult).toBeTruthy();
    expect(structuredResult.structuredObservation.canonicalFact).toBe('Current project fact.');
  });

  it('derives exact lookup keys from names and handle-like observations', async () => {
    const ts = Date.now();
    const entityName = `Houston Blenders Voice Launch ${ts}`;
    const handle = `hb-voice-v${ts}`;

    await mcpCall(server, 'create_entities', {
      entities: [
        {
          name: entityName,
          entityType: 'project',
          observations: [`Initial launch handle is ${handle}.`],
        },
      ],
    });
    await mcpCall(server, 'add_observations', {
      observations: [
        {
          entityName,
          contents: [`Latest handoff is tracked under ${handle}.`],
          kind: 'handoff',
          canonicalFact: `Latest handoff is tracked under ${handle}.`,
        },
      ],
    });

    const byDerivedName = await mcpCall(server, 'search_entities', {
      query: 'houston-blenders',
      searchType: 'exact',
      limit: 10,
      compact: false,
    });
    expect(byDerivedName.exactOnly).toBe(true);
    expect(byDerivedName.exactEntityMatches).toBeGreaterThanOrEqual(1);
    expect(byDerivedName.results.some((result: any) => result.content?.name === entityName)).toBe(true);

    const byHandle = await mcpCall(server, 'search_entities', {
      query: handle,
      searchType: 'exact',
      memoryType: 'observation',
      limit: 10,
      compact: false,
    });
    const handoff = byHandle.results.find((result: any) => result.structuredObservation?.kind === 'handoff');
    expect(byHandle.exactOnly).toBe(true);
    expect(byHandle.exactObservationMatches).toBeGreaterThanOrEqual(1);
    expect(handoff).toBeTruthy();
    expect(handoff.structuredObservation.canonicalFact).toContain(handle);
  });

  it('materializes inline entity observations as queryable observation rows', async () => {
    const ts = Date.now();
    const entityName = `Inline Observation Project ${ts}`;
    const handle = `inline-observation-handle-${ts}`;

    const created = await mcpCall(server, 'create_entities', {
      entities: [
        {
          name: entityName,
          entityType: 'project',
          observations: [`Inline observation includes ${handle}.`],
        },
      ],
    });

    expect(created.entities[0].materializedInlineObservations).toHaveLength(1);
    expect(created.entities[0].materializedInlineObservations[0].metadata.source).toBe('create_entities_inline');
    expect(created.entities[0].materializedInlineObservations[0].contents[0]).toContain(handle);

    const searched = await mcpCall(server, 'search_entities', {
      query: handle,
      memoryType: 'observation',
      limit: 10,
      compact: false,
    });

    expect(searched.exactAnchored).toBe(true);
    expect(searched.exactObservationMatches).toBeGreaterThanOrEqual(1);
    expect(searched.results.some((result: any) =>
      result.memoryType === 'observation' &&
      result.content?.metadata?.source === 'create_entities_inline' &&
      Array.isArray(result.content?.contents) &&
      result.content.contents[0].includes(handle)
    )).toBe(true);
  });

  it('hides redundant inline entity representation when materialized observation exists', async () => {
    const ts = Date.now();
    const entityName = `Inline Representation Dedupe ${ts}`;
    const handle = `ird-handle-${ts}`;

    await mcpCall(server, 'create_entities', {
      entities: [
        {
          name: entityName,
          entityType: 'project',
          observations: [`Inline entity text carries ${handle}.`],
        },
      ],
    });

    const searched = await mcpCall(server, 'search_entities', {
      query: handle,
      limit: 1,
      compact: false,
    });

    expect(searched.exactAnchored).toBe(true);
    expect(searched.exactEntityMatches).toBeGreaterThanOrEqual(1);
    expect(searched.exactObservationMatches).toBe(1);
    expect(searched.preRepresentationDeduplicationCount).toBeGreaterThanOrEqual(2);
    expect(searched.redundantRepresentationCount).toBe(1);
    expect(searched.returnedResults).toBe(1);
    expect(searched.totalResults).toBe(1);
    expect(searched.results[0].memoryType).toBe('observation');
    expect(searched.results[0].content.metadata.source).toBe('create_entities_inline');
    expect(searched.results[0].content.contents[0]).toContain(handle);

    const redundant = await mcpCall(server, 'search_entities', {
      query: handle,
      includeRedundantRepresentations: true,
      limit: 10,
      compact: false,
    });

    const entityResult = redundant.results.find((result: any) => result.memoryType === 'entity');
    expect(redundant.redundantRepresentationCount).toBe(0);
    expect(entityResult).toBeTruthy();
    expect(entityResult.matchedLookupKinds).toContain('embedded_observation_handle');
    expect(entityResult.matchOrigins).toContain('observation_prose');
  });

  it('keeps entity name matches even when materialized inline observations also match', async () => {
    const ts = Date.now();
    const entityName = `Inline Name Facet ${ts}`;

    await mcpCall(server, 'create_entities', {
      entities: [
        {
          name: entityName,
          entityType: 'project',
          observations: [`Observation belongs to ${entityName}.`],
        },
      ],
    });

    const searched = await mcpCall(server, 'search_entities', {
      query: entityName,
      limit: 10,
      compact: false,
    });

    const entityResult = searched.results.find((result: any) => result.memoryType === 'entity');
    const observationResult = searched.results.find((result: any) => result.memoryType === 'observation');

    expect(entityResult).toBeTruthy();
    expect(observationResult).toBeTruthy();
    expect(entityResult.matchedLookupKinds).toContain('canonical_name');
    expect(entityResult.matchOrigins).toContain('name');
    expect(searched.redundantRepresentationCount).toBe(0);
  });

  it('does not bridge inline observation handles to unrelated observation rows', async () => {
    const ts = Date.now();
    const entityName = `Inline Observation Bridge Guard ${ts}`;
    const handle = `inline-bridge-guard-${ts}`;

    await mcpCall(server, 'create_entities', {
      entities: [
        {
          name: entityName,
          entityType: 'project',
          observations: [`Inline-only handle ${handle}.`],
        },
      ],
    });
    await mcpCall(server, 'add_observations', {
      observations: [
        {
          entityName,
          contents: ['Unrelated later observation for the same entity.'],
          kind: 'handoff',
        },
      ],
    });

    const searched = await mcpCall(server, 'search_entities', {
      query: handle,
      memoryType: 'observation',
      limit: 10,
      compact: false,
    });

    expect(searched.exactAnchored).toBe(true);
    expect(searched.exactObservationMatches).toBe(1);
    expect(searched.results).toHaveLength(1);
    expect(searched.results[0].content.contents[0]).toContain(handle);
  });

  it('preserves repeated inline observations within the same create request', async () => {
    const ts = Date.now();
    const entityName = `Repeated Inline Observation Project ${ts}`;
    const repeated = `Repeated inline observation ${ts}.`;

    const created = await mcpCall(server, 'create_entities', {
      entities: [
        {
          name: entityName,
          entityType: 'project',
          observations: [repeated, repeated],
        },
      ],
    });

    expect(created.entities[0].materializedInlineObservations).toHaveLength(2);
    const inlineKeys = created.entities[0].materializedInlineObservations.map((obs: any) => obs.metadata.inlineKey);
    expect(new Set(inlineKeys).size).toBe(2);
  });

  it('uses an indexed lookup bridge for aliases, observations, and relations', async () => {
    const ts = Date.now();
    const entityName = `Indexed Canonical Project ${ts}`;
    const alias = `agent-next-action-${ts}`;
    const related = `Indexed Related Project ${ts}`;

    await mcpCall(server, 'create_entities', {
      entities: [
        {
          name: entityName,
          entityType: 'project',
          aliases: [alias],
          observations: ['Canonical project seed.'],
        },
        {
          name: related,
          entityType: 'project',
          observations: ['Related project seed.'],
        },
      ],
    });
    await mcpCall(server, 'add_observations', {
      observations: [
        {
          entityName,
          contents: ['Latest indexed handoff for the canonical project.'],
          kind: 'handoff',
        },
      ],
    });
    await mcpCall(server, 'create_relations', {
      relations: [
        {
          from: entityName,
          to: related,
          relationType: 'depends_on',
        },
      ],
    });

    const db = server.getMemoryManager().getDb();
    const lookupCount = (db.prepare(
      'SELECT COUNT(*) as cnt FROM graph_lookup_keys WHERE tenant_id = ? AND lookup_key = ?'
    ).get('default', alias) as any)?.cnt || 0;
    expect(lookupCount).toBeGreaterThanOrEqual(1);

    const searched = await mcpCall(server, 'search_entities', {
      query: alias,
      searchType: 'exact',
      limit: 20,
      compact: false,
    });

    expect(searched.exactOnly).toBe(true);
    expect(searched.exactEntityMatches).toBeGreaterThanOrEqual(1);
    expect(searched.exactObservationMatches).toBeGreaterThanOrEqual(1);
    expect(searched.exactRelationMatches).toBeGreaterThanOrEqual(1);
    expect(searched.results.some((result: any) => result.content?.entityName === entityName)).toBe(true);
    expect(searched.results.some((result: any) => result.content?.from === entityName)).toBe(true);
  });

  it('anchors default hybrid search on indexed exact matches without fallback search', async () => {
    const ts = Date.now();
    const entityName = `Hybrid Anchor Project ${ts}`;
    const alias = `hybrid-anchor-${ts}`;
    const handle = `hybrid-anchor-handle-${ts}`;
    const related = `Hybrid Anchor Related ${ts}`;

    await mcpCall(server, 'create_entities', {
      entities: [
        {
          name: entityName,
          entityType: 'project',
          aliases: [alias],
          observations: ['Hybrid anchor seed.'],
        },
        {
          name: related,
          entityType: 'project',
          observations: ['Hybrid anchor related seed.'],
        },
      ],
    });
    await mcpCall(server, 'add_observations', {
      observations: [
        {
          entityName,
          contents: [`Hybrid default lookup handle ${handle}.`],
          kind: 'handoff',
        },
      ],
    });
    await mcpCall(server, 'create_relations', {
      relations: [
        {
          from: entityName,
          to: related,
          relationType: 'supports',
        },
      ],
    });

    const manager = server.getMemoryManager() as any;
    const originalSearch = manager.search.bind(manager);
    manager.search = async () => {
      throw new Error('fallback search should not run when exact graph matches anchor default search');
    };

    try {
      const searched = await mcpCall(server, 'search_entities', {
        query: alias,
        limit: 20,
        compact: false,
      });

      expect(searched.searchType).toBe('hybrid');
      expect(searched.exactOnly).toBe(false);
      expect(searched.exactAnchored).toBe(true);
      expect(searched.semanticSkipped).toBe('exact_matches');
      expect(searched.exactEntityMatches).toBeGreaterThanOrEqual(1);
      expect(searched.exactObservationMatches).toBeGreaterThanOrEqual(1);
      expect(searched.exactRelationMatches).toBeGreaterThanOrEqual(1);
      expect(searched.results.some((result: any) => result.content?.name === entityName)).toBe(true);
      expect(searched.results.some((result: any) => result.content?.entityName === entityName)).toBe(true);
      expect(searched.results.some((result: any) => result.content?.from === entityName)).toBe(true);
    } finally {
      manager.search = originalSearch;
    }
  });

  it('counts observation prose handle matches before anchoring hybrid observation searches', async () => {
    const ts = Date.now();
    const entityName = `Hybrid Observation Handle Project ${ts}`;
    const handle = `hybrid-observation-handle-${ts}`;

    await mcpCall(server, 'create_entities', {
      entities: [
        {
          name: entityName,
          entityType: 'project',
          observations: ['Hybrid observation handle seed.'],
        },
      ],
    });
    await mcpCall(server, 'add_observations', {
      observations: [
        {
          entityName,
          contents: [`Observation prose includes ${handle}.`],
          kind: 'handoff',
        },
      ],
    });

    const manager = server.getMemoryManager() as any;
    const originalSearch = manager.search.bind(manager);
    manager.search = async () => {
      throw new Error('fallback search should not run when an observation row matches the handle');
    };

    try {
      const searched = await mcpCall(server, 'search_entities', {
        query: handle,
        memoryType: 'observation',
        limit: 10,
        compact: false,
      });

      expect(searched.exactAnchored).toBe(true);
      expect(searched.semanticSkipped).toBe('exact_matches');
      expect(searched.exactObservationMatches).toBeGreaterThanOrEqual(1);
      expect(searched.results.some((result: any) =>
        result.memoryType === 'observation' &&
        Array.isArray(result.content?.contents) &&
        result.content.contents[0].includes(handle)
      )).toBe(true);
    } finally {
      manager.search = originalSearch;
    }
  });

  it('does not suppress fallback when filters remove all exact candidates', async () => {
    const ts = Date.now();
    const entityName = `Hybrid Filter Entity Only ${ts}`;
    const alias = `hybrid-filter-entity-only-${ts}`;

    await mcpCall(server, 'create_entities', {
      entities: [
        {
          name: entityName,
          entityType: 'project',
          aliases: [alias],
          observations: [],
        },
      ],
    });

    const manager = server.getMemoryManager() as any;
    const originalSearch = manager.search.bind(manager);
    let fallbackCalled = false;
    manager.search = async () => {
      fallbackCalled = true;
      return [];
    };

    try {
      const searched = await mcpCall(server, 'search_entities', {
        query: alias,
        memoryType: 'observation',
        limit: 10,
        compact: false,
      });

      expect(fallbackCalled).toBe(true);
      expect(searched.exactAnchored).toBe(false);
      expect(searched.semanticSkipped).toBe(null);
      expect(searched.exactEntityMatches).toBeGreaterThanOrEqual(1);
      expect(searched.filteredExactMatches).toBe(0);
      expect(searched.totalResults).toBe(0);
    } finally {
      manager.search = originalSearch;
    }
  });

  it('refreshes lookup keys when observations are updated', async () => {
    const ts = Date.now();
    const entityName = `Indexed Update Project ${ts}`;
    const oldHandle = `indexed-update-old-${ts}`;
    const newHandle = `indexed-update-new-${ts}`;

    await mcpCall(server, 'create_entities', {
      entities: [
        {
          name: entityName,
          entityType: 'project',
          observations: ['Seed for update test.'],
        },
      ],
    });
    const added = await mcpCall(server, 'add_observations', {
      observations: [
        {
          entityName,
          contents: [`Original lookup handle ${oldHandle}.`],
          kind: 'handoff',
        },
      ],
    });

    await server.getMemoryManager().updateObservationContent(
      added.observations[0].id,
      `Updated lookup handle ${newHandle}.`,
      undefined,
      'default'
    );

    const oldSearch = await mcpCall(server, 'search_entities', {
      query: oldHandle,
      searchType: 'exact',
      memoryType: 'observation',
      limit: 10,
      compact: false,
    });
    const newSearch = await mcpCall(server, 'search_entities', {
      query: newHandle,
      searchType: 'exact',
      memoryType: 'observation',
      limit: 10,
      compact: false,
    });

    expect(oldSearch.exactObservationMatches).toBe(0);
    expect(newSearch.exactOnly).toBe(true);
    expect(newSearch.exactObservationMatches).toBeGreaterThanOrEqual(1);
    expect(newSearch.results.some((result: any) =>
      Array.isArray(result.content?.contents) && result.content.contents[0].includes(newHandle)
    )).toBe(true);
  });

  it('can rebuild the lookup index for existing graph rows', async () => {
    const ts = Date.now();
    const entityName = `Indexed Rebuild Project ${ts}`;
    const alias = `indexed-rebuild-alias-${ts}`;
    const id = `indexed-rebuild-${ts}`;
    const db = server.getMemoryManager().getDb();

    db.prepare(`
      INSERT INTO shared_memory (id, tenant_id, memory_type, content, created_by, tags)
      VALUES (?, 'default', 'entity', ?, 'contract-test', '[]')
    `).run(id, JSON.stringify({
      name: entityName,
      type: 'project',
      aliases: [alias],
      observations: ['Seeded directly to simulate pre-index data.'],
    }));

    const rebuilt = server.getMemoryManager().rebuildGraphLookupIndex('default');
    expect(rebuilt.rowsIndexed).toBeGreaterThanOrEqual(1);
    expect(rebuilt.keysIndexed).toBeGreaterThanOrEqual(1);

    const searched = await mcpCall(server, 'search_entities', {
      query: alias,
      searchType: 'exact',
      limit: 10,
      compact: false,
    });

    expect(searched.exactOnly).toBe(true);
    expect(searched.results.some((result: any) => result.content?.name === entityName)).toBe(true);
  });

  it('removes lookup keys when graph rows are deleted', async () => {
    const ts = Date.now();
    const entityName = `Indexed Delete Project ${ts}`;
    const alias = `indexed-delete-alias-${ts}`;

    const created = await mcpCall(server, 'create_entities', {
      entities: [
        {
          name: entityName,
          entityType: 'project',
          aliases: [alias],
          observations: ['Seed for delete index cleanup.'],
        },
      ],
    });
    const added = await mcpCall(server, 'add_observations', {
      observations: [
        {
          entityName,
          contents: [`Delete lookup marker ${alias}.`],
          kind: 'handoff',
        },
      ],
    });

    const db = server.getMemoryManager().getDb();
    const ids = [created.entities[0].id, added.observations[0].id];
    const beforeDelete = (db.prepare(
      `SELECT COUNT(*) as cnt FROM graph_lookup_keys WHERE memory_id IN (${ids.map(() => '?').join(',')})`
    ).get(...ids) as any)?.cnt || 0;
    expect(beforeDelete).toBeGreaterThan(0);

    const deleted = await server.getMemoryManager().deleteGraphRows(ids, 'default');
    expect(deleted.deleted).toBe(2);

    const afterDelete = (db.prepare(
      `SELECT COUNT(*) as cnt FROM graph_lookup_keys WHERE memory_id IN (${ids.map(() => '?').join(',')})`
    ).get(...ids) as any)?.cnt || 0;
    expect(afterDelete).toBe(0);
  });

  it('produces a Phase A identity dry-run without domain table mutations by default', async () => {
    const ts = Date.now();
    const entityName = `phase-a-dry-run-${ts}`;

    await mcpCall(server, 'create_entities', {
      entities: [
        {
          name: entityName,
          entityType: 'project',
          observations: ['Shard one: project goals and current state.'],
        },
        {
          name: entityName,
          entityType: 'project',
          observations: ['Shard two: implementation notes and next action.'],
        },
      ],
    });

    const db = server.getMemoryManager().getDb();
    const domainCountsBefore = {
      shared_memory: (db.prepare('SELECT COUNT(*) as cnt FROM shared_memory').get() as any).cnt,
      graph_lookup_keys: (db.prepare('SELECT COUNT(*) as cnt FROM graph_lookup_keys').get() as any).cnt,
    };
    const auditBefore = (db.prepare(
      "SELECT COUNT(*) as cnt FROM neural_audit_log WHERE operation = 'pass2_dry_run'"
    ).get() as any).cnt;

    const report = await mcpCall(server, 'inspect_identity_candidates', {
      canonicalKey: entityName,
      recordAudit: false,
      saveArtifact: false,
    });

    expect(report.phase).toBe('A');
    expect(report.tool).toBe('inspect_identity_candidates');
    expect(report.canonicalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.mutationContract.domainTablesUnchanged).toBe(true);
    expect(report.audit.recorded).toBe(false);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].canonicalKey).toBe(server.getMemoryManager().canonicalEntityKey(entityName));
    expect(report.groups[0].rowCount).toBe(2);
    expect(report.groups[0].classification).toBe('facet_of_identity');
    expect(report.groups[0].rows[0]).toMatchObject({
      proposedAction: 'facet_under_identity',
      proposedFacetType: 'project_identity',
    });
    expect(report.groups[0].rows[0].sourceRowId).toBeTruthy();
    expect(report.groups[0].rows[0].contentHash).toMatch(/^[a-f0-9]{64}$/);

    const domainCountsAfter = {
      shared_memory: (db.prepare('SELECT COUNT(*) as cnt FROM shared_memory').get() as any).cnt,
      graph_lookup_keys: (db.prepare('SELECT COUNT(*) as cnt FROM graph_lookup_keys').get() as any).cnt,
    };
    const auditAfter = (db.prepare(
      "SELECT COUNT(*) as cnt FROM neural_audit_log WHERE operation = 'pass2_dry_run'"
    ).get() as any).cnt;

    expect(domainCountsAfter).toEqual(domainCountsBefore);
    expect(auditAfter).toBe(auditBefore);
  });

  it('records exactly one pass2_dry_run audit row when requested', async () => {
    const ts = Date.now();
    const entityName = `phase-a-audited-${ts}`;

    await mcpCall(server, 'create_entities', {
      entities: [
        {
          name: entityName,
          entityType: 'project',
          observations: ['Audited shard one.'],
        },
        {
          name: entityName,
          entityType: 'project',
          observations: ['Audited shard two.'],
        },
      ],
    });

    const db = server.getMemoryManager().getDb();
    const sharedBefore = (db.prepare('SELECT COUNT(*) as cnt FROM shared_memory').get() as any).cnt;
    const lookupBefore = (db.prepare('SELECT COUNT(*) as cnt FROM graph_lookup_keys').get() as any).cnt;
    const auditBefore = (db.prepare(
      "SELECT COUNT(*) as cnt FROM neural_audit_log WHERE operation = 'pass2_dry_run'"
    ).get() as any).cnt;

    const report = await mcpCall(server, 'inspect_identity_candidates', {
      canonicalKey: entityName,
      recordAudit: true,
      saveArtifact: false,
    });

    const auditAfter = (db.prepare(
      "SELECT COUNT(*) as cnt FROM neural_audit_log WHERE operation = 'pass2_dry_run'"
    ).get() as any).cnt;
    const auditRow = db.prepare(
      "SELECT * FROM neural_audit_log WHERE id = ? AND operation = 'pass2_dry_run'"
    ).get(report.audit.id) as any;

    expect(report.audit.recorded).toBe(true);
    expect(report.audit.rowsWritten).toBe(1);
    expect(auditAfter).toBe(auditBefore + 1);
    expect(auditRow.content_hash).toBe(report.canonicalHash);
    expect(auditRow.target_count).toBe(2);
    expect((db.prepare('SELECT COUNT(*) as cnt FROM shared_memory').get() as any).cnt).toBe(sharedBefore);
    expect((db.prepare('SELECT COUNT(*) as cnt FROM graph_lookup_keys').get() as any).cnt).toBe(lookupBefore);
  });

  it('saves a Phase A artifact whose JSON round-trip reproduces the canonical hash', async () => {
    const ts = Date.now();
    const entityName = `phase-a-artifact-${ts}`;
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass2-artifact-'));

    try {
      await mcpCall(server, 'create_entities', {
        entities: [
          {
            name: entityName,
            entityType: 'project',
            observations: ['Artifact shard one.'],
          },
          {
            name: entityName,
            entityType: 'project',
            observations: ['Artifact shard two.'],
          },
        ],
      });

      const report = await mcpCall(server, 'inspect_identity_candidates', {
        canonicalKey: entityName,
        recordAudit: false,
        saveArtifact: true,
        artifactDir,
      });

      const saved = JSON.parse(fs.readFileSync(report.artifactPath, 'utf8'));
      expect(saved.canonicalHash).toBe(report.canonicalHash);
      expect(canonicalDryRunHash(saved)).toBe(report.canonicalHash);
      expect(saved.groups[0]).not.toHaveProperty('proposedSplit');
    } finally {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it('lists get_entity_context in tools/list', async () => {
    const listed = await (server as any)._handleToolsList();
    const names = listed.tools.map((tool: any) => tool.name);
    expect(names).toContain('get_entity_context');
  });

  it('lists execute_pass2_phase_c in tools/list', async () => {
    const listed = await (server as any)._handleToolsList();
    const names = listed.tools.map((tool: any) => tool.name);
    expect(names).toContain('execute_pass2_phase_c');
  });

  it('exposes add_observations agentId attribution in tools/list', async () => {
    const listed = await (server as any)._handleToolsList();
    const addObservations = listed.tools.find((tool: any) => tool.name === 'add_observations');
    expect(addObservations?.inputSchema?.properties?.agentId).toMatchObject({
      type: 'string',
    });
  });

  it('creates Phase C identity/facet/link tables and ADR indexes', () => {
    const db = server.getMemoryManager().getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('entity_identities','entity_context_facets','entity_lookup_identity_links')"
    ).all() as any[];
    expect(tables.map((row: any) => row.name).sort()).toEqual([
      'entity_context_facets',
      'entity_identities',
      'entity_lookup_identity_links',
    ]);

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_entity_%' OR name LIKE 'idx_facets_%' OR name LIKE 'idx_identity_lookup_%'"
    ).all().map((row: any) => row.name);
    expect(indexes).toEqual(expect.arrayContaining([
      'idx_entity_identities_active_canonical',
      'idx_entity_identities_lifecycle',
      'idx_entity_identities_status',
      'idx_entity_identities_audit',
      'idx_facets_active_source_hash',
      'idx_facets_identity',
      'idx_facets_source_row',
      'idx_facets_tenant_type',
      'idx_facets_content_hash',
      'idx_facets_audit',
      'idx_identity_lookup_links_active_identity',
      'idx_identity_lookup_links_one_resolved',
      'idx_identity_lookup_links_lookup',
      'idx_identity_lookup_links_identity',
      'idx_identity_lookup_links_source_row',
      'idx_identity_lookup_links_audit',
    ]));
  });

  it('rejects out-of-range Phase C confidence values', () => {
    const db = server.getMemoryManager().getDb();
    expect(() => db.prepare(`
      INSERT INTO entity_identities (
        identity_id, tenant_id, display_name, canonical_key, entity_type,
        lifecycle_status, status, resolution_status, confidence,
        created_at, updated_at
      )
      VALUES ('ident_test_confidence_bad', 'default', 'bad', 'bad', 'project',
        'unknown', 'active', 'inferred', 1.5, datetime('now'), datetime('now'))
    `).run()).toThrow(/CHECK constraint failed/);
  });

  it('Phase C plan mode validates a signed artifact without writing watched tables', async () => {
    const ts = Date.now();
    const entityName = `phase-c-plan-${ts}`;
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass2-phase-c-plan-'));

    try {
      await mcpCall(server, 'create_entities', {
        entities: [
          {
            name: entityName,
            entityType: 'project',
            metadata: { source: 'create_entities_inline' },
            observations: ['Phase C shard one.'],
          },
          {
            name: entityName,
            entityType: 'project',
            metadata: { source: 'create_entities_inline' },
            observations: ['Phase C shard two.'],
          },
        ],
      });
      const report = await mcpCall(server, 'inspect_identity_candidates', {
        canonicalKey: entityName,
        recordAudit: true,
        saveArtifact: true,
        artifactDir,
      });

      const before = pass2WatchedCounts(server);
      const plan = await mcpCall(server, 'execute_pass2_phase_c', {
        action: 'plan',
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
      });
      const after = pass2WatchedCounts(server);

      expect(after).toEqual(before);
      expect(plan.schemaVersion).toBe('pass2.phaseC.plan.v1');
      expect(plan.action).toBe('plan');
      expect(plan.productionExecuteEnabled).toBe(false);
      expect(plan.dryRunHash).toBe(report.canonicalHash);
      expect(plan.summary.executableGroups).toBe(1);
      expect(plan.wouldWrite.identities).toBe(1);
      expect(plan.wouldWrite.facets).toBe(2);
      expect(plan.wouldWrite.sharedMemory).toBe(0);
      expect(plan.wouldWrite.graphLookupKeys).toBe(0);
      expect(plan.rowCountsUnchanged).toBe(true);
    } finally {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it('Phase C plan mode accepts null metadataSource as explicit evidence of absence', async () => {
    const ts = Date.now();
    const entityName = `phase-c-null-metadata-source-${ts}`;
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass2-phase-c-null-metadata-'));

    try {
      await mcpCall(server, 'create_entities', {
        entities: [
          {
            name: entityName,
            entityType: 'project',
            observations: ['Phase C null metadata source shard one.'],
          },
          {
            name: entityName,
            entityType: 'project',
            observations: ['Phase C null metadata source shard two.'],
          },
        ],
      });
      const report = await mcpCall(server, 'inspect_identity_candidates', {
        canonicalKey: entityName,
        recordAudit: true,
        saveArtifact: true,
        artifactDir,
      });
      const saved = JSON.parse(fs.readFileSync(report.artifactPath, 'utf8'));
      expect(saved.groups[0].rows.every((row: any) => Object.prototype.hasOwnProperty.call(row, 'metadataSource'))).toBe(true);
      expect(saved.groups[0].rows.every((row: any) => row.metadataSource === null)).toBe(true);

      const before = pass2WatchedCounts(server);
      const plan = await mcpCall(server, 'execute_pass2_phase_c', {
        action: 'plan',
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
      });
      const after = pass2WatchedCounts(server);

      expect(after).toEqual(before);
      expect(plan.summary.executableGroups).toBe(1);
      expect(plan.summary.skippedGroups).toBe(0);
      expect(plan.executableGroups[0].notes).toContain('PHASE_C_METADATA_SOURCE_NULL');
      expect(plan.executableGroups[0].metadataSourceNullRowCount).toBe(2);
      expect(plan.wouldWrite.identities).toBe(1);
      expect(plan.wouldWrite.facets).toBe(2);
      expect(plan.rowCountsUnchanged).toBe(true);
    } finally {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it('Phase C refuses execute and verify when source rows drift after dry-run review', async () => {
    const ts = Date.now();
    const entityName = `phase-c-source-drift-${ts}`;
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass2-source-drift-'));

    try {
      await mcpCall(server, 'create_entities', {
        entities: [
          { name: entityName, entityType: 'project', metadata: { source: 'create_entities_inline' }, observations: ['Drift shard one.'] },
          { name: entityName, entityType: 'project', metadata: { source: 'create_entities_inline' }, observations: ['Drift shard two.'] },
        ],
      });
      const report = await mcpCall(server, 'inspect_identity_candidates', {
        canonicalKey: entityName,
        recordAudit: true,
        saveArtifact: true,
        artifactDir,
      });
      const sourceRowId = report.groups[0].rows[0].sourceRowId;
      const db = server.getMemoryManager().getDb();
      db.prepare('UPDATE shared_memory SET content = ? WHERE id = ?').run(
        JSON.stringify({ name: entityName, entityType: 'project', observations: ['Drifted after review.'] }),
        sourceRowId
      );

      const before = pass2WatchedCounts(server);
      const plan = await mcpCall(server, 'execute_pass2_phase_c', {
        action: 'plan',
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
      });
      expect(plan.status).toBe('source_row_validation_failed');
      expect(plan.sourceRowIssues).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceRowId, issue: 'SOURCE_ROW_HASH_DRIFT' }),
      ]));
      expect(plan.productionExecuteEnabled).toBe(false);
      expect(pass2WatchedCounts(server)).toEqual(before);

      await expect(mcpCall(server, 'execute_pass2_phase_c', {
        action: 'execute',
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
      })).rejects.toThrow(/PHASE_C_SOURCE_ROW_VALIDATION_FAILED/);
      await expect(mcpCall(server, 'execute_pass2_phase_c', {
        action: 'verify',
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
      })).rejects.toThrow(/PHASE_C_SOURCE_ROW_VALIDATION_FAILED/);
      expect(pass2WatchedCounts(server)).toEqual(before);
    } finally {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it('Phase C execute verifies idempotent no-op, persisted context, and rollback in test context', async () => {
    const ts = Date.now();
    const entityName = `phase-c-execute-${ts}`;
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass2-phase-c-execute-'));

    try {
      await mcpCall(server, 'create_entities', {
        entities: [
          {
            name: entityName,
            entityType: 'project',
            metadata: { source: 'create_entities_inline' },
            observations: ['Phase C execute shard one.'],
          },
          {
            name: entityName,
            entityType: 'project',
            metadata: { source: 'create_entities_inline' },
            observations: ['Phase C execute shard two.'],
          },
        ],
      });
      const report = await mcpCall(server, 'inspect_identity_candidates', {
        canonicalKey: entityName,
        recordAudit: true,
        saveArtifact: true,
        artifactDir,
      });
      const plan = await mcpCall(server, 'execute_pass2_phase_c', {
        action: 'plan',
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
      });
      expect(plan.summary.executableGroups).toBe(1);

      const beforeExecute = pass2WatchedCounts(server);
      const executed = await mcpCall(server, 'execute_pass2_phase_c', {
        action: 'execute',
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
      });
      const afterExecute = pass2WatchedCounts(server);
      const ownerAuditId = executed.groups[0].ownerAuditId;
      const identityId = executed.groups[0].identityId;

      expect(executed.status).toBe('executed');
      expect(executed.executedGroups).toBe(1);
      expect(executed.productionExecuteEnabled).toBe(false);
      expect(identityId).toMatch(/^ident_[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(afterExecute.shared_memory).toBe(beforeExecute.shared_memory);
      expect(afterExecute.graph_lookup_keys).toBe(beforeExecute.graph_lookup_keys);
      expect(afterExecute.neural_vec_index).toBe(beforeExecute.neural_vec_index);
      expect(afterExecute.shared_memory_vec).toBe(beforeExecute.shared_memory_vec);
      expect(afterExecute.entity_identities - beforeExecute.entity_identities).toBe(1);
      expect(afterExecute.entity_context_facets - beforeExecute.entity_context_facets).toBe(2);
      expect(afterExecute.entity_lookup_identity_links - beforeExecute.entity_lookup_identity_links).toBe(plan.wouldWrite.links);
      expect(afterExecute.neural_audit_log - beforeExecute.neural_audit_log).toBe(plan.wouldWrite.auditRows);

      const context = await mcpCall(server, 'get_entity_context', {
        query: entityName,
      });
      expect(context.phase).toBe('C');
      expect(context.resolved).toBe(true);
      expect(context.identity.id).toBe(identityId);
      expect(context.facets.items).toHaveLength(2);
      expect(context.provenance.appliedDryRunReportHash).toBeNull();

      const verified = await mcpCall(server, 'execute_pass2_phase_c', {
        action: 'verify',
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
      });
      expect(verified.status).toBe('verified');
      expect(verified.groups[0]).toMatchObject({
        verified: true,
        identityId,
        facetCount: 2,
        expectedFacetCount: 2,
      });

      const beforeNoop = pass2WatchedCounts(server);
      const noop = await mcpCall(server, 'execute_pass2_phase_c', {
        action: 'execute',
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
      });
      const afterNoop = pass2WatchedCounts(server);
      expect(noop.status).toBe('verified_noop');
      expect(noop.noopGroups).toBe(1);
      expect(afterNoop).toEqual(beforeNoop);

      const rollback = await mcpCall(server, 'execute_pass2_phase_c', {
        action: 'rollback',
        rollbackOwnerAuditId: ownerAuditId,
      });
      expect(rollback.status).toBe('rolled_back');
      expect(rollback.identitiesDeactivated).toBe(1);
      expect(rollback.facetsDeactivated).toBe(2);
      expect(rollback.linksDeactivated).toBe(plan.wouldWrite.links);

      const db = server.getMemoryManager().getDb();
      expect((db.prepare(
        "SELECT COUNT(*) as cnt FROM entity_identities WHERE source_audit_id = ? AND status = 'active'"
      ).get(ownerAuditId) as any).cnt).toBe(0);
      expect((db.prepare(
        "SELECT COUNT(*) as cnt FROM entity_context_facets WHERE source_audit_id = ? AND status = 'active'"
      ).get(ownerAuditId) as any).cnt).toBe(0);
      expect((db.prepare(
        "SELECT COUNT(*) as cnt FROM entity_lookup_identity_links WHERE source_audit_id = ? AND status = 'active'"
      ).get(ownerAuditId) as any).cnt).toBe(0);
    } finally {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it('Phase C execute refuses partial or mismatched prior attempts', async () => {
    const ts = Date.now();
    const entityName = `phase-c-partial-${ts}`;
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass2-phase-c-partial-'));

    try {
      await mcpCall(server, 'create_entities', {
        entities: [
          { name: entityName, entityType: 'project', metadata: { source: 'create_entities_inline' }, observations: ['Partial shard one.'] },
          { name: entityName, entityType: 'project', metadata: { source: 'create_entities_inline' }, observations: ['Partial shard two.'] },
        ],
      });
      const report = await mcpCall(server, 'inspect_identity_candidates', {
        canonicalKey: entityName,
        recordAudit: true,
        saveArtifact: true,
        artifactDir,
      });
      const db = server.getMemoryManager().getDb();
      db.prepare(`
        INSERT INTO entity_identities (
          identity_id, tenant_id, display_name, canonical_key, entity_type,
          lifecycle_status, status, resolution_status, confidence,
          source_audit_id, created_by, created_at, updated_at
        )
        VALUES (?, 'default', ?, ?, 'project', 'unknown', 'active', 'inferred', 0.5, 'mismatched-owner', 'test', datetime('now'), datetime('now'))
      `).run(`ident_partial_${ts}`, entityName, server.getMemoryManager().canonicalEntityKey(entityName));

      await expect(mcpCall(server, 'execute_pass2_phase_c', {
        action: 'execute',
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
      })).rejects.toThrow(/PHASE_C_PARTIAL_OR_MISMATCHED_PRIOR_ATTEMPT/);
    } finally {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it('Phase C production execute opens only with fresh exact approval and rollback rehearsal evidence', async () => {
    const ts = Date.now();
    const entityName = `phase-c-prod-gate-${ts}`;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass2-phase-c-prod-gate-'));
    const dbPath = path.join(tempDir, 'unified-platform.db');
    const artifactDir = path.join(tempDir, 'artifacts');
    const previousProductionEnabled = process.env.PHASE_C_PRODUCTION_EXECUTE_ENABLED;
    const previousProductionHash = process.env.PHASE_C_PRODUCTION_DRY_RUN_HASH;
    const previousProductionApprovalId = process.env.PHASE_C_PRODUCTION_APPROVAL_OBSERVATION_ID;
    const previousRollbackRehearsalId = process.env.PHASE_C_ROLLBACK_REHEARSAL_OBSERVATION_ID;
    const previousReviewerPassIds = process.env.PHASE_C_REVIEWER_PASS_OBSERVATION_IDS;
    const previousTrustedApprovalAgents = process.env.PHASE_C_TRUSTED_APPROVAL_AGENTS;
    const previousTrustedApprovers = process.env.PHASE_C_TRUSTED_APPROVERS;
    const previousRequiredReviewers = process.env.PHASE_C_REQUIRED_REVIEWERS;
    const previousTrustedReviewAgents = process.env.PHASE_C_TRUSTED_REVIEW_AGENTS;
    const prodLikeServer = new NeuralMCPServer(0, dbPath);

    try {
      process.env.PHASE_C_TRUSTED_APPROVAL_AGENTS = 'codex-desktop';
      process.env.PHASE_C_TRUSTED_APPROVERS = 'tommy';
      process.env.PHASE_C_REQUIRED_REVIEWERS = 'codex,claude-code';
      process.env.PHASE_C_TRUSTED_REVIEW_AGENTS = 'codex,claude-code';
      await mcpCall(prodLikeServer, 'create_entities', {
        entities: [
          {
            name: entityName,
            entityType: 'project',
            metadata: { source: 'create_entities_inline' },
            observations: ['Production gate shard one.'],
          },
          {
            name: entityName,
            entityType: 'project',
            metadata: { source: 'create_entities_inline' },
            observations: ['Production gate shard two.'],
          },
        ],
      });

      const report = await mcpCall(prodLikeServer, 'inspect_identity_candidates', {
        canonicalKey: entityName,
        recordAudit: true,
        saveArtifact: true,
        artifactDir,
      });

      await expect(mcpCall(prodLikeServer, 'execute_pass2_phase_c', {
        action: 'execute',
        executionMode: 'production',
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
      })).rejects.toThrow(/PHASE_C_PRODUCTION_EXECUTE_NOT_ENABLED/);

      const rehearsal = await mcpCall(prodLikeServer, 'add_observations', {
        agentId: 'codex-desktop',
        observations: [
          {
            entityName: 'Pass 2.0 Phase C Identity/Facet/Link Writes',
            contents: ['Rollback rehearsal passed for the exact production gate test hash.'],
            metadata: {
              kind: 'rollback_rehearsal_pass',
              phase: 'Phase C',
              dryRunHash: report.canonicalHash,
              rehearsalVerdict: 'PASS',
            },
          },
        ],
      });
      const spoofedCodexReview = await mcpCall(prodLikeServer, 'add_observations', {
        agentId: 'claude-code',
        observations: [
          {
            entityName: 'Pass 2.0 Phase C Identity/Facet/Link Writes',
            contents: ['Claude-code must not be able to fill the codex reviewer slot.'],
            metadata: {
              kind: 'phase_c_reviewer_pass',
              phase: 'Phase C',
              dryRunHash: report.canonicalHash,
              reviewVerdict: 'PASS',
              reviewer: 'codex',
            },
          },
        ],
      });
      const codexReview = await mcpCall(prodLikeServer, 'add_observations', {
        agentId: 'codex',
        observations: [
          {
            entityName: 'Pass 2.0 Phase C Identity/Facet/Link Writes',
            contents: ['Codex reviewer PASS for exact production gate test hash.'],
            metadata: {
              kind: 'phase_c_reviewer_pass',
              phase: 'Phase C',
              dryRunHash: report.canonicalHash,
              reviewVerdict: 'PASS',
              reviewer: 'codex',
            },
          },
        ],
      });
      const claudeReview = await mcpCall(prodLikeServer, 'add_observations', {
        agentId: 'claude-code',
        observations: [
          {
            entityName: 'Pass 2.0 Phase C Identity/Facet/Link Writes',
            contents: ['Claude-code reviewer PASS for exact production gate test hash.'],
            metadata: {
              kind: 'phase_c_reviewer_pass',
              phase: 'Phase C',
              dryRunHash: report.canonicalHash,
              reviewVerdict: 'PASS',
              reviewer: 'claude-code',
            },
          },
        ],
      });
      const approval = await mcpCall(prodLikeServer, 'add_observations', {
        agentId: 'codex-desktop',
        observations: [
          {
            entityName: 'Pass 2.0 Phase C Identity/Facet/Link Writes',
            contents: ['Tommy explicitly approves production execute for the exact Phase C test hash and full scope.'],
            metadata: {
              kind: 'production_execute_approval',
              phase: 'Phase C',
              dryRunHash: report.canonicalHash,
              productionExecuteApproved: true,
              approvedBy: 'tommy',
              action: 'execute_pass2_phase_c',
            },
          },
        ],
      });
      const approvalMissingAction = await mcpCall(prodLikeServer, 'add_observations', {
        agentId: 'codex-desktop',
        observations: [
          {
            entityName: 'Pass 2.0 Phase C Identity/Facet/Link Writes',
            contents: ['Tommy approval without the required exact action binding must not open production execute.'],
            metadata: {
              kind: 'production_execute_approval',
              phase: 'Phase C',
              dryRunHash: report.canonicalHash,
              productionExecuteApproved: true,
              approvedBy: 'tommy',
            },
          },
        ],
      });
      process.env.PHASE_C_PRODUCTION_EXECUTE_ENABLED = 'true';
      process.env.PHASE_C_PRODUCTION_DRY_RUN_HASH = report.canonicalHash;
      process.env.PHASE_C_PRODUCTION_APPROVAL_OBSERVATION_ID = approvalMissingAction.observations[0].id;
      process.env.PHASE_C_ROLLBACK_REHEARSAL_OBSERVATION_ID = rehearsal.observations[0].id;
      process.env.PHASE_C_REVIEWER_PASS_OBSERVATION_IDS = [
        `codex=${spoofedCodexReview.observations[0].id}`,
        `claude-code=${claudeReview.observations[0].id}`,
      ].join(',');

      const missingActionPlan = await mcpCall(prodLikeServer, 'execute_pass2_phase_c', {
        action: 'plan',
        executionMode: 'production',
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
        approvalObservationId: approvalMissingAction.observations[0].id,
      });
      expect(missingActionPlan.productionExecuteEnabled).toBe(false);
      expect(missingActionPlan.productionGate.reasons).toContain('PHASE_C_APPROVAL_ACTION_MISMATCH');
      process.env.PHASE_C_PRODUCTION_APPROVAL_OBSERVATION_ID = approval.observations[0].id;

      const spoofedPlan = await mcpCall(prodLikeServer, 'execute_pass2_phase_c', {
        action: 'plan',
        executionMode: 'production',
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
        approvalObservationId: approval.observations[0].id,
      });
      expect(spoofedPlan.productionExecuteEnabled).toBe(false);
      expect(spoofedPlan.productionGate.missingReviewers).toContain('codex');
      process.env.PHASE_C_REVIEWER_PASS_OBSERVATION_IDS = [
        `codex=${codexReview.observations[0].id}`,
        `claude-code=${claudeReview.observations[0].id}`,
      ].join(',');

      const plan = await mcpCall(prodLikeServer, 'execute_pass2_phase_c', {
        action: 'plan',
        executionMode: 'production',
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
        approvalObservationId: approval.observations[0].id,
      });
      expect(plan.productionExecuteEnabled, JSON.stringify(plan.productionGate)).toBe(true);
      expect(plan.productionGate).toMatchObject({
        enabled: true,
        approvalObservationId: approval.observations[0].id,
        rollbackRehearsalObservationId: rehearsal.observations[0].id,
        missingReviewers: [],
      });
      expect(Object.keys(plan.productionGate.reviewerPassObservationIds).sort()).toEqual(['claude-code', 'codex']);

      const executed = await mcpCall(prodLikeServer, 'execute_pass2_phase_c', {
        action: 'execute',
        executionMode: 'production',
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
        approvalObservationId: approval.observations[0].id,
        actorId: 'codex-desktop-test',
      });
      expect(executed.status).toBe('executed');
      expect(executed.writeContext).toBe('production');
      expect(executed.productionExecuteEnabled).toBe(true);
      expect(executed.productionGate.enabled).toBe(true);
      expect(executed.executedGroups).toBe(1);
      expect(executed.groups[0].facetsWritten).toBe(2);

      const verify = await mcpCall(prodLikeServer, 'execute_pass2_phase_c', {
        action: 'verify',
        executionMode: 'production',
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
        approvalObservationId: approval.observations[0].id,
      });
      expect(verify.status).toBe('verified');
      expect(verify.productionExecuteEnabled).toBe(true);
    } finally {
      prodLikeServer.close();
      if (typeof previousProductionEnabled === 'undefined') delete process.env.PHASE_C_PRODUCTION_EXECUTE_ENABLED;
      else process.env.PHASE_C_PRODUCTION_EXECUTE_ENABLED = previousProductionEnabled;
      if (typeof previousProductionHash === 'undefined') delete process.env.PHASE_C_PRODUCTION_DRY_RUN_HASH;
      else process.env.PHASE_C_PRODUCTION_DRY_RUN_HASH = previousProductionHash;
      if (typeof previousProductionApprovalId === 'undefined') delete process.env.PHASE_C_PRODUCTION_APPROVAL_OBSERVATION_ID;
      else process.env.PHASE_C_PRODUCTION_APPROVAL_OBSERVATION_ID = previousProductionApprovalId;
      if (typeof previousRollbackRehearsalId === 'undefined') delete process.env.PHASE_C_ROLLBACK_REHEARSAL_OBSERVATION_ID;
      else process.env.PHASE_C_ROLLBACK_REHEARSAL_OBSERVATION_ID = previousRollbackRehearsalId;
      if (typeof previousReviewerPassIds === 'undefined') delete process.env.PHASE_C_REVIEWER_PASS_OBSERVATION_IDS;
      else process.env.PHASE_C_REVIEWER_PASS_OBSERVATION_IDS = previousReviewerPassIds;
      if (typeof previousTrustedApprovalAgents === 'undefined') delete process.env.PHASE_C_TRUSTED_APPROVAL_AGENTS;
      else process.env.PHASE_C_TRUSTED_APPROVAL_AGENTS = previousTrustedApprovalAgents;
      if (typeof previousTrustedApprovers === 'undefined') delete process.env.PHASE_C_TRUSTED_APPROVERS;
      else process.env.PHASE_C_TRUSTED_APPROVERS = previousTrustedApprovers;
      if (typeof previousRequiredReviewers === 'undefined') delete process.env.PHASE_C_REQUIRED_REVIEWERS;
      else process.env.PHASE_C_REQUIRED_REVIEWERS = previousRequiredReviewers;
      if (typeof previousTrustedReviewAgents === 'undefined') delete process.env.PHASE_C_TRUSTED_REVIEW_AGENTS;
      else process.env.PHASE_C_TRUSTED_REVIEW_AGENTS = previousTrustedReviewAgents;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('Phase C plan mode rejects unsigned artifacts', async () => {
    const ts = Date.now();
    const entityName = `phase-c-unsigned-${ts}`;
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass2-phase-c-unsigned-'));

    try {
      await mcpCall(server, 'create_entities', {
        entities: [
          { name: entityName, entityType: 'project', observations: ['Unsigned Phase C shard one.'] },
          { name: entityName, entityType: 'project', observations: ['Unsigned Phase C shard two.'] },
        ],
      });
      const unsigned = await mcpCall(server, 'inspect_identity_candidates', {
        canonicalKey: entityName,
        recordAudit: false,
        saveArtifact: true,
        artifactDir,
      });

      await expect(mcpCall(server, 'execute_pass2_phase_c', {
        action: 'plan',
        dryRunArtifactPath: unsigned.artifactPath,
        dryRunHash: unsigned.canonicalHash,
      })).rejects.toThrow(/Signed pass2_dry_run audit row not found/);
    } finally {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it('assembles Phase B entity context from a signed dry-run projection without watched table mutations', async () => {
    const ts = Date.now();
    const entityName = `phase-b-context-${ts}`;
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass2-context-'));

    try {
      await mcpCall(server, 'create_entities', {
        entities: [
          {
            name: entityName,
            entityType: 'project',
            aliases: [`phase-b-alias-${ts}`],
            agentBootstrap: ['Phase B bootstrap note.'],
            observations: ['Shared implementation goal and signed projection context.'],
          },
          {
            name: entityName,
            entityType: 'project',
            observations: ['Shared implementation goal and signed projection context with test coverage.'],
          },
        ],
      });
      await mcpCall(server, 'add_observations', {
        observations: [
          {
            entityName,
            contents: ['Phase B materialized decision.'],
            kind: 'decision',
          },
        ],
      });
      await mcpCall(server, 'create_relations', {
        relations: [
          {
            from: entityName,
            to: `phase-b-related-${ts}`,
            relationType: 'INTEGRATES_WITH',
            properties: { description: 'Phase B relation registry fixture' },
          },
        ],
      });

      const report = await mcpCall(server, 'inspect_identity_candidates', {
        canonicalKey: entityName,
        recordAudit: true,
        saveArtifact: true,
        artifactDir,
      });

      const before = pass2WatchedCounts(server);
      const context = await mcpCall(server, 'get_entity_context', {
        query: entityName,
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
        observationKindFilter: ['decision'],
        relationTypeFilter: ['related_to'],
      });
      const after = pass2WatchedCounts(server);

      expect(after).toEqual(before);
      expect(context.schemaVersion).toBe('pass2.entityContext.v1');
      expect(context.phase).toBe('B');
      expect(context.resolved).toBe(false);
      expect(context.identity.id).toBeNull();
      expect(context.identity.canonicalEntityKey).toBe(server.getMemoryManager().canonicalEntityKey(entityName));
      expect(context.identity.aliases).toContain(`phase-b-alias-${ts}`);
      expect(context.legacyBootstrap).toContain('Phase B bootstrap note.');
      expect(context.warnings).toContain('PHASE_B_NO_PERSISTED_IDENTITY');
      expect(context.warnings).toContain('PHASE_B_PROJECTED_FACETS_NOT_RETURNED');
      expect(context.facets.items).toEqual([]);
      expect(context.provenance.appliedDryRunReportHash).toBe(report.canonicalHash);
      expect(context.provenance.dryRunProjection.proposedFacets.length).toBeGreaterThan(0);
      expect(context.provenance.dedupedRedundantRepresentations).toBeGreaterThanOrEqual(0);
      expect(context.tokenBudget.maxTokens).toBe(8000);
      expect(context.tokenBudget.estimatedTokens).toBeGreaterThan(0);
      expect(context.observations.items).toHaveLength(1);
      expect(context.observations.items[0].kind).toBe('decision');
      expect(context.relations.items).toHaveLength(1);
      expect(context.relations.items[0]).toMatchObject({
        sourceRelationType: 'INTEGRATES_WITH',
        semanticRelationType: 'related_to',
        mappingConfidence: 0.70,
        mappingSource: 'registry-v1',
        registryVersion: '1',
      });
    } finally {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it('honors Phase B sections without assembling unrequested context sections', async () => {
    const ts = Date.now();
    const entityName = `phase-b-sections-${ts}`;
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass2-sections-'));

    try {
      await mcpCall(server, 'create_entities', {
        entities: [
          {
            name: entityName,
            entityType: 'project',
            agentBootstrap: ['Section bootstrap should be gated.'],
            observations: ['Section shard one.'],
          },
          {
            name: entityName,
            entityType: 'project',
            observations: ['Section shard two.'],
          },
        ],
      });
      await mcpCall(server, 'create_relations', {
        relations: [{ from: entityName, to: `phase-b-section-peer-${ts}`, relationType: 'DEPENDS_ON' }],
      });
      const report = await mcpCall(server, 'inspect_identity_candidates', {
        canonicalKey: entityName,
        recordAudit: true,
        saveArtifact: true,
        artifactDir,
      });

      const context = await mcpCall(server, 'get_entity_context', {
        query: entityName,
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
        sections: ['identity'],
      });

      expect(context.identity.canonicalEntityKey).toBe(server.getMemoryManager().canonicalEntityKey(entityName));
      expect(context.observations.items).toEqual([]);
      expect(context.relations.items).toEqual([]);
      expect(context.facets.items).toEqual([]);
      expect(context.legacyBootstrap).toEqual([]);
      expect(context.warnings).not.toContain('PHASE_B_PROJECTED_FACETS_NOT_RETURNED');
      expect(context.provenance.dryRunProjection.proposedFacets).toEqual([]);

      await expect(mcpCall(server, 'get_entity_context', {
        query: entityName,
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
        sections: ['identity', 'bogus'],
      })).rejects.toThrow(/Invalid get_entity_context section/);
    } finally {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it('filters Phase B since by recorded row time rather than historical observedAt', async () => {
    const ts = Date.now();
    const entityName = `phase-b-since-${ts}`;
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass2-since-'));

    try {
      await mcpCall(server, 'create_entities', {
        entities: [
          { name: entityName, entityType: 'project', observations: ['Since shard one.'] },
          { name: entityName, entityType: 'project', observations: ['Since shard two.'] },
        ],
      });
      const since = new Date(Date.now() - 2000).toISOString();
      await mcpCall(server, 'add_observations', {
        observations: [
          {
            entityName,
            contents: ['Historical fact recorded after the since cursor.'],
            kind: 'decision',
            metadata: { observedAt: '2000-01-01T00:00:00.000Z' },
          },
        ],
      });
      const report = await mcpCall(server, 'inspect_identity_candidates', {
        canonicalKey: entityName,
        recordAudit: true,
        saveArtifact: true,
        artifactDir,
      });

      const context = await mcpCall(server, 'get_entity_context', {
        query: entityName,
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
        since,
        observationKindFilter: ['decision'],
      });

      expect(context.observations.items.map((item: any) => item.content)).toContain('Historical fact recorded after the since cursor.');
      expect(context.observations.items[0].timestamp).toBe('2000-01-01T00:00:00.000Z');
    } finally {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it('accepts older signed artifact paths without dryRunHash after newer audits exist', async () => {
    const ts = Date.now();
    const olderName = `phase-b-older-artifact-${ts}`;
    const newerName = `phase-b-newer-artifact-${ts}`;
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass2-older-'));

    try {
      await mcpCall(server, 'create_entities', {
        entities: [
          { name: olderName, entityType: 'project', observations: ['Older signed shard one.'] },
          { name: olderName, entityType: 'project', observations: ['Older signed shard two.'] },
        ],
      });
      const older = await mcpCall(server, 'inspect_identity_candidates', {
        canonicalKey: olderName,
        recordAudit: true,
        saveArtifact: true,
        artifactDir,
      });

      await mcpCall(server, 'create_entities', {
        entities: [
          { name: newerName, entityType: 'project', observations: ['Newer signed shard one.'] },
          { name: newerName, entityType: 'project', observations: ['Newer signed shard two.'] },
        ],
      });
      const newer = await mcpCall(server, 'inspect_identity_candidates', {
        canonicalKey: newerName,
        recordAudit: true,
        saveArtifact: true,
        artifactDir,
      });
      expect(newer.canonicalHash).not.toBe(older.canonicalHash);

      const context = await mcpCall(server, 'get_entity_context', {
        query: olderName,
        dryRunArtifactPath: older.artifactPath,
      });

      expect(context.identity.canonicalEntityKey).toBe(server.getMemoryManager().canonicalEntityKey(olderName));
      expect(context.provenance.appliedDryRunReportHash).toBe(older.canonicalHash);
    } finally {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it('keeps multiple contents from one Phase B observation row distinct during dedupe', async () => {
    const ts = Date.now();
    const entityName = `phase-b-multi-content-${ts}`;
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass2-multi-content-'));

    try {
      await mcpCall(server, 'create_entities', {
        entities: [
          { name: entityName, entityType: 'project', observations: ['Multi-content shard one.'] },
          { name: entityName, entityType: 'project', observations: ['Multi-content shard two.'] },
        ],
      });
      await mcpCall(server, 'add_observations', {
        observations: [
          {
            entityName,
            contents: ['First separate content item.', 'Second separate content item.'],
            kind: 'note',
            metadata: { contentHash: 'row-level-hash' },
          },
        ],
      });
      const report = await mcpCall(server, 'inspect_identity_candidates', {
        canonicalKey: entityName,
        recordAudit: true,
        saveArtifact: true,
        artifactDir,
      });
      const context = await mcpCall(server, 'get_entity_context', {
        query: entityName,
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
        observationKindFilter: ['note'],
      });

      const contents = context.observations.items.map((item: any) => item.content);
      expect(contents).toContain('First separate content item.');
      expect(contents).toContain('Second separate content item.');
    } finally {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it('refuses Phase B projection when exact entity lookup disagrees with dry-run candidate handles', async () => {
    const ts = Date.now();
    const targetName = `phase-b-exact-target-${ts}`;
    const unrelatedName = `phase-b-unrelated-carrier-${ts}`;
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass2-projection-mismatch-'));

    try {
      await mcpCall(server, 'create_entities', {
        entities: [
          {
            name: targetName,
            entityType: 'system_project',
            observations: ['Canonical target context.'],
          },
          {
            name: unrelatedName,
            entityType: 'project',
            observations: [`This unrelated shard mentions ${targetName} only as embedded prose.`],
          },
        ],
      });

      const report = await mcpCall(server, 'inspect_identity_candidates', {
        canonicalKey: unrelatedName,
        recordAudit: true,
        saveArtifact: true,
        artifactDir,
      });

      const context = await mcpCall(server, 'get_entity_context', {
        query: targetName,
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
      });

      expect(context.resolved).toBe(false);
      expect(context.identity.id).toBeNull();
      expect(context.identity.canonicalEntityKey).toBeNull();
      expect(context.resolution.proposedIdentity).toBeNull();
      expect(context.resolution.warnings).toContain('EXACT_LOOKUP_PROJECTION_MISMATCH');
      expect(context.resolution.warnings).toContain('NO_PROJECTION_MATCH');
      expect(context.provenance.appliedDryRunReportHash).toBe(report.canonicalHash);

      server.getMemoryManager().getDb().prepare('DELETE FROM graph_lookup_keys').run();
      const fallbackContext = await mcpCall(server, 'get_entity_context', {
        query: targetName,
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
      });

      expect(fallbackContext.resolved).toBe(false);
      expect(fallbackContext.identity.id).toBeNull();
      expect(fallbackContext.identity.canonicalEntityKey).toBeNull();
      expect(fallbackContext.resolution.proposedIdentity).toBeNull();
      expect(fallbackContext.resolution.warnings).toContain('EXACT_LOOKUP_PROJECTION_MISMATCH');
      expect(fallbackContext.resolution.warnings).toContain('NO_PROJECTION_MATCH');
    } finally {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it('keeps Phase B hard-split/manual-review projections unresolved with candidates', async () => {
    const ts = Date.now();
    const hyphenName = `phase-b-hb-apdas-${ts}`;
    const underscoreName = `phase_b_hb_apdas_${ts}`;
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass2-split-'));

    try {
      await mcpCall(server, 'create_entities', {
        entities: [
          {
            name: hyphenName,
            entityType: 'project',
            observations: ['Voice phone transport SIP PSTN call routing gateway.'],
          },
          {
            name: underscoreName,
            entityType: 'project',
            observations: ['Houston blenders distributor packet invoices lubricant allocation.'],
          },
        ],
      });

      const report = await mcpCall(server, 'inspect_identity_candidates', {
        canonicalKey: hyphenName,
        recordAudit: true,
        saveArtifact: true,
        artifactDir,
      });
      const context = await mcpCall(server, 'get_entity_context', {
        query: hyphenName,
        dryRunArtifactPath: report.artifactPath,
        dryRunHash: report.canonicalHash,
      });

      expect(context.resolved).toBe(false);
      expect(context.identity.id).toBeNull();
      expect(context.resolution.candidates.length).toBeGreaterThan(0);
      expect(context.resolution.warnings).toContain('NORMALIZATION_COLLAPSES_DISTINCT_RAW_NAMES');
      expect(context.provenance.dryRunProjection.classification).toBe('independent_identity');
    } finally {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it('rejects unsigned or tenant-mismatched Phase B dry-run artifacts', async () => {
    const ts = Date.now();
    const entityName = `phase-b-unsigned-${ts}`;
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass2-unsigned-'));

    try {
      await mcpCall(server, 'create_entities', {
        entities: [
          { name: entityName, entityType: 'project', observations: ['Unsigned shard one.'] },
          { name: entityName, entityType: 'project', observations: ['Unsigned shard two.'] },
        ],
      });

      const unsigned = await mcpCall(server, 'inspect_identity_candidates', {
        canonicalKey: entityName,
        recordAudit: false,
        saveArtifact: true,
        artifactDir,
      });
      await expect(mcpCall(server, 'get_entity_context', {
        query: entityName,
        dryRunArtifactPath: unsigned.artifactPath,
        dryRunHash: unsigned.canonicalHash,
      })).rejects.toThrow(/Signed pass2_dry_run audit row not found/);

      const signed = await mcpCall(server, 'inspect_identity_candidates', {
        canonicalKey: entityName,
        recordAudit: true,
        saveArtifact: true,
        artifactDir,
      });
      await expect(mcpCall(server, 'get_entity_context', {
        query: entityName,
        tenantId: 'other-tenant',
        dryRunArtifactPath: signed.artifactPath,
        dryRunHash: signed.canonicalHash,
      })).rejects.toThrow(/tenant mismatch|Signed pass2_dry_run audit row not found/);
    } finally {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it('flags normalized raw-name collisions as split candidates', async () => {
    const ts = Date.now();
    const hyphenName = `hb-apdas-${ts}`;
    const underscoreName = `hb_apdas_${ts}`;

    await mcpCall(server, 'create_entities', {
      entities: [
        {
          name: hyphenName,
          entityType: 'project',
          observations: ['Voice phone transport SIP PSTN call routing gateway.'],
        },
        {
          name: underscoreName,
          entityType: 'project',
          observations: ['Houston blenders distributor packet invoices lubricant allocation.'],
        },
      ],
    });

    const report = await mcpCall(server, 'inspect_identity_candidates', {
      canonicalKey: hyphenName,
      recordAudit: false,
      saveArtifact: false,
    });

    const group = report.groups[0];
    const splitSignal = group.signals.find((signal: any) => signal.name === 'normalization_collapses_distinct_raw_names');
    expect(group.canonicalKey).toBe(server.getMemoryManager().canonicalEntityKey(hyphenName));
    expect(group.classification).toBe('independent_identity');
    expect(group.warnings).toContain('NORMALIZATION_COLLAPSES_DISTINCT_RAW_NAMES');
    expect(splitSignal.result).toBe(true);
    expect(group.proposedSplit).toHaveLength(2);
  });

  it('groups registrations by canonical agent identity', async () => {
    const ts = Date.now();
    const canonicalAgentId = `codex-desktop-${ts}`;
    const sessionAgentId = `agent-codex-${ts}-session`;
    const cliAgentId = `${canonicalAgentId}-cli`;

    const registered = await mcpCall(server, 'register_agent', {
      agentId: sessionAgentId,
      name: canonicalAgentId,
      capabilities: ['analysis'],
      metadata: { aliases: [cliAgentId] },
    });

    expect(registered.canonicalAgentId).toBe(canonicalAgentId);
    expect(registered.aliases).toContain(cliAgentId);

    await mcpCall(server, 'register_agent', {
      agentId: cliAgentId,
      name: 'Codex CLI',
      capabilities: ['execution'],
      metadata: { canonicalAgentId },
    });

    const status = await mcpCall(server, 'get_agent_status', {
      groupByCanonical: true,
    });

    const canonical = status.canonicalAgents.find((agent: any) => agent.agentId === canonicalAgentId);
    expect(canonical).toBeTruthy();
    expect(canonical.sessionCount).toBeGreaterThanOrEqual(2);
    expect(canonical.aliases).toContain(sessionAgentId);
    expect(canonical.aliases).toContain(cliAgentId);
    expect(canonical.capabilities).toContain('analysis');
    expect(canonical.capabilities).toContain('execution');
  });

  it('groups non-standard ephemeral agent session IDs by useful display name', async () => {
    const ts = Date.now();
    const canonicalAgentId = `codex-desktop-live-${ts}`;
    const sessionAgentId = `agent-codex-live-${ts}-session`;

    const registered = await mcpCall(server, 'register_agent', {
      agentId: sessionAgentId,
      name: canonicalAgentId,
      capabilities: ['analysis'],
    });

    expect(registered.canonicalAgentId).toBe(canonicalAgentId);

    const status = await mcpCall(server, 'get_agent_status', {
      groupByCanonical: true,
    });

    const canonical = status.canonicalAgents.find((agent: any) => agent.agentId === canonicalAgentId);
    expect(canonical).toBeTruthy();
    expect(canonical.aliases).toContain(sessionAgentId);
    expect(canonical.capabilities).toContain('analysis');
  });
});
