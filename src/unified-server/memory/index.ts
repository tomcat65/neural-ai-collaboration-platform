// Hierarchical Memory Manager Implementation
import Database from 'better-sqlite3';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import {
  MemorySystem,
  IndividualMemory,
  SharedMemory,
  MemoryQuery,
  MemoryScope,
  SearchResult,
  MemoryUpdate,
  AgentPreferences,
  LearningHistory,
  PrivateMemory,
  ProjectContext,
  Task,
  TaskStatus,
  TaskGraph,
  ConsensusHistory,
  SharedKnowledge,
  ProjectArtifacts
} from '../types/memory.js';
import { SqliteVecClient } from '../../memory/sqlite-vec-client.js';
import type { RequestContext } from '../../middleware/auth/types.js';
import {
  authorizeGraphMutation as authorizeGraphMutationImpl,
  authorizeGraphRead as authorizeGraphReadImpl,
  classifyObservationSensitivity as classifyObservationSensitivityImpl,
} from './authz.js';
import {
  createIndexes,
  migrateAddTenantColumn,
  migrateAgentRegistrations,
  ensureReadAtColumn as ensureReadAtColumnImpl,
  ensureSummaryColumn as ensureSummaryColumnImpl,
  ensureArchivedAtColumn as ensureArchivedAtColumnImpl,
} from './schema.js';
import {
  setSystemConnected,
  recordSQLiteFallback,
  setDualWriteEnabled,
  recordDualWriteResult,
  recordMemoryReadLatency,
  recordMemoryWriteLatency,
  metrics
} from '../../observability/index.js';

type GraphMemoryType = 'entity' | 'observation' | 'relation';

interface GraphLookupEntry {
  lookupKey: string;
  keyKind: string;
  weight: number;
}

export class MemoryManager {
  private db: Database.Database;
  private dbPath: string;
  private memorySystem: MemorySystem;

  /** Expose database reference for tenant resolver initialization */
  getDb(): Database.Database { return this.db; }
  public vectorClient?: SqliteVecClient;
  // Compatibility alias for existing call sites and payloads.
  public weaviateClient?: SqliteVecClient;
  private isAdvancedSystemsEnabled: boolean = false;
  private isDualWriteEnabled: boolean = false;
  readonly contentSizeThreshold: number = parseInt(process.env.CONTENT_SIZE_THRESHOLD || '51200', 10); // 50KB default

  constructor(dbPath: string = './data/unified-platform.db') {
    this.db = new Database(dbPath);
    this.dbPath = dbPath;
    this.memorySystem = {
      individual: new Map(),
      shared: {
        project: {} as ProjectContext,
        tasks: { tasks: new Map(), dependencies: new Map(), assignments: new Map() },
        decisions: [],
        knowledge: [],
        artifacts: []
      }
    };

    this.initializeDatabase();
    this.loadMemoryFromDatabase();
    this.initializeAdvancedSystems();
    this.initializeDualWrite();
  }

  private initializeDualWrite(): void {
    this.isDualWriteEnabled = process.env.DUAL_WRITE_ENABLED === 'true';
    setDualWriteEnabled(this.isDualWriteEnabled);
    if (this.isDualWriteEnabled) {
      console.log('🔀 Dual-write mode ENABLED: Writing to both shared_memory AND canonical tables');
    }
  }

  // For testing: allow overriding dual-write setting
  public setDualWriteEnabled(enabled: boolean): void {
    this.isDualWriteEnabled = enabled;
    console.log(`🔀 Dual-write mode ${enabled ? 'ENABLED' : 'DISABLED'} (config override)`);
  }

  public isDualWriteMode(): boolean {
    return this.isDualWriteEnabled;
  }

  private async initializeAdvancedSystems(): Promise<void> {
    try {
      console.log('🚀 Initializing advanced memory systems...');

      const advancedEnabled = process.env.ENABLE_ADVANCED_MEMORY !== 'false';
      if (!advancedEnabled) {
        console.log('⏭️ Advanced memory systems disabled by ENABLE_ADVANCED_MEMORY=false');
        setSystemConnected('weaviate', false);
        this.vectorClient = undefined;
        this.weaviateClient = undefined;
        this.isAdvancedSystemsEnabled = false;
        recordSQLiteFallback();
        return;
      }

      // Initialize embedded sqlite-vec client
      try {
        this.vectorClient = new SqliteVecClient(this.db);
        await this.vectorClient.initialize();
        // Legacy alias while external status payloads still reference "weaviate".
        this.weaviateClient = this.vectorClient;
        setSystemConnected('weaviate', true);
        metrics.logEvent('info', 'systems', 'sqlite-vec client initialized');
      } catch (vectorError) {
        console.warn('⚠️ sqlite-vec initialization failed:', vectorError);
        setSystemConnected('weaviate', false);
        metrics.logEvent('error', 'systems', 'sqlite-vec client initialization failed', { error: String(vectorError) });
        this.vectorClient = undefined;
        this.weaviateClient = undefined;
      }

      this.isAdvancedSystemsEnabled = !!this.vectorClient;

      if (this.isAdvancedSystemsEnabled) {
        console.log('✅ Advanced memory systems initialized (partial or full)');
      } else {
        console.log('⚠️ No advanced systems available - SQLite-only mode');
        recordSQLiteFallback();
      }

      // Startup tombstone drain: retry any failed vector deletes from previous sessions.
      void this.retryFailedWeaviateDeletes(100).then((result) => {
        if (result.attempted > 0) {
          console.log(`🪦 Startup tombstone drain: ${result.succeeded}/${result.attempted} succeeded, ${result.failed} failed`);
        }
      }).catch((err) => {
        console.warn('⚠️ Startup tombstone drain failed (non-fatal):', err);
      });

    } catch (error) {
      console.warn('⚠️ Advanced memory systems initialization failed:', error);
      console.log('🔄 Falling back to SQLite-only mode');
      metrics.logEvent('error', 'systems', 'All advanced systems failed - SQLite fallback', { error: String(error) });
      recordSQLiteFallback();
      this.isAdvancedSystemsEnabled = false;
    }
  }

  private initializeDatabase(): void {
    // Individual Memory Tables (with tenant_id for multi-tenant isolation)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS individual_memory (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        tenant_id TEXT DEFAULT 'default',
        memory_type TEXT NOT NULL,
        content TEXT NOT NULL,
        importance REAL DEFAULT 0.5,
        tags TEXT,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Shared Memory Tables (with tenant_id for multi-tenant isolation)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shared_memory (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        memory_type TEXT NOT NULL,
        content TEXT NOT NULL,
        created_by TEXT NOT NULL,
        tags TEXT,
        version INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Task Management Tables (with tenant_id for multi-tenant isolation)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        parent_task_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        requirements TEXT,
        status TEXT DEFAULT 'created',
        priority TEXT DEFAULT 'medium',
        estimated_effort REAL,
        actual_effort REAL,
        created_by TEXT NOT NULL,
        assigned_to TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
      )
    `);

    // Knowledge Base Table (with tenant_id for multi-tenant isolation)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shared_knowledge (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        tags TEXT,
        source TEXT NOT NULL,
        confidence REAL DEFAULT 0.5,
        verifications TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Consensus History Table (with tenant_id for multi-tenant isolation)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS consensus_history (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        decision TEXT NOT NULL,
        participants TEXT NOT NULL,
        votes TEXT,
        result TEXT,
        reasoning TEXT,
        created_by TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME
      )
    `);

    // Project Artifacts Table (with tenant_id for multi-tenant isolation)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_artifacts (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        path TEXT NOT NULL,
        version TEXT DEFAULT '1.0.0',
        created_by TEXT NOT NULL,
        modified_by TEXT NOT NULL,
        size INTEGER,
        checksum TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        modified_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Agent Registrations — canonical table (replaces shared_memory agent_registration blobs)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_registrations (
        agent_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        name TEXT NOT NULL,
        capabilities_json TEXT DEFAULT '[]',
        endpoint TEXT,
        metadata_json TEXT DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'active',
        registered_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (agent_id, tenant_id)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agent_registrations_tenant
        ON agent_registrations(tenant_id, status)
    `);

    // Agent Identity Changes — canonical table (replaces shared_memory agent_identity blobs)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_identity_changes (
        id TEXT PRIMARY KEY,
        previous_agent_id TEXT NOT NULL,
        updated_agent_id TEXT NOT NULL,
        updated_name TEXT,
        capabilities_json TEXT DEFAULT '[]',
        metadata_json TEXT DEFAULT '{}',
        updated_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agent_identity_prev
        ON agent_identity_changes(previous_agent_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agent_identity_updated
        ON agent_identity_changes(updated_agent_id)
    `);

    // Migrate legacy shared_memory agent_registration rows
    migrateAgentRegistrations(this.db);

    // Session Handoffs Table — stores flag_for_next_session per project
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_handoffs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        from_agent TEXT NOT NULL,
        summary TEXT NOT NULL,
        open_items_json TEXT,
        created_at DATETIME NOT NULL DEFAULT (datetime('now')),
        consumed_at DATETIME NULL,
        active INTEGER NOT NULL DEFAULT 1,
        last_confirmed DATETIME NULL
      )
    `);

    // Partial unique index: exactly one active handoff per project
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_session_handoffs_active
        ON session_handoffs(project_id) WHERE active = 1
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_session_handoffs_project
        ON session_handoffs(project_id, created_at DESC)
    `);

    // Neural Audit Log — tracks all write operations with content hashing
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS neural_audit_log (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        entity_name TEXT,
        content_hash TEXT NOT NULL,
        flagged INTEGER NOT NULL DEFAULT 0,
        flag_reason TEXT,
        created_at DATETIME NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_agent
        ON neural_audit_log(agent_id, created_at DESC)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_flagged
        ON neural_audit_log(flagged) WHERE flagged = 1
    `);

    // Weaviate tombstone table for failed vector deletes (Phase A)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS failed_weaviate_deletes (
        id TEXT PRIMARY KEY,
        weaviate_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        failed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT
      )
    `);

    // Deterministic graph lookup index. This avoids scanning every entity,
    // observation, and relation when agents ask for exact project context.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graph_lookup_keys (
        tenant_id TEXT NOT NULL DEFAULT 'default',
        lookup_key TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        memory_id TEXT NOT NULL,
        key_kind TEXT NOT NULL DEFAULT 'derived',
        weight REAL NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id, lookup_key, memory_type, memory_id)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entity_identities (
        identity_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        display_name TEXT NOT NULL,
        canonical_key TEXT NOT NULL,
        entity_type TEXT NOT NULL DEFAULT 'unknown',
        lifecycle_status TEXT NOT NULL DEFAULT 'unknown',
        status TEXT NOT NULL DEFAULT 'active',
        resolution_status TEXT NOT NULL DEFAULT 'unresolved',
        confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
        source_audit_id TEXT,
        superseded_by TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_verified_at TEXT,
        deactivated_at TEXT,
        deactivated_by TEXT,
        metadata_json TEXT
      )
    `);

    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_identities_active_canonical
        ON entity_identities(tenant_id, canonical_key, entity_type)
        WHERE status='active'
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_entity_identities_lifecycle
        ON entity_identities(tenant_id, lifecycle_status)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_entity_identities_status
        ON entity_identities(status)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_entity_identities_audit
        ON entity_identities(tenant_id, source_audit_id)
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entity_context_facets (
        facet_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        identity_id TEXT,
        source_row_id TEXT NOT NULL,
        facet_type TEXT NOT NULL,
        title TEXT,
        content_hash TEXT NOT NULL,
        content_json TEXT NOT NULL,
        confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
        status TEXT NOT NULL DEFAULT 'active',
        source_audit_id TEXT,
        provenance_json TEXT,
        created_at TEXT NOT NULL,
        deactivated_at TEXT,
        deactivated_by TEXT
      )
    `);

    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_facets_active_source_hash
        ON entity_context_facets(tenant_id, source_row_id, content_hash)
        WHERE status='active'
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_facets_identity
        ON entity_context_facets(identity_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_facets_source_row
        ON entity_context_facets(source_row_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_facets_tenant_type
        ON entity_context_facets(tenant_id, facet_type)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_facets_content_hash
        ON entity_context_facets(content_hash)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_facets_audit
        ON entity_context_facets(tenant_id, source_audit_id)
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entity_lookup_identity_links (
        link_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        lookup_key TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        memory_id TEXT NOT NULL,
        key_kind TEXT,
        identity_id TEXT NOT NULL,
        resolution_status TEXT NOT NULL DEFAULT 'resolved',
        confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
        status TEXT NOT NULL DEFAULT 'active',
        source_audit_id TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_verified_at TEXT,
        deactivated_at TEXT,
        deactivated_by TEXT
      )
    `);

    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_lookup_links_active_identity
        ON entity_lookup_identity_links(tenant_id, lookup_key, memory_type, memory_id, identity_id)
        WHERE status='active'
    `);
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_lookup_links_one_resolved
        ON entity_lookup_identity_links(tenant_id, lookup_key, memory_type, memory_id)
        WHERE status='active' AND resolution_status='resolved'
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_identity_lookup_links_lookup
        ON entity_lookup_identity_links(tenant_id, lookup_key, memory_type, status)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_identity_lookup_links_identity
        ON entity_lookup_identity_links(tenant_id, identity_id, status)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_identity_lookup_links_source_row
        ON entity_lookup_identity_links(tenant_id, memory_type, memory_id, status)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_identity_lookup_links_audit
        ON entity_lookup_identity_links(tenant_id, source_audit_id)
    `);

    // Idempotent ALTER: add mutation audit columns to neural_audit_log
    try {
      const auditCols = this.db.prepare('PRAGMA table_info(neural_audit_log)').all() as any[];
      const auditColNames = auditCols.map((c: any) => c.name);
      if (!auditColNames.includes('tenant_id')) {
        this.db.exec("ALTER TABLE neural_audit_log ADD COLUMN tenant_id TEXT DEFAULT 'default'");
      }
      if (!auditColNames.includes('actor_type')) {
        this.db.exec("ALTER TABLE neural_audit_log ADD COLUMN actor_type TEXT");
      }
      if (!auditColNames.includes('actor_id')) {
        this.db.exec("ALTER TABLE neural_audit_log ADD COLUMN actor_id TEXT");
      }
      if (!auditColNames.includes('target_count')) {
        this.db.exec("ALTER TABLE neural_audit_log ADD COLUMN target_count INTEGER");
      }
      if (!auditColNames.includes('reason')) {
        this.db.exec("ALTER TABLE neural_audit_log ADD COLUMN reason TEXT");
      }
    } catch { /* ok — table may not exist yet at this point */ }

    // Core messaging table. Created here (not only via the standalone
    // migrations/001 script, which is never invoked at startup) so a fresh
    // database has ai_messages BEFORE the Phase B / tenant-column migrations
    // below try to ALTER it. Without this, migrateUsersAndTenantColumns throws
    // "no such table: ai_messages" on a fresh DB and aborts — leaving the
    // bootstrap user and session_handoffs.tenant_id uncreated. Legacy data
    // migration from shared_memory still lives in migrations/001.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY,
        legacy_shared_memory_id TEXT UNIQUE,
        from_agent TEXT NOT NULL,
        from_source TEXT NOT NULL,
        to_agent TEXT NOT NULL,
        content TEXT NOT NULL,
        message_type TEXT DEFAULT 'info',
        priority TEXT DEFAULT 'normal',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        read_at DATETIME,
        metadata TEXT
      )
    `);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_messages_to ON ai_messages(to_agent, created_at DESC)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_messages_from ON ai_messages(from_agent, created_at DESC)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_messages_type ON ai_messages(to_agent, message_type)`);

    // Phase B: Add trusted provenance columns to shared_memory and ai_messages
    try {
      const smCols = this.db.prepare('PRAGMA table_info(shared_memory)').all() as any[];
      const smColNames = smCols.map((c: any) => c.name);
      if (!smColNames.includes('owner_actor_type')) {
        this.db.exec('ALTER TABLE shared_memory ADD COLUMN owner_actor_type TEXT');
      }
      if (!smColNames.includes('owner_actor_id')) {
        this.db.exec('ALTER TABLE shared_memory ADD COLUMN owner_actor_id TEXT');
      }
    } catch { /* ok — table may not exist yet */ }

    try {
      const amCols = this.db.prepare('PRAGMA table_info(ai_messages)').all() as any[];
      const amColNames = amCols.map((c: any) => c.name);
      if (!amColNames.includes('from_actor_type')) {
        this.db.exec('ALTER TABLE ai_messages ADD COLUMN from_actor_type TEXT');
      }
      if (!amColNames.includes('from_actor_id')) {
        this.db.exec('ALTER TABLE ai_messages ADD COLUMN from_actor_id TEXT');
      }
    } catch { /* ok — table may not exist yet (pre-migration) */ }

    // Migration: Add tenant_id column to existing tables if missing BEFORE creating tenant indexes
    migrateAddTenantColumn(this.db);

    // Migration 002: Users table + tenant_id/user_id on ai_messages & session_handoffs
    this.migrateUsersAndTenantColumns();

    // Create indexes after migrations to avoid referencing missing columns on older databases
    createIndexes(this.db);
    this.backfillGraphLookupIndexIfEmpty();

    console.log('🧠 Memory database initialized');
  }

  private migrateUsersAndTenantColumns(): void {
    try {
      // ─── Users table ───
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT 'default',
          display_name TEXT NOT NULL,
          timezone TEXT DEFAULT 'UTC',
          locale TEXT DEFAULT 'en-US',
          date_format TEXT DEFAULT 'YYYY-MM-DD',
          units TEXT DEFAULT 'metric',
          working_hours TEXT DEFAULT '{"start":"09:00","end":"17:00"}',
          last_seen_tz TEXT,
          prefs_version INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now'))
        )
      `);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)`);

      // ─── tenant_memberships (canonical membership model) ───
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS tenant_memberships (
          user_id TEXT NOT NULL,
          tenant_id TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member',
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now')),
          UNIQUE (tenant_id, user_id)
        )
      `);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user ON tenant_memberships(user_id)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_role ON tenant_memberships(tenant_id, role)`);

      // ─── Add tenant_id + user_id to ai_messages if missing ───
      const aiCols = this.db.prepare('PRAGMA table_info(ai_messages)').all() as any[];
      const aiColNames = aiCols.map((c: any) => c.name);

      if (!aiColNames.includes('tenant_id')) {
        this.db.exec(`ALTER TABLE ai_messages ADD COLUMN tenant_id TEXT DEFAULT 'default'`);
        this.db.exec(`UPDATE ai_messages SET tenant_id = 'default' WHERE tenant_id IS NULL`);
        console.log('🔧 Migration 002: Added tenant_id to ai_messages');
      }
      if (!aiColNames.includes('user_id')) {
        this.db.exec(`ALTER TABLE ai_messages ADD COLUMN user_id TEXT`);
        console.log('🔧 Migration 002: Added user_id to ai_messages');
      }
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_messages_tenant ON ai_messages(tenant_id)`);

      // ─── Add tenant_id + user_id to session_handoffs if missing ───
      const shCols = this.db.prepare('PRAGMA table_info(session_handoffs)').all() as any[];
      const shColNames = shCols.map((c: any) => c.name);

      if (!shColNames.includes('tenant_id')) {
        this.db.exec(`ALTER TABLE session_handoffs ADD COLUMN tenant_id TEXT DEFAULT 'default'`);
        this.db.exec(`UPDATE session_handoffs SET tenant_id = 'default' WHERE tenant_id IS NULL`);
        console.log('🔧 Migration 002: Added tenant_id to session_handoffs');
      }
      if (!shColNames.includes('user_id')) {
        this.db.exec(`ALTER TABLE session_handoffs ADD COLUMN user_id TEXT`);
        console.log('🔧 Migration 002: Added user_id to session_handoffs');
      }
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_session_handoffs_tenant ON session_handoffs(tenant_id)`);

      // ─── Update session_handoffs unique index to (tenant_id, project_id) ───
      // Check if the old global index exists and replace it
      const indexes = this.db.prepare(
        `SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_session_handoffs_active'`
      ).get() as any;

      if (indexes && indexes.sql && !indexes.sql.includes('tenant_id')) {
        // Old index is project_id-only — drop and recreate
        this.db.exec(`DROP INDEX idx_session_handoffs_active`);
        this.db.exec(`
          CREATE UNIQUE INDEX idx_session_handoffs_active
            ON session_handoffs(tenant_id, project_id) WHERE active = 1
        `);
        console.log('🔧 Migration 002: Updated session_handoffs unique index to (tenant_id, project_id)');
      } else if (!indexes) {
        // Index doesn't exist at all — create it
        this.db.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_session_handoffs_active
            ON session_handoffs(tenant_id, project_id) WHERE active = 1
        `);
      }

      // ─── Bootstrap user 'tommy' ───
      const existingUser = this.db.prepare(`SELECT id FROM users WHERE id = 'tommy'`).get();
      if (!existingUser) {
        this.db.prepare(`
          INSERT INTO users (id, tenant_id, display_name, timezone, locale, date_format, units, working_hours)
          VALUES ('tommy', 'default', 'Tommy', 'America/Chicago', 'en-US', 'YYYY-MM-DD', 'metric', '{"start":"09:00","end":"17:00"}')
        `).run();
        console.log('🔧 Migration 002: Bootstrap user "tommy" created');
      }

      // ─── Bootstrap membership (tommy, default, owner) ───
      const existingMembership = this.db.prepare(
        `SELECT user_id FROM tenant_memberships WHERE user_id = 'tommy' AND tenant_id = 'default'`
      ).get();
      if (!existingMembership) {
        this.db.prepare(`
          INSERT INTO tenant_memberships (user_id, tenant_id, role)
          VALUES ('tommy', 'default', 'owner')
        `).run();
        console.log('🔧 Migration 002: Bootstrap membership (tommy, default, owner) created');
      }

    } catch (error) {
      console.warn('⚠️ Migration 002 (users + tenant columns) encountered an issue:', error);
    }

    // Composite index for read path — created after migrations to guarantee columns exist
    try {
      this.ensureReadAtColumn();
      this.ensureArchivedAtColumn();
      this.ensureSummaryColumn();
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_messages_read_path ON ai_messages(tenant_id, to_agent, archived_at, read_at, created_at DESC)`);
      // Backfill NULL summaries for existing rows
      const nullCount = (this.db.prepare(
        `SELECT COUNT(*) as cnt FROM ai_messages WHERE summary IS NULL AND content IS NOT NULL`
      ).get() as any)?.cnt ?? 0;
      if (nullCount > 0) {
        const rows = this.db.prepare(
          `SELECT id, content FROM ai_messages WHERE summary IS NULL AND content IS NOT NULL`
        ).all() as any[];
        const updateStmt = this.db.prepare(`UPDATE ai_messages SET summary = ? WHERE id = ?`);
        for (const row of rows) {
          updateStmt.run(MemoryManager.generateSummary(row.content), row.id);
        }
        console.log(`📋 Backfilled summaries for ${rows.length} existing messages`);
      }
    } catch {
      // ai_messages table may not exist yet
    }
  }

  private loadMemoryFromDatabase(): void {
    // Load individual memory with tenant-scoped composite cache keys
    const individualStmt = this.db.prepare(`
      SELECT agent_id, COALESCE(tenant_id, 'default') as tenant_id, memory_type, content, importance, tags, created_at, updated_at
      FROM individual_memory
      ORDER BY agent_id, importance DESC
    `);

    const individualRows = individualStmt.all() as any[];
    // Group by composite key tenantId:agentId for tenant isolation
    const agentGroups = new Map<string, { agentId: string; rows: any[] }>();

    for (const row of individualRows) {
      const tenantId = row.tenant_id || 'default';
      const agentId = row.agent_id;
      const cacheKey = `${tenantId}:${agentId}`;
      if (!agentGroups.has(cacheKey)) {
        agentGroups.set(cacheKey, { agentId, rows: [] });
      }
      agentGroups.get(cacheKey)!.rows.push(row);
    }

    for (const [cacheKey, { agentId, rows }] of agentGroups) {
      const memory: IndividualMemory = {
        agentId,
        preferences: {} as AgentPreferences,
        learnings: [],
        privateContext: [],
        capabilities: []
      };

      for (const row of rows) {
        const content = JSON.parse((row as any).content);
        switch ((row as any).memory_type) {
          case 'preferences':
            memory.preferences = content;
            break;
          case 'learning':
            memory.learnings.push(content);
            break;
          case 'private_context':
            memory.privateContext.push(content);
            break;
          case 'capabilities':
            memory.capabilities.push(content);
            break;
        }
      }

      this.memorySystem.individual.set(cacheKey, memory);
    }

    // Load shared memory
    this.loadSharedMemoryFromDatabase();

    console.log(`🧠 Loaded memory for ${this.memorySystem.individual.size} agents`);
  }

  private loadSharedMemoryFromDatabase(): void {
    // Load tasks from dedicated tasks table
    const tasksStmt = this.db.prepare('SELECT * FROM tasks');
    const taskRows = tasksStmt.all() as any[];
    
    for (const row of taskRows) {
      const taskRow = row as any;
      const task: Task = {
        id: taskRow.id,
        title: taskRow.title,
        description: taskRow.description,
        requirements: taskRow.requirements ? JSON.parse(taskRow.requirements) : {},
        status: taskRow.status,
        priority: taskRow.priority,
        estimatedEffort: taskRow.estimated_effort,
        actualEffort: taskRow.actual_effort,
        createdBy: taskRow.created_by,
        assignedTo: taskRow.assigned_to,
        createdAt: new Date(taskRow.created_at),
        updatedAt: new Date(taskRow.updated_at),
        completedAt: taskRow.completed_at ? new Date(taskRow.completed_at) : undefined,
        parentTaskId: taskRow.parent_task_id || undefined,
        childTaskIds: []
      };

      this.memorySystem.shared.tasks.tasks.set(task.id, task);
      
      if (task.assignedTo) {
        this.memorySystem.shared.tasks.assignments.set(task.id, task.assignedTo);
      }
    }
    
    // Load tasks from shared_memory table (new API storage pattern)
    const sharedTasksStmt = this.db.prepare('SELECT * FROM shared_memory WHERE memory_type = ?');
    const sharedTaskRows = sharedTasksStmt.all('task') as any[];
    
    for (const row of sharedTaskRows) {
      try {
        const taskData = JSON.parse(row.content);
        const task: Task = {
          id: taskData.id || row.id,
          title: taskData.title || 'Untitled Task',
          description: taskData.description || '',
          requirements: taskData.requirements || {},
          status: taskData.status || TaskStatus.CREATED,
          priority: taskData.priority || 'medium',
          estimatedEffort: taskData.estimatedEffort || 1,
          actualEffort: taskData.actualEffort,
          createdBy: row.created_by,
          assignedTo: taskData.assignedTo,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
          completedAt: taskData.completedAt ? new Date(taskData.completedAt) : undefined,
          parentTaskId: taskData.parentTaskId,
          childTaskIds: taskData.childTaskIds || []
        };

        this.memorySystem.shared.tasks.tasks.set(task.id, task);
        
        if (task.assignedTo) {
          this.memorySystem.shared.tasks.assignments.set(task.id, task.assignedTo);
        }
      } catch (parseError) {
        console.warn(`Failed to parse task from shared_memory: ${row.id}`, parseError);
      }
    }

    // Load shared knowledge from dedicated shared_knowledge table
    const knowledgeStmt = this.db.prepare('SELECT * FROM shared_knowledge');
    const knowledgeRows = knowledgeStmt.all() as any[];
    
    this.memorySystem.shared.knowledge = knowledgeRows.map(row => {
      const knowledgeRow = row as any;
      return {
        id: knowledgeRow.id,
        title: knowledgeRow.title,
        content: knowledgeRow.content,
        type: knowledgeRow.type,
        tags: knowledgeRow.tags ? JSON.parse(knowledgeRow.tags) : [],
        source: knowledgeRow.source,
        confidence: knowledgeRow.confidence,
        verifications: knowledgeRow.verifications ? JSON.parse(knowledgeRow.verifications) : [],
        createdAt: new Date(knowledgeRow.created_at),
        updatedAt: new Date(knowledgeRow.updated_at)
      };
    });
    
    // Load knowledge from shared_memory table (new API storage pattern)
    const sharedKnowledgeStmt = this.db.prepare('SELECT * FROM shared_memory WHERE memory_type = ?');
    const sharedKnowledgeRows = sharedKnowledgeStmt.all('knowledge') as any[];
    
    for (const row of sharedKnowledgeRows) {
      try {
        const knowledgeData = JSON.parse(row.content);
        const knowledge = {
          id: row.id,
          title: knowledgeData.title || 'Untitled Knowledge',
          content: knowledgeData.content || '',
          type: knowledgeData.type || 'fact',
          tags: knowledgeData.tags || [],
          source: row.created_by,
          confidence: knowledgeData.confidence || 0.5,
          verifications: knowledgeData.verifications || [],
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at)
        };

        this.memorySystem.shared.knowledge.push(knowledge);
      } catch (parseError) {
        console.warn(`Failed to parse knowledge from shared_memory: ${row.id}`, parseError);
      }
    }

    // Load consensus history
    const consensusStmt = this.db.prepare('SELECT * FROM consensus_history');
    const consensusRows = consensusStmt.all() as any[];
    
    this.memorySystem.shared.decisions = consensusRows.map(row => {
      const consensusRow = row as any;
      return {
        id: consensusRow.id,
        decision: consensusRow.decision,
        participants: JSON.parse(consensusRow.participants),
        votes: new Map(Object.entries(consensusRow.votes ? JSON.parse(consensusRow.votes) : {})),
        result: consensusRow.result ? JSON.parse(consensusRow.result) : {},
        reasoning: consensusRow.reasoning,
        createdAt: new Date(consensusRow.created_at),
        resolvedAt: consensusRow.resolved_at ? new Date(consensusRow.resolved_at) : undefined
      };
    });

    // Load project artifacts
    const artifactsStmt = this.db.prepare('SELECT * FROM project_artifacts');
    const artifactRows = artifactsStmt.all() as any[];
    
    this.memorySystem.shared.artifacts = artifactRows.map(row => {
      const artifactRow = row as any;
      return {
        id: artifactRow.id,
        name: artifactRow.name,
        type: artifactRow.type,
        path: artifactRow.path,
        version: artifactRow.version,
        createdBy: artifactRow.created_by,
        modifiedBy: artifactRow.modified_by,
        size: artifactRow.size,
        checksum: artifactRow.checksum,
        metadata: artifactRow.metadata ? JSON.parse(artifactRow.metadata) : {},
        createdAt: new Date(artifactRow.created_at),
        modifiedAt: new Date(artifactRow.modified_at)
      };
    });
  }

  async store(agentId: string, memory: any, scope: 'individual' | 'shared', type: string, tenantId: string = 'default', context?: RequestContext): Promise<string> {
    const id = uuidv4();

    // 1. Store in SQLite (primary storage)
    if (scope === 'individual') {
      const stmt = this.db.prepare(`
        INSERT INTO individual_memory (id, agent_id, tenant_id, memory_type, content, importance, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        agentId,
        tenantId,
        type,
        JSON.stringify(memory),
        (memory && memory.importance) || 0.5,
        JSON.stringify((memory && memory.tags) || [])
      );

      // Update in-memory cache (tenant-scoped cache key: tenantId:agentId)
      const cacheKey = `${tenantId}:${agentId}`;
      if (!this.memorySystem.individual.has(cacheKey)) {
        this.memorySystem.individual.set(cacheKey, {
          agentId,
          preferences: {} as AgentPreferences,
          learnings: [],
          privateContext: [],
          capabilities: []
        });
      }

      const agentMemory = this.memorySystem.individual.get(cacheKey)!;
      switch (type) {
        case 'preferences':
          agentMemory.preferences = memory;
          break;
        case 'learning':
          agentMemory.learnings.push(memory);
          break;
        case 'private_context':
          agentMemory.privateContext.push(memory);
          break;
        case 'capabilities':
          agentMemory.capabilities.push(memory);
          break;
      }
      
    } else {
      const ownerActorType = context?.authType || null;
      const ownerActorId = (context?.userId || context?.apiKeyId || null);
      const stmt = this.db.prepare(`
        INSERT INTO shared_memory (id, tenant_id, memory_type, content, created_by, tags, owner_actor_type, owner_actor_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        tenantId,
        type,
        JSON.stringify(memory || {}),
        agentId,
        JSON.stringify((memory && memory.tags) || []),
        ownerActorType,
        ownerActorId
      );

      if (this.isGraphMemoryType(type)) {
        this.refreshGraphLookupIndexForMemory(id, tenantId, type, memory || {});
      }

      // DUAL-WRITE SHIM: Also write to canonical tables when enabled
      if (this.isDualWriteEnabled && memory) {
        await this.dualWriteToCanonical(id, agentId, memory, type);
      }

      // Update shared memory cache based on type
      if (memory) {
        switch (type) {
          case 'knowledge':
            this.memorySystem.shared.knowledge.push(memory);
            break;
          case 'task':
            if (memory.id) {
              this.memorySystem.shared.tasks.tasks.set(memory.id, memory);
            }
            break;
          case 'artifact':
            this.memorySystem.shared.artifacts.push(memory);
            break;
        }
      }
    }

    // 2. Store in advanced systems if available (skip ai_message — stored in dedicated table)
    if (this.isAdvancedSystemsEnabled && type !== 'ai_message') {
      await this.storeInAdvancedSystems(id, agentId, memory, scope, type, tenantId);
    }

    console.log(`💾 Stored ${scope} memory (${type}) for agent ${agentId}${this.isAdvancedSystemsEnabled ? ' [Multi-DB]' : ' [SQLite]'}`);
    return id;
  }

  private async storeInAdvancedSystems(id: string, agentId: string, memory: any, scope: string, type: string, tenantId: string = 'default'): Promise<void> {
    try {
      // Store in embedded vector index for semantic search (tenant-scoped).
      if (this.vectorClient) {
        await this.vectorClient.storeMemory({
          id,
          agentId,
          tenantId,
          type: type as any,
          content: typeof memory === 'string' ? memory : JSON.stringify(memory),
          timestamp: Date.now(),
          tags: memory?.tags || [],
          priority: Math.round((memory?.importance || 0.5) * 10),
          relationships: [],
          metadata: memory?.metadata || {}
        });
      }

    } catch (error) {
      console.warn('⚠️ Failed to store in advanced systems:', error);
    }
  }

  /**
   * DUAL-WRITE SHIM: Write to canonical tables (tasks, shared_knowledge)
   * This enables gradual migration from shared_memory to canonical tables.
   * Gate: DUAL_WRITE_ENABLED=true environment variable
   */
  private async dualWriteToCanonical(id: string, agentId: string, memory: any, type: string): Promise<void> {
    try {
      if (type === 'task') {
        // Write to canonical tasks table
        const taskId = memory.id || id;
        const existsStmt = this.db.prepare('SELECT id FROM tasks WHERE id = ?');
        const existing = existsStmt.get(taskId);

        if (existing) {
          // Update existing task
          const updateStmt = this.db.prepare(`
            UPDATE tasks SET
              title = ?,
              description = ?,
              requirements = ?,
              status = ?,
              priority = ?,
              estimated_effort = ?,
              actual_effort = ?,
              assigned_to = ?,
              updated_at = CURRENT_TIMESTAMP,
              completed_at = ?
            WHERE id = ?
          `);
          updateStmt.run(
            memory.title || 'Untitled Task',
            memory.description || '',
            JSON.stringify(memory.requirements || {}),
            memory.status || 'created',
            memory.priority || 'medium',
            memory.estimatedEffort || null,
            memory.actualEffort || null,
            memory.assignedTo || null,
            memory.completedAt || null,
            taskId
          );
          console.log(`🔀 [DUAL-WRITE] Updated task in canonical table: ${taskId}`);
        } else {
          // Insert new task
          const insertStmt = this.db.prepare(`
            INSERT INTO tasks (
              id, parent_task_id, title, description, requirements,
              status, priority, estimated_effort, actual_effort,
              created_by, assigned_to, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          insertStmt.run(
            taskId,
            memory.parentTaskId || null,
            memory.title || 'Untitled Task',
            memory.description || '',
            JSON.stringify(memory.requirements || {}),
            memory.status || 'created',
            memory.priority || 'medium',
            memory.estimatedEffort || null,
            memory.actualEffort || null,
            agentId,
            memory.assignedTo || null,
            memory.completedAt || null
          );
          console.log(`🔀 [DUAL-WRITE] Inserted task into canonical table: ${taskId}`);
        }

      } else if (type === 'knowledge') {
        // Write to canonical shared_knowledge table
        const knowledgeId = memory.id || id;
        const existsStmt = this.db.prepare('SELECT id FROM shared_knowledge WHERE id = ?');
        const existing = existsStmt.get(knowledgeId);

        if (existing) {
          // Update existing knowledge
          const updateStmt = this.db.prepare(`
            UPDATE shared_knowledge SET
              title = ?,
              content = ?,
              type = ?,
              tags = ?,
              confidence = ?,
              verifications = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `);
          updateStmt.run(
            memory.title || 'Untitled Knowledge',
            typeof memory.content === 'string' ? memory.content : JSON.stringify(memory.content || ''),
            memory.type || 'fact',
            JSON.stringify(memory.tags || []),
            memory.confidence || 0.5,
            JSON.stringify(memory.verifications || []),
            knowledgeId
          );
          console.log(`🔀 [DUAL-WRITE] Updated knowledge in canonical table: ${knowledgeId}`);
        } else {
          // Insert new knowledge
          const insertStmt = this.db.prepare(`
            INSERT INTO shared_knowledge (
              id, title, content, type, tags, source, confidence, verifications
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);
          insertStmt.run(
            knowledgeId,
            memory.title || 'Untitled Knowledge',
            typeof memory.content === 'string' ? memory.content : JSON.stringify(memory.content || ''),
            memory.type || 'fact',
            JSON.stringify(memory.tags || []),
            memory.source || agentId,
            memory.confidence || 0.5,
            JSON.stringify(memory.verifications || [])
          );
          console.log(`🔀 [DUAL-WRITE] Inserted knowledge into canonical table: ${knowledgeId}`);
        }
      }
      // Other types (artifact, etc.) are not dual-written - only task and knowledge
      recordDualWriteResult(true);
    } catch (error) {
      console.error(`⚠️ [DUAL-WRITE] Failed to write to canonical table:`, error);
      recordDualWriteResult(false);
      // Don't throw - dual-write failures shouldn't break primary storage
    }
  }

  async retrieve(query: MemoryQuery, scope: MemoryScope): Promise<any[]> {
    const results: any[] = [];

    if (scope.individual && query.agentId) {
      const agentMemory = this.memorySystem.individual.get(query.agentId);
      if (agentMemory) {
        results.push(agentMemory);
      }
    }

    if (scope.shared) {
      // Always include shared memory when scope includes shared
      const tasks = Array.from(this.memorySystem.shared.tasks.tasks.values());
      results.push(...tasks);
      results.push(...this.memorySystem.shared.knowledge);
      results.push(...this.memorySystem.shared.artifacts);
    }

    return results.slice(0, query.limit || 100);
  }

  async update(id: string, updates: any, scope: 'individual' | 'shared'): Promise<void> {
    if (scope === 'individual') {
      const stmt = this.db.prepare(`
        UPDATE individual_memory 
        SET content = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);
      stmt.run(JSON.stringify(updates), id);
    } else {
      const stmt = this.db.prepare(`
        UPDATE shared_memory 
        SET content = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);
      stmt.run(JSON.stringify(updates), id);
    }

    console.log(`🔄 Updated ${scope} memory: ${id}`);
  }

  /**
   * Update delivery status for a message in ai_messages table.
   * Merges the new status into the existing metadata JSON column.
   */
  async updateMessageStatus(messageId: string, deliveryStatus: string): Promise<void> {
    try {
      const row = this.db.prepare('SELECT metadata FROM ai_messages WHERE id = ?').get(messageId) as any;
      if (!row) {
        console.warn(`⚠️ updateMessageStatus: message ${messageId} not found in ai_messages`);
        return;
      }
      const metadata = row.metadata ? JSON.parse(row.metadata) : {};
      metadata.deliveryStatus = deliveryStatus;
      metadata.deliveredAt = new Date().toISOString();
      this.db.prepare('UPDATE ai_messages SET metadata = ? WHERE id = ?').run(JSON.stringify(metadata), messageId);
    } catch (err: any) {
      if (err.message?.includes('no such table')) {
        console.warn('⚠️ updateMessageStatus: ai_messages table not found, skipping');
        return;
      }
      throw err;
    }
  }

  async share(fromAgent: string, toAgent: string, memory: any): Promise<void> {
    // Create a shared knowledge entry
    const sharedKnowledge: SharedKnowledge = {
      id: uuidv4(),
      title: `Shared from ${fromAgent}`,
      content: JSON.stringify(memory),
      type: 'lesson-learned',
      tags: ['shared', fromAgent],
      source: fromAgent,
      confidence: 0.8,
      verifications: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.store(fromAgent, sharedKnowledge, 'shared', 'knowledge');
    console.log(`🤝 Shared memory from ${fromAgent} to ${toAgent}`);
  }

  async search(query: string, scope: MemoryScope | string, tenantId: string = 'default', options?: { limit?: number }): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const searchTerm = query.toLowerCase();
    const queryLimit = options?.limit ?? 50;

    // Handle scope parameter - convert string to MemoryScope object
    let searchScope: MemoryScope;
    if (typeof scope === 'string') {
      switch (scope) {
        case 'individual':
          searchScope = { individual: true, shared: false };
          break;
        case 'shared':
          searchScope = { shared: true, individual: false };
          break;
        case 'all':
        default:
          searchScope = { shared: true, individual: true };
          break;
      }
    } else {
      searchScope = scope;
    }

    // 2. Enhanced search with advanced systems (tenant-scoped)
    if (this.isAdvancedSystemsEnabled) {
      await this.searchInAdvancedSystems(query, searchScope, results, tenantId, queryLimit);
    }

    // NOTE: In-memory caches (memorySystem.individual) are NOT tenant-scoped.
    // All search uses SQL paths below which ARE tenant-scoped.
    if (searchScope.individual) {
      // Search individual_memory table directly (tenant-scoped)
      try {
        const individualStmt = this.db.prepare(`
          SELECT id, agent_id, memory_type, content, importance, created_at
          FROM individual_memory
          WHERE tenant_id = ? AND LOWER(content) LIKE ?
          ORDER BY importance DESC
          LIMIT ?
        `);

        const individualRows = individualStmt.all(tenantId, `%${searchTerm}%`, queryLimit) as any[];
        
        for (const row of individualRows) {
          try {
            const content = JSON.parse(row.content);
              results.push({
                id: row.id,
                type: 'individual',
                content: content,
                relevance: row.importance || 0.5,
                source: row.agent_id,
                timestamp: new Date(row.created_at),
                memoryType: row.memory_type
              });
            } catch (parseError) {
              // If JSON parse fails, include raw content
              results.push({
                id: row.id,
                type: 'individual',
                content: { raw: row.content, type: row.memory_type },
                relevance: row.importance || 0.5,
                source: row.agent_id,
                timestamp: new Date(row.created_at),
                memoryType: row.memory_type
              });
            }
          }
        } catch (dbError) {
        console.warn('🔍 Database search error for individual memory:', dbError);
      }
    }

    if (searchScope.shared) {
      // NOTE: In-memory caches (memorySystem.shared.knowledge, tasks) are NOT tenant-scoped.
      // All search uses SQL paths below which ARE tenant-scoped.

      // Search shared_memory table with smart chunking for large content (tenant-scoped)
      try {
        // Phase 1: Query with content size to identify large rows
        const sizeStmt = this.db.prepare(`
          SELECT id, memory_type, LENGTH(content) as content_size, created_by, created_at
          FROM shared_memory
          WHERE tenant_id = ? AND LOWER(content) LIKE ?
          ORDER BY created_at DESC
          LIMIT ?
        `);
        const sizeRows = sizeStmt.all(tenantId, `%${searchTerm}%`, queryLimit) as any[];

        // Phase 2: Fetch full content for small rows, truncated for large rows
        const threshold = this.contentSizeThreshold;
        const smallIds = sizeRows.filter(r => r.content_size <= threshold).map(r => r.id);
        const largeRows = sizeRows.filter(r => r.content_size > threshold);

        // Batch-fetch small rows with full content
        if (smallIds.length > 0) {
          const placeholders = smallIds.map(() => '?').join(',');
          const fullStmt = this.db.prepare(
            `SELECT id, memory_type, content, created_by, created_at FROM shared_memory WHERE id IN (${placeholders})`
          );
          const fullRows = fullStmt.all(...smallIds) as any[];
          for (const row of fullRows) {
            try {
              const content = JSON.parse(row.content);
              results.push({
                id: row.id, type: 'shared', content, relevance: 0.6,
                source: row.created_by, timestamp: new Date(row.created_at),
                memoryType: row.memory_type
              });
            } catch {
              results.push({
                id: row.id, type: 'shared',
                content: { raw: row.content, type: row.memory_type },
                relevance: 0.6, source: row.created_by, timestamp: new Date(row.created_at),
                memoryType: row.memory_type
              });
            }
          }
        }

        // For large rows, return metadata + truncated preview + chunk info
        for (const row of largeRows) {
          const chunkSize = this.contentSizeThreshold;
          const totalChunks = Math.ceil(row.content_size / chunkSize);
          // Fetch only the first chunk as preview
          const previewStmt = this.db.prepare(
            `SELECT SUBSTR(content, 1, ?) as preview, memory_type FROM shared_memory WHERE id = ?`
          );
          const preview = previewStmt.get(chunkSize, row.id) as any;
          let previewContent: any;
          try {
            // Try to parse preview — may be incomplete JSON
            previewContent = JSON.parse(preview?.preview || '{}');
          } catch {
            previewContent = { raw: preview?.preview, type: preview?.memory_type };
          }
          results.push({
            id: row.id, type: 'shared',
            content: previewContent,
            relevance: 0.6, source: row.created_by, timestamp: new Date(row.created_at),
            memoryType: row.memory_type,
            chunked: true, contentSize: row.content_size, totalChunks, chunkSize
          });
        }
      } catch (dbError) {
        console.warn('🔍 Database search error for shared memory:', dbError);
      }
      
      // Search shared_knowledge table directly (tenant-scoped)
      try {
        const knowledgeStmt = this.db.prepare(`
          SELECT id, title, content, type, source, confidence, created_at
          FROM shared_knowledge
          WHERE tenant_id = ? AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ?)
          ORDER BY confidence DESC
          LIMIT ?
        `);

        const knowledgeRows = knowledgeStmt.all(tenantId, `%${searchTerm}%`, `%${searchTerm}%`, queryLimit) as any[];
        
        for (const row of knowledgeRows) {
          results.push({
            id: row.id,
            type: 'shared',
            content: {
              id: row.id,
              title: row.title,
              content: row.content,
              type: row.type,
              source: row.source,
              confidence: row.confidence
            },
            relevance: row.confidence || 0.5,
            source: row.source,
            timestamp: new Date(row.created_at),
            memoryType: 'knowledge'
          });
        }
      } catch (dbError) {
        console.warn('🔍 Database search error for shared knowledge:', dbError);
      }
      
      // Search tasks table directly (tenant-scoped)
      try {
        const tasksStmt = this.db.prepare(`
          SELECT id, title, description, status, created_by, created_at
          FROM tasks
          WHERE tenant_id = ? AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)
          ORDER BY created_at DESC
          LIMIT ?
        `);

        const taskRows = tasksStmt.all(tenantId, `%${searchTerm}%`, `%${searchTerm}%`, queryLimit) as any[];
        
        for (const row of taskRows) {
          results.push({
            id: row.id,
            type: 'shared',
            content: {
              id: row.id,
              title: row.title,
              description: row.description,
              status: row.status,
              createdBy: row.created_by
            },
            relevance: 0.7,
            source: row.created_by,
            timestamp: new Date(row.created_at),
            memoryType: 'task'
          });
        }
      } catch (dbError) {
        console.warn('🔍 Database search error for tasks:', dbError);
      }
    }

    // Remove duplicates based on ID and sort by relevance
    const uniqueResults = new Map<string, SearchResult>();
    for (const result of results) {
      if (!uniqueResults.has(result.id) || uniqueResults.get(result.id)!.relevance < result.relevance) {
        uniqueResults.set(result.id, result);
      }
    }

    const finalResults = Array.from(uniqueResults.values()).sort((a, b) => b.relevance - a.relevance);

    return finalResults;
  }

  private async searchInAdvancedSystems(query: string, scope: MemoryScope, results: SearchResult[], tenantId: string = 'default', limit: number = 50): Promise<void> {
    try {
      // 1. Semantic search with sqlite-vec (post-filtered by tenant)
      if (this.vectorClient && scope.shared) {
        console.log(`🔍 Performing semantic search with sqlite-vec: "${query}" (tenant: ${tenantId})`);
        const vectorResults = await this.vectorClient.searchMemories({
          query,
          tenantId,
          limit,
        });

        for (const wResult of vectorResults) {
          // Propagate the vec0 distance so the caller can rank by semantic
          // similarity. Without this the distance computed in rowToMemoryItem
          // is dropped here, every semantic hit collapses to a flat score, and
          // results fall back to arbitrary order (irrelevant rows float up).
          const distance = (wResult.metadata && typeof (wResult.metadata as any).distance === 'number')
            ? (wResult.metadata as any).distance
            : undefined;
          // vec0 default metric is L2; map to a bounded 0..1 similarity.
          const semanticSimilarity = distance !== undefined ? 1 / (1 + distance) : undefined;
          results.push({
            id: wResult.id,
            type: 'shared',
            content: {
              original: wResult.content,
              tags: wResult.tags,
              agentId: wResult.agentId,
              source: 'sqlite-vec'
            },
            relevance: semanticSimilarity ?? (wResult.priority || 5) / 10,
            source: `sqlite-vec:${wResult.agentId}`,
            timestamp: new Date(wResult.timestamp),
            memoryType: wResult.type,
            ...(distance !== undefined ? { distance, semanticSimilarity } : {}),
          } as SearchResult);
        }
      }


    } catch (error) {
      console.warn('⚠️ Advanced search systems error:', error);
    }
  }

  getMemorySystem(): MemorySystem {
    return this.memorySystem;
  }

  getAgentMemory(agentId: string, tenantId: string = 'default'): IndividualMemory | undefined {
    // Cache key: tenantId:agentId for tenant isolation (no bare agentId fallback)
    const cacheKey = `${tenantId}:${agentId}`;
    return this.memorySystem.individual.get(cacheKey);
  }

  private comparableAgentId(agentId: string): string {
    return String(agentId || '').trim().toLowerCase();
  }

  private normalizeAgentId(agentId: string): string {
    let normalized = this.comparableAgentId(agentId);
    for (const suffix of ['-ide-agent', '-cli']) {
      if (normalized.endsWith(suffix) && normalized.length > suffix.length) {
        normalized = normalized.slice(0, -suffix.length);
        break;
      }
    }
    return normalized;
  }

  private getHeuristicAgentAliases(agentId: string): string[] {
    const comparable = this.comparableAgentId(agentId);
    if (!comparable) return [];

    const normalized = this.normalizeAgentId(comparable);
    return Array.from(new Set([
      comparable,
      normalized,
      `${normalized}-cli`,
      `${normalized}-ide-agent`,
    ].filter(Boolean)));
  }

  public inferCanonicalAgentId(agentId: string, name?: string, metadata: any = {}): string {
    const explicit = metadata?.canonicalAgentId || metadata?.canonical_agent_id || metadata?.canonical;
    if (typeof explicit === 'string' && explicit.trim()) {
      return this.comparableAgentId(explicit);
    }

    const comparable = this.comparableAgentId(agentId);
    const display = this.comparableAgentId(name || '');
    const looksEphemeral = /^agent-(?:.+-)?\d+-[a-z0-9]+(?:-.+)?$/.test(comparable);
    const displayIsUseful = !!display && !display.startsWith('stdio-bridge-');

    if (looksEphemeral && displayIsUseful) {
      return display;
    }

    return this.normalizeAgentId(comparable);
  }

  private parseAgentMetadata(metadataJson?: string | null): any {
    if (!metadataJson) return {};
    try {
      const parsed = JSON.parse(metadataJson);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private getRegisteredAgentRows(): Array<{ agentId: string; name: string; metadataJson: string; updatedAt: string }> {
    try {
      return this.db.prepare(
        `SELECT agent_id as agentId, name, metadata_json as metadataJson, updated_at as updatedAt
         FROM agent_registrations
         WHERE status = 'active'
         ORDER BY updated_at DESC`
      ).all() as Array<{ agentId: string; name: string; metadataJson: string; updatedAt: string }>;
    } catch {
      return [];
    }
  }

  private getAgentIdentityRows(): Array<{ previousAgentId: string; updatedAgentId: string; updatedAt: string }> {
    try {
      return this.db.prepare(
        `SELECT
           previous_agent_id as previousAgentId,
           updated_agent_id as updatedAgentId,
           created_at as updatedAt
         FROM agent_identity_changes
         ORDER BY created_at DESC`
      ).all() as Array<{ previousAgentId: string; updatedAgentId: string; updatedAt: string }>;
    } catch {
      return [];
    }
  }

  private resolveAgentFamily(agentId: string): { aliases: string[]; canonical: string } {
    const requested = this.comparableAgentId(agentId);
    if (!requested) {
      return { aliases: [], canonical: '' };
    }

    const registrations = this.getRegisteredAgentRows();
    const identities = this.getAgentIdentityRows();
    const normalized = this.normalizeAgentId(requested);
    const aliases = new Set<string>(this.getHeuristicAgentAliases(requested));
    const queue = Array.from(aliases);

    const addAlias = (candidate?: string | null) => {
      const comparable = this.comparableAgentId(candidate || '');
      if (!comparable || aliases.has(comparable)) return;
      aliases.add(comparable);
      queue.push(comparable);
    };

    for (const row of registrations) {
      const metadata = this.parseAgentMetadata(row.metadataJson);
      const canonical = this.inferCanonicalAgentId(row.agentId, row.name, metadata);
      const rowAliases = [
        row.agentId,
        row.name,
        canonical,
        ...(Array.isArray(metadata.aliases) ? metadata.aliases : []),
      ];

      if (
        this.normalizeAgentId(row.agentId) === normalized ||
        this.normalizeAgentId(row.name) === normalized ||
        canonical === normalized ||
        rowAliases.some((alias) => this.getHeuristicAgentAliases(alias).includes(requested))
      ) {
        for (const alias of rowAliases) addAlias(alias);
        addAlias(row.agentId);
      }
    }

    for (const row of identities) {
      if (
        this.normalizeAgentId(row.previousAgentId) === normalized ||
        this.normalizeAgentId(row.updatedAgentId) === normalized
      ) {
        addAlias(row.previousAgentId);
        addAlias(row.updatedAgentId);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const row of identities) {
        if (this.comparableAgentId(row.previousAgentId) === current) {
          addAlias(row.updatedAgentId);
        }
        if (this.comparableAgentId(row.updatedAgentId) === current) {
          addAlias(row.previousAgentId);
        }
      }
    }

    let canonical = requested;
    const aliasList = Array.from(aliases);
    const registeredMatches = registrations
      .filter((row) => {
        const metadata = this.parseAgentMetadata(row.metadataJson);
        const canonical = this.inferCanonicalAgentId(row.agentId, row.name, metadata);
        return (
          aliasList.includes(this.comparableAgentId(row.agentId)) ||
          aliasList.includes(this.comparableAgentId(row.name)) ||
          aliasList.includes(canonical)
        );
      })
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

    if (registeredMatches.length > 0) {
      const row = registeredMatches[0];
      canonical = this.inferCanonicalAgentId(row.agentId, row.name, this.parseAgentMetadata(row.metadataJson));
    } else {
      const identityMatches = identities
        .filter((row) =>
          aliasList.includes(this.comparableAgentId(row.previousAgentId)) ||
          aliasList.includes(this.comparableAgentId(row.updatedAgentId))
        )
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

      if (identityMatches.length > 0) {
        canonical = this.comparableAgentId(identityMatches[0].updatedAgentId) || requested;
      }
    }

    if (!aliases.has(canonical)) {
      aliases.add(canonical);
    }

    return { aliases: Array.from(aliases), canonical };
  }

  public getAgentAliases(agentId: string): string[] {
    return this.resolveAgentFamily(agentId).aliases;
  }

  public resolvePreferredAgentId(agentId: string): string {
    return this.resolveAgentFamily(agentId).canonical || this.comparableAgentId(agentId);
  }

  getSharedMemory(): SharedMemory {
    return this.memorySystem.shared;
  }

  async recordLearning(agentId: string, context: string, lesson: string, confidence: number = 0.8, tenantId: string = 'default'): Promise<void> {
    const learning: LearningHistory = {
      id: uuidv4(),
      timestamp: new Date(),
      context,
      lesson,
      confidence,
      reinforcements: 1
    };

    await this.store(agentId, learning, 'individual', 'learning', tenantId);
  }

  async updateAgentPreferences(agentId: string, preferences: Partial<AgentPreferences>, tenantId: string = 'default'): Promise<void> {
    const cacheKey = `${tenantId}:${agentId}`;
    const currentMemory = this.memorySystem.individual.get(cacheKey);
    if (currentMemory) {
      currentMemory.preferences = { ...currentMemory.preferences, ...preferences };
      await this.store(agentId, currentMemory.preferences, 'individual', 'preferences', tenantId);
    }
  }

  async getSystemStatus(): Promise<any> {
    const status = {
      sqlite: { connected: true, type: 'SQLite' },
      vector: { connected: false, type: 'sqlite-vec', backend: 'sqlite-vec' },
      // Backward-compat alias for older dashboards/clients.
      weaviate: { connected: false, type: 'Vector Database (legacy alias)', backend: 'sqlite-vec' },
      advancedSystemsEnabled: this.isAdvancedSystemsEnabled
    };

    if (this.isAdvancedSystemsEnabled) {
      if (this.vectorClient) {
        const connected = await this.vectorClient.healthCheck();
        status.vector.connected = connected;
        status.weaviate.connected = connected;
      }
    }

    return status;
  }

  /**
   * Retrieve a specific chunk of a large content row from shared_memory.
   * Used by callers when search results include chunked: true.
   */
  getContentChunk(id: string, chunkIndex: number): { chunk: string; chunkIndex: number; totalChunks: number; contentSize: number } {
    const sizeRow = this.db.prepare(
      'SELECT LENGTH(content) as content_size FROM shared_memory WHERE id = ?'
    ).get(id) as any;
    if (!sizeRow) throw new Error(`Entity ${id} not found`);

    const contentSize = sizeRow.content_size;
    const chunkSize = this.contentSizeThreshold;
    const totalChunks = Math.ceil(contentSize / chunkSize);

    if (chunkIndex < 0 || chunkIndex >= totalChunks) {
      throw new Error(`Chunk index ${chunkIndex} out of range [0, ${totalChunks - 1}]`);
    }

    const offset = chunkIndex * chunkSize;
    const row = this.db.prepare(
      'SELECT SUBSTR(content, ?, ?) as chunk FROM shared_memory WHERE id = ?'
    ).get(offset + 1, chunkSize, id) as any; // SUBSTR is 1-indexed

    return { chunk: row.chunk, chunkIndex, totalChunks, contentSize };
  }

  // ─── Security: Content Sanitization + Audit ───

  private static readonly INJECTION_PATTERNS: RegExp[] = [
    /ignore previous/i,
    /system override/i,
    /\bSYSTEM:/,
    /\[INST\]/,
    /<\|.*?\|>/,
    /\}\s*\{.*tool/i,
  ];

  static sanitizeContent(content: string): { safe: boolean; reason?: string } {
    for (const pattern of MemoryManager.INJECTION_PATTERNS) {
      if (pattern.test(content)) {
        return { safe: false, reason: `Flagged pattern: ${pattern.toString()}` };
      }
    }
    if (content.length > 10000) {
      return { safe: false, reason: 'Content exceeds 10000 character limit' };
    }
    return { safe: true };
  }

  static contentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Write an entry to the neural_audit_log table.
   * Fire-and-forget — failures are logged but never throw.
   */
  auditLog(operation: string, agentId: string, content: string, entityName?: string, flagged: boolean = false, flagReason?: string): void {
    try {
      const id = uuidv4();
      const hash = MemoryManager.contentHash(content);
      this.db.prepare(
        `INSERT INTO neural_audit_log (id, operation, agent_id, entity_name, content_hash, flagged, flag_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, operation, agentId, entityName || null, hash, flagged ? 1 : 0, flagReason || null);
    } catch (e: any) {
      console.error(`⚠️ Audit log write failed (non-fatal): ${e.message}`);
    }
  }

  /**
   * Query the neural_audit_log table (for admin/testing).
   */
  queryAuditLog(agentId?: string, operation?: string, limit: number = 20): any[] {
    let query = 'SELECT * FROM neural_audit_log WHERE 1=1';
    const params: any[] = [];
    if (agentId) { query += ' AND agent_id = ?'; params.push(agentId); }
    if (operation) { query += ' AND operation = ?'; params.push(operation); }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    return this.db.prepare(query).all(...params);
  }

  /**
   * Escape a string for safe use inside XML/HTML attribute values.
   */
  private static escapeAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Wrap content string in <neural_memory> structural delimiters.
   * trust levels: 'verified' (server-generated), 'agent' (agent-submitted), 'identity' (agent identity data)
   */
  static wrapContent(content: string, source: string, entity: string, trust: 'verified' | 'agent' | 'identity' = 'verified'): string {
    return `<neural_memory source="${MemoryManager.escapeAttr(source)}" entity="${MemoryManager.escapeAttr(entity)}" trust="${trust}">\n${content}\n</neural_memory>`;
  }

  // ─── Session Protocol methods ───

  /**
   * Build a tiered context bundle for an agent.
   * depth: 'hot' | 'warm' | 'cold'
   *   HOT:  identity + unread messages + handoff flag + guardrails
   *   WARM: HOT + project observations (30d) + recent decisions
   *   COLD: everything
   */
  getAgentContext(
    agentId: string,
    projectId?: string,
    depth: 'hot' | 'warm' | 'cold' = projectId ? 'warm' : 'hot',
    tenantId: string = 'default',
    maxTokens: number = 4000,
    userId?: string | null
  ): any {
    const bundle: any = {
      identity: { learnings: [] },
      user: null,
      project: null,
      handoff: null,
      unreadMessages: { count: 0, hint: 'Use get_ai_messages(agentId) to retrieve' },
      guardrails: [],
      meta: { depth, tokenEstimate: 0, truncated: false, sectionsDropped: [] }
    };

    // --- HOT tier (always included) ---

    // 1. Agent identity: learnings + preferences (tenant-scoped cache key, no bare agentId fallback)
    const agentMem = this.memorySystem.individual.get(`${tenantId}:${agentId}`);
    if (agentMem) {
      bundle.identity.learnings = agentMem.learnings.slice(-20).map((l: any) => ({
        _wrapped: MemoryManager.wrapContent(JSON.stringify(l), 'learning', agentId, 'identity')
      }));
      bundle.identity._preferencesWrapped = MemoryManager.wrapContent(
        JSON.stringify(agentMem.preferences || {}), 'preferences', agentId, 'identity'
      );
    }

    // 1b. Task 1100: HOT tier user block (included when userId provided)
    if (userId) {
      const userProfile = this.getUserProfile(userId, tenantId);
      if (userProfile) {
        bundle.user = {
          _wrapped: MemoryManager.wrapContent(JSON.stringify({
            id: userProfile.id,
            displayName: userProfile.displayName,
            timezone: userProfile.timezone,
            locale: userProfile.locale,
            dateFormat: userProfile.dateFormat,
            units: userProfile.units,
            workingHours: userProfile.workingHours,
          }), 'user_profile', userId, 'identity'),
        };
      }
    }

    // 2. Unread messages — count + inlined compact previews (tenant-scoped).
    // Previously this returned ONLY a count, so an agent that loads context at
    // the start of a turn saw "you have N unread" but not the content, and had
    // to make a second get_ai_messages call. Agents that don't (or can't poll,
    // e.g. Cowork / web chats) never saw their messages. Inlining compact
    // previews here makes the single context-load deliver the actual messages,
    // so cross-agent comms work without any polling. Excludes archived; newest
    // first; uses the idx_ai_messages_read_path index; previews use the compact
    // `summary` column. Capped small (budget trimming can drop these first).
    try {
      this.ensureReadAtColumn();
      this.ensureArchivedAtColumn();
      this.ensureSummaryColumn();
      const previewLimit = 5;
      const countRow = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM ai_messages WHERE to_agent = ? AND tenant_id = ? AND read_at IS NULL AND archived_at IS NULL'
      ).get(agentId, tenantId) as any;
      const unreadCount = countRow?.cnt ?? 0;
      const previewRows = unreadCount > 0 ? this.db.prepare(
        `SELECT id, from_agent, message_type, priority, created_at, summary, content
         FROM ai_messages
         WHERE to_agent = ? AND tenant_id = ? AND read_at IS NULL AND archived_at IS NULL
         ORDER BY created_at DESC LIMIT ?`
      ).all(agentId, tenantId, previewLimit) as any[] : [];
      const messages = previewRows.map((m: any) => {
        const raw = (typeof m.summary === 'string' && m.summary.length > 0) ? m.summary : (m.content || '');
        const preview = raw.length > 200 ? raw.slice(0, 200) + '…' : raw;
        return {
          id: m.id,
          from: m.from_agent,
          type: m.message_type,
          priority: m.priority,
          timestamp: m.created_at,
          preview,
        };
      });
      bundle.unreadMessages = {
        count: unreadCount,
        messages,
        truncated: unreadCount > messages.length,
        hint: unreadCount > messages.length
          ? `Showing ${messages.length} of ${unreadCount} unread (compact previews). Use get_ai_messages(agentId) for the rest, get_message_detail(messageId) for full content.`
          : 'Compact previews shown. Use get_ai_messages(agentId) to mark read, get_message_detail(messageId) for full content.',
      };
    } catch { /* ai_messages table may not exist */ }

    // 3. Guardrails — entities of type 'guardrail' (tenant-scoped)
    try {
      const guardrailRows = this.db.prepare(
        `SELECT id, content, created_at FROM shared_memory
         WHERE tenant_id = ? AND memory_type = 'entity' AND LOWER(content) LIKE '%"type":"guardrail"%'
         ORDER BY created_at DESC LIMIT 10`
      ).all(tenantId) as any[];
      bundle.guardrails = guardrailRows.map((r: any) => {
        try {
          const parsed = JSON.parse(r.content);
          return { _wrapped: MemoryManager.wrapContent(JSON.stringify(parsed), 'guardrail', parsed.name || 'guardrail') };
        } catch { return { _wrapped: MemoryManager.wrapContent(r.content, 'guardrail', 'unknown') }; }
      });
    } catch { /* ok */ }

    // 4. HOT-tagged observations (tenant-scoped)
    try {
      const hotRows = this.db.prepare(
        `SELECT id, content, created_at FROM shared_memory
         WHERE tenant_id = ? AND memory_type = 'observation' AND content LIKE '%[HOT]%'
         ORDER BY created_at DESC LIMIT 20`
      ).all(tenantId) as any[];
      if (hotRows.length > 0) {
        if (!bundle.project) bundle.project = {};
        bundle.project.hotObservations = hotRows.map((r: any) => {
          try {
            const parsed = JSON.parse(r.content);
            return { _wrapped: MemoryManager.wrapContent(JSON.stringify(parsed), 'observation', parsed.entityName || 'hot', 'agent') };
          } catch { return { _wrapped: MemoryManager.wrapContent(r.content, 'observation', 'hot', 'agent') }; }
        });
      }
    } catch { /* ok */ }

    // 5. Handoff flag (filter consumed handoffs for context isolation, tenant-scoped)
    if (projectId) {
      const rawHandoff = this.getActiveHandoff(projectId, tenantId);
      const handoff = rawHandoff && !rawHandoff.consumedAt ? rawHandoff : null;
      if (handoff) {
        bundle.handoff = {
          _wrapped: MemoryManager.wrapContent(handoff.summary, 'handoff', projectId, 'agent'),
          _openItemsWrapped: (handoff.openItems || []).map((item: string) =>
            MemoryManager.wrapContent(item, 'handoff_item', projectId, 'agent')
          ),
          fromAgent: handoff.fromAgent,
          projectId: handoff.projectId,
          createdAt: handoff.createdAt,
        };
      }
    }

    // --- WARM tier (project context, 30-day window) ---
    if ((depth === 'warm' || depth === 'cold') && projectId) {
      if (!bundle.project) bundle.project = {};

      // Project entity (tenant-scoped)
      try {
        const projRow = this.db.prepare(
          `SELECT id, content, created_at FROM shared_memory
           WHERE tenant_id = ? AND memory_type = 'entity' AND LOWER(content) LIKE ?
           ORDER BY created_at DESC LIMIT 1`
        ).get(tenantId, `%"name":"${projectId.toLowerCase()}"%`) as any;
        if (projRow) {
          try {
            const projData = JSON.parse(projRow.content);
            const summaryText = projData.observations?.join('; ') || projData.name || projectId;
            bundle.project._summaryWrapped = MemoryManager.wrapContent(summaryText, 'project_summary', projectId!, 'agent');
            bundle.project._entityWrapped = MemoryManager.wrapContent(JSON.stringify(projData), 'entity', projectId!, 'agent');
          } catch { /* ok */ }
        }
      } catch { /* ok */ }

      // Recent observations for project (30 days, tenant-scoped)
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
        const obsRows = this.db.prepare(
          `SELECT id, content, created_at FROM shared_memory
           WHERE tenant_id = ? AND memory_type = 'observation' AND LOWER(content) LIKE ?
           AND created_at >= ? ORDER BY created_at DESC LIMIT 3`
        ).all(tenantId, `%${projectId.toLowerCase()}%`, thirtyDaysAgo) as any[];
        bundle.project.recentObservations = obsRows.map((r: any) => {
          try {
            const parsed = JSON.parse(r.content);
            return { _wrapped: MemoryManager.wrapContent(JSON.stringify(parsed), 'observation', parsed.entityName || projectId!, 'agent') };
          } catch { return { _wrapped: MemoryManager.wrapContent(r.content, 'observation', projectId!, 'agent') }; }
        });
      } catch { /* ok */ }

      // Recent decisions (last 5, tenant-scoped)
      try {
        const decRows = this.db.prepare(
          `SELECT id, decision, reasoning, created_at FROM consensus_history
           WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 5`
        ).all(tenantId) as any[];
        bundle.project.recentDecisions = decRows.map((d: any) => ({
          _wrapped: MemoryManager.wrapContent(JSON.stringify(d), 'decision', projectId!, 'agent')
        }));
      } catch { /* ok */ }
    }

    // --- COLD tier (everything, tenant-scoped) ---
    if (depth === 'cold' && projectId) {
      try {
        const allObs = this.db.prepare(
          `SELECT id, content, created_at FROM shared_memory
           WHERE tenant_id = ? AND memory_type = 'observation' AND LOWER(content) LIKE ?
           ORDER BY created_at DESC LIMIT 100`
        ).all(tenantId, `%${projectId.toLowerCase()}%`) as any[];
        bundle.project.allObservations = allObs.map((r: any) => {
          try {
            const parsed = JSON.parse(r.content);
            return { _wrapped: MemoryManager.wrapContent(JSON.stringify(parsed), 'observation', parsed.entityName || projectId!, 'agent') };
          } catch { return { _wrapped: MemoryManager.wrapContent(r.content, 'observation', projectId!, 'agent') }; }
        });
      } catch { /* ok */ }

      try {
        const allEntities = this.db.prepare(
          `SELECT id, content, created_at FROM shared_memory
           WHERE tenant_id = ? AND memory_type = 'entity' AND LOWER(content) LIKE ?
           ORDER BY created_at DESC LIMIT 50`
        ).all(tenantId, `%${projectId.toLowerCase()}%`) as any[];
        bundle.project.allEntities = allEntities.map((r: any) => {
          try {
            const parsed = JSON.parse(r.content);
            return { _wrapped: MemoryManager.wrapContent(JSON.stringify(parsed), 'entity', parsed.name || projectId!, 'agent') };
          } catch { return { _wrapped: MemoryManager.wrapContent(r.content, 'entity', projectId!, 'agent') }; }
        });
      } catch { /* ok */ }
    }

    // --- Task 1400: Priority-based token budget enforcement ---
    // Priority order (lowest priority dropped first):
    //   summary < messages < observations < guardrails < handoff < identity
    const estimateTokens = () => Math.ceil(JSON.stringify(bundle).length / 4);
    bundle.meta.tokenEstimate = estimateTokens();

    if (bundle.meta.tokenEstimate > maxTokens) {
      bundle.meta.truncated = true;
      const sectionsDropped: string[] = [];

      // 1. Drop COLD observations + entities first (lowest priority bulk)
      if (bundle.project?.allObservations && estimateTokens() > maxTokens) {
        bundle.project.allObservations = bundle.project.allObservations.slice(0, 3);
        if (estimateTokens() > maxTokens) {
          delete bundle.project.allObservations;
          sectionsDropped.push('allObservations');
        }
      }
      if (bundle.project?.allEntities && estimateTokens() > maxTokens) {
        delete bundle.project.allEntities;
        sectionsDropped.push('allEntities');
      }

      // 2. Drop project summary (low priority)
      if (bundle.project?._summaryWrapped && estimateTokens() > maxTokens) {
        delete bundle.project._summaryWrapped;
        sectionsDropped.push('projectSummary');
      }

      // 2b. Drop inlined message previews (keep count + hint). Per the priority
      // order, message bodies are low — trim them before observations/guardrails.
      if (bundle.unreadMessages?.messages?.length > 0 && estimateTokens() > maxTokens) {
        const total = bundle.unreadMessages.count;
        delete bundle.unreadMessages.messages;
        bundle.unreadMessages.truncated = total > 0;
        bundle.unreadMessages.hint = 'Previews omitted for token budget. Use get_ai_messages(agentId) to retrieve.';
        sectionsDropped.push('messagePreviews');
      }

      // 3. Drop recent decisions
      if (bundle.project?.recentDecisions && estimateTokens() > maxTokens) {
        delete bundle.project.recentDecisions;
        sectionsDropped.push('recentDecisions');
      }

      // 4. Drop recent observations (warm tier)
      if (bundle.project?.recentObservations && estimateTokens() > maxTokens) {
        bundle.project.recentObservations = bundle.project.recentObservations.slice(0, 1);
        if (estimateTokens() > maxTokens) {
          delete bundle.project.recentObservations;
          sectionsDropped.push('recentObservations');
        }
      }

      // 5. Drop HOT observations
      if (bundle.project?.hotObservations && estimateTokens() > maxTokens) {
        delete bundle.project.hotObservations;
        sectionsDropped.push('hotObservations');
      }

      // 6. Drop guardrails (higher priority than observations, but lower than handoff/identity)
      if (bundle.guardrails?.length > 0 && estimateTokens() > maxTokens) {
        bundle.guardrails = bundle.guardrails.slice(0, 2);
        if (estimateTokens() > maxTokens) {
          bundle.guardrails = [];
          sectionsDropped.push('guardrails');
        }
      }

      // 7. Trim identity learnings (never drop identity entirely)
      if (bundle.identity?.learnings?.length > 5 && estimateTokens() > maxTokens) {
        bundle.identity.learnings = bundle.identity.learnings.slice(-5);
        sectionsDropped.push('learnings(trimmed)');
      }

      bundle.meta.sectionsDropped = sectionsDropped;
      bundle.meta.tokenEstimate = estimateTokens();
    }

    return bundle;
  }

  /**
   * Get the active handoff flag for a project.
   */
  getActiveHandoff(projectId: string, tenantId: string = 'default'): any | null {
    try {
      const row = this.db.prepare(
        'SELECT * FROM session_handoffs WHERE project_id = ? AND tenant_id = ? AND active = 1'
      ).get(projectId, tenantId) as any;
      if (!row) return null;
      return {
        id: row.id,
        projectId: row.project_id,
        fromAgent: row.from_agent,
        summary: row.summary,
        openItems: row.open_items_json ? JSON.parse(row.open_items_json) : [],
        createdAt: row.created_at,
        consumedAt: row.consumed_at,
      };
    } catch {
      return null;
    }
  }

  /**
   * Mark a handoff as consumed (idempotency guard for begin_session retries).
   */
  consumeHandoff(handoffId: string): void {
    try {
      this.db.prepare(
        "UPDATE session_handoffs SET consumed_at = datetime('now') WHERE id = ? AND consumed_at IS NULL"
      ).run(handoffId);
    } catch (e: any) {
      console.error(`⚠️ consumeHandoff failed (non-fatal): ${e.message}`);
    }
  }

  /**
   * Write a new handoff flag, deactivating any previous one for the same project.
   * Runs in a single transaction for atomicity.
   */
  writeHandoff(projectId: string, fromAgent: string, summary: string, openItems?: string[], tenantId: string = 'default', userId?: string | null): string {
    const id = uuidv4();
    const txn = this.db.transaction(() => {
      // Deactivate prior handoff (tenant-scoped)
      this.db.prepare(
        'UPDATE session_handoffs SET active = 0 WHERE project_id = ? AND tenant_id = ? AND active = 1'
      ).run(projectId, tenantId);
      // Insert new active handoff with tenant_id and user_id (audit trail)
      this.db.prepare(
        `INSERT INTO session_handoffs (id, project_id, from_agent, summary, open_items_json, tenant_id, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, projectId, fromAgent, summary, openItems ? JSON.stringify(openItems) : null, tenantId, userId || null);
    });
    txn();
    return id;
  }

  /**
   * Ensure a project entity skeleton exists in shared_memory.
   * Returns the existing entity ID or creates a new one.
   */
  ensureProjectEntity(agentId: string, projectId: string, tenantId: string = 'default'): string {
    // Check if a project entity already exists (tenant-scoped)
    const existing = this.db.prepare(
      `SELECT id FROM shared_memory
       WHERE tenant_id = ? AND memory_type = 'entity' AND LOWER(content) LIKE ?
       LIMIT 1`
    ).get(tenantId, `%"name":"${projectId.toLowerCase()}"%`) as any;

    if (existing) return existing.id;

    // Create skeleton entity
    const entityId = uuidv4();
    const skeleton = {
      name: projectId,
      type: 'project',
      observations: [`Project ${projectId} created`],
      createdBy: agentId,
      timestamp: new Date().toISOString(),
    };

    this.db.prepare(
      `INSERT INTO shared_memory (id, tenant_id, memory_type, content, created_by, tags)
       VALUES (?, ?, 'entity', ?, ?, '["project"]')`
    ).run(entityId, tenantId, JSON.stringify(skeleton), agentId);

    return entityId;
  }

  async close(): Promise<void> {
    this.db.close();
    // Embedded vector client does not require explicit closing.
    console.log('🧠 Enhanced memory manager closed');
  }

  // ─── ai_messages table methods (P1 migration) ───

  /**
   * Store a message in the dedicated ai_messages table.
   * Falls back to shared_memory if ai_messages table doesn't exist yet.
   */
  async storeMessage(
    from: string,
    to: string,
    content: string,
    messageType: string = 'info',
    priority: string = 'normal',
    metadata?: Record<string, any>,
    tenantId: string = 'default',
    context?: RequestContext
  ): Promise<string> {
    const id = uuidv4();
    const fromActorType = context?.authType || null;
    const fromActorId = context?.userId || context?.apiKeyId || null;
    const summary = MemoryManager.generateSummary(content);

    // Write-side auto-split: offload large messages to entity observation
    let storedContent = content;
    if (content.length > 3000) {
      const entityName = `msg-detail-${id}`;
      try {
        await this.store(from, {
          name: entityName,
          type: 'message_detail',
          observations: [content],
          createdBy: from,
          timestamp: new Date().toISOString(),
        }, 'shared', 'entity', tenantId, context);
        const detailAgentId = to && to !== '*' ? to : '<your-agent-id>';
        storedContent = `Full content stored as entity "${entityName}". To read the full message, call: get_message_detail({ messageId: "${id}", agentId: "${detailAgentId}" }). You can also inspect the entity via search_entities("${entityName}").`;
        console.log(`📦 Auto-split oversized message (${content.length} chars) → entity ${entityName}`);
      } catch {
        // If entity creation fails, store full content as fallback
        storedContent = content;
      }
    }

    try {
      this.ensureSummaryColumn();
      const stmt = this.db.prepare(`
        INSERT INTO ai_messages (id, from_agent, from_source, to_agent, content, message_type, priority, metadata, tenant_id, from_actor_type, from_actor_id, summary)
        VALUES (?, ?, 'direct', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, from, to, storedContent, messageType, priority, JSON.stringify(metadata || {}), tenantId, fromActorType, fromActorId, summary);
    } catch (err: any) {
      // Fallback: ai_messages table may not exist yet (pre-migration)
      if (err.message?.includes('no such table')) {
        console.warn('⚠️ ai_messages table not found, falling back to shared_memory');
        return this.store(from, {
          id: `message-${Date.now()}`,
          to,
          target: to,
          from,
          message: content,
          content,
          type: messageType,
          messageType,
          priority,
          timestamp: new Date().toISOString(),
          deliveryStatus: 'delivered',
          metadata: metadata || {},
        }, 'shared', 'ai_message', tenantId, context);
      }
      throw err;
    }

    // Also store in vector index for semantic search if available.
    if (this.isAdvancedSystemsEnabled && this.vectorClient) {
      try {
        await this.vectorClient.storeMemory({
          id,
          agentId: from,
          tenantId,
          type: 'ai_message' as any,
          content: content,
          timestamp: Date.now(),
          tags: ['message', messageType],
          priority: priority === 'urgent' ? 10 : priority === 'high' ? 7 : 5,
          relationships: [],
          metadata: { to, messageType, priority },
        });
      } catch {
        // Non-critical: vector write failure shouldn't break messaging.
      }
    }

    console.log(`💬 Stored message: ${from} → ${to} [${messageType}]`);
    return id;
  }

  /**
   * Get messages for an agent from the dedicated ai_messages table.
   * Falls back to shared_memory search if ai_messages table doesn't exist.
   */
  getMessages(
    agentId: string,
    options: {
      messageType?: string;
      since?: string;
      limit?: number;
      unreadOnly?: boolean;
      markAsRead?: boolean;
      tenantId?: string;
      includeArchived?: boolean;
      compact?: boolean;
      from?: string;
    } = {}
  ): any[] {
    const limit = options.limit || 5;
    const tenantId = options.tenantId || 'default';
    const compact = options.compact !== false; // default true
    const recipientAliases = this.getAgentAliases(agentId);
    const senderAliases = options.from ? this.getAgentAliases(options.from) : [];

    try {
      // Ensure read_at + archived_at + summary columns exist (idempotent migration)
      this.ensureReadAtColumn();
      this.ensureArchivedAtColumn();
      this.ensureSummaryColumn();

      // Compact mode: exclude full content column to reduce token consumption
      const columns = compact
        ? 'id, from_agent, to_agent, message_type, priority, created_at, read_at, archived_at, summary, metadata'
        : '*';
      const recipientPlaceholders = recipientAliases.map(() => '?').join(',');
      let query = `SELECT ${columns} FROM ai_messages WHERE to_agent IN (${recipientPlaceholders}) AND tenant_id = ?`;
      const params: any[] = [...recipientAliases, tenantId];

      // Task 1200: Exclude archived by default
      if (!options.includeArchived) {
        query += ' AND archived_at IS NULL';
      }

      if (options.messageType) {
        query += ' AND message_type = ?';
        params.push(options.messageType);
      }
      if (options.since) {
        query += ' AND created_at >= ?';
        params.push(options.since);
      }
      if (options.unreadOnly) {
        query += ' AND read_at IS NULL';
      }
      if (options.from) {
        const senderPlaceholders = senderAliases.map(() => '?').join(',');
        query += ` AND from_agent IN (${senderPlaceholders})`;
        params.push(...senderAliases);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const messages = this.db.prepare(query).all(...params) as any[];

      // Mark retrieved messages as read if requested
      if (options.markAsRead && messages.length > 0) {
        const ids = messages.map((m: any) => m.id);
        const placeholders = ids.map(() => '?').join(',');
        this.db.prepare(
          `UPDATE ai_messages SET read_at = ? WHERE id IN (${placeholders}) AND read_at IS NULL`
        ).run(new Date().toISOString(), ...ids);
      }

      return messages;
    } catch (err: any) {
      if (err.message?.includes('no such table')) {
        console.warn('⚠️ ai_messages table not found, falling back to shared_memory(ai_message)');
        return this.getLegacyMessages(agentId, options);
      }
      throw err;
    }
  }

  /**
   * Legacy fallback: read ai_message rows from shared_memory (pre-migration schema).
   * These rows do not track read/archive state, so unreadOnly/includeArchived are best-effort.
   */
  private getLegacyMessages(
    agentId: string,
    options: {
      messageType?: string;
      since?: string;
      limit?: number;
      unreadOnly?: boolean;
      markAsRead?: boolean;
      tenantId?: string;
      includeArchived?: boolean;
      compact?: boolean;
      from?: string;
    } = {}
  ): any[] {
    const limit = options.limit || 5;
    const tenantId = options.tenantId || 'default';
    const recipientAliases = this.getAgentAliases(agentId);
    const senderAliases = options.from ? this.getAgentAliases(options.from) : [];

    let rows: any[] = [];
    try {
      rows = this.db.prepare(
        `SELECT id, content, created_by, created_at
         FROM shared_memory
         WHERE tenant_id = ? AND memory_type = 'ai_message'
         ORDER BY created_at DESC
         LIMIT 500`
      ).all(tenantId) as any[];
    } catch {
      return [];
    }

    const filtered = rows
      .map((row: any) => {
        let payload: any = {};
        try {
          payload = JSON.parse(row.content || '{}');
        } catch {
          payload = {};
        }

        const toAgent = payload.to || payload.target || payload.to_agent;
        const fromAgent = payload.from || payload.from_agent || row.created_by;
        const content = String(payload.content ?? payload.message ?? '');
        const messageType = String(payload.messageType ?? payload.type ?? 'info');
        const priority = String(payload.priority ?? 'normal');
        const createdAt = payload.timestamp || row.created_at;

        return {
          id: row.id,
          from_agent: fromAgent,
          to_agent: toAgent,
          content,
          message_type: messageType,
          priority,
          created_at: createdAt,
          read_at: null,
          archived_at: null,
          summary: MemoryManager.generateSummary(content),
          metadata: JSON.stringify(payload.metadata || {}),
        };
      })
      .filter((msg: any) => recipientAliases.includes(this.comparableAgentId(msg.to_agent)))
      .filter((msg: any) => !options.messageType || msg.message_type === options.messageType)
      .filter((msg: any) => !options.since || String(msg.created_at) >= String(options.since))
      .filter((msg: any) => !options.from || senderAliases.includes(this.comparableAgentId(msg.from_agent)))
      .slice(0, limit);

    // markAsRead is ignored in legacy mode (no read_at column).
    return filtered;
  }

  /**
   * Get a single message by ID with full content.
   * Used by get_message_detail tool for the scan-then-detail workflow.
   */
  async getMessageById(
    messageId: string,
    markAsRead: boolean = true,
    tenantId: string = 'default',
    agentId?: string
  ): Promise<any | null> {
    const recipientAliases = agentId ? this.getAgentAliases(agentId) : [];
    try {
      this.ensureReadAtColumn();
      this.ensureSummaryColumn();
      // Scope by tenant + recipient to prevent cross-tenant/cross-agent reads
      let query = 'SELECT * FROM ai_messages WHERE id = ? AND tenant_id = ?';
      const params: any[] = [messageId, tenantId];
      if (recipientAliases.length > 0) {
        const recipientPlaceholders = recipientAliases.map(() => '?').join(',');
        query += ` AND to_agent IN (${recipientPlaceholders})`;
        params.push(...recipientAliases);
      }
      const msg = this.db.prepare(query).get(...params) as any;
      if (!msg) return null;
      if (markAsRead && !msg.read_at) {
        this.db.prepare('UPDATE ai_messages SET read_at = ? WHERE id = ? AND read_at IS NULL')
          .run(new Date().toISOString(), messageId);
      }
      // Resolve auto-split pointer: if content references an entity, fetch the full content
      const pointerMatch = msg.content?.match(/^Full content stored as entity "([^"]+)"/);
      if (pointerMatch) {
        const entityName = pointerMatch[1];
        try {
          const results = await this.search(entityName, 'shared', tenantId);
          const entity = results.find((r: any) => r?.content?.name === entityName);
          if (entity?.content?.observations?.length) {
            msg.content = entity.content.observations[0];
            msg._resolvedFrom = entityName;
          }
        } catch {
          // If entity lookup fails, return the pointer as-is
        }
      }
      return msg;
    } catch (err: any) {
      if (err.message?.includes('no such table')) {
        // Legacy fallback from shared_memory(ai_message)
        const row = this.db.prepare(
          `SELECT id, content, created_by, created_at
           FROM shared_memory
           WHERE id = ? AND tenant_id = ? AND memory_type = 'ai_message'`
        ).get(messageId, tenantId) as any;
        if (!row) return null;

        let payload: any = {};
        try {
          payload = JSON.parse(row.content || '{}');
        } catch {
          payload = {};
        }

        const toAgent = payload.to || payload.target || payload.to_agent;
        if (recipientAliases.length > 0 && !recipientAliases.includes(this.comparableAgentId(toAgent))) return null;

        const fromAgent = payload.from || payload.from_agent || row.created_by;
        const content = String(payload.content ?? payload.message ?? '');
        const messageType = String(payload.messageType ?? payload.type ?? 'info');
        const priority = String(payload.priority ?? 'normal');

        return {
          id: row.id,
          from_agent: fromAgent,
          to_agent: toAgent,
          content,
          message_type: messageType,
          priority,
          created_at: payload.timestamp || row.created_at,
          read_at: null,
          summary: MemoryManager.generateSummary(content),
          metadata: JSON.stringify(payload.metadata || {}),
        };
      }
      throw err;
    }
  }

  /**
   * Get a single entity by ID with full content.
   * Searches shared_memory, individual_memory, shared_knowledge, and tasks tables.
   * Used by get_entity_detail tool for the scan-then-detail workflow.
   */
  async getEntityById(entityId: string, tenantId: string = 'default'): Promise<any | null> {
    // Try shared_memory first
    try {
      const row = this.db.prepare(
        `SELECT id, memory_type, content, created_by, created_at FROM shared_memory WHERE id = ? AND tenant_id = ?`
      ).get(entityId, tenantId) as any;
      if (row) {
        let content: any;
        try { content = JSON.parse(row.content); } catch { content = { raw: row.content, type: row.memory_type }; }
        return { id: row.id, sourceTable: 'shared_memory', type: 'shared', memoryType: row.memory_type, content, source: row.created_by, createdAt: row.created_at };
      }
    } catch { /* table may not exist */ }

    // Try individual_memory
    try {
      const row = this.db.prepare(
        `SELECT id, agent_id, memory_type, content, importance, created_at FROM individual_memory WHERE id = ? AND tenant_id = ?`
      ).get(entityId, tenantId) as any;
      if (row) {
        let content: any;
        try { content = JSON.parse(row.content); } catch { content = { raw: row.content, type: row.memory_type }; }
        return { id: row.id, sourceTable: 'individual_memory', type: 'individual', memoryType: row.memory_type, content, source: row.agent_id, importance: row.importance, createdAt: row.created_at };
      }
    } catch { /* table may not exist */ }

    // Try shared_knowledge
    try {
      const row = this.db.prepare(
        `SELECT id, title, content, type, source, confidence, created_at FROM shared_knowledge WHERE id = ? AND tenant_id = ?`
      ).get(entityId, tenantId) as any;
      if (row) {
        return { id: row.id, sourceTable: 'shared_knowledge', type: 'shared', memoryType: row.type, content: { id: row.id, title: row.title, content: row.content, type: row.type, source: row.source, confidence: row.confidence }, source: row.source, createdAt: row.created_at };
      }
    } catch { /* table may not exist */ }

    // Try tasks
    try {
      const row = this.db.prepare(
        `SELECT id, title, description, status, created_by, created_at FROM tasks WHERE id = ? AND tenant_id = ?`
      ).get(entityId, tenantId) as any;
      if (row) {
        return { id: row.id, sourceTable: 'tasks', type: 'shared', memoryType: 'task', content: { id: row.id, title: row.title, description: row.description, status: row.status, createdBy: row.created_by }, source: row.created_by, createdAt: row.created_at };
      }
    } catch { /* table may not exist */ }

    return null;
  }

  /**
   * Count unread, non-archived messages for an agent within a tenant.
   */
  countUnreadMessages(agentId: string, tenantId: string = 'default'): number {
    const recipientAliases = this.getAgentAliases(agentId);
    try {
      this.ensureReadAtColumn();
      this.ensureArchivedAtColumn();
      const recipientPlaceholders = recipientAliases.map(() => '?').join(',');
      const row = this.db.prepare(
        `SELECT COUNT(*) as cnt
         FROM ai_messages
         WHERE to_agent IN (${recipientPlaceholders}) AND tenant_id = ? AND read_at IS NULL AND archived_at IS NULL`
      ).get(...recipientAliases, tenantId) as any;
      return row?.cnt ?? 0;
    } catch {
      // Legacy fallback: pre-migration rows have no read/archive tracking, treat all as unread.
      try {
        const rows = this.db.prepare(
          `SELECT content
           FROM shared_memory
           WHERE tenant_id = ? AND memory_type = 'ai_message'`
        ).all(tenantId) as Array<{ content: string }>;
        let count = 0;
        for (const row of rows) {
          try {
            const payload = JSON.parse(row.content || '{}');
            const toAgent = payload.to || payload.target || payload.to_agent;
            if (recipientAliases.includes(this.comparableAgentId(toAgent))) count += 1;
          } catch {
            // ignore malformed row
          }
        }
        return count;
      } catch {
        return 0;
      }
    }
  }

  /**
   * Ensure read_at column exists on ai_messages table (idempotent).
   */
  private _readAtColumnChecked = false;
  private ensureReadAtColumn(): void {
    if (this._readAtColumnChecked) return;
    if (ensureReadAtColumnImpl(this.db)) this._readAtColumnChecked = true;
  }

  // ─── Message Hygiene: summary column migration ───
  private _summaryColumnChecked = false;
  private ensureSummaryColumn(): void {
    if (this._summaryColumnChecked) return;
    if (ensureSummaryColumnImpl(this.db)) this._summaryColumnChecked = true;
  }

  /**
   * Generate a summary for a message on write.
   * Short messages (<=200 chars): summary = content.
   * Longer: first line truncated to 120 chars + approx token count.
   */
  static generateSummary(content: string): string {
    if (content.length <= 200) return content;
    const firstLine = content.split('\n')[0].slice(0, 120);
    const approxTokens = Math.ceil(content.length / 4);
    return `${firstLine} [~${approxTokens} tokens]`;
  }

  // ─── Task 1200: archived_at column migration ───
  private _archivedAtColumnChecked = false;
  private ensureArchivedAtColumn(): void {
    if (this._archivedAtColumnChecked) return;
    if (ensureArchivedAtColumnImpl(this.db)) this._archivedAtColumnChecked = true;
  }

  /**
   * Task 1200: Mark specific messages as read, or all unread messages for an agent.
   * Returns count of messages marked.
   */
  markMessagesRead(
    agentId: string,
    messageIds?: string[],
    tenantId: string = 'default'
  ): number {
    this.ensureReadAtColumn();
    const now = new Date().toISOString();
    const recipientAliases = this.getAgentAliases(agentId);
    const recipientPlaceholders = recipientAliases.map(() => '?').join(',');

    if (messageIds && messageIds.length > 0) {
      // Mark specific messages
      const placeholders = messageIds.map(() => '?').join(',');
      const result = this.db.prepare(
        `UPDATE ai_messages
         SET read_at = ?
         WHERE id IN (${placeholders}) AND to_agent IN (${recipientPlaceholders}) AND tenant_id = ? AND read_at IS NULL`
      ).run(now, ...messageIds, ...recipientAliases, tenantId);
      return result.changes;
    } else {
      // Mark all unread for this agent
      const result = this.db.prepare(
        `UPDATE ai_messages
         SET read_at = ?
         WHERE to_agent IN (${recipientPlaceholders}) AND tenant_id = ? AND read_at IS NULL`
      ).run(now, ...recipientAliases, tenantId);
      return result.changes;
    }
  }

  /**
   * Task 1200 / Engram comms surface: archive messages for an agent — either
   * specific messageIds (per-message archive, used by the dashboard inbox), or
   * all messages older than N days. Both paths are scoped to the agent's own
   * recipient aliases. Returns count of messages archived.
   */
  archiveMessages(
    agentId: string,
    olderThanDays?: number,
    tenantId: string = 'default',
    messageIds?: string[]
  ): number {
    this.ensureArchivedAtColumn();
    const now = new Date().toISOString();
    const recipientAliases = this.getAgentAliases(agentId);
    const recipientPlaceholders = recipientAliases.map(() => '?').join(',');

    if (messageIds && messageIds.length > 0) {
      // Archive specific messages by id (still scoped to this agent's inbox).
      const placeholders = messageIds.map(() => '?').join(',');
      const result = this.db.prepare(
        `UPDATE ai_messages
         SET archived_at = ?
         WHERE id IN (${placeholders}) AND to_agent IN (${recipientPlaceholders}) AND tenant_id = ? AND archived_at IS NULL`
      ).run(now, ...messageIds, ...recipientAliases, tenantId);
      return result.changes;
    }

    // Otherwise archive by age cutoff (default 30 days).
    const cutoff = new Date(Date.now() - (olderThanDays ?? 30) * 86400000).toISOString();
    const result = this.db.prepare(
      `UPDATE ai_messages
       SET archived_at = ?
       WHERE to_agent IN (${recipientPlaceholders}) AND tenant_id = ? AND created_at < ? AND archived_at IS NULL`
    ).run(now, ...recipientAliases, tenantId, cutoff);
    return result.changes;
  }

  // ─── Task 1100: User Profile methods ───

  /**
   * Get a user profile by userId within a tenant.
   */
  getUserProfile(userId: string, tenantId: string = 'default'): any | null {
    try {
      const row = this.db.prepare(
        'SELECT * FROM users WHERE id = ? AND tenant_id = ?'
      ).get(userId, tenantId) as any;
      if (!row) return null;
      return {
        id: row.id,
        tenantId: row.tenant_id,
        displayName: row.display_name,
        timezone: row.timezone,
        locale: row.locale,
        dateFormat: row.date_format,
        units: row.units,
        workingHours: row.working_hours ? JSON.parse(row.working_hours) : null,
        lastSeenTz: row.last_seen_tz,
        prefsVersion: row.prefs_version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch {
      return null;
    }
  }

  /**
   * Update a user profile. Merges provided fields, bumps prefs_version.
   * Returns the updated profile.
   */
  updateUserProfile(
    userId: string,
    updates: {
      displayName?: string;
      timezone?: string;
      locale?: string;
      dateFormat?: string;
      units?: string;
      workingHours?: { start: string; end: string };
    },
    tenantId: string = 'default'
  ): any | null {
    const existing = this.getUserProfile(userId, tenantId);
    if (!existing) return null;

    const setClauses: string[] = [];
    const params: any[] = [];

    if (updates.displayName !== undefined) { setClauses.push('display_name = ?'); params.push(updates.displayName); }
    if (updates.timezone !== undefined) { setClauses.push('timezone = ?'); params.push(updates.timezone); }
    if (updates.locale !== undefined) { setClauses.push('locale = ?'); params.push(updates.locale); }
    if (updates.dateFormat !== undefined) { setClauses.push('date_format = ?'); params.push(updates.dateFormat); }
    if (updates.units !== undefined) { setClauses.push('units = ?'); params.push(updates.units); }
    if (updates.workingHours !== undefined) { setClauses.push('working_hours = ?'); params.push(JSON.stringify(updates.workingHours)); }

    if (setClauses.length === 0) return existing;

    setClauses.push("prefs_version = prefs_version + 1");
    setClauses.push("updated_at = datetime('now')");

    const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = ? AND tenant_id = ?`;
    params.push(userId, tenantId);
    this.db.prepare(sql).run(...params);

    return this.getUserProfile(userId, tenantId);
  }

  /**
   * Update last_seen_tz for a user (from X-User-Timezone header).
   * Fire-and-forget; never throws.
   */
  updateLastSeenTz(userId: string, timezone: string, tenantId: string = 'default'): void {
    try {
      this.db.prepare(
        `UPDATE users SET last_seen_tz = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
      ).run(timezone, userId, tenantId);
    } catch { /* non-fatal */ }
  }

  /**
   * Check if ai_messages table exists (for graceful migration detection)
   */
  hasAiMessagesTable(): boolean {
    try {
      const result = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_messages'"
      ).get() as any;
      return !!result;
    } catch {
      return false;
    }
  }

  // ─── Phase A: Knowledge Graph Mutation Helpers ───

  /**
   * Escape special SQL LIKE characters in a pattern substring.
   * Codex finding #7: escape % and _ before wrapping with %..%
   */
  static escapeLikePattern(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  /**
   * Authorize a graph mutation using ONLY the RequestContext (codex findings #1, #2).
   * Never trusts tool args for identity.
   */
  authorizeGraphMutation(
    action: string,
    context: RequestContext
  ): { authorized: boolean; reason?: string } {
    return authorizeGraphMutationImpl(action, context);
  }

  // ─── BV-S1: Graph Export Read Authorization + Data Access ───

  /**
   * Permission vocabulary for graph read operations:
   *   graph:view              — topology (nodes + links). Minimum to access endpoint.
   *   graph:observations:view — non-sensitive observations.
   *   graph:sensitive:view    — agent-internal/system observations.
   *   Legacy: graph:read, graph:write, * imply graph:view + graph:observations:view.
   */
  authorizeGraphRead(
    context: RequestContext
  ): { permissions: Set<string>; authorized: boolean; reason?: string } {
    return authorizeGraphReadImpl(context);
  }

  /**
   * Deterministic 4-step sensitivity classification for an observation row.
   * contents is string[] — any match in any entry → entire observation is sensitive.
   */
  static classifyObservationSensitivity(
    observationContent: { entityName: string; contents: string[]; messageType?: string; sensitive?: boolean }
  ): boolean {
    return classifyObservationSensitivityImpl(observationContent);
  }

  /**
   * Fetch graph data for export (tenant-scoped).
   * Returns entities (nodes), relations (links), and optionally observations.
   */
  getGraphExport(options: {
    tenantId: string;
    limit: number;
    cursor?: string;
    includeObservations: boolean;
    updatedSince?: string;
    entityName?: string;
    permissions: Set<string>;
  }): {
    nodes?: any[];
    links?: any[];
    observations?: any[];
    nextCursor: string | null;
    totals: { nodes?: number; links?: number; observations: number };
    maxUpdatedAt?: string;
  } {
    const { tenantId, limit, cursor, includeObservations, updatedSince, entityName, permissions } = options;
    const offset = cursor ? parseInt(Buffer.from(cursor, 'base64').toString('utf8'), 10) || 0 : 0;
    const canSeeSensitive = permissions.has('graph:sensitive:view');

    // entityName mode: observations-only
    if (entityName) {
      let obsQuery = `SELECT id, content, created_at, updated_at FROM shared_memory
        WHERE tenant_id = ? AND memory_type = 'observation'
        AND json_extract(content, '$.entityName') = ?`;
      const obsParams: any[] = [tenantId, entityName];
      if (updatedSince) {
        obsQuery += ' AND updated_at >= ?';
        obsParams.push(updatedSince);
      }
      obsQuery += ' ORDER BY created_at ASC';

      const allObs = this.db.prepare(obsQuery).all(...obsParams) as any[];
      const filtered = this.filterAndMapObservations(allObs, canSeeSensitive);

      // Apply pagination to filtered observations
      const paged = filtered.observations.slice(offset, offset + limit);
      const nextOffset = offset + limit;
      const nextCursor = nextOffset < filtered.observations.length
        ? Buffer.from(String(nextOffset)).toString('base64')
        : null;

      return {
        observations: paged,
        nextCursor,
        totals: { observations: filtered.observations.length },
        maxUpdatedAt: filtered.maxUpdatedAt || undefined,
      };
    }

    // Full mode: nodes + links + optional observations
    // Nodes (entities)
    let entityQuery = `SELECT id, content, created_at, updated_at FROM shared_memory
      WHERE tenant_id = ? AND memory_type = 'entity'`;
    const entityParams: any[] = [tenantId];
    if (updatedSince) {
      entityQuery += ' AND updated_at >= ?';
      entityParams.push(updatedSince);
    }
    entityQuery += ' ORDER BY created_at ASC';

    const entityRows = this.db.prepare(entityQuery).all(...entityParams) as any[];
    const updTracker = { max: undefined as string | undefined };

    const nodes = entityRows.map((row: any) => {
      const content = JSON.parse(row.content);
      // Count observations for this entity
      const obsCount = (this.db.prepare(
        `SELECT COUNT(*) as cnt FROM shared_memory
         WHERE tenant_id = ? AND memory_type = 'observation'
         AND json_extract(content, '$.entityName') = ?`
      ).get(tenantId, content.name) as any)?.cnt || 0;

      // Track max updated_at from included entity rows
      if (row.updated_at && (!updTracker.max || row.updated_at > updTracker.max)) {
        updTracker.max = row.updated_at;
      }

      return {
        name: content.name,
        entityType: content.entityType || content.type,
        observationCount: obsCount,
        id: row.id,
        createdAt: row.created_at,
      };
    });

    // Links (relations)
    let relQuery = `SELECT id, content, created_at, updated_at FROM shared_memory
      WHERE tenant_id = ? AND memory_type = 'relation'`;
    const relParams: any[] = [tenantId];
    if (updatedSince) {
      relQuery += ' AND updated_at >= ?';
      relParams.push(updatedSince);
    }
    relQuery += ' ORDER BY created_at ASC';

    const relRows = this.db.prepare(relQuery).all(...relParams) as any[];
    const links = relRows.map((row: any) => {
      const content = JSON.parse(row.content);
      // Track max updated_at from included relation rows
      if (row.updated_at && (!updTracker.max || row.updated_at > updTracker.max)) {
        updTracker.max = row.updated_at;
      }
      return {
        source: content.from,
        target: content.to,
        relationType: content.relationType,
      };
    });

    // Observations (optional)
    let observations: any[] | undefined;
    let totalObs = 0;
    if (includeObservations) {
      let obsQuery = `SELECT id, content, created_at, updated_at FROM shared_memory
        WHERE tenant_id = ? AND memory_type = 'observation'`;
      const obsParams: any[] = [tenantId];
      if (updatedSince) {
        obsQuery += ' AND updated_at >= ?';
        obsParams.push(updatedSince);
      }
      obsQuery += ' ORDER BY created_at ASC';

      const allObs = this.db.prepare(obsQuery).all(...obsParams) as any[];
      const filtered = this.filterAndMapObservations(allObs, canSeeSensitive);
      totalObs = filtered.observations.length;
      observations = filtered.observations;
      // Include observation max in overall max
      if (filtered.maxUpdatedAt && (!updTracker.max || filtered.maxUpdatedAt > updTracker.max)) {
        updTracker.max = filtered.maxUpdatedAt;
      }
    }

    // Paginate the combined result by nodes
    const pagedNodes = nodes.slice(offset, offset + limit);
    const nextOffset = offset + limit;
    const nextCursor = nextOffset < nodes.length
      ? Buffer.from(String(nextOffset)).toString('base64')
      : null;

    return {
      nodes: pagedNodes,
      links,
      observations,
      nextCursor,
      totals: {
        nodes: nodes.length,
        links: links.length,
        observations: totalObs,
      },
      maxUpdatedAt: updTracker.max,
    };
  }

  /**
   * Filter observations by sensitivity and map to export shape.
   */
  private filterAndMapObservations(rows: any[], canSeeSensitive: boolean): { observations: any[]; maxUpdatedAt: string | null } {
    const result: any[] = [];
    let maxUpdatedAt: string | null = null;
    for (const row of rows) {
      const content = JSON.parse(row.content);
      const isSensitive = MemoryManager.classifyObservationSensitivity(content);
      if (isSensitive && !canSeeSensitive) continue;
      result.push({
        id: row.id,
        entityName: content.entityName,
        contents: content.contents || [],
        metadata: content.metadata || {},
        addedBy: content.addedBy,
        createdAt: row.created_at,
      });
      if (row.updated_at && (!maxUpdatedAt || row.updated_at > maxUpdatedAt)) {
        maxUpdatedAt = row.updated_at;
      }
    }
    return { observations: result, maxUpdatedAt };
  }

  private isGraphMemoryType(type: string): type is GraphMemoryType {
    return type === 'entity' || type === 'observation' || type === 'relation';
  }

  private addGraphLookupEntry(
    entries: Map<string, GraphLookupEntry>,
    rawValue: any,
    keyKind: string,
    weight: number
  ): void {
    if (typeof rawValue !== 'string') return;
    const lookupKey = this.normalizeEntityLookup(rawValue);
    if (!lookupKey) return;

    const existing = entries.get(lookupKey);
    if (!existing || weight > existing.weight) {
      entries.set(lookupKey, { lookupKey, keyKind, weight });
    }
  }

  private addGraphLookupVariants(
    entries: Map<string, GraphLookupEntry>,
    value: any,
    keyKind: string,
    weight: number
  ): void {
    if (typeof value !== 'string' || !value.trim()) return;
    for (const variant of this.entityLookupVariants(value)) {
      this.addGraphLookupEntry(entries, variant, keyKind, weight);
    }
  }

  private addGraphLookupHandles(
    entries: Map<string, GraphLookupEntry>,
    value: any,
    keyKind: string,
    weight: number
  ): void {
    if (typeof value !== 'string' || !value.trim()) return;
    for (const handle of this.extractLookupHandles(value)) {
      this.addGraphLookupVariants(entries, handle, keyKind, weight);
    }
  }

  private graphLookupEntriesForContent(content: any, memoryType: GraphMemoryType): GraphLookupEntry[] {
    const entries = new Map<string, GraphLookupEntry>();

    for (const value of this.entityLookupValues(content || {})) {
      this.addGraphLookupEntry(entries, value, 'derived', 50);
    }

    if (memoryType === 'entity') {
      this.addGraphLookupVariants(entries, content?.name, 'canonical_name', 100);
      if (Array.isArray(content?.aliases)) {
        for (const alias of content.aliases) {
          this.addGraphLookupVariants(entries, alias, 'alias', 95);
        }
      }
      if (Array.isArray(content?.observations)) {
        for (const observation of content.observations) {
          this.addGraphLookupHandles(entries, observation, 'embedded_observation_handle', 70);
        }
      }
      if (Array.isArray(content?.agentBootstrap)) {
        for (const bootstrap of content.agentBootstrap) {
          this.addGraphLookupHandles(entries, bootstrap, 'agent_bootstrap_handle', 65);
        }
      }
    }

    if (memoryType === 'observation') {
      this.addGraphLookupVariants(entries, content?.entityName, 'entity_name', 95);
      if (Array.isArray(content?.appliesTo)) {
        for (const appliesTo of content.appliesTo) {
          this.addGraphLookupVariants(entries, appliesTo, 'applies_to', 85);
        }
      }
      if (Array.isArray(content?.metadata?.appliesTo)) {
        for (const appliesTo of content.metadata.appliesTo) {
          this.addGraphLookupVariants(entries, appliesTo, 'metadata_applies_to', 85);
        }
      }
      if (Array.isArray(content?.contents)) {
        for (const item of content.contents) {
          this.addGraphLookupHandles(entries, item, 'observation_handle', 75);
        }
      }
      this.addGraphLookupHandles(entries, content?.metadata?.canonicalFact, 'canonical_fact_handle', 80);
    }

    if (memoryType === 'relation') {
      this.addGraphLookupVariants(entries, content?.from, 'relation_from', 90);
      this.addGraphLookupVariants(entries, content?.to, 'relation_to', 90);
    }

    return Array.from(entries.values());
  }

  private replaceGraphLookupIndexForMemory(
    memoryId: string,
    tenantId: string,
    memoryType: GraphMemoryType,
    content: any,
    deleteStmt?: Database.Statement,
    insertStmt?: Database.Statement
  ): number {
    const entries = this.graphLookupEntriesForContent(content, memoryType);
    const del = deleteStmt || this.db.prepare(
      'DELETE FROM graph_lookup_keys WHERE tenant_id = ? AND memory_id = ?'
    );
    const insert = insertStmt || this.db.prepare(`
      INSERT INTO graph_lookup_keys (tenant_id, lookup_key, memory_type, memory_id, key_kind, weight, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, lookup_key, memory_type, memory_id) DO UPDATE SET
        key_kind = excluded.key_kind,
        weight = excluded.weight,
        updated_at = CURRENT_TIMESTAMP
    `);

    del.run(tenantId, memoryId);
    for (const entry of entries) {
      insert.run(tenantId, entry.lookupKey, memoryType, memoryId, entry.keyKind, entry.weight);
    }
    return entries.length;
  }

  private refreshGraphLookupIndexForMemory(
    memoryId: string,
    tenantId: string,
    memoryType: string,
    content: any
  ): void {
    if (!this.isGraphMemoryType(memoryType)) return;

    try {
      const replace = this.db.transaction(() => {
        this.replaceGraphLookupIndexForMemory(memoryId, tenantId, memoryType, content);
      });
      replace();
    } catch (error: any) {
      console.warn(`⚠️ Failed to refresh graph lookup index for ${memoryId}:`, error?.message || error);
    }
  }

  public rebuildGraphLookupIndex(tenantId?: string): { rowsIndexed: number; keysIndexed: number } {
    const params: any[] = [];
    let where = "WHERE memory_type IN ('entity', 'observation', 'relation')";
    if (tenantId) {
      where += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const rows = this.db.prepare(`
      SELECT id, COALESCE(tenant_id, 'default') as tenant_id, memory_type, content
      FROM shared_memory
      ${where}
      ORDER BY created_at ASC
    `).all(...params) as Array<{ id: string; tenant_id: string; memory_type: string; content: string }>;

    const deleteAll = tenantId
      ? this.db.prepare('DELETE FROM graph_lookup_keys WHERE tenant_id = ?')
      : this.db.prepare('DELETE FROM graph_lookup_keys');
    const deleteRow = this.db.prepare('DELETE FROM graph_lookup_keys WHERE tenant_id = ? AND memory_id = ?');
    const insert = this.db.prepare(`
      INSERT INTO graph_lookup_keys (tenant_id, lookup_key, memory_type, memory_id, key_kind, weight, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, lookup_key, memory_type, memory_id) DO UPDATE SET
        key_kind = excluded.key_kind,
        weight = excluded.weight,
        updated_at = CURRENT_TIMESTAMP
    `);

    let rowsIndexed = 0;
    let keysIndexed = 0;
    const rebuild = this.db.transaction(() => {
      if (tenantId) {
        deleteAll.run(tenantId);
      } else {
        deleteAll.run();
      }

      for (const row of rows) {
        if (!this.isGraphMemoryType(row.memory_type)) continue;
        let content: any;
        try {
          content = JSON.parse(row.content || '{}');
        } catch {
          continue;
        }
        keysIndexed += this.replaceGraphLookupIndexForMemory(
          row.id,
          row.tenant_id || 'default',
          row.memory_type,
          content,
          deleteRow,
          insert
        );
        rowsIndexed++;
      }
    });
    rebuild();

    return { rowsIndexed, keysIndexed };
  }

  public async materializeInlineObservations(
    agentId: string,
    entityId: string,
    entityName: string,
    observations: any[],
    tenantId: string = 'default',
    context?: RequestContext
  ): Promise<any[]> {
    if (!Array.isArray(observations) || observations.length === 0) return [];

    const materialized: any[] = [];
    for (let inlineIndex = 0; inlineIndex < observations.length; inlineIndex++) {
      const raw = observations[inlineIndex];
      if (typeof raw !== 'string' || !raw.trim()) continue;

      const contentHash = MemoryManager.contentHash(raw);
      const inlineKey = `${entityId}:${inlineIndex}:${contentHash}`;
      const existing = this.db.prepare(
        `SELECT id, content, created_by, created_at
         FROM shared_memory
         WHERE tenant_id = ?
           AND memory_type = 'observation'
           AND json_extract(content, '$.metadata.inlineKey') = ?
         LIMIT 1`
      ).get(tenantId, inlineKey) as any;

      if (existing) {
        let existingContent: any = {};
        try {
          existingContent = JSON.parse(existing.content || '{}');
        } catch {}
        materialized.push({
          id: existing.id,
          ...existingContent,
          skipped: true,
          skipReason: 'existing_inline_observation',
        });
        continue;
      }

      const observationData = {
        entityName,
        contents: [raw],
        addedBy: agentId,
        timestamp: new Date().toISOString(),
        metadata: {
          source: 'create_entities_inline',
          entityId,
          inlineIndex,
          inlineKey,
          contentHash,
          canonicalEntityKey: this.normalizeEntityLookup(entityName),
          vectorEmbedded: true,
          relationshipsUpdated: true,
        },
      };

      const observationId = await this.store(agentId, observationData, 'shared', 'observation', tenantId, context);
      materialized.push({ id: observationId, ...observationData });
    }

    return materialized;
  }

  private backfillGraphLookupIndexIfEmpty(): void {
    try {
      const lookupCount = (this.db.prepare(
        'SELECT COUNT(*) as cnt FROM graph_lookup_keys'
      ).get() as any)?.cnt || 0;
      if (lookupCount > 0) return;

      const graphCount = (this.db.prepare(
        "SELECT COUNT(*) as cnt FROM shared_memory WHERE memory_type IN ('entity', 'observation', 'relation')"
      ).get() as any)?.cnt || 0;
      if (graphCount === 0) return;

      const result = this.rebuildGraphLookupIndex();
      console.log(`🔎 Backfilled graph lookup index: ${result.rowsIndexed} rows, ${result.keysIndexed} keys`);
    } catch (error: any) {
      console.warn('⚠️ Graph lookup index backfill skipped:', error?.message || error);
    }
  }

  private graphLookupIndexHasRows(tenantId: string): boolean {
    try {
      const row = this.db.prepare(
        'SELECT 1 FROM graph_lookup_keys WHERE tenant_id = ? LIMIT 1'
      ).get(tenantId) as any;
      return !!row;
    } catch {
      return false;
    }
  }

  private findRowsByLookupIndexValues(
    lookupValues: Iterable<string>,
    tenantId: string,
    memoryTypes: GraphMemoryType[]
  ): { usedIndex: boolean; rows: any[] } {
    const lookupKeys = Array.from(new Set(
      Array.from(lookupValues)
        .map((value) => this.normalizeEntityLookup(value))
        .filter(Boolean)
    ));
    const usedIndex = this.graphLookupIndexHasRows(tenantId);
    if (!usedIndex || lookupKeys.length === 0 || memoryTypes.length === 0) {
      return { usedIndex, rows: [] };
    }

    const rowsById = new Map<string, any>();
    const typePlaceholders = memoryTypes.map(() => '?').join(',');
    const maxKeysPerQuery = Math.max(1, 900 - memoryTypes.length);

    for (let i = 0; i < lookupKeys.length; i += maxKeysPerQuery) {
      const keyChunk = lookupKeys.slice(i, i + maxKeysPerQuery);
      const keyPlaceholders = keyChunk.map(() => '?').join(',');
      const rows = this.db.prepare(`
        SELECT
          sm.id,
          sm.content,
          sm.created_by,
          sm.created_at,
          sm.owner_actor_type,
          sm.owner_actor_id,
          sm.memory_type,
          MAX(gl.weight) as lookup_weight,
          GROUP_CONCAT(DISTINCT gl.key_kind) as lookup_key_kinds
        FROM graph_lookup_keys gl
        JOIN shared_memory sm
          ON sm.id = gl.memory_id
         AND sm.tenant_id = gl.tenant_id
         AND sm.memory_type = gl.memory_type
        WHERE gl.tenant_id = ?
          AND gl.lookup_key IN (${keyPlaceholders})
          AND gl.memory_type IN (${typePlaceholders})
        GROUP BY sm.id
        ORDER BY MAX(gl.weight) DESC, sm.created_at DESC
      `).all(tenantId, ...keyChunk, ...memoryTypes) as any[];

      for (const row of rows) {
        const existing = rowsById.get(row.id);
        if (!existing || (row.lookup_weight || 0) > (existing.lookup_weight || 0)) {
          rowsById.set(row.id, row);
        }
      }
    }

    return {
      usedIndex,
      rows: Array.from(rowsById.values()).sort((a: any, b: any) =>
        (b.lookup_weight || 0) - (a.lookup_weight || 0) ||
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
      ),
    };
  }

  /**
   * Normalize human-entered entity names for alias resolution.
   * This keeps the caller workflow natural: "ascend-consult" can resolve to
   * the canonical graph entity "Ascend-Consult-LLC" without a separate tool.
   */
  private normalizeEntityLookup(value: string): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  public canonicalEntityKey(value: string): string {
    return this.normalizeEntityLookup(value);
  }

  private tableExists(tableName: string): boolean {
    const row = this.db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ? LIMIT 1"
    ).get(tableName) as any;
    return !!row;
  }

  private tableHasColumn(tableName: string, columnName: string): boolean {
    if (!this.tableExists(tableName)) return false;
    const rows = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
    return rows.some((row: any) => row.name === columnName);
  }

  private countTableRows(tableName: string, tenantId?: string): number {
    if (!this.tableExists(tableName)) return 0;
    if (tenantId && this.tableHasColumn(tableName, 'tenant_id')) {
      return (this.db.prepare(`SELECT COUNT(*) as cnt FROM ${tableName} WHERE tenant_id = ?`).get(tenantId) as any)?.cnt || 0;
    }
    return (this.db.prepare(`SELECT COUNT(*) as cnt FROM ${tableName}`).get() as any)?.cnt || 0;
  }

  private pass2DomainRowCounts(tenantId: string): Record<string, number> {
    return {
      shared_memory: this.countTableRows('shared_memory', tenantId),
      graph_lookup_keys: this.countTableRows('graph_lookup_keys', tenantId),
      entity_identities: this.countTableRows('entity_identities', tenantId),
      entity_context_facets: this.countTableRows('entity_context_facets', tenantId),
      entity_lookup_identity_links: this.countTableRows('entity_lookup_identity_links', tenantId),
      neural_vec_index: this.countTableRows(process.env.SQLITE_VEC_INDEX_TABLE || 'neural_vec_index', tenantId),
      shared_memory_vec: this.countTableRows(process.env.SQLITE_VEC_TABLE || 'shared_memory_vec'),
    };
  }

  private static stableStringify(value: any): string {
    if (typeof value === 'undefined') return 'null';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((item) => MemoryManager.stableStringify(item)).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${MemoryManager.stableStringify(value[key])}`).join(',')}}`;
  }

  private static stripDryRunEphemeral(value: any): any {
    const ephemeral = new Set([
      'generatedAt',
      'durationMs',
      'estimatedTokens',
      'estimatedBytes',
      'canonicalHash',
      'artifactPath',
      'audit',
    ]);
    if (Array.isArray(value)) return value.map((item) => MemoryManager.stripDryRunEphemeral(item));
    if (!value || typeof value !== 'object') return value;
    const result: any = {};
    for (const key of Object.keys(value)) {
      if (ephemeral.has(key)) continue;
      const stripped = MemoryManager.stripDryRunEphemeral(value[key]);
      if (typeof stripped === 'undefined') continue;
      result[key] = stripped;
    }
    return result;
  }

  private static canonicalDryRunHash(report: any): string {
    return createHash('sha256')
      .update(MemoryManager.stableStringify(MemoryManager.stripDryRunEphemeral(report)))
      .digest('hex');
  }

  private safeJsonParse(value: any): any {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string') return {};
    try {
      return JSON.parse(value || '{}');
    } catch {
      return {};
    }
  }

  private excerpt(value: any, maxLength: number = 180): string | null {
    if (typeof value !== 'string') return null;
    const compact = value.replace(/\s+/g, ' ').trim();
    if (!compact) return null;
    return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact;
  }

  private tokenSet(value: any): Set<string> {
    const collectText = (input: any, parentKey: string = ''): string[] => {
      if (typeof input === 'string') return [input];
      if (Array.isArray(input)) return input.flatMap((item) => collectText(item, parentKey));
      if (!input || typeof input !== 'object') return [];
      const structuralKeys = new Set([
        'name',
        'entityName',
        'type',
        'entityType',
        'createdBy',
        'timestamp',
        'metadata',
        'vectorEmbedded',
        'graphIndexed',
        'cacheEnabled',
        'relationshipsUpdated',
      ]);
      const text: string[] = [];
      for (const [key, nested] of Object.entries(input)) {
        if (structuralKeys.has(key)) continue;
        text.push(...collectText(nested, key));
      }
      return text;
    };
    const text = typeof value === 'string' ? value : collectText(value).join(' ');
    return new Set((text.toLowerCase().match(/[a-z0-9]{3,}/g) || [])
      .filter((token) => !['entity', 'name', 'type', 'metadata', 'observations', 'timestamp', 'createdby'].includes(token)));
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    const intersection = new Set(Array.from(a).filter((token) => b.has(token)));
    const union = new Set([...Array.from(a), ...Array.from(b)]);
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  private averageContentSimilarity(rows: any[]): number {
    if (rows.length <= 1) return 1;
    const tokenSets = rows.map((row) => this.tokenSet(row.content));
    let total = 0;
    let comparisons = 0;
    for (let i = 0; i < tokenSets.length; i++) {
      for (let j = i + 1; j < tokenSets.length; j++) {
        total += this.jaccardSimilarity(tokenSets[i], tokenSets[j]);
        comparisons++;
      }
    }
    return comparisons === 0 ? 0 : total / comparisons;
  }

  private classifyPass2Group(group: any): { classification: string; confidence: number; signals: any[]; warnings: string[]; proposedSplit?: any[] } {
    const rows = group.rows;
    const rawNames = new Set(rows.map((row: any) => row.rawName).filter(Boolean));
    const entityTypes = new Set(rows.map((row: any) => row.entityType || 'unknown'));
    const createdBy = new Set(rows.map((row: any) => row.createdBy || 'unknown'));
    const metadataSources = new Set(rows.map((row: any) => row.metadataSource).filter(Boolean));
    const createdTimes = rows
      .map((row: any) => Date.parse(row.createdAt || ''))
      .filter((value: number) => Number.isFinite(value));
    const createdWithinSeconds = createdTimes.length > 1
      ? (Math.max(...createdTimes) - Math.min(...createdTimes)) / 1000
      : 0;
    const averageSimilarity = this.averageContentSimilarity(rows);
    const rawNamesDiffer = rawNames.size > 1;
    const contentDomainsDiverge = averageSimilarity < 0.35;
    const normalizationSplit = rawNamesDiffer && contentDomainsDiverge;

    const signals = [
      { name: 'same_canonical_key', result: true, weight: 0.35 },
      { name: 'single_raw_name', result: rawNames.size === 1, weight: 0.20, rawNames: Array.from(rawNames) },
      { name: 'same_entity_type', result: entityTypes.size === 1, weight: 0.15, entityTypes: Array.from(entityTypes) },
      { name: 'same_created_by', result: createdBy.size === 1, weight: 0.10, createdBy: Array.from(createdBy) },
      { name: 'created_at_within_seconds', result: createdWithinSeconds <= 60, weight: 0.10, seconds: createdWithinSeconds },
      { name: 'same_metadata_source', result: metadataSources.size === 1 && metadataSources.size > 0, weight: 0.10, metadataSources: Array.from(metadataSources) },
      { name: 'content_shape_similarity', result: averageSimilarity >= 0.30, weight: 0.20, averageSimilarity: Number(averageSimilarity.toFixed(3)) },
      {
        name: 'normalization_collapses_distinct_raw_names',
        result: normalizationSplit,
        effect: normalizationSplit ? 'hard_split' : 'none',
        rawNames: Array.from(rawNames),
        averageSimilarity: Number(averageSimilarity.toFixed(3)),
      },
    ];

    if (rows.length === 1) {
      return { classification: 'single_identity', confidence: 1, signals, warnings: [] };
    }

    if (normalizationSplit) {
      const clusters = new Map<string, any[]>();
      for (const row of rows) {
        const key = row.rawName || row.canonicalKey;
        if (!clusters.has(key)) clusters.set(key, []);
        clusters.get(key)!.push(row);
      }
      return {
        classification: 'independent_identity',
        confidence: 0.9,
        signals,
        warnings: ['NORMALIZATION_COLLAPSES_DISTINCT_RAW_NAMES'],
        proposedSplit: Array.from(clusters.entries()).map(([rawName, clusterRows]) => ({
          rawName,
          classification: clusterRows.length > 1 ? 'facet_of_identity' : 'independent_identity',
          rowIds: clusterRows.map((row: any) => row.sourceRowId),
          rowCount: clusterRows.length,
        })),
      };
    }

    const score = signals.reduce((sum, signal) => (
      sum + (signal.result === true && typeof signal.weight === 'number' ? signal.weight : 0)
    ), 0);
    if (score >= 0.85) {
      return { classification: 'facet_of_identity', confidence: Number(Math.min(score, 0.99).toFixed(2)), signals, warnings: [] };
    }
    if (score >= 0.5) {
      return { classification: 'unknown', confidence: Number(score.toFixed(2)), signals, warnings: ['LOW_CONFIDENCE_DUPLICATE_GROUP'] };
    }
    return { classification: 'unknown', confidence: Number(score.toFixed(2)), signals, warnings: ['MANUAL_REVIEW_REQUIRED'] };
  }

  public inspectIdentityCandidates(options: {
    tenantId?: string;
    canonicalKey?: string;
    limit?: number;
    minGroupSize?: number;
    includeSingletons?: boolean;
  } = {}): any {
    const startedAt = Date.now();
    const tenantId = options.tenantId || 'default';
    const limit = Math.max(1, Math.min(Number(options.limit || 50), 500));
    const includeSingletons = options.includeSingletons === true;
    const minGroupSize = includeSingletons ? 1 : Math.max(2, Number(options.minGroupSize || 2));
    const canonicalFilter = options.canonicalKey ? this.normalizeEntityLookup(options.canonicalKey) : null;
    const rowCountsBefore = this.pass2DomainRowCounts(tenantId);

    const entityRows = this.db.prepare(`
      SELECT id, content, created_by, created_at, updated_at
      FROM shared_memory
      WHERE tenant_id = ? AND memory_type = 'entity'
      ORDER BY created_at ASC, id ASC
    `).all(tenantId) as any[];
    const observationRows = this.db.prepare(`
      SELECT id, content, created_by, created_at
      FROM shared_memory
      WHERE tenant_id = ? AND memory_type = 'observation'
      ORDER BY created_at ASC, id ASC
    `).all(tenantId) as any[];
    const relationRows = this.db.prepare(`
      SELECT id, content, created_by, created_at
      FROM shared_memory
      WHERE tenant_id = ? AND memory_type = 'relation'
      ORDER BY created_at ASC, id ASC
    `).all(tenantId) as any[];

    const observationsByCanonical = new Map<string, any[]>();
    for (const row of observationRows) {
      const content = this.safeJsonParse(row.content);
      const key = this.normalizeEntityLookup(content.entityName || '');
      if (!key) continue;
      if (!observationsByCanonical.has(key)) observationsByCanonical.set(key, []);
      observationsByCanonical.get(key)!.push({ row, content });
    }

    const relationEndpointCounts = new Map<string, number>();
    for (const row of relationRows) {
      const content = this.safeJsonParse(row.content);
      for (const endpoint of [content.from, content.to]) {
        const key = this.normalizeEntityLookup(endpoint || '');
        if (!key) continue;
        relationEndpointCounts.set(key, (relationEndpointCounts.get(key) || 0) + 1);
      }
    }

    const groupsByCanonical = new Map<string, any>();
    let parseErrors = 0;
    for (const row of entityRows) {
      const content = this.safeJsonParse(row.content);
      if (!content || Object.keys(content).length === 0) {
        parseErrors++;
        continue;
      }
      const rawName = typeof content.name === 'string' ? content.name : '';
      const canonicalKey = this.normalizeEntityLookup(rawName);
      if (!canonicalKey || (canonicalFilter && canonicalKey !== canonicalFilter)) continue;
      const entityType = String(content.entityType || content.type || 'unknown').trim() || 'unknown';
      const metadata = content.metadata && typeof content.metadata === 'object' ? content.metadata : {};
      const materialized = observationsByCanonical.get(canonicalKey) || [];
      const inlineObservations = Array.isArray(content.observations) ? content.observations : [];
      const firstMaterialized = materialized[0]?.content?.contents?.[0];
      const firstInline = inlineObservations.find((value: any) => typeof value === 'string');
      const evidence = {
        sourceRowId: row.id,
        rawName,
        canonicalKey,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        entityType,
        contentHash: MemoryManager.contentHash(row.content || ''),
        firstObservationExcerpt: this.excerpt(firstInline || firstMaterialized),
        observationCount: inlineObservations.length + materialized.length,
        relationEndpointCount: relationEndpointCounts.get(canonicalKey) || 0,
        metadataSource: typeof metadata.source === 'string' ? metadata.source : null,
        proposedAction: 'manual_review',
        proposedFacetType: 'project_identity',
        proposedFacetTitle: rawName || canonicalKey,
        warnings: [] as string[],
        content,
      };
      if (!groupsByCanonical.has(canonicalKey)) {
        groupsByCanonical.set(canonicalKey, { canonicalKey, rows: [] });
      }
      groupsByCanonical.get(canonicalKey).rows.push(evidence);
    }

    const allGroups = Array.from(groupsByCanonical.values());
    const candidateGroups = allGroups
      .filter((group) => canonicalFilter || group.rows.length >= minGroupSize)
      .sort((a, b) => b.rows.length - a.rows.length || a.canonicalKey.localeCompare(b.canonicalKey))
      .slice(0, limit)
      .map((group) => {
        const classification = this.classifyPass2Group(group);
        const proposedAction = classification.classification === 'facet_of_identity'
          ? 'facet_under_identity'
          : classification.classification === 'single_identity'
            ? 'preserve'
            : 'manual_review';
        const rows = group.rows.map((row: any) => {
          const { content, ...rest } = row;
          return {
            ...rest,
            proposedAction,
            warnings: [...row.warnings, ...classification.warnings],
          };
        });
        return {
          canonicalKey: group.canonicalKey,
          rowCount: group.rows.length,
          rawNames: Array.from(new Set(group.rows.map((row: any) => row.rawName).filter(Boolean))),
          entityTypes: Array.from(new Set(group.rows.map((row: any) => row.entityType))),
          createdBy: Array.from(new Set(group.rows.map((row: any) => row.createdBy))),
          classification: classification.classification,
          confidence: classification.confidence,
          proposedAction,
          signals: classification.signals,
          warnings: classification.warnings,
          proposedSplit: classification.proposedSplit,
          rows,
        };
      });

    const rowCountsAfter = this.pass2DomainRowCounts(tenantId);
    const domainTablesUnchanged = JSON.stringify(rowCountsBefore) === JSON.stringify(rowCountsAfter);
    const report = {
      schemaVersion: 'pass2.phaseA.dryRun.v1',
      phase: 'A',
      tool: 'inspect_identity_candidates',
      generatedAt: new Date().toISOString(),
      tenantId,
      options: {
        canonicalKey: canonicalFilter,
        limit,
        minGroupSize,
        includeSingletons,
      },
      summary: {
        totalEntityRows: entityRows.length,
        uniqueCanonicalKeys: allGroups.length,
        duplicateGroupCount: allGroups.filter((group) => group.rows.length >= 2).length,
        returnedGroupCount: candidateGroups.length,
        rowsInReturnedGroups: candidateGroups.reduce((sum, group) => sum + group.rowCount, 0),
        parseErrors,
      },
      mutationContract: {
        domainTablesUnchanged,
        permittedAuditOperation: 'pass2_dry_run',
        rowCountsBefore,
        rowCountsAfter,
      },
      groups: candidateGroups,
      durationMs: Date.now() - startedAt,
    };
    const canonicalHash = MemoryManager.canonicalDryRunHash(report);
    return {
      ...report,
      canonicalHash,
    };
  }

  public savePass2DryRunArtifact(report: any, artifactDir?: string): string {
    const dir = path.resolve(artifactDir || path.join(this.dbPath === ':memory:' ? process.cwd() : path.dirname(this.dbPath), 'pass2-dry-runs'));
    fs.mkdirSync(dir, { recursive: true });
    const tenant = String(report.tenantId || 'default').replace(/[^a-zA-Z0-9_-]+/g, '-');
    const hash = String(report.canonicalHash || MemoryManager.canonicalDryRunHash(report));
    const filePath = path.join(dir, `pass2-dry-run-${tenant}-${hash.slice(0, 16)}.json`);
    fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const savedHash = MemoryManager.canonicalDryRunHash(saved);
    if (savedHash !== hash) {
      fs.unlinkSync(filePath);
      throw new Error(`Saved Pass 2 dry-run artifact hash mismatch: expected ${hash}, got ${savedHash}`);
    }
    return filePath;
  }

  public recordPass2DryRunAudit(
    agentId: string,
    tenantId: string,
    canonicalHash: string,
    targetCount: number,
    reason: string,
    context: RequestContext
  ): { id: string; operation: string; contentHash: string } {
    const id = uuidv4();
    const actorId = context.userId || context.apiKeyId || agentId || 'system';
    this.db.prepare(
      `INSERT INTO neural_audit_log (id, operation, agent_id, entity_name, content_hash, flagged, flag_reason, tenant_id, actor_type, actor_id, target_count, reason)
       VALUES (?, 'pass2_dry_run', ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?)`
    ).run(
      id,
      agentId || actorId,
      'pass2_phase_a',
      canonicalHash,
      tenantId,
      context.authType,
      actorId,
      targetCount,
      reason
    );
    return { id, operation: 'pass2_dry_run', contentHash: canonicalHash };
  }

  private pass2RelationRegistry(): Record<string, { semanticRelationType: string; mappingConfidence: number }> {
    return {
      HAS_SUBSYSTEM: { semanticRelationType: 'has_part', mappingConfidence: 0.95 },
      PART_OF: { semanticRelationType: 'part_of', mappingConfidence: 1.00 },
      INTEGRATES_WITH: { semanticRelationType: 'related_to', mappingConfidence: 0.70 },
      DEPENDS_ON: { semanticRelationType: 'depends_on', mappingConfidence: 1.00 },
      BLOCKS_IMPLEMENTATION_OF: { semanticRelationType: 'blocks', mappingConfidence: 0.95 },
      REQUIRES_RESOLUTION_OF: { semanticRelationType: 'blocked_by', mappingConfidence: 0.95 },
      THREATENS_SUCCESS_OF: { semanticRelationType: 'risks', mappingConfidence: 0.85 },
      REFERENCES: { semanticRelationType: 'references', mappingConfidence: 1.00 },
      MENTIONS: { semanticRelationType: 'mentions', mappingConfidence: 0.85 },
      SUCCEEDED_BY: { semanticRelationType: 'succeeded_by', mappingConfidence: 1.00 },
      PREDECESSOR_OF: { semanticRelationType: 'predecessor_of', mappingConfidence: 1.00 },
      SUPERSEDES: { semanticRelationType: 'supersedes', mappingConfidence: 1.00 },
      SUPERSEDED_BY: { semanticRelationType: 'superseded_by', mappingConfidence: 1.00 },
    };
  }

  private mapPass2RelationType(sourceRelationType: any): any {
    const source = String(sourceRelationType || '').trim();
    const mapped = this.pass2RelationRegistry()[source.toUpperCase()];
    if (!mapped) {
      return {
        sourceRelationType: source || null,
        semanticRelationType: null,
        mappingConfidence: null,
        mappingSource: 'unmapped',
        registryVersion: '1',
      };
    }
    return {
      sourceRelationType: source,
      semanticRelationType: mapped.semanticRelationType,
      mappingConfidence: mapped.mappingConfidence,
      mappingSource: 'registry-v1',
      registryVersion: '1',
    };
  }

  private clampNumber(value: any, defaultValue: number, min: number, max: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return defaultValue;
    return Math.max(min, Math.min(Math.floor(parsed), max));
  }

  private parseSinceTimestamp(value: any): number | null {
    if (!value) return null;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private rowTimestampMs(row: any, content?: any): number {
    const candidates = [
      content?.metadata?.observedAt,
      content?.timestamp,
      row?.created_at,
      row?.updated_at,
    ];
    for (const candidate of candidates) {
      const parsed = Date.parse(String(candidate || ''));
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  private pass2ArtifactSearchDirs(): string[] {
    const dirs = new Set<string>();
    if (this.dbPath !== ':memory:') {
      dirs.add(path.join(path.dirname(this.dbPath), 'pass2-dry-runs'));
    }
    dirs.add(path.resolve('data/pass2-dry-runs'));
    dirs.add(path.resolve('pass2-dry-runs'));
    return Array.from(dirs);
  }

  private findPass2DryRunArtifactByHash(tenantId: string, hash: string): string | null {
    const hashPrefix = hash.slice(0, 16);
    const tenantSafe = tenantId.replace(/[^a-zA-Z0-9_-]+/g, '-');
    for (const dir of this.pass2ArtifactSearchDirs()) {
      if (!fs.existsSync(dir)) continue;
      const preferred = path.join(dir, `pass2-dry-run-${tenantSafe}-${hashPrefix}.json`);
      const candidates = fs.existsSync(preferred)
        ? [preferred]
        : fs.readdirSync(dir)
          .filter((file) => file.endsWith('.json') && file.includes(hashPrefix))
          .map((file) => path.join(dir, file));
      for (const candidate of candidates) {
        try {
          const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
          const savedHash = MemoryManager.canonicalDryRunHash(parsed);
          if (savedHash === hash && String(parsed.tenantId || 'default') === tenantId) {
            return candidate;
          }
        } catch {
          // Ignore unreadable or non dry-run JSON files.
        }
      }
    }
    return null;
  }

  private loadSignedPass2DryRunProjection(options: {
    tenantId: string;
    dryRunArtifactPath?: string;
    dryRunHash?: string;
  }): { report: any; canonicalHash: string; artifactPath: string; auditRow: any; groupsByCanonical: Map<string, any> } {
    const tenantId = options.tenantId || 'default';
    const expectedHash = options.dryRunHash ? String(options.dryRunHash) : null;
    let artifactPath = options.dryRunArtifactPath ? path.resolve(String(options.dryRunArtifactPath)) : '';
    let report: any | null = null;
    let artifactHash: string | null = null;

    if (artifactPath) {
      if (!fs.existsSync(artifactPath)) {
        throw new Error(`Pass 2 dry-run artifact not found: ${artifactPath}`);
      }
      report = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      const artifactTenantId = String(report.tenantId || 'default');
      if (artifactTenantId !== tenantId) {
        throw new Error(`Pass 2 dry-run artifact tenant mismatch: expected ${tenantId}, got ${artifactTenantId}`);
      }
      artifactHash = MemoryManager.canonicalDryRunHash(report);
      const embeddedHash = report.canonicalHash ? String(report.canonicalHash) : artifactHash;
      if (artifactHash !== embeddedHash) {
        throw new Error(`Pass 2 dry-run artifact embedded hash mismatch: expected ${embeddedHash}, got ${artifactHash}`);
      }
      if (expectedHash && artifactHash !== expectedHash) {
        throw new Error(`Pass 2 dry-run artifact hash mismatch: expected ${expectedHash}, got ${artifactHash}`);
      }
    }

    const auditHashToFind = expectedHash || artifactHash;
    let auditRow: any | undefined;

    if (auditHashToFind) {
      auditRow = this.db.prepare(`
        SELECT *
        FROM neural_audit_log
        WHERE tenant_id = ?
          AND operation = 'pass2_dry_run'
          AND content_hash = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(tenantId, auditHashToFind) as any;
    } else {
      auditRow = this.db.prepare(`
        SELECT *
        FROM neural_audit_log
        WHERE tenant_id = ?
          AND operation = 'pass2_dry_run'
        ORDER BY created_at DESC
        LIMIT 1
      `).get(tenantId) as any;
    }

    if (!auditRow) {
      throw new Error(auditHashToFind
        ? `Signed pass2_dry_run audit row not found for hash ${auditHashToFind}`
        : `Signed pass2_dry_run audit row not found for tenant ${tenantId}`);
    }

    const auditHash = String(auditRow.content_hash || '');
    if (!artifactPath) {
      const found = this.findPass2DryRunArtifactByHash(tenantId, auditHash);
      if (!found) {
        throw new Error(`Signed Pass 2 dry-run artifact not found for hash ${auditHash}`);
      }
      artifactPath = found;
    }

    if (!report) {
      report = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      const artifactTenantId = String(report.tenantId || 'default');
      if (artifactTenantId !== tenantId) {
        throw new Error(`Pass 2 dry-run artifact tenant mismatch: expected ${tenantId}, got ${artifactTenantId}`);
      }
    }

    const canonicalHash = MemoryManager.canonicalDryRunHash(report);
    const embeddedHash = report.canonicalHash ? String(report.canonicalHash) : canonicalHash;
    if (canonicalHash !== embeddedHash) {
      throw new Error(`Pass 2 dry-run artifact embedded hash mismatch: expected ${embeddedHash}, got ${canonicalHash}`);
    }
    if (canonicalHash !== auditHash) {
      throw new Error(`Pass 2 dry-run artifact is not signed by selected audit row: expected ${auditHash}, got ${canonicalHash}`);
    }
    if (expectedHash && canonicalHash !== expectedHash) {
      throw new Error(`Pass 2 dry-run artifact hash mismatch: expected ${expectedHash}, got ${canonicalHash}`);
    }

    const groupsByCanonical = new Map<string, any>();
    for (const group of Array.isArray(report.groups) ? report.groups : []) {
      if (group?.canonicalKey) groupsByCanonical.set(String(group.canonicalKey), group);
    }

    return { report, canonicalHash, artifactPath, auditRow, groupsByCanonical };
  }

  private pass2PhaseCWatchedCounts(tenantId: string): Record<string, number> {
    return {
      ...this.pass2DomainRowCounts(tenantId),
      neural_audit_log: this.countTableRows('neural_audit_log', tenantId),
    };
  }

  private pass2PhaseCGroupIsExecutable(group: any): {
    executable: boolean;
    reasons: string[];
    notes: string[];
    metadataSourceNullRowCount: number;
  } {
    const reasons: string[] = [];
    const notes: string[] = [];
    let metadataSourceNullRowCount = 0;
    if (String(group?.classification || '') !== 'facet_of_identity') {
      reasons.push('CLASSIFICATION_NOT_EXECUTABLE');
    }
    if (String(group?.proposedAction || '') !== 'facet_under_identity') {
      reasons.push('PROPOSED_ACTION_NOT_EXECUTABLE');
    }
    if (Array.isArray(group?.warnings) && group.warnings.length > 0) {
      reasons.push('GROUP_WARNINGS_REQUIRE_REVIEW');
    }
    const rows = Array.isArray(group?.rows) ? group.rows : [];
    if (rows.length === 0) {
      reasons.push('NO_ROW_EVIDENCE');
    }
    const mandatory = [
      'sourceRowId',
      'createdBy',
      'createdAt',
      'entityType',
      'contentHash',
      'firstObservationExcerpt',
      'observationCount',
      'relationEndpointCount',
      'metadataSource',
      'proposedAction',
    ];
    for (const row of rows) {
      for (const field of mandatory) {
        if (field === 'metadataSource') {
          if (!Object.prototype.hasOwnProperty.call(row || {}, field) || typeof row?.[field] === 'undefined' || row?.[field] === '') {
            reasons.push(`ROW_MISSING_${field.toUpperCase()}`);
          } else if (row?.[field] === null) {
            metadataSourceNullRowCount += 1;
            notes.push('PHASE_C_METADATA_SOURCE_NULL');
          }
          continue;
        }
        if (typeof row?.[field] === 'undefined' || row?.[field] === null || row?.[field] === '') {
          reasons.push(`ROW_MISSING_${field.toUpperCase()}`);
        }
      }
      if (String(row?.proposedAction || '') !== 'facet_under_identity') {
        reasons.push('ROW_ACTION_NOT_EXECUTABLE');
      }
      if (Array.isArray(row?.warnings) && row.warnings.length > 0) {
        reasons.push('ROW_WARNINGS_REQUIRE_REVIEW');
      }
    }
    return {
      executable: reasons.length === 0,
      reasons: Array.from(new Set(reasons)),
      notes: Array.from(new Set(notes)),
      metadataSourceNullRowCount,
    };
  }

  private pass2PhaseCLinkConfidence(keyKind: any, weight: any): number {
    const kind = String(keyKind || '').toLowerCase();
    if (['canonical_name', 'alias', 'entity_name'].includes(kind)) return 1.0;
    if (['metadata_applies_to', 'applies_to'].includes(kind)) return 0.85;
    if (kind === 'embedded_observation_handle') return 0.70;
    if (kind === 'agent_bootstrap_handle') return 0.65;
    if (kind === 'derived') return 0.50;
    const numericWeight = Number(weight);
    if (Number.isFinite(numericWeight)) {
      return Math.max(0.4, Math.min(0.85, Number((numericWeight / 100).toFixed(2))));
    }
    return 0.5;
  }

  private pass2PhaseCContentHash(value: any): string {
    return createHash('sha256').update(MemoryManager.stableStringify(value)).digest('hex');
  }

  private pass2PhaseCUlid(prefix: 'ident' | 'facet' | 'ilink'): string {
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let time = Date.now();
    let timePart = '';
    for (let i = 0; i < 10; i++) {
      timePart = alphabet[time % 32] + timePart;
      time = Math.floor(time / 32);
    }
    const bytes = randomBytes(16);
    let randomPart = '';
    for (let i = 0; i < 16; i++) {
      randomPart += alphabet[bytes[i] % 32];
    }
    return `${prefix}_${timePart}${randomPart}`;
  }

  private pass2PhaseCApprovalScopeHash(options: {
    tenantId: string;
    dryRunHash: string;
    canonicalKeys?: string[] | null;
  }): string {
    const canonicalKeys = options.canonicalKeys && options.canonicalKeys.length > 0
      ? options.canonicalKeys.map((key) => this.normalizeEntityLookup(String(key))).filter(Boolean).sort()
      : ['*'];
    return this.pass2PhaseCContentHash({
      tenantId: options.tenantId,
      dryRunHash: options.dryRunHash,
      canonicalKeys,
    });
  }

  private pass2PhaseCObservationById(tenantId: string, observationId: string): any | null {
    if (!observationId) return null;
    const row = this.db.prepare(`
      SELECT id, content, created_by, created_at, tenant_id, memory_type
      FROM shared_memory
      WHERE id = ? AND tenant_id = ? AND memory_type = 'observation'
      LIMIT 1
    `).get(observationId, tenantId) as any;
    if (!row) return null;
    const content = this.safeJsonParse(row.content);
    return {
      ...row,
      parsedContent: content,
      metadata: content?.metadata && typeof content.metadata === 'object' ? content.metadata : {},
    };
  }

  private pass2PhaseCTrustedList(envName: string, fallback: string[]): Set<string> {
    const configured = String(process.env[envName] || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return new Set(configured.length > 0 ? configured : fallback);
  }

  private pass2PhaseCEvidenceIdMap(envName: string): Record<string, string> {
    const raw = String(process.env[envName] || '');
    const entries: Record<string, string> = {};
    for (const part of raw.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const separator = trimmed.indexOf('=');
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (key && value) entries[key] = value;
    }
    return entries;
  }

  private pass2PhaseCFindRollbackRehearsalEvidence(tenantId: string, dryRunHash: string, expectedObservationId: string): any | null {
    if (!expectedObservationId) return null;
    const row = this.pass2PhaseCObservationById(tenantId, expectedObservationId);
    if (!row) return null;
    const metadata = row.metadata || {};
    if (
      metadata.kind === 'rollback_rehearsal_pass' &&
      metadata.phase === 'Phase C' &&
      metadata.dryRunHash === dryRunHash &&
      (metadata.rehearsalVerdict === 'PASS' || metadata.reviewVerdict === 'PASS')
    ) {
      return row;
    }
    return null;
  }

  private pass2PhaseCReviewerPasses(tenantId: string, dryRunHash: string, scopeHash: string | null, canonicalAllowlist?: Set<string> | null): {
    required: string[];
    found: Record<string, string>;
    missing: string[];
  } {
    const required = Array.from(this.pass2PhaseCTrustedList('PHASE_C_REQUIRED_REVIEWERS', ['codex', 'claude-code']));
    const trustedCreators = this.pass2PhaseCTrustedList('PHASE_C_TRUSTED_REVIEW_AGENTS', required);
    const pinnedIds = this.pass2PhaseCEvidenceIdMap('PHASE_C_REVIEWER_PASS_OBSERVATION_IDS');
    const requestedKeys = canonicalAllowlist ? Array.from(canonicalAllowlist).sort() : null;
    const found: Record<string, string> = {};

    for (const reviewer of required) {
      const pinnedId = pinnedIds[reviewer];
      if (!pinnedId) continue;
      const row = this.pass2PhaseCObservationById(tenantId, pinnedId);
      if (!row) continue;
      const metadata = row.metadata || {};
      if (!trustedCreators.has(String(row.created_by || ''))) continue;
      if (String(row.created_by || '') !== reviewer) continue;
      if (metadata.reviewer && String(metadata.reviewer) !== reviewer) continue;
      if (metadata.kind !== 'phase_c_reviewer_pass' || metadata.phase !== 'Phase C') continue;
      if (metadata.reviewVerdict !== 'PASS') continue;
      if (metadata.dryRunHash !== dryRunHash) continue;
      if (scopeHash && metadata.scopeHash && metadata.scopeHash !== scopeHash) continue;
      if (scopeHash && !metadata.scopeHash) {
        const approvedKeys = Array.isArray(metadata.canonicalKeys)
          ? metadata.canonicalKeys.map((key: any) => this.normalizeEntityLookup(String(key))).filter(Boolean).sort()
          : null;
        const fullScopeApproved = (!approvedKeys || approvedKeys.length === 0) && !requestedKeys;
        const exactKeysApproved = !!approvedKeys && !!requestedKeys && approvedKeys.join('\n') === requestedKeys.join('\n');
        if (!fullScopeApproved && !exactKeysApproved) continue;
      }
      found[reviewer] = row.id;
    }

    return {
      required,
      found,
      missing: required.filter((reviewer) => !found[reviewer]),
    };
  }

  private pass2PhaseCProductionGateStatus(args: any, tenantId: string, dryRunHash?: string, canonicalAllowlist?: Set<string> | null): {
    enabled: boolean;
    reasons: string[];
    approvalObservationId: string | null;
    rollbackRehearsalObservationId: string | null;
    reviewerPassObservationIds: Record<string, string>;
    requiredReviewers: string[];
    missingReviewers: string[];
    scopeHash: string | null;
  } {
    const reasons: string[] = [];
    const approvalObservationId = String(args.approvalObservationId || '');
    const canonicalKeys = canonicalAllowlist ? Array.from(canonicalAllowlist) : null;
    const scopeHash = dryRunHash ? this.pass2PhaseCApprovalScopeHash({ tenantId, dryRunHash, canonicalKeys }) : null;
    const operatorSwitch = String(process.env.PHASE_C_PRODUCTION_EXECUTE_ENABLED || '').toLowerCase();
    const operatorDryRunHash = String(process.env.PHASE_C_PRODUCTION_DRY_RUN_HASH || '');
    const operatorApprovalObservationId = String(process.env.PHASE_C_PRODUCTION_APPROVAL_OBSERVATION_ID || '');
    const operatorRollbackRehearsalObservationId = String(process.env.PHASE_C_ROLLBACK_REHEARSAL_OBSERVATION_ID || '');

    if (!dryRunHash) reasons.push('PHASE_C_DRY_RUN_HASH_REQUIRED');
    if (operatorSwitch !== 'true') reasons.push('PHASE_C_OPERATOR_SWITCH_NOT_ENABLED');
    if (!operatorDryRunHash) reasons.push('PHASE_C_OPERATOR_DRY_RUN_HASH_REQUIRED');
    if (dryRunHash && operatorDryRunHash && operatorDryRunHash !== dryRunHash) {
      reasons.push('PHASE_C_OPERATOR_DRY_RUN_HASH_MISMATCH');
    }
    if (!operatorApprovalObservationId) reasons.push('PHASE_C_OPERATOR_APPROVAL_OBSERVATION_ID_REQUIRED');
    if (approvalObservationId && operatorApprovalObservationId && approvalObservationId !== operatorApprovalObservationId) {
      reasons.push('PHASE_C_OPERATOR_APPROVAL_OBSERVATION_ID_MISMATCH');
    }
    if (!operatorRollbackRehearsalObservationId) reasons.push('PHASE_C_OPERATOR_ROLLBACK_REHEARSAL_OBSERVATION_ID_REQUIRED');
    if (!approvalObservationId) reasons.push('PHASE_C_FRESH_APPROVAL_OBSERVATION_REQUIRED');

    const approval = this.pass2PhaseCObservationById(tenantId, approvalObservationId);
    if (approvalObservationId && !approval) {
      reasons.push('PHASE_C_APPROVAL_OBSERVATION_NOT_FOUND');
    }

    if (approval) {
      const metadata = approval.metadata || {};
      const trustedApprovalAgents = this.pass2PhaseCTrustedList('PHASE_C_TRUSTED_APPROVAL_AGENTS', ['codex-desktop']);
      const trustedApprovers = this.pass2PhaseCTrustedList('PHASE_C_TRUSTED_APPROVERS', ['tommy', 'Tommy', 'TOMAS']);
      const createdMs = Date.parse(String(approval.created_at || ''));
      const maxAgeMs = 24 * 60 * 60 * 1000;
      if (!trustedApprovalAgents.has(String(approval.created_by || ''))) {
        reasons.push('PHASE_C_APPROVAL_OBSERVATION_UNTRUSTED_CREATOR');
      }
      if (!trustedApprovers.has(String(metadata.approvedBy || ''))) {
        reasons.push('PHASE_C_APPROVAL_UNTRUSTED_APPROVER');
      }
      if (!Number.isFinite(createdMs) || Date.now() - createdMs > maxAgeMs) {
        reasons.push('PHASE_C_APPROVAL_OBSERVATION_NOT_FRESH');
      }
      if (metadata.kind !== 'production_execute_approval' || metadata.phase !== 'Phase C') {
        reasons.push('PHASE_C_APPROVAL_OBSERVATION_WRONG_KIND');
      }
      if (metadata.productionExecuteApproved !== true) {
        reasons.push('PHASE_C_PRODUCTION_APPROVAL_NOT_TRUE');
      }
      if (metadata.action !== 'execute_pass2_phase_c') {
        reasons.push('PHASE_C_APPROVAL_ACTION_MISMATCH');
      }
      if (dryRunHash && metadata.dryRunHash !== dryRunHash) {
        reasons.push('PHASE_C_APPROVAL_DRY_RUN_HASH_MISMATCH');
      }
      if (scopeHash && metadata.scopeHash && metadata.scopeHash !== scopeHash) {
        reasons.push('PHASE_C_APPROVAL_SCOPE_HASH_MISMATCH');
      }
      if (scopeHash && !metadata.scopeHash) {
        const approvedKeys = Array.isArray(metadata.canonicalKeys)
          ? metadata.canonicalKeys.map((key: any) => this.normalizeEntityLookup(String(key))).filter(Boolean).sort()
          : null;
        const requestedKeys = canonicalKeys ? [...canonicalKeys].sort() : null;
        const fullScopeApproved = (!approvedKeys || approvedKeys.length === 0) && !requestedKeys;
        const exactKeysApproved = !!approvedKeys && !!requestedKeys && approvedKeys.join('\n') === requestedKeys.join('\n');
        if (!fullScopeApproved && !exactKeysApproved) {
          reasons.push('PHASE_C_APPROVAL_SCOPE_MISMATCH');
        }
      }
    }

    const rehearsal = dryRunHash ? this.pass2PhaseCFindRollbackRehearsalEvidence(tenantId, dryRunHash, operatorRollbackRehearsalObservationId) : null;
    if (!rehearsal) {
      reasons.push('PHASE_C_ROLLBACK_REHEARSAL_EVIDENCE_REQUIRED');
    }
    const reviewerPasses = dryRunHash ? this.pass2PhaseCReviewerPasses(tenantId, dryRunHash, scopeHash, canonicalAllowlist) : { required: [], found: {}, missing: [] };
    if (reviewerPasses.missing.length > 0) {
      reasons.push('PHASE_C_REVIEWER_PASS_REQUIRED');
    }

    return {
      enabled: reasons.length === 0,
      reasons,
      approvalObservationId: approvalObservationId || null,
      rollbackRehearsalObservationId: rehearsal?.id || null,
      reviewerPassObservationIds: reviewerPasses.found,
      requiredReviewers: reviewerPasses.required,
      missingReviewers: reviewerPasses.missing,
      scopeHash,
    };
  }

  private pass2PhaseCWriteContext(args: any, tenantId?: string, dryRunHash?: string, canonicalAllowlist?: Set<string> | null): 'test' | 'rehearsal' | 'production' | null {
    if (this.dbPath === ':memory:') return 'test';
    const mode = String(args.executionMode || args.mode || '').toLowerCase();
    const resolvedDb = path.resolve(this.dbPath || '');
    if (mode === 'rehearsal' && !resolvedDb.endsWith('unified-platform.db')) {
      return 'rehearsal';
    }
    if (mode === 'production' && resolvedDb.endsWith('unified-platform.db')) {
      const gate = this.pass2PhaseCProductionGateStatus(args, tenantId || 'default', dryRunHash, canonicalAllowlist);
      if (gate.enabled) return 'production';
    }
    return null;
  }

  private insertPass2PhaseCAuditRow(options: {
    operation: 'pass2_phase_c' | 'pass2_rollback';
    tenantId: string;
    entityName: string;
    contentHash: string;
    targetCount: number;
    reason: string;
    actorId?: string;
  }): string {
    const id = uuidv4();
    const actorId = options.actorId || 'phase_c_tooling';
    this.db.prepare(
      `INSERT INTO neural_audit_log (id, operation, agent_id, entity_name, content_hash, flagged, flag_reason, tenant_id, actor_type, actor_id, target_count, reason)
       VALUES (?, ?, ?, ?, ?, 0, NULL, ?, 'migration', ?, ?, ?)`
    ).run(
      id,
      options.operation,
      actorId,
      options.entityName,
      options.contentHash,
      options.tenantId,
      actorId,
      options.targetCount,
      options.reason
    );
    return id;
  }

  private pass2PhaseCGroupEntityType(group: any): string {
    return String(group.entityTypes?.[0] || group.rows?.[0]?.entityType || 'unknown') || 'unknown';
  }

  private pass2PhaseCGroupSourceRowIds(group: any): string[] {
    return (Array.isArray(group.rows) ? group.rows : [])
      .map((row: any) => String(row.sourceRowId || ''))
      .filter(Boolean);
  }

  private pass2PhaseCFindOwnerAudit(tenantId: string, dryRunHash: string, canonicalKey: string): any | null {
    return this.db.prepare(`
      SELECT *
      FROM neural_audit_log
      WHERE tenant_id = ?
        AND operation = 'pass2_phase_c'
        AND entity_name = ?
        AND content_hash = ?
        AND reason LIKE 'Phase C owner:%'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).get(tenantId, canonicalKey, dryRunHash) as any || null;
  }

  private pass2PhaseCExpectedLinkRows(group: any, graphRowsBySource: Map<string, any[]>): any[] {
    const links: any[] = [];
    for (const row of Array.isArray(group.rows) ? group.rows : []) {
      const sourceRowId = String(row.sourceRowId || '');
      for (const link of graphRowsBySource.get(sourceRowId) || []) {
        links.push(link);
      }
    }
    return links;
  }

  private pass2PhaseCGroupCompletion(options: {
    tenantId: string;
    group: any;
    graphRowsBySource: Map<string, any[]>;
    ownerAuditId?: string | null;
  }): { complete: boolean; activeIdentity: any | null; facetCount: number; linkCount: number; expectedFacetCount: number; expectedLinkCount: number; mismatch: boolean } {
    const { tenantId, group, graphRowsBySource, ownerAuditId } = options;
    const canonicalKey = String(group.canonicalKey || '');
    const entityType = this.pass2PhaseCGroupEntityType(group);
    const activeIdentity = this.db.prepare(`
      SELECT *
      FROM entity_identities
      WHERE tenant_id = ? AND canonical_key = ? AND entity_type = ? AND status = 'active'
      LIMIT 1
    `).get(tenantId, canonicalKey, entityType) as any || null;

    const expectedFacetRows = Array.isArray(group.rows) ? group.rows : [];
    const expectedLinks = this.pass2PhaseCExpectedLinkRows(group, graphRowsBySource);
    if (!activeIdentity) {
      const orphanOwner = ownerAuditId ? this.db.prepare(`
        SELECT COUNT(*) as cnt
        FROM neural_audit_log
        WHERE tenant_id = ? AND id = ? AND operation = 'pass2_phase_c'
      `).get(tenantId, ownerAuditId) as any : null;
      return {
        complete: false,
        activeIdentity: null,
        facetCount: 0,
        linkCount: 0,
        expectedFacetCount: expectedFacetRows.length,
        expectedLinkCount: expectedLinks.length,
        mismatch: !!orphanOwner?.cnt,
      };
    }

    const ownerMismatch = !!ownerAuditId && activeIdentity.source_audit_id !== ownerAuditId;
    let facetCount = 0;
    let facetMismatch = false;
    for (const row of expectedFacetRows) {
      const facet = this.db.prepare(`
        SELECT source_audit_id
        FROM entity_context_facets
        WHERE tenant_id = ? AND source_row_id = ? AND content_hash = ? AND status = 'active'
        LIMIT 1
      `).get(tenantId, String(row.sourceRowId || ''), String(row.contentHash || '')) as any;
      if (facet) {
        facetCount += 1;
        if (ownerAuditId && facet.source_audit_id !== ownerAuditId) facetMismatch = true;
      }
    }

    let linkCount = 0;
    let linkMismatch = false;
    for (const link of expectedLinks) {
      const activeLink = this.db.prepare(`
        SELECT source_audit_id
        FROM entity_lookup_identity_links
        WHERE tenant_id = ?
          AND lookup_key = ?
          AND memory_type = ?
          AND memory_id = ?
          AND identity_id = ?
          AND status = 'active'
        LIMIT 1
      `).get(tenantId, link.lookup_key, link.memory_type, link.memory_id, activeIdentity.identity_id) as any;
      if (activeLink) {
        linkCount += 1;
        if (ownerAuditId && activeLink.source_audit_id !== ownerAuditId) linkMismatch = true;
      }
    }

    return {
      complete: !ownerMismatch && !facetMismatch && !linkMismatch && facetCount === expectedFacetRows.length && linkCount === expectedLinks.length,
      activeIdentity,
      facetCount,
      linkCount,
      expectedFacetCount: expectedFacetRows.length,
      expectedLinkCount: expectedLinks.length,
      mismatch: ownerMismatch || facetMismatch || linkMismatch,
    };
  }

  private pass2PhaseCAssertNoPriorMismatch(options: {
    tenantId: string;
    group: any;
    graphRowsBySource: Map<string, any[]>;
    ownerAudit: any | null;
    dryRunHash: string;
  }): { noop: boolean; ownerAuditId?: string; activeIdentity?: any } {
    const { tenantId, group, graphRowsBySource, ownerAudit, dryRunHash } = options;
    const canonicalKey = String(group.canonicalKey || '');
    const completion = this.pass2PhaseCGroupCompletion({
      tenantId,
      group,
      graphRowsBySource,
      ownerAuditId: ownerAudit?.id || null,
    });
    if (ownerAudit) {
      if (completion.complete) return { noop: true, ownerAuditId: ownerAudit.id, activeIdentity: completion.activeIdentity };
      throw new Error(`PHASE_C_PARTIAL_OR_MISMATCHED_PRIOR_ATTEMPT: ${canonicalKey}`);
    }
    if (completion.activeIdentity || completion.facetCount > 0 || completion.linkCount > 0) {
      throw new Error(`PHASE_C_PARTIAL_OR_MISMATCHED_PRIOR_ATTEMPT: ${canonicalKey}`);
    }
    const orphanOwner = this.pass2PhaseCFindOwnerAudit(tenantId, dryRunHash, canonicalKey);
    if (orphanOwner) {
      throw new Error(`PHASE_C_PARTIAL_OR_MISMATCHED_PRIOR_ATTEMPT: ${canonicalKey}`);
    }
    return { noop: false };
  }

  private executePass2PhaseCWrites(options: {
    args: any;
    tenantId: string;
    projection: any;
    planResult: any;
    executableGroups: any[];
    graphRowsBySource: Map<string, any[]>;
    canonicalAllowlist?: Set<string> | null;
  }): any {
    const { args, tenantId, projection, planResult, executableGroups, graphRowsBySource, canonicalAllowlist } = options;
    const writeContext = this.pass2PhaseCWriteContext(args, tenantId, projection.canonicalHash, canonicalAllowlist || null);
    if (!writeContext) {
      throw new Error('PHASE_C_PRODUCTION_EXECUTE_NOT_ENABLED: execute requires a non-production test/rehearsal context, fresh approvalObservationId for the exact dryRunHash/scope, rollback rehearsal evidence, reviewer PASS, and explicit Tommy production execute approval.');
    }
    if (!projection.canonicalHash) {
      throw new Error('PHASE_C_DRY_RUN_HASH_REQUIRED');
    }
    if (executableGroups.length === 0) {
      throw new Error('PHASE_C_NO_EXECUTABLE_GROUPS');
    }

    const before = this.pass2PhaseCWatchedCounts(tenantId);
    const actorId = String(args.actorId || args.deactivatedBy || 'phase_c_tooling');
    const groupResults: any[] = [];
    const transaction = this.db.transaction(() => {
      for (const group of executableGroups) {
        const canonicalKey = String(group.canonicalKey || '');
        const entityType = this.pass2PhaseCGroupEntityType(group);
        const ownerAudit = this.pass2PhaseCFindOwnerAudit(tenantId, projection.canonicalHash, canonicalKey);
        const prior = this.pass2PhaseCAssertNoPriorMismatch({
          tenantId,
          group,
          graphRowsBySource,
          ownerAudit,
          dryRunHash: projection.canonicalHash,
        });
        if (prior.noop) {
          groupResults.push({
            canonicalKey,
            status: 'verified_noop',
            ownerAuditId: prior.ownerAuditId,
            identityId: prior.activeIdentity?.identity_id || null,
          });
          continue;
        }

        const sourceRowIds = this.pass2PhaseCGroupSourceRowIds(group);
        const sourceRows = this.pass2FetchEntityRows(tenantId, sourceRowIds);
        const sourceContentById = new Map(sourceRows.map((row: any) => [row.id, this.safeJsonParse(row.content)]));
        const graphLinks = this.pass2PhaseCExpectedLinkRows(group, graphRowsBySource);
        const targetCount = 1 + group.rows.length + graphLinks.length;
        const ownerAuditId = this.insertPass2PhaseCAuditRow({
          operation: 'pass2_phase_c',
          tenantId,
          entityName: canonicalKey,
          contentHash: projection.canonicalHash,
          targetCount,
          reason: `Phase C owner: ${canonicalKey} dryRunHash=${projection.canonicalHash}`,
          actorId,
        });

        const identityId = this.pass2PhaseCUlid('ident');
        const displayName = group.rawNames?.[0] || group.rows?.[0]?.rawName || canonicalKey;
        const lifecycle = this.findPass2LifecycleAssertion(tenantId, canonicalKey);
        const now = new Date().toISOString();
        const identityMetadata = {
          dryRunHash: projection.canonicalHash,
          ownerAuditId,
          sourceRowIds,
          notes: planResult.executableGroups.find((item: any) => item.canonicalKey === canonicalKey)?.notes || [],
        };
        this.db.prepare(`
          INSERT INTO entity_identities (
            identity_id, tenant_id, display_name, canonical_key, entity_type,
            lifecycle_status, status, resolution_status, confidence,
            source_audit_id, created_by, created_at, updated_at, last_verified_at, metadata_json
          )
          VALUES (?, ?, ?, ?, ?, ?, 'active', 'inferred', ?, ?, 'pass2_phase_c', ?, ?, ?, ?)
        `).run(
          identityId,
          tenantId,
          displayName,
          canonicalKey,
          entityType,
          lifecycle.status,
          group.confidence ?? null,
          ownerAuditId,
          now,
          now,
          now,
          JSON.stringify(identityMetadata)
        );
        const identityHash = this.pass2PhaseCContentHash({
          table: 'entity_identities',
          identityId,
          tenantId,
          canonicalKey,
          entityType,
          dryRunHash: projection.canonicalHash,
        });
        this.insertPass2PhaseCAuditRow({
          operation: 'pass2_phase_c',
          tenantId,
          entityName: canonicalKey,
          contentHash: identityHash,
          targetCount: 1,
          reason: `Phase C row: identity ownerAuditId=${ownerAuditId}`,
          actorId,
        });

        let facetCount = 0;
        for (const row of group.rows) {
          const sourceRowId = String(row.sourceRowId || '');
          const sourceContent = sourceContentById.get(sourceRowId) || {};
          const facetId = this.pass2PhaseCUlid('facet');
          const contentJson = {
            sourceRowId,
            sourceContent,
            rowEvidence: row,
            migration: { dryRunHash: projection.canonicalHash, ownerAuditId },
          };
          this.db.prepare(`
            INSERT INTO entity_context_facets (
              facet_id, tenant_id, identity_id, source_row_id, facet_type, title,
              content_hash, content_json, confidence, status, source_audit_id, provenance_json, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
          `).run(
            facetId,
            tenantId,
            identityId,
            sourceRowId,
            row.proposedFacetType || 'project_identity',
            row.proposedFacetTitle || row.rawName || canonicalKey,
            String(row.contentHash || ''),
            JSON.stringify(contentJson),
            group.confidence ?? null,
            ownerAuditId,
            JSON.stringify({ dryRunHash: projection.canonicalHash, ownerAuditId }),
            now
          );
          facetCount += 1;
          this.insertPass2PhaseCAuditRow({
            operation: 'pass2_phase_c',
            tenantId,
            entityName: canonicalKey,
            contentHash: String(row.contentHash || this.pass2PhaseCContentHash(contentJson)),
            targetCount: 1,
            reason: `Phase C row: facet ownerAuditId=${ownerAuditId} facetId=${facetId}`,
            actorId,
          });
        }

        let linkCount = 0;
        for (const link of graphLinks) {
          const linkId = this.pass2PhaseCUlid('ilink');
          const linkConfidence = this.pass2PhaseCLinkConfidence(link.key_kind, link.weight);
          this.db.prepare(`
            INSERT INTO entity_lookup_identity_links (
              link_id, tenant_id, lookup_key, memory_type, memory_id, key_kind,
              identity_id, resolution_status, confidence, status, source_audit_id,
              created_by, created_at, updated_at, last_verified_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'resolved', ?, 'active', ?, 'pass2_phase_c', ?, ?, ?)
          `).run(
            linkId,
            tenantId,
            link.lookup_key,
            link.memory_type,
            link.memory_id,
            link.key_kind,
            identityId,
            linkConfidence,
            ownerAuditId,
            now,
            now,
            now
          );
          linkCount += 1;
          const linkHash = this.pass2PhaseCContentHash({
            lookupKey: link.lookup_key,
            memoryType: link.memory_type,
            memoryId: link.memory_id,
            identityId,
          });
          this.insertPass2PhaseCAuditRow({
            operation: 'pass2_phase_c',
            tenantId,
            entityName: canonicalKey,
            contentHash: linkHash,
            targetCount: 1,
            reason: `Phase C row: link ownerAuditId=${ownerAuditId} linkId=${linkId}`,
            actorId,
          });
        }

        groupResults.push({
          canonicalKey,
          status: 'executed',
          ownerAuditId,
          identityId,
          facetsWritten: facetCount,
          linksWritten: linkCount,
          auditRowsWritten: 1 + 1 + facetCount + linkCount,
        });
      }
    });
    transaction();
    const after = this.pass2PhaseCWatchedCounts(tenantId);
    const wroteGroups = groupResults.filter((group) => group.status === 'executed');
    const noopGroups = groupResults.filter((group) => group.status === 'verified_noop');
    return {
      schemaVersion: 'pass2.phaseC.execute.v1',
      phase: 'C',
      action: 'execute',
      status: wroteGroups.length === 0 ? 'verified_noop' : 'executed',
      writeContext,
      tenantId,
      dryRunHash: projection.canonicalHash,
      productionExecuteEnabled: writeContext === 'production',
      productionGate: this.pass2PhaseCProductionGateStatus(args, tenantId, projection.canonicalHash, canonicalAllowlist || null),
      executedGroups: wroteGroups.length,
      noopGroups: noopGroups.length,
      groups: groupResults,
      rowCountsBefore: before,
      rowCountsAfter: after,
      watchedTableDeltas: Object.fromEntries(Object.keys(after).map((key) => [key, after[key] - (before[key] || 0)])),
    };
  }

  private verifyPass2PhaseCExecution(options: {
    args: any;
    tenantId: string;
    projection: any;
    executableGroups: any[];
    graphRowsBySource: Map<string, any[]>;
    canonicalAllowlist?: Set<string> | null;
  }): any {
    const { args, tenantId, projection, executableGroups, graphRowsBySource, canonicalAllowlist } = options;
    const productionGate = this.pass2PhaseCProductionGateStatus(args, tenantId, projection.canonicalHash, canonicalAllowlist || null);
    const groups = executableGroups.map((group) => {
      const canonicalKey = String(group.canonicalKey || '');
      const ownerAudit = this.pass2PhaseCFindOwnerAudit(tenantId, projection.canonicalHash, canonicalKey);
      const completion = this.pass2PhaseCGroupCompletion({
        tenantId,
        group,
        graphRowsBySource,
        ownerAuditId: ownerAudit?.id || null,
      });
      return {
        canonicalKey,
        ownerAuditId: ownerAudit?.id || null,
        verified: !!ownerAudit && completion.complete,
        identityId: completion.activeIdentity?.identity_id || null,
        facetCount: completion.facetCount,
        expectedFacetCount: completion.expectedFacetCount,
        linkCount: completion.linkCount,
        expectedLinkCount: completion.expectedLinkCount,
        mismatch: completion.mismatch,
      };
    });
    return {
      schemaVersion: 'pass2.phaseC.verify.v1',
      phase: 'C',
      action: 'verify',
      status: groups.every((group) => group.verified) ? 'verified' : 'not_verified',
      tenantId,
      dryRunHash: projection.canonicalHash,
      productionExecuteEnabled: productionGate.enabled,
      productionGate,
      groups,
    };
  }

  private rollbackPass2PhaseC(args: any = {}): any {
    const tenantId = String(args.tenantId || 'default');
    const writeContext = this.pass2PhaseCWriteContext(args);
    if (!writeContext) {
      throw new Error('PHASE_C_PRODUCTION_ROLLBACK_NOT_ENABLED: rollback requires a non-production test/rehearsal context. Production rollback is a manual SQL runbook operation; see docs/PLAN-Pass-2.0-Phase-C-Identity-Facet-Link-Writes.md.');
    }
    const rollbackOwnerAuditId = String(args.rollbackOwnerAuditId || '');
    if (!rollbackOwnerAuditId) {
      throw new Error('PHASE_C_ROLLBACK_OWNER_AUDIT_ID_REQUIRED');
    }
    const owner = this.db.prepare(`
      SELECT *
      FROM neural_audit_log
      WHERE tenant_id = ? AND id = ? AND operation = 'pass2_phase_c'
      LIMIT 1
    `).get(tenantId, rollbackOwnerAuditId) as any;
    if (!owner) {
      throw new Error(`PHASE_C_OWNER_AUDIT_NOT_FOUND: ${rollbackOwnerAuditId}`);
    }

    const before = this.pass2PhaseCWatchedCounts(tenantId);
    const actorId = String(args.deactivatedBy || args.actorId || 'phase_c_tooling');
    const now = new Date().toISOString();
    const transaction = this.db.transaction(() => {
      const identities = this.db.prepare(`
        SELECT identity_id
        FROM entity_identities
        WHERE tenant_id = ? AND source_audit_id = ? AND status = 'active'
      `).all(tenantId, rollbackOwnerAuditId) as any[];
      const identityIds = identities.map((row) => row.identity_id);
      const identityUpdate = this.db.prepare(`
        UPDATE entity_identities
        SET status = 'deactivated', deactivated_at = ?, deactivated_by = ?, updated_at = ?
        WHERE tenant_id = ? AND source_audit_id = ? AND status = 'active'
      `).run(now, actorId, now, tenantId, rollbackOwnerAuditId);

      let facetChanges = 0;
      let linkChanges = 0;
      let cascadedFromIdentityCount = 0;
      const facetByOwner = this.db.prepare(`
        UPDATE entity_context_facets
        SET status = 'deactivated', deactivated_at = ?, deactivated_by = ?
        WHERE tenant_id = ? AND source_audit_id = ? AND status = 'active'
      `).run(now, actorId, tenantId, rollbackOwnerAuditId);
      facetChanges += facetByOwner.changes || 0;
      const linkByOwner = this.db.prepare(`
        UPDATE entity_lookup_identity_links
        SET status = 'deactivated', deactivated_at = ?, deactivated_by = ?, updated_at = ?
        WHERE tenant_id = ? AND source_audit_id = ? AND status = 'active'
      `).run(now, actorId, now, tenantId, rollbackOwnerAuditId);
      linkChanges += linkByOwner.changes || 0;

      if (identityIds.length > 0) {
        const placeholders = identityIds.map(() => '?').join(',');
        const facetByIdentity = this.db.prepare(`
          UPDATE entity_context_facets
          SET status = 'deactivated', deactivated_at = ?, deactivated_by = ?
          WHERE tenant_id = ? AND identity_id IN (${placeholders}) AND status = 'active'
        `).run(now, actorId, tenantId, ...identityIds);
        facetChanges += facetByIdentity.changes || 0;
        cascadedFromIdentityCount += facetByIdentity.changes || 0;
        const linkByIdentity = this.db.prepare(`
          UPDATE entity_lookup_identity_links
          SET status = 'deactivated', deactivated_at = ?, deactivated_by = ?, updated_at = ?
          WHERE tenant_id = ? AND identity_id IN (${placeholders}) AND status = 'active'
        `).run(now, actorId, now, tenantId, ...identityIds);
        linkChanges += linkByIdentity.changes || 0;
        cascadedFromIdentityCount += linkByIdentity.changes || 0;
      }

      const targetCount = (identityUpdate.changes || 0) + facetChanges + linkChanges;
      const rollbackAuditId = this.insertPass2PhaseCAuditRow({
        operation: 'pass2_rollback',
        tenantId,
        entityName: owner.entity_name || 'pass2_phase_c',
        contentHash: this.pass2PhaseCContentHash({ rollbackOwnerAuditId, targetCount, now }),
        targetCount,
        reason: `Rollback of pass2_phase_c ownerAuditId=${rollbackOwnerAuditId}`,
        actorId,
      });
      return {
        rollbackAuditId,
        identitiesDeactivated: identityUpdate.changes || 0,
        facetsDeactivated: facetChanges,
        linksDeactivated: linkChanges,
        cascadedFromIdentityCount,
        targetCount,
        identityIds,
      };
    });
    const result = transaction();
    const after = this.pass2PhaseCWatchedCounts(tenantId);
    return {
      schemaVersion: 'pass2.phaseC.rollback.v1',
      phase: 'C',
      action: 'rollback',
      status: 'rolled_back',
      writeContext,
      tenantId,
      rollbackOwnerAuditId,
      ...result,
      rowCountsBefore: before,
      rowCountsAfter: after,
      watchedTableDeltas: Object.fromEntries(Object.keys(after).map((key) => [key, after[key] - (before[key] || 0)])),
    };
  }

  public executePass2PhaseC(args: any = {}): any {
    const action = String(args.action || 'plan');
    const tenantId = String(args.tenantId || 'default');
    const dryRunHash = args.dryRunHash ? String(args.dryRunHash) : undefined;
    const canonicalAllowlist: Set<string> | null = Array.isArray(args.canonicalKeys) && args.canonicalKeys.length > 0
      ? new Set<string>(args.canonicalKeys.map((key: any) => this.normalizeEntityLookup(String(key))).filter(Boolean))
      : null;

    if (!['plan', 'execute', 'rollback', 'verify'].includes(action)) {
      throw new Error(`Invalid Phase C action: ${action}`);
    }
    if (action === 'rollback') {
      return this.rollbackPass2PhaseC({ ...args, tenantId });
    }

    const rowCountsBefore = this.pass2PhaseCWatchedCounts(tenantId);
    const projection = this.loadSignedPass2DryRunProjection({
      tenantId,
      dryRunArtifactPath: args.dryRunArtifactPath,
      dryRunHash,
    });

    const report = projection.report;
    if (!report?.summary || !Array.isArray(report.groups)) {
      throw new Error('Phase C dry-run artifact is missing summary or groups');
    }

    const allGroups = (Array.isArray(report.groups) ? report.groups : [])
      .filter((group: any) => !canonicalAllowlist || canonicalAllowlist.has(String(group.canonicalKey || '')));

    const executableGroups: any[] = [];
    const skippedGroups: any[] = [];
    const sourceRowIssues: any[] = [];
    let expectedFacetRows = 0;
    let expectedLinkRows = 0;
    let existingActiveIdentities = 0;
    let existingActiveFacets = 0;
    let existingActiveLinks = 0;
    let wouldWriteIdentities = 0;
    let wouldWriteFacets = 0;
    let wouldWriteLinks = 0;
    let wouldWriteAuditRows = 0;

    const identityCache = new Map<string, any>();
    const graphRowsBySource = new Map<string, any[]>();
    const eligibilityByCanonical = new Map<string, ReturnType<MemoryManager['pass2PhaseCGroupIsExecutable']>>();

    for (const group of allGroups) {
      const canonicalKey = String(group.canonicalKey || '');
      const eligibility = this.pass2PhaseCGroupIsExecutable(group);
      eligibilityByCanonical.set(canonicalKey, eligibility);
      const rows = Array.isArray(group.rows) ? group.rows : [];
      const groupSourceRowIssues: any[] = [];

      for (const row of rows) {
        const sourceRowId = String(row.sourceRowId || '');
        if (!sourceRowId) continue;
        const source = this.db.prepare(`
          SELECT id, content
          FROM shared_memory
          WHERE tenant_id = ? AND id = ? AND memory_type = 'entity'
          LIMIT 1
        `).get(tenantId, sourceRowId) as any;
        if (!source) {
          const issue = { canonicalKey, sourceRowId, issue: 'SOURCE_ROW_NOT_FOUND' };
          sourceRowIssues.push(issue);
          groupSourceRowIssues.push(issue);
          continue;
        }
        const liveHash = MemoryManager.contentHash(source.content || '');
        if (liveHash !== String(row.contentHash || '')) {
          const issue = {
            canonicalKey,
            sourceRowId,
            issue: 'SOURCE_ROW_HASH_DRIFT',
            expected: row.contentHash,
            actual: liveHash,
          };
          sourceRowIssues.push(issue);
          groupSourceRowIssues.push(issue);
        }
        const graphRows = this.db.prepare(`
          SELECT lookup_key, memory_type, memory_id, key_kind, weight
          FROM graph_lookup_keys
          WHERE tenant_id = ? AND memory_id = ?
          ORDER BY weight DESC, lookup_key ASC
        `).all(tenantId, sourceRowId) as any[];
        graphRowsBySource.set(sourceRowId, graphRows);
      }

      if (!eligibility.executable) {
        skippedGroups.push({
          canonicalKey,
          rowCount: rows.length,
          classification: group.classification || null,
          proposedAction: group.proposedAction || null,
          reasons: eligibility.reasons,
          notes: eligibility.notes,
          metadataSourceNullRowCount: eligibility.metadataSourceNullRowCount,
        });
        continue;
      }
      if (groupSourceRowIssues.length > 0) {
        skippedGroups.push({
          canonicalKey,
          rowCount: rows.length,
          classification: group.classification || null,
          proposedAction: group.proposedAction || null,
          reasons: ['SOURCE_ROW_VALIDATION_FAILED'],
          notes: eligibility.notes,
          metadataSourceNullRowCount: eligibility.metadataSourceNullRowCount,
          issues: groupSourceRowIssues,
        });
        continue;
      }
      executableGroups.push(group);
    }

    if (sourceRowIssues.length > 0) {
      skippedGroups.push({
        canonicalKey: '*',
        rowCount: sourceRowIssues.length,
        reasons: ['SOURCE_ROW_VALIDATION_FAILED'],
        issues: sourceRowIssues,
      });
    }

    for (const group of executableGroups) {
      const canonicalKey = String(group.canonicalKey || '');
      const entityType = String(group.entityTypes?.[0] || group.rows?.[0]?.entityType || 'unknown') || 'unknown';
      const identityKey = `${canonicalKey}\u0000${entityType}`;
      let activeIdentity = identityCache.get(identityKey);
      if (typeof activeIdentity === 'undefined') {
        activeIdentity = this.db.prepare(`
          SELECT *
          FROM entity_identities
          WHERE tenant_id = ? AND canonical_key = ? AND entity_type = ? AND status = 'active'
          LIMIT 1
        `).get(tenantId, canonicalKey, entityType) as any || null;
        identityCache.set(identityKey, activeIdentity);
      }
      if (activeIdentity) {
        existingActiveIdentities += 1;
      } else {
        wouldWriteIdentities += 1;
      }

      const syntheticIdentityId = activeIdentity?.identity_id || `planned:${canonicalKey}:${entityType}`;
      expectedFacetRows += group.rows.length;
      for (const row of group.rows) {
        const sourceRowId = String(row.sourceRowId || '');
        const contentHash = String(row.contentHash || '');
        const activeFacet = this.db.prepare(`
          SELECT facet_id
          FROM entity_context_facets
          WHERE tenant_id = ? AND source_row_id = ? AND content_hash = ? AND status = 'active'
          LIMIT 1
        `).get(tenantId, sourceRowId, contentHash) as any;
        if (activeFacet) existingActiveFacets += 1;
        else wouldWriteFacets += 1;

        const graphRows = graphRowsBySource.get(sourceRowId) || [];
        expectedLinkRows += graphRows.length;
        for (const link of graphRows) {
          const activeLink = activeIdentity ? this.db.prepare(`
            SELECT link_id
            FROM entity_lookup_identity_links
            WHERE tenant_id = ?
              AND lookup_key = ?
              AND memory_type = ?
              AND memory_id = ?
              AND identity_id = ?
              AND status = 'active'
            LIMIT 1
          `).get(tenantId, link.lookup_key, link.memory_type, link.memory_id, activeIdentity.identity_id) as any : null;
          if (activeLink) existingActiveLinks += 1;
          else wouldWriteLinks += 1;
          this.pass2PhaseCLinkConfidence(link.key_kind, link.weight);
        }
      }

      const groupRowHashes = group.rows.map((row: any) => row.contentHash).filter(Boolean);
      this.pass2PhaseCContentHash({
        tenantId,
        canonicalKey,
        entityType,
        identityId: syntheticIdentityId,
        dryRunHash: projection.canonicalHash,
        rowHashes: groupRowHashes,
      });
    }

    if (wouldWriteIdentities + wouldWriteFacets + wouldWriteLinks > 0) {
      wouldWriteAuditRows = executableGroups.length + wouldWriteIdentities + wouldWriteFacets + wouldWriteLinks;
    }

    const rowCountsAfter = this.pass2PhaseCWatchedCounts(tenantId);
    const productionGate = this.pass2PhaseCProductionGateStatus(args, tenantId, projection.canonicalHash, canonicalAllowlist);
    const planResult = {
      schemaVersion: 'pass2.phaseC.plan.v1',
      phase: 'C',
      action: 'plan',
      status: sourceRowIssues.length > 0 ? 'source_row_validation_failed' : (executableGroups.length > 0 ? 'ready_for_plan_review' : 'no_executable_groups'),
      tenantId,
      dryRunHash: projection.canonicalHash,
      dryRunArtifactPath: projection.artifactPath,
      dryRunAuditId: projection.auditRow.id,
      productionExecuteEnabled: productionGate.enabled,
      productionGate,
      gates: {
        executeImplemented: true,
        productionExecuteAuthorized: productionGate.enabled,
        requiresFreshExecuteApproval: !productionGate.enabled,
        requiresRollbackRehearsal: args.requireRollbackRehearsal === false ? false : !productionGate.rollbackRehearsalObservationId,
        requiresReviewerPassOnLivePlan: true,
      },
      summary: {
        artifactGroups: allGroups.length,
        executableGroups: executableGroups.length,
        skippedGroups: skippedGroups.length,
        expectedIdentityRows: executableGroups.length,
        expectedFacetRows,
        expectedLinkRows,
        existingActiveIdentities,
        existingActiveFacets,
        existingActiveLinks,
      },
      wouldWrite: {
        identities: wouldWriteIdentities,
        facets: wouldWriteFacets,
        links: wouldWriteLinks,
        auditRows: wouldWriteAuditRows,
        sharedMemory: 0,
        graphLookupKeys: 0,
        sqliteVecTables: 0,
        deletes: 0,
      },
      executableGroups: executableGroups.map((group: any) => ({
        canonicalKey: group.canonicalKey,
        rowCount: group.rows.length,
        classification: group.classification,
        proposedAction: group.proposedAction,
        confidence: group.confidence ?? null,
        notes: eligibilityByCanonical.get(String(group.canonicalKey || ''))?.notes || [],
        metadataSourceNullRowCount: eligibilityByCanonical.get(String(group.canonicalKey || ''))?.metadataSourceNullRowCount || 0,
        sourceRowIds: group.rows.map((row: any) => row.sourceRowId),
        graphLookupTupleCount: group.rows.reduce((sum: number, row: any) => sum + (graphRowsBySource.get(String(row.sourceRowId || '')) || []).length, 0),
      })),
      skippedGroups,
      sourceRowIssues,
      rowCountsBefore,
      rowCountsAfter,
      rowCountsUnchanged: JSON.stringify(rowCountsBefore) === JSON.stringify(rowCountsAfter),
    };
    if (action === 'plan') {
      return planResult;
    }
    if (sourceRowIssues.length > 0) {
      throw new Error(`PHASE_C_SOURCE_ROW_VALIDATION_FAILED: ${sourceRowIssues.map((issue) => `${issue.canonicalKey}:${issue.sourceRowId}:${issue.issue}`).join(', ')}`);
    }
    if (action === 'verify') {
      return this.verifyPass2PhaseCExecution({
        args,
        tenantId,
        projection,
        executableGroups,
        graphRowsBySource,
        canonicalAllowlist,
      });
    }
    return this.executePass2PhaseCWrites({
      args,
      tenantId,
      projection,
      planResult,
      executableGroups,
      graphRowsBySource,
      canonicalAllowlist,
    });
  }

  private pass2ProjectedIdentityIsConfident(group: any): boolean {
    if (!group) return false;
    const classification = String(group.classification || '');
    const proposedAction = String(group.proposedAction || '');
    const warnings = Array.isArray(group.warnings) ? group.warnings : [];
    const allowed = (
      (classification === 'facet_of_identity' && proposedAction === 'facet_under_identity') ||
      (classification === 'single_identity' && proposedAction === 'preserve')
    );
    return allowed && warnings.length === 0;
  }

  private pass2ProjectionCandidates(group: any): any[] {
    if (!group) return [];
    return (Array.isArray(group.rows) ? group.rows : []).map((row: any) => ({
      identityId: null,
      displayName: row.rawName || group.canonicalKey,
      canonicalEntityKey: group.canonicalKey,
      entityType: row.entityType || 'unknown',
      lifecycleStatus: 'unknown',
      status: null,
      confidence: group.confidence ?? null,
      reason: `${group.classification || 'unknown'}:${group.proposedAction || 'manual_review'}`,
      sourceRowId: row.sourceRowId,
      warnings: Array.from(new Set([...(Array.isArray(group.warnings) ? group.warnings : []), ...(Array.isArray(row.warnings) ? row.warnings : [])])),
    }));
  }

  private findPass2LifecycleAssertion(tenantId: string, canonicalKey: string): { status: string; source: string; rowId: string | null } {
    const rows = this.db.prepare(`
      SELECT id, content, created_at
      FROM shared_memory
      WHERE tenant_id = ? AND memory_type = 'observation'
      ORDER BY created_at DESC, id DESC
    `).all(tenantId) as any[];

    for (const row of rows) {
      const content = this.safeJsonParse(row.content);
      const metadata = content.metadata && typeof content.metadata === 'object' ? content.metadata : {};
      if (metadata.kind !== 'lifecycle-assertion' && content.kind !== 'lifecycle-assertion') continue;
      const targets = [
        content.entityName,
        ...(Array.isArray(content.appliesTo) ? content.appliesTo : []),
        ...(Array.isArray(metadata.appliesTo) ? metadata.appliesTo : []),
      ];
      if (!targets.some((target) => this.normalizeEntityLookup(String(target || '')) === canonicalKey)) continue;
      const status = metadata.lifecycleStatus || metadata.status || content.lifecycleStatus || content.status;
      if (typeof status === 'string' && status.trim()) {
        return { status: status.trim(), source: 'lifecycle-assertion', rowId: row.id };
      }
    }

    return { status: 'unknown', source: 'none', rowId: null };
  }

  private pass2FetchEntityRows(tenantId: string, sourceRowIds: string[]): any[] {
    if (sourceRowIds.length === 0) return [];
    const placeholders = sourceRowIds.map(() => '?').join(',');
    return this.db.prepare(`
      SELECT id, content, created_by, created_at, updated_at
      FROM shared_memory
      WHERE tenant_id = ?
        AND memory_type = 'entity'
        AND id IN (${placeholders})
      ORDER BY created_at ASC, id ASC
    `).all(tenantId, ...sourceRowIds) as any[];
  }

  private pass2ObservationItems(options: {
    tenantId: string;
    canonicalKey: string;
    entityRows: any[];
    includeLegacyEmbedded: boolean;
    observationKindFilter: string[] | null;
    sinceMs: number | null;
  }): { items: any[]; embeddedInlineObservations: number; materializedObservations: number; deduped: number } {
    const kindFilter = options.observationKindFilter && options.observationKindFilter.length > 0
      ? new Set(options.observationKindFilter.map((kind) => String(kind)))
      : null;
    const items: any[] = [];
    const seenHashes = new Set<string>();
    let embeddedInlineObservations = 0;
    let materializedObservations = 0;
    let deduped = 0;

    for (const row of options.entityRows) {
      const content = this.safeJsonParse(row.content);
      const inline = Array.isArray(content.observations) ? content.observations : [];
      embeddedInlineObservations += inline.filter((value: any) => typeof value === 'string' && value.trim()).length;
      if (!options.includeLegacyEmbedded) continue;
      for (let index = 0; index < inline.length; index++) {
        const value = inline[index];
        if (typeof value !== 'string' || !value.trim()) continue;
        const hash = MemoryManager.contentHash(value);
        if (seenHashes.has(hash)) {
          deduped++;
          continue;
        }
        seenHashes.add(hash);
        const timestamp = row.created_at;
        const recordedMs = Date.parse(String(row.created_at || ''));
        if (options.sinceMs !== null && (!Number.isFinite(recordedMs) || recordedMs < options.sinceMs)) continue;
        items.push({
          id: null,
          sourceRowId: row.id,
          content: value,
          kind: 'legacy-embedded',
          timestamp,
          recordedAt: row.created_at,
          contentHash: hash,
          source: 'legacy_entity_observations',
        });
      }
    }

    const rows = this.db.prepare(`
      SELECT id, content, created_by, created_at, updated_at
      FROM shared_memory
      WHERE tenant_id = ? AND memory_type = 'observation'
      ORDER BY created_at DESC, id DESC
    `).all(options.tenantId) as any[];

    for (const row of rows) {
      const content = this.safeJsonParse(row.content);
      const targets = [
        content.entityName,
        ...(Array.isArray(content.appliesTo) ? content.appliesTo : []),
        ...(Array.isArray(content.metadata?.appliesTo) ? content.metadata.appliesTo : []),
      ];
      if (!targets.some((target) => this.normalizeEntityLookup(String(target || '')) === options.canonicalKey)) continue;
      const recordedMs = Date.parse(String(row.created_at || ''));
      if (options.sinceMs !== null && (!Number.isFinite(recordedMs) || recordedMs < options.sinceMs)) continue;

      const metadata = content.metadata && typeof content.metadata === 'object' ? content.metadata : {};
      const kind = metadata.kind || content.kind || 'fact';
      if (kindFilter && !kindFilter.has(String(kind))) continue;

      const values = Array.isArray(content.contents) ? content.contents : [content.content].filter(Boolean);
      for (let index = 0; index < values.length; index++) {
        const value = values[index];
        if (typeof value !== 'string' || !value.trim()) continue;
        const valueHash = MemoryManager.contentHash(value);
        const dedupeKey = valueHash;
        const hash = values.length === 1 && metadata.contentHash ? metadata.contentHash : valueHash;
        if (seenHashes.has(dedupeKey)) {
          deduped++;
          continue;
        }
        seenHashes.add(dedupeKey);
        materializedObservations++;
        items.push({
          id: row.id,
          sourceRowId: row.id,
          content: value,
          kind,
          principleName: metadata.principle_name || metadata.principleName || null,
          addedBy: content.addedBy || row.created_by,
          timestamp: metadata.observedAt || content.timestamp || row.created_at,
          recordedAt: row.created_at,
          contentHash: hash,
          source: metadata.source || 'add_observations',
          metadata,
        });
      }
    }

    items.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    return { items, embeddedInlineObservations, materializedObservations, deduped };
  }

  private pass2RelationItems(options: {
    tenantId: string;
    canonicalKey: string;
    sourceNames: string[];
    relationTypeFilter: string[] | null;
    sinceMs: number | null;
  }): any[] {
    const sourceKeys = new Set([
      options.canonicalKey,
      ...options.sourceNames.map((name) => this.normalizeEntityLookup(name)).filter(Boolean),
    ]);
    const filter = options.relationTypeFilter && options.relationTypeFilter.length > 0
      ? new Set(options.relationTypeFilter.map((value) => String(value).toLowerCase()))
      : null;
    const rows = this.db.prepare(`
      SELECT id, content, created_by, created_at, updated_at
      FROM shared_memory
      WHERE tenant_id = ? AND memory_type = 'relation'
      ORDER BY created_at DESC, id DESC
    `).all(options.tenantId) as any[];

    const items: any[] = [];
    for (const row of rows) {
      const content = this.safeJsonParse(row.content);
      const recordedMs = Date.parse(String(row.created_at || ''));
      if (options.sinceMs !== null && (!Number.isFinite(recordedMs) || recordedMs < options.sinceMs)) continue;
      const fromKey = this.normalizeEntityLookup(content.from || '');
      const toKey = this.normalizeEntityLookup(content.to || '');
      if (!sourceKeys.has(fromKey) && !sourceKeys.has(toKey)) continue;

      const mapped = this.mapPass2RelationType(content.relationType || content.type);
      if (filter) {
        const source = String(mapped.sourceRelationType || '').toLowerCase();
        const semantic = String(mapped.semanticRelationType || '').toLowerCase();
        if (!filter.has(source) && !filter.has(semantic)) continue;
      }

      items.push({
        edgeId: null,
        sourceRowId: row.id,
        fromIdentityId: null,
        toIdentityId: null,
        unresolvedFromName: content.from || null,
        unresolvedToName: content.to || null,
        fromResolutionStatus: 'unresolved',
        toResolutionStatus: 'unresolved',
        ...mapped,
        properties: content.properties || {},
        createdAt: row.created_at,
      });
    }
    return items;
  }

  private pass2PersistedContextForQuery(options: {
    tenantId: string;
    query: string;
    baseResponse: any;
    wantsIdentity: boolean;
    wantsObservations: boolean;
    wantsRelations: boolean;
    wantsFacets: boolean;
    wantsLegacyBootstrap: boolean;
    includeLegacyEmbedded: boolean;
    includeLegacyRowCounts: boolean;
    observationKindFilter: string[] | null;
    relationTypeFilter: string[] | null;
    sinceMs: number | null;
    observationLimit: number;
    observationOffset: number;
    relationLimit: number;
    relationOffset: number;
    facetLimit: number;
    facetOffset: number;
    maxTokens: number;
  }): any | null {
    const variants = this.entityQueryVariants(options.query).filter(Boolean);
    if (variants.length === 0) return null;
    const placeholders = variants.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT DISTINCT ei.*, il.confidence AS link_confidence, il.lookup_key AS matched_lookup_key
      FROM graph_lookup_keys gl
      JOIN entity_lookup_identity_links il
        ON il.tenant_id = gl.tenant_id
       AND il.lookup_key = gl.lookup_key
       AND il.memory_type = gl.memory_type
       AND il.memory_id = gl.memory_id
      JOIN entity_identities ei
        ON ei.tenant_id = il.tenant_id
       AND ei.identity_id = il.identity_id
      WHERE gl.tenant_id = ?
        AND gl.lookup_key IN (${placeholders})
        AND gl.memory_type = 'entity'
        AND gl.memory_id = il.memory_id
        AND il.status = 'active'
        AND il.resolution_status = 'resolved'
        AND il.confidence >= 0.85
        AND ei.status = 'active'
      ORDER BY il.confidence DESC, ei.created_at ASC, ei.identity_id ASC
    `).all(options.tenantId, ...variants) as any[];
    const identityRows = Array.from(new Map(rows.map((row: any) => [row.identity_id, row])).values());
    if (identityRows.length === 0) return null;

    const response = options.baseResponse;
    response.phase = 'C';
    response.provenance.appliedDryRunReportHash = null;
    response.provenance.dryRunArtifactPath = null;
    response.resolution.matchedAlias = this.normalizeEntityLookup(options.query) || null;
    response.resolution.aliasType = 'canonical_name';
    response.resolution.aliasConfidence = rows[0]?.link_confidence ?? null;

    if (identityRows.length > 1) {
      response.resolved = false;
      response.resolution.warnings.push('AMBIGUOUS_LOOKUP');
      response.warnings.push('AMBIGUOUS_LOOKUP');
      response.resolution.candidates = identityRows.map((row: any) => ({
        identityId: row.identity_id,
        displayName: row.display_name,
        canonicalEntityKey: row.canonical_key,
        entityType: row.entity_type,
        lifecycleStatus: row.lifecycle_status,
        status: row.status,
        confidence: row.confidence,
        reason: 'phase_c_persisted_candidate',
      }));
      response.tokenBudget.estimatedTokens = Math.ceil(JSON.stringify(response).length / 4);
      return response;
    }

    const identity = identityRows[0] as any;
    const facetRows = this.db.prepare(`
      SELECT *
      FROM entity_context_facets
      WHERE tenant_id = ? AND identity_id = ? AND status = 'active'
      ORDER BY created_at ASC, facet_id ASC
    `).all(options.tenantId, identity.identity_id) as any[];
    const sourceRowIds = Array.from(new Set(facetRows.map((row: any) => String(row.source_row_id || '')).filter(Boolean)));
    const entityRows = this.pass2FetchEntityRows(options.tenantId, sourceRowIds);
    const sourceContents = entityRows.map((row) => this.safeJsonParse(row.content));
    const aliases = Array.from(new Set(sourceContents.flatMap((content) => Array.isArray(content.aliases) ? content.aliases : [])));
    const agentBootstrap = Array.from(new Set(sourceContents.flatMap((content) => Array.isArray(content.agentBootstrap) ? content.agentBootstrap : [])));

    response.resolved = true;
    response.resolution.matchedIdentityIds = [identity.identity_id];
    response.resolution.proposedIdentity = null;
    if (options.wantsIdentity) {
      response.identity = {
        id: identity.identity_id,
        displayName: identity.display_name || identity.canonical_key,
        canonicalEntityKey: identity.canonical_key,
        entityType: identity.entity_type || 'unknown',
        lifecycleStatus: identity.lifecycle_status || 'unknown',
        lifecycleSource: 'entity_identities',
        status: identity.status || 'active',
        aliases,
        agentBootstrap,
      };
    }
    if (options.wantsLegacyBootstrap) {
      response.legacyBootstrap = agentBootstrap;
    }
    response.provenance.sourceRows = sourceRowIds;
    response.provenance.phaseC = {
      identityId: identity.identity_id,
      sourceAuditId: identity.source_audit_id || null,
    };

    let observations: any = {
      items: [],
      embeddedInlineObservations: 0,
      materializedObservations: 0,
      deduped: 0,
    };
    if (options.wantsObservations) {
      observations = this.pass2ObservationItems({
        tenantId: options.tenantId,
        canonicalKey: identity.canonical_key,
        entityRows,
        includeLegacyEmbedded: options.includeLegacyEmbedded,
        observationKindFilter: options.observationKindFilter,
        sinceMs: options.sinceMs,
      });
      const observationSlice = observations.items.slice(options.observationOffset, options.observationOffset + options.observationLimit);
      response.observations = {
        items: observationSlice,
        hasMore: options.observationOffset + observationSlice.length < observations.items.length,
        nextOffset: options.observationOffset + observationSlice.length < observations.items.length
          ? options.observationOffset + observationSlice.length
          : null,
      };
      response.provenance.dedupedRedundantRepresentations = observations.deduped;
    }

    let relations: any[] = [];
    if (options.wantsRelations) {
      relations = this.pass2RelationItems({
        tenantId: options.tenantId,
        canonicalKey: identity.canonical_key,
        sourceNames: sourceContents.map((content) => content.name).filter(Boolean),
        relationTypeFilter: options.relationTypeFilter,
        sinceMs: options.sinceMs,
      }).map((relation) => ({
        ...relation,
        fromIdentityId: this.normalizeEntityLookup(relation.unresolvedFromName || '') === identity.canonical_key ? identity.identity_id : relation.fromIdentityId,
        toIdentityId: this.normalizeEntityLookup(relation.unresolvedToName || '') === identity.canonical_key ? identity.identity_id : relation.toIdentityId,
      }));
      const relationSlice = relations.slice(options.relationOffset, options.relationOffset + options.relationLimit);
      response.relations = {
        items: relationSlice,
        hasMore: options.relationOffset + relationSlice.length < relations.length,
        nextOffset: options.relationOffset + relationSlice.length < relations.length ? options.relationOffset + relationSlice.length : null,
      };
    }

    if (options.wantsFacets) {
      const facetItems = facetRows.map((row: any) => ({
        facetId: row.facet_id,
        sourceRowId: row.source_row_id,
        facetType: row.facet_type,
        title: row.title,
        contentHash: row.content_hash,
        confidence: row.confidence,
        sourceAuditId: row.source_audit_id,
        content: this.safeJsonParse(row.content_json),
        provenance: this.safeJsonParse(row.provenance_json),
        createdAt: row.created_at,
      }));
      const facetSlice = facetItems.slice(options.facetOffset, options.facetOffset + options.facetLimit);
      response.facets = {
        items: facetSlice,
        hasMore: options.facetOffset + facetSlice.length < facetItems.length,
        nextOffset: options.facetOffset + facetSlice.length < facetItems.length ? options.facetOffset + facetSlice.length : null,
      };
    }

    if (options.includeLegacyRowCounts) {
      response.legacyRowCounts = {
        entityRows: entityRows.length,
        embeddedInlineObservations: observations.embeddedInlineObservations,
        materializedObservations: observations.materializedObservations,
        legacyRelationRows: relations.length,
      };
    }

    const estimate = Math.ceil(JSON.stringify(response).length / 4);
    response.tokenBudget.estimatedTokens = estimate;
    if (estimate > options.maxTokens) {
      response.tokenBudget.truncatedSections.push('token_budget_estimate_exceeded');
      response.warnings.push('TOKEN_BUDGET_ESTIMATE_EXCEEDED');
    }
    return response;
  }

  public getEntityContext(args: any = {}): any {
    const tenantId = String(args.tenantId || 'default');
    const query = typeof args.query === 'string' ? args.query : '';
    const identityId = typeof args.identityId === 'string' ? args.identityId.trim() : '';
    if (!query && !identityId) {
      throw new Error('get_entity_context requires `query` or `identityId`');
    }

    const observationLimit = this.clampNumber(args.observationLimit, 25, 0, 100);
    const observationOffset = this.clampNumber(args.observationOffset, 0, 0, Number.MAX_SAFE_INTEGER);
    const relationLimit = this.clampNumber(args.relationLimit, 25, 0, 100);
    const relationOffset = this.clampNumber(args.relationOffset, 0, 0, Number.MAX_SAFE_INTEGER);
    const maxTokens = this.clampNumber(args.maxTokens, 8000, 500, 50000);
    const sinceMs = this.parseSinceTimestamp(args.since);
    const includeLegacyEmbedded = args.includeLegacyEmbedded === true;
    const includeFacets = args.includeFacets !== false;
    const includeCandidates = args.includeCandidates !== false;
    const includeLegacyRowCounts = args.includeLegacyRowCounts !== false;
    const observationKindFilter = Array.isArray(args.observationKindFilter) ? args.observationKindFilter.map(String) : null;
    const relationTypeFilter = Array.isArray(args.relationTypeFilter) ? args.relationTypeFilter.map(String) : null;
    const allowedSections = new Set<string>(['identity', 'observations', 'relations', 'facets', 'legacyBootstrap']);
    const selectedSections = new Set<string>(
      Array.isArray(args.sections) && args.sections.length > 0
        ? args.sections.map((section: any) => String(section))
        : ['identity', 'observations', 'relations', 'facets', 'legacyBootstrap']
    );
    for (const section of selectedSections) {
      if (!allowedSections.has(section)) {
        throw new Error(`Invalid get_entity_context section: ${section}`);
      }
    }
    const wantsIdentity = selectedSections.has('identity');
    const wantsObservations = selectedSections.has('observations');
    const wantsRelations = selectedSections.has('relations');
    const wantsFacets = selectedSections.has('facets');
    const wantsLegacyBootstrap = selectedSections.has('legacyBootstrap');
    const excludeLifecycleStatus = Array.isArray(args.excludeLifecycleStatus)
      ? new Set(args.excludeLifecycleStatus.map((value: any) => String(value)))
      : null;

    const baseResponse: any = {
      schemaVersion: 'pass2.entityContext.v1',
      phase: 'B',
      query,
      tenantId,
      resolved: false,
      resolution: {
        matchedAlias: null,
        aliasType: null,
        aliasConfidence: null,
        matchedIdentityIds: [] as string[],
        candidates: [] as any[],
        lifecycleExcluded: [] as any[],
        warnings: [] as string[],
        proposedIdentity: null as any,
      },
      identity: {
        id: null,
        displayName: null as string | null,
        canonicalEntityKey: null as string | null,
        entityType: null as string | null,
        lifecycleStatus: 'unknown',
        lifecycleSource: 'none',
        status: null,
        aliases: [] as string[],
        agentBootstrap: [] as string[],
      },
      observations: { items: [] as any[], hasMore: false, nextOffset: null as number | null },
      relations: { items: [] as any[], hasMore: false, nextOffset: null as number | null },
      facets: { items: [] as any[], hasMore: false, nextOffset: null as number | null },
      legacyBootstrap: [] as string[],
      legacyRowCounts: null as any,
      warnings: [] as string[],
      provenance: {
        schemaVersion: '2.0-draft',
        queryTimestamp: new Date().toISOString(),
        dedupedRedundantRepresentations: 0,
        sourceRows: [] as string[],
        appliedDryRunReportHash: null as string | null,
        dryRunArtifactPath: null as string | null,
        dryRunProjection: null as any,
      },
      tokenBudget: { maxTokens, estimatedTokens: 0, truncatedSections: [] as string[] },
    };

    if (identityId) {
      if (!this.tableExists('entity_identities')) {
        baseResponse.resolution.warnings.push('PHASE_B_NO_PERSISTED_IDENTITY');
        baseResponse.warnings.push('PHASE_B_NO_PERSISTED_IDENTITY');
        baseResponse.tokenBudget.estimatedTokens = Math.ceil(JSON.stringify(baseResponse).length / 4);
        return baseResponse;
      }
      const row = this.db.prepare(`
        SELECT *
        FROM entity_identities
        WHERE tenant_id = ? AND identity_id = ? AND status = 'active'
        LIMIT 1
      `).get(tenantId, identityId) as any;
      if (!row) {
        baseResponse.resolution.warnings.push('PHASE_B_NO_PERSISTED_IDENTITY');
        baseResponse.warnings.push('PHASE_B_NO_PERSISTED_IDENTITY');
        baseResponse.tokenBudget.estimatedTokens = Math.ceil(JSON.stringify(baseResponse).length / 4);
        return baseResponse;
      }
      baseResponse.phase = 'C';
      baseResponse.resolved = true;
      baseResponse.resolution.matchedIdentityIds = [identityId];
      baseResponse.identity = {
        id: identityId,
        displayName: row.display_name || row.canonical_key,
        canonicalEntityKey: row.canonical_key,
        entityType: row.entity_type || 'unknown',
        lifecycleStatus: row.lifecycle_status || 'unknown',
        lifecycleSource: row.lifecycle_source || 'entity_identities',
        status: row.status || 'active',
        aliases: this.safeJsonParse(row.aliases_json || '[]'),
        agentBootstrap: [],
      };
      baseResponse.tokenBudget.estimatedTokens = Math.ceil(JSON.stringify(baseResponse).length / 4);
      return baseResponse;
    }

    const persistedContext = this.pass2PersistedContextForQuery({
      tenantId,
      query,
      baseResponse,
      wantsIdentity,
      wantsObservations,
      wantsRelations,
      wantsFacets,
      wantsLegacyBootstrap,
      includeLegacyEmbedded,
      includeLegacyRowCounts,
      observationKindFilter,
      relationTypeFilter,
      sinceMs,
      observationLimit,
      observationOffset,
      relationLimit,
      relationOffset,
      facetLimit: this.clampNumber(args.facetLimit, 25, 0, 100),
      facetOffset: this.clampNumber(args.facetOffset, 0, 0, Number.MAX_SAFE_INTEGER),
      maxTokens,
    });
    if (persistedContext) {
      return persistedContext;
    }

    const projection = this.loadSignedPass2DryRunProjection({
      tenantId,
      dryRunArtifactPath: args.dryRunArtifactPath,
      dryRunHash: args.dryRunHash,
    });
    baseResponse.provenance.appliedDryRunReportHash = projection.canonicalHash;
    baseResponse.provenance.dryRunArtifactPath = projection.artifactPath;

    const queryVariants = this.entityQueryVariants(query);
    const indexedEntityRows = this.findRowsByLookupIndexValues(queryVariants, tenantId, ['entity']);
    const matchedRows = indexedEntityRows.usedIndex
      ? indexedEntityRows.rows.filter((row: any) => {
          const kinds = this.rowLookupKinds(row);
          return kinds.has('canonical_name') || kinds.has('alias');
        })
      : this.findEntitiesByNameOrAlias(query, tenantId);
    const candidateKeys = new Set<string>(queryVariants);
    for (const row of matchedRows) {
      const content = this.safeJsonParse(row.content);
      candidateKeys.add(this.normalizeEntityLookup(content.name || ''));
    }

    const candidateGroups = Array.from(new Map(Array.from(candidateKeys)
      .map((key) => projection.groupsByCanonical.get(key))
      .filter(Boolean)
      .map((group: any) => [group.canonicalKey, group])).values());

    let selectedGroup = candidateGroups.length === 1 ? candidateGroups[0] : null;
    if (!selectedGroup && projection.groupsByCanonical.has(this.normalizeEntityLookup(query))) {
      selectedGroup = projection.groupsByCanonical.get(this.normalizeEntityLookup(query));
    }

    if (!selectedGroup) {
      baseResponse.resolution.matchedAlias = this.normalizeEntityLookup(query) || null;
      baseResponse.resolution.aliasType = 'canonical_name';
      baseResponse.resolution.aliasConfidence = matchedRows.length > 0 ? 0.7 : null;
      if (includeCandidates) {
        baseResponse.resolution.candidates = candidateGroups.flatMap((group) => this.pass2ProjectionCandidates(group));
      }
      if (matchedRows.length > 0 && candidateGroups.length === 0) {
        baseResponse.resolution.warnings.push('EXACT_LOOKUP_PROJECTION_MISMATCH');
      }
      baseResponse.resolution.warnings.push(candidateGroups.length > 1 ? 'AMBIGUOUS_LOOKUP' : 'NO_PROJECTION_MATCH');
      baseResponse.warnings.push(...baseResponse.resolution.warnings);
      baseResponse.tokenBudget.estimatedTokens = Math.ceil(JSON.stringify(baseResponse).length / 4);
      return baseResponse;
    }

    const sourceRowIds = (Array.isArray(selectedGroup.rows) ? selectedGroup.rows : [])
      .map((row: any) => String(row.sourceRowId || ''))
      .filter(Boolean);
    const entityRows = this.pass2FetchEntityRows(tenantId, sourceRowIds);
    const sourceContents = entityRows.map((row) => this.safeJsonParse(row.content));
    const displayName = selectedGroup.rawNames?.[0] || sourceContents[0]?.name || selectedGroup.canonicalKey;
    const entityType = selectedGroup.entityTypes?.[0] || sourceContents[0]?.entityType || sourceContents[0]?.type || 'unknown';
    const aliases = Array.from(new Set(sourceContents.flatMap((content) => Array.isArray(content.aliases) ? content.aliases : [])));
    const agentBootstrap = Array.from(new Set(sourceContents.flatMap((content) => Array.isArray(content.agentBootstrap) ? content.agentBootstrap : [])));
    const lifecycle = this.findPass2LifecycleAssertion(tenantId, selectedGroup.canonicalKey);
    const candidate = {
      identityId: null,
      displayName,
      canonicalEntityKey: selectedGroup.canonicalKey,
      entityType,
      lifecycleStatus: lifecycle.status,
      status: null,
      confidence: selectedGroup.confidence ?? null,
      reason: `${selectedGroup.classification || 'unknown'}:${selectedGroup.proposedAction || 'manual_review'}`,
      sourceRowIds,
    };

    if (excludeLifecycleStatus && excludeLifecycleStatus.has(lifecycle.status)) {
      baseResponse.resolution.lifecycleExcluded.push(candidate);
      baseResponse.resolution.warnings.push('LIFECYCLE_EXCLUDED_CANDIDATES');
      baseResponse.warnings.push('LIFECYCLE_EXCLUDED_CANDIDATES');
      baseResponse.tokenBudget.estimatedTokens = Math.ceil(JSON.stringify(baseResponse).length / 4);
      return baseResponse;
    }

    const confident = this.pass2ProjectedIdentityIsConfident(selectedGroup);
    baseResponse.resolved = false;
    baseResponse.resolution.matchedAlias = this.normalizeEntityLookup(query) || selectedGroup.canonicalKey;
    baseResponse.resolution.aliasType = 'canonical_name';
    baseResponse.resolution.aliasConfidence = confident ? 0.9 : 0.7;
    baseResponse.resolution.proposedIdentity = {
      ...candidate,
      classification: selectedGroup.classification,
      proposedAction: selectedGroup.proposedAction,
    };
    if (wantsIdentity) {
      baseResponse.identity = {
        id: null,
        displayName,
        canonicalEntityKey: selectedGroup.canonicalKey,
        entityType,
        lifecycleStatus: lifecycle.status,
        lifecycleSource: lifecycle.source,
        status: null,
        aliases,
        agentBootstrap,
      };
    }
    if (wantsLegacyBootstrap) {
      baseResponse.legacyBootstrap = agentBootstrap;
    }
    baseResponse.provenance.sourceRows = sourceRowIds;
    baseResponse.provenance.dryRunProjection = {
      proposedIdentity: baseResponse.resolution.proposedIdentity,
      proposedFacets: includeFacets && wantsFacets ? (Array.isArray(selectedGroup.rows) ? selectedGroup.rows : []).map((row: any) => ({
        sourceRowId: row.sourceRowId,
        facetType: row.proposedFacetType || 'project_identity',
        title: row.proposedFacetTitle || row.rawName || selectedGroup.canonicalKey,
        contentHash: row.contentHash || null,
        confidence: selectedGroup.confidence ?? null,
        proposedAction: row.proposedAction || selectedGroup.proposedAction,
        warnings: row.warnings || selectedGroup.warnings || [],
      })) : [],
      proposedLinks: [],
      classification: selectedGroup.classification,
      warnings: selectedGroup.warnings || [],
    };

    baseResponse.warnings.push('PHASE_B_NO_PERSISTED_IDENTITY');
    baseResponse.resolution.warnings.push('PHASE_B_NO_PERSISTED_IDENTITY');
    if (!confident) {
      baseResponse.resolution.warnings.push(...(selectedGroup.warnings || []));
      if (includeCandidates) baseResponse.resolution.candidates = this.pass2ProjectionCandidates(selectedGroup);
    }
    if (includeFacets && wantsFacets && baseResponse.provenance.dryRunProjection.proposedFacets.length > 0) {
      baseResponse.warnings.push('PHASE_B_PROJECTED_FACETS_NOT_RETURNED');
    }

    let observations: any = {
      items: [],
      embeddedInlineObservations: 0,
      materializedObservations: 0,
      deduped: 0,
    };
    if (wantsObservations) {
      observations = this.pass2ObservationItems({
        tenantId,
        canonicalKey: selectedGroup.canonicalKey,
        entityRows,
        includeLegacyEmbedded,
        observationKindFilter,
        sinceMs,
      });
      const observationSlice = observations.items.slice(observationOffset, observationOffset + observationLimit);
      baseResponse.observations = {
        items: observationSlice,
        hasMore: observationOffset + observationSlice.length < observations.items.length,
        nextOffset: observationOffset + observationSlice.length < observations.items.length
          ? observationOffset + observationSlice.length
          : null,
      };
      baseResponse.provenance.dedupedRedundantRepresentations = observations.deduped;
    }

    let relations: any[] = [];
    if (wantsRelations) {
      relations = this.pass2RelationItems({
        tenantId,
        canonicalKey: selectedGroup.canonicalKey,
        sourceNames: sourceContents.map((content) => content.name).filter(Boolean),
        relationTypeFilter,
        sinceMs,
      });
      const relationSlice = relations.slice(relationOffset, relationOffset + relationLimit);
      baseResponse.relations = {
        items: relationSlice,
        hasMore: relationOffset + relationSlice.length < relations.length,
        nextOffset: relationOffset + relationSlice.length < relations.length ? relationOffset + relationSlice.length : null,
      };
    }

    if (includeLegacyRowCounts) {
      baseResponse.legacyRowCounts = {
        entityRows: entityRows.length,
        embeddedInlineObservations: observations.embeddedInlineObservations,
        materializedObservations: observations.materializedObservations,
        legacyRelationRows: relations.length,
      };
    }

    const estimate = Math.ceil(JSON.stringify(baseResponse).length / 4);
    baseResponse.tokenBudget.estimatedTokens = estimate;
    if (estimate > maxTokens) {
      baseResponse.tokenBudget.truncatedSections.push('token_budget_estimate_exceeded');
      baseResponse.warnings.push('TOKEN_BUDGET_ESTIMATE_EXCEEDED');
    }
    return baseResponse;
  }

  private entityLookupVariants(value: string): string[] {
    const normalized = this.normalizeEntityLookup(value);
    if (!normalized) return [];

    const variants = new Set<string>([normalized]);
    const parts = normalized.split('-').filter(Boolean);

    for (const suffix of ['-llc', '-inc', '-corp', '-co', '-company']) {
      if (normalized.endsWith(suffix)) {
        variants.add(normalized.slice(0, -suffix.length));
      } else {
        variants.add(`${normalized}${suffix}`);
      }
    }
    if (/-v\d{1,3}$/.test(normalized)) {
      variants.add(normalized.replace(/-v\d{1,3}$/, ''));
    }
    if (parts.length >= 2) {
      variants.add(parts.slice(0, 2).join('-'));
    }
    if (parts.length >= 3) {
      variants.add(parts.slice(0, 3).join('-'));
      variants.add(parts.map((part) => part[0]).join(''));
      variants.add(`${parts[0][0]}${parts[1][0]}-${parts[2]}`);
    }
    if (parts.length >= 4) {
      variants.add(`${parts[0][0]}${parts[1][0]}-${parts.slice(2, 4).join('-')}`);
    }
    return Array.from(variants).filter(Boolean);
  }

  private entityQueryVariants(value: string): string[] {
    const normalized = this.normalizeEntityLookup(value);
    if (!normalized) return [];

    const variants = new Set<string>([normalized]);
    for (const suffix of ['-llc', '-inc', '-corp', '-co', '-company']) {
      if (normalized.endsWith(suffix)) {
        variants.add(normalized.slice(0, -suffix.length));
      } else {
        variants.add(`${normalized}${suffix}`);
      }
    }
    if (/-v\d{1,3}$/.test(normalized)) {
      variants.add(normalized.replace(/-v\d{1,3}$/, ''));
    }
    return Array.from(variants).filter(Boolean);
  }

  private extractLookupHandles(value: string): string[] {
    const handles = new Set<string>();
    const pattern = /\b[a-zA-Z][a-zA-Z0-9]*(?:[._/-][a-zA-Z0-9]+)+\b/g;
    for (const match of value.matchAll(pattern)) {
      const raw = match[0];
      const normalized = this.normalizeEntityLookup(raw);
      if (normalized.length >= 3 && /[a-z]/.test(normalized)) {
        handles.add(raw);
      }
    }
    return Array.from(handles);
  }

  private entityLookupValues(content: any): string[] {
    const values = new Set<string>();
    const add = (value: any, mode: 'full' | 'handles' = 'full') => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (!trimmed) return;
      if (mode === 'full') {
        const normalized = this.normalizeEntityLookup(trimmed);
        if (normalized) values.add(normalized);
        for (const variant of this.entityLookupVariants(trimmed)) values.add(variant);
      }
      for (const handle of this.extractLookupHandles(trimmed)) {
        for (const variant of this.entityLookupVariants(handle)) values.add(variant);
      }
    };
    const addMany = (value: any, mode: 'full' | 'handles' = 'full') => {
      if (!Array.isArray(value)) return;
      for (const item of value) add(item, mode);
    };
    const addMetadata = (metadata: any) => {
      if (!metadata || typeof metadata !== 'object') return;
      addMany(metadata.aliases);
      addMany(metadata.appliesTo);
      add(metadata.canonicalFact, 'handles');
      add(metadata.status, 'handles');
      for (const value of Object.values(metadata)) {
        if (typeof value === 'string') add(value, 'handles');
        if (Array.isArray(value)) addMany(value, 'handles');
      }
    };

    add(content?.name);
    add(content?.entityName);
    add(content?.from);
    add(content?.to);
    if (Array.isArray(content?.aliases)) {
      for (const alias of content.aliases) add(alias);
    }
    addMany(content?.appliesTo);
    addMany(content?.tags);
    addMany(content?.observations, 'handles');
    addMany(content?.contents, 'handles');
    addMany(content?.agentBootstrap, 'handles');
    addMetadata(content?.metadata);

    return Array.from(values);
  }

  private entityNameAndAliasLookupValues(content: any): string[] {
    const values = new Set<string>();
    const add = (value: any) => {
      if (typeof value !== 'string' || !value.trim()) return;
      for (const variant of this.entityQueryVariants(value)) values.add(variant);
    };

    add(content?.name);
    if (Array.isArray(content?.aliases)) {
      for (const alias of content.aliases) add(alias);
    }
    return Array.from(values);
  }

  private rowLookupKinds(row: any): Set<string> {
    return new Set(String(row?.lookup_key_kinds || '')
      .split(',')
      .map((kind) => kind.trim())
      .filter(Boolean));
  }

  private entityNameLookupValuesForQuery(entityName: string, tenantId: string): Set<string> {
    const values = new Set<string>();
    const queryVariants = new Set(this.entityQueryVariants(entityName));
    const indexed = this.findRowsByLookupIndexValues(queryVariants, tenantId, ['entity']);
    const rows = indexed.usedIndex
      ? indexed.rows.filter((row: any) => {
          const kinds = this.rowLookupKinds(row);
          return kinds.has('canonical_name') || kinds.has('alias');
        })
      : this.findEntitiesByNameOrAlias(entityName, tenantId);

    for (const row of rows) {
      try {
        const content = JSON.parse(row.content || '{}');
        for (const value of this.entityQueryVariants(content.name)) {
          values.add(value);
        }
      } catch {}
    }
    return values;
  }

  /**
   * Resolve exact entity rows by canonical name or aliases.
   * This intentionally avoids semantic search and only scans entity rows.
   */
  findEntitiesByNameOrAlias(entityName: string, tenantId: string): any[] {
    const queryVariants = new Set(this.entityQueryVariants(entityName));
    if (queryVariants.size === 0) return [];

    const indexed = this.findRowsByLookupIndexValues(queryVariants, tenantId, ['entity']);
    if (indexed.usedIndex) {
      return indexed.rows;
    }

    const rows = this.db.prepare(
      `SELECT id, content, created_by, created_at, owner_actor_type, owner_actor_id
       FROM shared_memory
       WHERE tenant_id = ? AND memory_type = 'entity'`
    ).all(tenantId) as any[];

    return rows.filter((row: any) => {
      try {
        const content = JSON.parse(row.content || '{}');
        return this.entityNameAndAliasLookupValues(content).some((value) => queryVariants.has(value));
      } catch {
        return false;
      }
    });
  }

  /**
   * Resolve observation rows by canonical entity name or aliases.
   * Used by exact searches so agent "read entity X and observations" workflows
   * do not need to invoke semantic/vector search when deterministic rows exist.
   */
  findObservationsByEntityOrAlias(entityName: string, tenantId: string): any[] {
    const queryVariants = new Set(this.entityQueryVariants(entityName));
    if (queryVariants.size === 0) return [];
    const matchedEntityValues = this.entityNameLookupValuesForQuery(entityName, tenantId);
    const indexedLookupValues = new Set([...queryVariants, ...matchedEntityValues]);

    const indexed = this.findRowsByLookupIndexValues(indexedLookupValues, tenantId, ['observation']);
    if (indexed.usedIndex) {
      return indexed.rows;
    }

    const rows = this.db.prepare(
      `SELECT id, content, created_by, created_at, owner_actor_type, owner_actor_id
       FROM shared_memory
       WHERE tenant_id = ? AND memory_type = 'observation'`
    ).all(tenantId) as any[];

    return rows.filter((row: any) => {
      try {
        const content = JSON.parse(row.content || '{}');
        const values = this.entityLookupValues(content);
        const entityValues = this.entityLookupValues({ entityName: content.entityName });
        return values.some((value) => queryVariants.has(value)) ||
          entityValues.some((value) => matchedEntityValues.has(value));
      } catch {
        return false;
      }
    });
  }

  /**
   * Resolve relation rows by canonical entity name or aliases.
   */
  findRelationsByEntityOrAlias(entityName: string, tenantId: string): any[] {
    const queryVariants = new Set(this.entityQueryVariants(entityName));
    if (queryVariants.size === 0) return [];
    const matchedEntityValues = this.entityNameLookupValuesForQuery(entityName, tenantId);
    const indexedLookupValues = new Set([...queryVariants, ...matchedEntityValues]);

    const indexed = this.findRowsByLookupIndexValues(indexedLookupValues, tenantId, ['relation']);
    if (indexed.usedIndex) {
      return indexed.rows;
    }

    const rows = this.db.prepare(
      `SELECT id, content, created_by, created_at, owner_actor_type, owner_actor_id
       FROM shared_memory
       WHERE tenant_id = ? AND memory_type = 'relation'`
    ).all(tenantId) as any[];

    return rows.filter((row: any) => {
      try {
        const content = JSON.parse(row.content || '{}');
        const values = [
          ...this.entityLookupValues(content),
          ...this.entityLookupValues({ entityName: content.from }),
          ...this.entityLookupValues({ entityName: content.to }),
        ];
        return values.some((value) => queryVariants.has(value) || matchedEntityValues.has(value));
      } catch {
        return false;
      }
    });
  }

  /**
   * Find entity rows by name (case-insensitive, tenant-scoped).
   * Codex finding #4: LOWER(json_extract()) for case-insensitive matching.
   */
  findEntitiesByName(entityName: string, tenantId: string): any[] {
    return this.db.prepare(
      `SELECT id, content, created_by, created_at, owner_actor_type, owner_actor_id FROM shared_memory
       WHERE tenant_id = ? AND memory_type = 'entity'
       AND LOWER(json_extract(content, '$.name')) = LOWER(?)`
    ).all(tenantId, entityName) as any[];
  }

  /**
   * Find observation rows for an entity (case-insensitive, tenant-scoped).
   */
  findObservationsByEntity(entityName: string, tenantId: string): any[] {
    return this.db.prepare(
      `SELECT id, content, created_by, created_at, owner_actor_type, owner_actor_id FROM shared_memory
       WHERE tenant_id = ? AND memory_type = 'observation'
       AND LOWER(json_extract(content, '$.entityName')) = LOWER(?)`
    ).all(tenantId, entityName) as any[];
  }

  /**
   * Find relation rows involving an entity (case-insensitive, tenant-scoped).
   */
  findRelationsByEntity(entityName: string, tenantId: string): any[] {
    return this.db.prepare(
      `SELECT id, content, created_by, created_at, owner_actor_type, owner_actor_id FROM shared_memory
       WHERE tenant_id = ? AND memory_type = 'relation'
       AND (LOWER(json_extract(content, '$.from')) = LOWER(?)
            OR LOWER(json_extract(content, '$.to')) = LOWER(?))`
    ).all(tenantId, entityName, entityName) as any[];
  }

  /**
   * Phase B: Check if a member owns all target rows (row-level provenance enforcement).
   * Returns { allowed: true } if all rows are owned by the member, or { allowed: false, reason }
   * if any row is not owned, is legacy (no provenance), or is system-owned.
   */
  checkMemberOwnership(targetRows: any[], context: RequestContext): { allowed: boolean; reason?: string } {
    const userId = context.userId;
    if (!userId) return { allowed: false, reason: 'No userId in context for member ownership check' };

    for (const row of targetRows) {
      // Legacy rows without provenance → admin-only (safe default)
      if (!row.owner_actor_type || !row.owner_actor_id) {
        return { allowed: false, reason: 'Legacy row without provenance requires admin role' };
      }
      // System-owned rows → admin-only
      if (row.owner_actor_type === 'system') {
        return { allowed: false, reason: 'System-owned row requires admin role' };
      }
      // Row owned by a different actor type or different user → rejected
      if (row.owner_actor_type !== 'jwt' || row.owner_actor_id !== userId) {
        return { allowed: false, reason: `Row owned by ${row.owner_actor_type}:${row.owner_actor_id}, not by jwt:${userId}` };
      }
    }
    return { allowed: true };
  }

  /**
   * Fetch a single observation row by ID (for ownership check before update).
   */
  getObservationRow(obsId: string, tenantId: string): any | null {
    return this.db.prepare(
      "SELECT id, content, created_by, owner_actor_type, owner_actor_id FROM shared_memory WHERE id = ? AND tenant_id = ? AND memory_type = 'observation'"
    ).get(obsId, tenantId) as any || null;
  }

  /**
   * Find observations by containsAny substrings (case-insensitive, tenant-scoped).
   * Codex finding #7: escapes % and _ in patterns.
   */
  findObservationsByContainsAny(entityName: string, containsAny: string[], tenantId: string): any[] {
    if (containsAny.length === 0) return [];

    const escapedPatterns = containsAny.map(s => `%${MemoryManager.escapeLikePattern(s)}%`);
    const likeConditions = escapedPatterns.map(() => `LOWER(content) LIKE LOWER(?) ESCAPE '\\'`).join(' OR ');

    const sql = `SELECT id, content, created_by, created_at, owner_actor_type, owner_actor_id FROM shared_memory
       WHERE tenant_id = ? AND memory_type = 'observation'
       AND LOWER(json_extract(content, '$.entityName')) = LOWER(?)
       AND (${likeConditions})`;

    return this.db.prepare(sql).all(tenantId, entityName, ...escapedPatterns) as any[];
  }

  /**
   * Delete graph rows from SQLite in a transaction, then attempt vector cleanup.
   * Failures are tombstoned for retry.
   */
  async deleteGraphRows(ids: string[], tenantId: string): Promise<{
    deleted: number;
    vectorCleanup: number;
    vectorFailures: number;
    weaviateCleanup: number;
    weaviateFailures: number;
  }> {
    if (ids.length === 0) {
      return { deleted: 0, vectorCleanup: 0, vectorFailures: 0, weaviateCleanup: 0, weaviateFailures: 0 };
    }

    // SQLite transaction delete
    const placeholders = ids.map(() => '?').join(',');
    const txn = this.db.transaction(() => {
      this.db.prepare(
        `DELETE FROM graph_lookup_keys WHERE tenant_id = ? AND memory_id IN (${placeholders})`
      ).run(tenantId, ...ids);
      return this.db.prepare(
        `DELETE FROM shared_memory WHERE id IN (${placeholders})`
      ).run(...ids);
    });
    const result = txn();

    // Vector cleanup (best-effort with tombstone on failure)
    let vectorCleanup = 0;
    let vectorFailures = 0;

    if (this.vectorClient) {
      for (const id of ids) {
        try {
          await this.vectorClient.deleteMemory(id);
          vectorCleanup++;
        } catch (err: any) {
          vectorFailures++;
          // Insert tombstone for retry
          try {
            this.db.prepare(
              `INSERT OR IGNORE INTO failed_weaviate_deletes (id, weaviate_id, tenant_id, last_error)
               VALUES (?, ?, ?, ?)`
            ).run(uuidv4(), id, tenantId, err?.message || 'unknown');
          } catch { /* tombstone write failure is truly non-fatal */ }
        }
      }
    }

    // Fire-and-forget: drain any pending tombstones while we're at it
    if (vectorFailures > 0) {
      void this.retryFailedWeaviateDeletes(25).catch(() => {});
    }

    return {
      deleted: result.changes,
      vectorCleanup,
      vectorFailures,
      // Legacy aliases for existing API consumers.
      weaviateCleanup: vectorCleanup,
      weaviateFailures: vectorFailures
    };
  }

  /**
   * Update observation content in SQLite and re-embed in vector index.
   */
  async updateObservationContent(
    obsId: string,
    newContent: string,
    contentIndex: number | undefined,
    tenantId: string
  ): Promise<{ updated: boolean; vectorReindexed: boolean; weaviateReindexed: boolean }> {
    // Fetch current row (constrained to observations only)
    const row = this.db.prepare(
      "SELECT id, content, created_by, owner_actor_type, owner_actor_id FROM shared_memory WHERE id = ? AND tenant_id = ? AND memory_type = 'observation'"
    ).get(obsId, tenantId) as any;
    if (!row) throw new Error(`Observation ${obsId} not found`);

    let updatedContentObj: any;
    try {
      updatedContentObj = JSON.parse(row.content);
    } catch {
      throw new Error(`Failed to parse observation content for ${obsId}`);
    }

    // Replace at contentIndex within contents array, or replace entire content field
    if (contentIndex !== undefined && Array.isArray(updatedContentObj.contents)) {
      if (contentIndex < 0 || contentIndex >= updatedContentObj.contents.length) {
        throw new Error(`contentIndex ${contentIndex} out of range [0, ${updatedContentObj.contents.length - 1}]`);
      }
      updatedContentObj.contents[contentIndex] = newContent;
    } else if (Array.isArray(updatedContentObj.contents) && updatedContentObj.contents.length > 0) {
      // Replace first content element if no index specified
      updatedContentObj.contents[0] = newContent;
    } else {
      // Fallback: set a contents array
      updatedContentObj.contents = [newContent];
    }

    // Update SQLite (tenant + type guard, verify exactly 1 row)
    const upd = this.db.prepare(
      "UPDATE shared_memory SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ? AND memory_type = 'observation'"
    ).run(JSON.stringify(updatedContentObj), obsId, tenantId);
    if (upd.changes !== 1) throw new Error(`Observation ${obsId} not found`);
    this.refreshGraphLookupIndexForMemory(obsId, tenantId, 'observation', updatedContentObj);

    // Vector backend: delete + reinsert for re-embedding.
    let vectorReindexed = false;
    if (this.vectorClient) {
      try {
        await this.vectorClient.deleteMemory(obsId);
        await this.vectorClient.storeMemory({
          id: obsId,
          agentId: row.created_by,
          tenantId,
          type: 'observation' as any,
          content: JSON.stringify(updatedContentObj),
          timestamp: Date.now(),
          tags: [],
          priority: 5,
          relationships: [],
          metadata: {},
        });
        vectorReindexed = true;
      } catch (err: any) {
        // Tombstone for failed vector operation.
        try {
          this.db.prepare(
            `INSERT OR IGNORE INTO failed_weaviate_deletes (id, weaviate_id, tenant_id, last_error)
             VALUES (?, ?, ?, ?)`
          ).run(uuidv4(), obsId, tenantId, err?.message || 'unknown');
        } catch { /* non-fatal */ }
        // Fire-and-forget: drain pending tombstones
        void this.retryFailedWeaviateDeletes(25).catch(() => {});
      }
    }

    return {
      updated: true,
      vectorReindexed,
      // Legacy alias for existing API consumers.
      weaviateReindexed: vectorReindexed
    };
  }

  /**
   * Enhanced audit log for graph mutations (codex finding #6).
   * Logs tenant_id, actor_type, actor_id, target count, and reason.
   */
  auditMutationOp(
    operation: string,
    context: RequestContext,
    entityName: string,
    targetIds: string[],
    reason?: string
  ): void {
    try {
      const id = uuidv4();
      const hash = MemoryManager.contentHash(targetIds.join(','));
      const actorId = context.userId || context.apiKeyId || 'system';
      this.db.prepare(
        `INSERT INTO neural_audit_log (id, operation, agent_id, entity_name, content_hash, flagged, flag_reason, tenant_id, actor_type, actor_id, target_count, reason)
         VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?)`
      ).run(
        id,
        operation,
        actorId,
        entityName,
        hash,
        context.tenantId,
        context.authType,
        actorId,
        targetIds.length,
        reason || null
      );
    } catch (e: any) {
      console.error(`⚠️ Mutation audit log write failed (non-fatal): ${e.message}`);
    }
  }

  /**
   * Retry failed vector deletes from the tombstone queue.
   * Processes oldest-first, removes on success, bumps retry_count on failure.
   */
  async retryFailedWeaviateDeletes(limit = 100): Promise<{ attempted: number; succeeded: number; failed: number }> {
    if (!this.vectorClient) return { attempted: 0, succeeded: 0, failed: 0 };

    const rows = this.db.prepare(
      `SELECT id, weaviate_id, tenant_id, retry_count
       FROM failed_weaviate_deletes
       ORDER BY failed_at ASC
       LIMIT ?`
    ).all(limit) as any[];

    let succeeded = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await this.vectorClient.deleteMemory(row.weaviate_id);
        this.db.prepare('DELETE FROM failed_weaviate_deletes WHERE id = ?').run(row.id);
        succeeded++;
      } catch (err: any) {
        failed++;
        this.db.prepare(
          `UPDATE failed_weaviate_deletes
           SET retry_count = retry_count + 1,
               last_error = ?,
               failed_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).run(err?.message || 'unknown', row.id);
      }
    }
    return { attempted: rows.length, succeeded, failed };
  }

  // ─── Data Management Methods ───────────────────────────────────

  /**
   * Find entities by name prefix (case-insensitive, tenant-scoped).
   */
  findEntitiesByPrefix(prefix: string, tenantId: string): any[] {
    return this.db.prepare(
      `SELECT id, content, created_by, tags, created_at, updated_at, owner_actor_type, owner_actor_id
       FROM shared_memory
       WHERE tenant_id = ? AND memory_type = 'entity'
       AND LOWER(json_extract(content, '$.name')) LIKE LOWER(? || '%')
       ORDER BY created_at ASC`
    ).all(tenantId, prefix) as any[];
  }

  /**
   * List distinct entity name prefixes (first segment before '-') for autocomplete.
   */
  listEntityPrefixes(tenantId: string): string[] {
    const rows = this.db.prepare(
      `SELECT DISTINCT SUBSTR(json_extract(content, '$.name'), 1,
        INSTR(json_extract(content, '$.name'), '-') - 1) as prefix
       FROM shared_memory WHERE tenant_id = ? AND memory_type = 'entity'
       AND json_extract(content, '$.name') LIKE '%-%'
       ORDER BY prefix ASC`
    ).all(tenantId) as any[];
    return rows.map((r: any) => r.prefix).filter((p: string) => p && p.length > 0);
  }

  /**
   * Export entities + observations + relations matching a prefix or name list.
   */
  exportEntities(options: {
    tenantId: string;
    namePrefix?: string;
    entityNames?: string[];
  }): any {
    const { tenantId, namePrefix, entityNames: explicitNames } = options;

    // Find matching entities
    let entities: any[];
    if (namePrefix) {
      entities = this.findEntitiesByPrefix(namePrefix, tenantId);
    } else if (explicitNames && explicitNames.length > 0) {
      entities = explicitNames.flatMap(name => this.findEntitiesByName(name, tenantId));
    } else {
      throw new Error('Must provide namePrefix or entityNames');
    }

    // Extract entity names from results
    const entityNameSet = new Set<string>();
    for (const e of entities) {
      try {
        const content = JSON.parse(e.content);
        if (content.name) entityNameSet.add(content.name);
      } catch {}
    }

    // Collect observations
    const observations: any[] = [];
    for (const name of entityNameSet) {
      observations.push(...this.findObservationsByEntity(name, tenantId));
    }

    // Collect relations (deduplicate by id)
    const relationMap = new Map<string, any>();
    for (const name of entityNameSet) {
      for (const rel of this.findRelationsByEntity(name, tenantId)) {
        relationMap.set(rel.id, rel);
      }
    }
    const relations = Array.from(relationMap.values());

    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      source: 'neural-ai-collaboration',
      filter: { namePrefix: namePrefix || null, entityNames: explicitNames || null, tenantId },
      counts: { entities: entities.length, observations: observations.length, relations: relations.length },
      entities,
      observations,
      relations,
    };
  }

  /**
   * Import entities from a backup payload. INSERT OR IGNORE for idempotency.
   */
  async importEntities(backup: any, tenantId: string): Promise<{
    inserted: { entities: number; observations: number; relations: number };
    skipped: { entities: number; observations: number; relations: number };
    errors: string[];
  }> {
    if (backup.schemaVersion !== 1) {
      throw new Error(`Unsupported schema version: ${backup.schemaVersion}`);
    }

    const result = {
      inserted: { entities: 0, observations: 0, relations: 0 },
      skipped: { entities: 0, observations: 0, relations: 0 },
      errors: [] as string[],
    };

    const insertStmt = this.db.prepare(
      `INSERT OR IGNORE INTO shared_memory (id, tenant_id, memory_type, content, created_by, tags, created_at, updated_at, owner_actor_type, owner_actor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const importRows = (rows: any[], memoryType: string, countKey: 'entities' | 'observations' | 'relations') => {
      for (const row of rows) {
        try {
          const info = insertStmt.run(
            row.id,
            tenantId,
            memoryType,
            row.content,
            row.created_by || 'import',
            row.tags || '[]',
            row.created_at || new Date().toISOString(),
            row.updated_at || new Date().toISOString(),
            row.owner_actor_type || null,
            row.owner_actor_id || null
          );
          if (info.changes > 0) {
            result.inserted[countKey]++;
          } else {
            result.skipped[countKey]++;
          }
        } catch (err: any) {
          result.errors.push(`${memoryType} ${row.id}: ${err.message}`);
        }
      }
    };

    // Run in transaction
    const txn = this.db.transaction(() => {
      importRows(backup.entities || [], 'entity', 'entities');
      importRows(backup.observations || [], 'observation', 'observations');
      importRows(backup.relations || [], 'relation', 'relations');
    });
    txn();

    // Vector re-indexing for inserted entities (best-effort)
    if (this.vectorClient && result.inserted.entities > 0) {
      for (const entity of (backup.entities || [])) {
        try {
          await this.vectorClient.storeMemory({
            id: entity.id,
            agentId: entity.created_by || 'import',
            tenantId,
            type: 'entity' as any,
            content: entity.content,
            timestamp: Date.now(),
            tags: [],
            priority: 5,
            relationships: [],
          });
        } catch {}
      }
    }

    return result;
  }

  /**
   * Create a full database snapshot (backup).
   */
  /**
   * Return the default backup directory and auto-discovered external drives.
   */
  getBackupLocations(): Array<{
    id: string; path: string; label: string; writable: boolean;
    freeBytes?: number; totalBytes?: number;
  }> {
    type LocationEntry = {
      id: string; path: string; label: string; writable: boolean;
      freeBytes?: number; totalBytes?: number;
    };
    const locations: LocationEntry[] = [];
    const seen = new Set<string>();

    // Default: alongside the DB
    const defaultDir = path.join(path.dirname(this.dbPath), 'backups');
    locations.push({
      id: 'default',
      path: defaultDir,
      label: 'Internal (Docker volume)',
      writable: this.isDirWritable(defaultDir),
      ...this.getDiskSpace(defaultDir),
    });
    seen.add(path.resolve(defaultDir));

    // Auto-discover drives from mounted host paths
    if (process.env.BACKUP_AUTODISCOVER === 'true') {
      this.discoverDrives('/host-drives', seen, locations);  // WSL2: /mnt/c, /mnt/d, USB /mnt/e...
      this.discoverDrives('/host-media', seen, locations);    // Linux: /media/user/usb-name
    }

    // Legacy: explicit BACKUP_DIR env
    if (process.env.BACKUP_DIR) {
      const resolved = path.resolve(process.env.BACKUP_DIR);
      if (!seen.has(resolved) && fs.existsSync(resolved)) {
        seen.add(resolved);
        locations.push({
          id: Buffer.from(resolved).toString('base64url'),
          path: resolved,
          label: 'External (BACKUP_DIR)',
          writable: this.isDirWritable(resolved),
          ...this.getDiskSpace(resolved),
        });
      }
    }

    return locations;
  }

  /**
   * Scan a host mount point for drives/volumes and add them as backup locations.
   */
  private discoverDrives(
    hostMountRoot: string,
    seen: Set<string>,
    locations: Array<{ id: string; path: string; label: string; writable: boolean; freeBytes?: number; totalBytes?: number }>
  ): void {
    if (!fs.existsSync(hostMountRoot)) return;

    // Skip known non-drive dirs in WSL2
    const skipDirs = new Set(['wsl', 'wslg', 'wslCrashLogs']);

    try {
      const entries = fs.readdirSync(hostMountRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        if (skipDirs.has(entry.name)) continue;

        const drivePath = path.join(hostMountRoot, entry.name);
        const resolved = path.resolve(drivePath);
        if (seen.has(resolved)) continue;
        seen.add(resolved);

        // Check if it's a real filesystem (has some content, not empty mount)
        try {
          const contents = fs.readdirSync(drivePath);
          if (contents.length === 0) continue; // empty mount = not a real drive
        } catch { continue; }

        // Build a friendly label
        const space = this.getDiskSpace(drivePath);
        const driveLetter = entry.name.toUpperCase();
        const sizeLabel = space.totalBytes
          ? ` (${this.humanSize(space.freeBytes || 0)} free / ${this.humanSize(space.totalBytes)})`
          : '';

        // Use neural-backups subfolder on each drive
        const backupPath = path.join(drivePath, 'neural-backups');
        const writable = this.isDirWritable(backupPath);

        locations.push({
          id: Buffer.from(backupPath).toString('base64url'),
          path: backupPath,
          label: `Drive ${driveLetter}:${sizeLabel}`,
          writable,
          ...this.getDiskSpace(backupPath),
        });
      }
    } catch {}
  }

  private isDirWritable(dir: string): boolean {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  private getDiskSpace(dir: string): { freeBytes?: number; totalBytes?: number } {
    try {
      // Node 18.15+ has fs.statfsSync
      if (typeof (fs as any).statfsSync === 'function') {
        const stat = (fs as any).statfsSync(dir);
        return {
          freeBytes: stat.bavail * stat.bsize,
          totalBytes: stat.blocks * stat.bsize,
        };
      }
    } catch {}
    return {};
  }

  private humanSize(bytes: number): string {
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  private resolveBackupDir(locationId?: string, folder?: string): string {
    let base: string;
    if (!locationId || locationId === 'default') {
      base = path.join(path.dirname(this.dbPath), 'backups');
    } else {
      const locations = this.getBackupLocations();
      const loc = locations.find(l => l.id === locationId);
      if (!loc) throw new Error(`Unknown backup location: ${locationId}`);
      if (!loc.writable) throw new Error(`Backup location not writable: ${loc.path}`);
      base = loc.path;
    }
    if (folder) {
      const safe = folder.replace(/[^a-zA-Z0-9_\-/ ]/g, '_');
      return path.join(base, safe);
    }
    return base;
  }

  /**
   * List folders within a backup location.
   */
  listBackupFolders(locationId?: string): string[] {
    const base = this.resolveBackupDir(locationId);
    if (!fs.existsSync(base)) return [];
    return fs.readdirSync(base, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();
  }

  /**
   * Create a named folder within a backup location.
   */
  createBackupFolder(folderName: string, locationId?: string): { path: string; created: boolean } {
    const base = this.resolveBackupDir(locationId);
    const safe = folderName.replace(/[^a-zA-Z0-9_\-/ ]/g, '_');
    const fullPath = path.join(base, safe);
    const existed = fs.existsSync(fullPath);
    fs.mkdirSync(fullPath, { recursive: true });
    return { path: fullPath, created: !existed };
  }

  /**
   * Move a snapshot to a different location/folder. Copies file + updates manifests.
   */
  async moveSnapshot(snapshotId: string, targetLocationId: string, targetFolder?: string): Promise<{
    moved: boolean;
    newLocation: string;
    filename: string;
  }> {
    const snapshots = this.listSnapshots();
    const snapshot = snapshots.find(s => s.snapshotId === snapshotId);
    if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);

    const sourceDir = snapshot.location || path.join(path.dirname(this.dbPath), 'backups');
    const sourcePath = path.join(sourceDir, snapshot.filename);
    if (!fs.existsSync(sourcePath)) throw new Error(`Snapshot file missing: ${snapshot.filename}`);

    const targetDir = this.resolveBackupDir(targetLocationId, targetFolder);
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, snapshot.filename);

    // Don't move to the same place
    if (path.resolve(sourcePath) === path.resolve(targetPath)) {
      return { moved: false, newLocation: targetDir, filename: snapshot.filename };
    }

    // Copy file
    fs.copyFileSync(sourcePath, targetPath);

    // Add to target manifest
    const targetManifestPath = path.join(targetDir, 'manifest.json');
    let targetManifest: any[] = [];
    try {
      if (fs.existsSync(targetManifestPath)) {
        targetManifest = JSON.parse(fs.readFileSync(targetManifestPath, 'utf-8'));
      }
    } catch {}
    targetManifest.push({ ...snapshot, location: targetDir });
    fs.writeFileSync(targetManifestPath, JSON.stringify(targetManifest, null, 2));

    // Remove from source manifest
    const sourceManifestPath = path.join(sourceDir, 'manifest.json');
    try {
      if (fs.existsSync(sourceManifestPath)) {
        let sourceManifest: any[] = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf-8'));
        sourceManifest = sourceManifest.filter((e: any) => e.snapshotId !== snapshotId);
        fs.writeFileSync(sourceManifestPath, JSON.stringify(sourceManifest, null, 2));
      }
    } catch {}

    // Remove source file
    fs.unlinkSync(sourcePath);

    return { moved: true, newLocation: targetDir, filename: snapshot.filename };
  }

  /**
   * Delete a snapshot file and remove from manifest.
   */
  deleteSnapshot(snapshotId: string): { deleted: boolean; filename: string } {
    const snapshots = this.listSnapshots();
    const snapshot = snapshots.find(s => s.snapshotId === snapshotId);
    if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);

    const dir = snapshot.location || path.join(path.dirname(this.dbPath), 'backups');
    const filePath = path.join(dir, snapshot.filename);

    // Remove file
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    // Update manifest
    const manifestPath = path.join(dir, 'manifest.json');
    try {
      if (fs.existsSync(manifestPath)) {
        let manifest: any[] = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        manifest = manifest.filter((e: any) => e.snapshotId !== snapshotId);
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      }
    } catch {}

    return { deleted: true, filename: snapshot.filename };
  }

  async createSnapshot(label?: string, locationId?: string, folder?: string): Promise<{
    snapshotId: string;
    filename: string;
    sizeBytes: number;
    createdAt: string;
    label: string;
    location: string;
  }> {
    const backupDir = this.resolveBackupDir(locationId, folder);
    fs.mkdirSync(backupDir, { recursive: true });

    const snapshotId = uuidv4();
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-');
    const safeLabel = (label || 'manual').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `neural-${dateStr}-${safeLabel}.db`;
    const targetPath = path.join(backupDir, filename);

    // Use better-sqlite3 built-in backup
    await this.db.backup(targetPath);

    const stats = fs.statSync(targetPath);
    const createdAt = now.toISOString();

    // Update manifest
    const manifestPath = path.join(backupDir, 'manifest.json');
    let manifest: any[] = [];
    try {
      if (fs.existsSync(manifestPath)) {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      }
    } catch {}

    const entry = { snapshotId, filename, sizeBytes: stats.size, createdAt, label: safeLabel, location: backupDir };
    manifest.push(entry);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    return entry;
  }

  /**
   * List available snapshots from manifest.
   */
  private readManifest(dir: string): any[] {
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return [];
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch {
      return [];
    }
  }

  listSnapshots(filterLocationId?: string): Array<{
    snapshotId: string;
    filename: string;
    sizeBytes: number;
    createdAt: string;
    label: string;
    location: string;
    locationId: string;
    locationLabel: string;
    folder?: string;
  }> {
    const allSnapshots: any[] = [];
    const locations = this.getBackupLocations();

    for (const loc of locations) {
      if (filterLocationId && loc.id !== filterLocationId) continue;

      // Scan root of location
      const dirsToScan = [{ dir: loc.path, folder: undefined as string | undefined }];

      // Scan subfolders
      if (fs.existsSync(loc.path)) {
        try {
          const subdirs = fs.readdirSync(loc.path, { withFileTypes: true })
            .filter(d => d.isDirectory());
          for (const sub of subdirs) {
            dirsToScan.push({ dir: path.join(loc.path, sub.name), folder: sub.name });
          }
        } catch {}
      }

      for (const { dir, folder } of dirsToScan) {
        const manifest = this.readManifest(dir);
        for (const entry of manifest) {
          const filePath = path.join(dir, entry.filename);
          if (fs.existsSync(filePath)) {
            allSnapshots.push({
              ...entry,
              location: entry.location || dir,
              locationId: loc.id,
              locationLabel: loc.label,
              folder: folder || entry.folder || undefined,
            });
          }
        }
      }
    }

    return allSnapshots.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Restore database from a snapshot. Returns pre-restore backup info.
   */
  async restoreSnapshot(snapshotId: string): Promise<{
    restoredFrom: string;
    preRestoreBackup: string;
  }> {
    const snapshots = this.listSnapshots();
    const snapshot = snapshots.find(s => s.snapshotId === snapshotId);
    if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);

    const snapshotDir = snapshot.location || path.join(path.dirname(this.dbPath), 'backups');
    const snapshotPath = path.join(snapshotDir, snapshot.filename);

    if (!fs.existsSync(snapshotPath)) {
      throw new Error(`Snapshot file missing: ${snapshot.filename}`);
    }

    // Validate snapshot integrity
    const testDb = new Database(snapshotPath, { readonly: true });
    try {
      const result = testDb.pragma('integrity_check') as any[];
      if (!result || result[0]?.integrity_check !== 'ok') {
        throw new Error('Snapshot failed integrity check');
      }
    } finally {
      testDb.close();
    }

    // Create pre-restore safety backup
    const preRestoreBackup = await this.createSnapshot('pre-restore');

    // Close current DB
    this.db.close();

    // Copy snapshot over live DB
    fs.copyFileSync(snapshotPath, this.dbPath);

    // Reopen
    this.db = new Database(this.dbPath);
    this.initializeDatabase();
    this.loadMemoryFromDatabase();
    this.initializeAdvancedSystems();

    return {
      restoredFrom: snapshot.filename,
      preRestoreBackup: preRestoreBackup.filename,
    };
  }

  /**
   * Retire (delete) entities and their observations/relations.
   */
  async retireEntities(entityNames: string[], tenantId: string): Promise<{
    entitiesDeleted: number;
    observationsDeleted: number;
    relationsDeleted: number;
    totalRowsDeleted: number;
  }> {
    const allIds: string[] = [];
    let entityCount = 0;
    let observationCount = 0;
    let relationCount = 0;
    const relationIdSet = new Set<string>();

    for (const name of entityNames) {
      const entities = this.findEntitiesByName(name, tenantId);
      entityCount += entities.length;
      allIds.push(...entities.map(e => e.id));

      const observations = this.findObservationsByEntity(name, tenantId);
      observationCount += observations.length;
      allIds.push(...observations.map(o => o.id));

      const relations = this.findRelationsByEntity(name, tenantId);
      for (const rel of relations) {
        if (!relationIdSet.has(rel.id)) {
          relationIdSet.add(rel.id);
          relationCount++;
          allIds.push(rel.id);
        }
      }
    }

    const deleteResult = await this.deleteGraphRows(allIds, tenantId);

    return {
      entitiesDeleted: entityCount,
      observationsDeleted: observationCount,
      relationsDeleted: relationCount,
      totalRowsDeleted: deleteResult.deleted,
    };
  }
}
