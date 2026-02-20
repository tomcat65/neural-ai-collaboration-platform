// Hierarchical Memory Manager Implementation
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
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
import { WeaviateClient } from '../../memory/weaviate-client.js';
import type { RequestContext } from '../../middleware/auth/types.js';
import {
  setSystemConnected,
  recordSQLiteFallback,
  setDualWriteEnabled,
  recordDualWriteResult,
  recordMemoryReadLatency,
  recordMemoryWriteLatency,
  metrics
} from '../../observability/index.js';

export class MemoryManager {
  private db: Database.Database;
  private memorySystem: MemorySystem;

  /** Expose database reference for tenant resolver initialization */
  getDb(): Database.Database { return this.db; }
  public weaviateClient?: WeaviateClient;
  private isAdvancedSystemsEnabled: boolean = false;
  private isDualWriteEnabled: boolean = false;
  readonly contentSizeThreshold: number = parseInt(process.env.CONTENT_SIZE_THRESHOLD || '51200', 10); // 50KB default

  constructor(dbPath: string = './data/unified-platform.db') {
    this.db = new Database(dbPath);
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

      // Initialize Weaviate client
      try {
        this.weaviateClient = new WeaviateClient();
        await this.weaviateClient.initialize();
        setSystemConnected('weaviate', true);
        metrics.logEvent('info', 'systems', 'Weaviate client initialized');
      } catch (weaviateError) {
        console.warn('⚠️ Weaviate initialization failed:', weaviateError);
        setSystemConnected('weaviate', false);
        metrics.logEvent('error', 'systems', 'Weaviate client initialization failed', { error: String(weaviateError) });
      }

      this.isAdvancedSystemsEnabled = !!this.weaviateClient;

      if (this.isAdvancedSystemsEnabled) {
        console.log('✅ Advanced memory systems initialized (partial or full)');
      } else {
        console.log('⚠️ No advanced systems available - SQLite-only mode');
        recordSQLiteFallback();
      }

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

    // Migration: Add tenant_id column to existing tables if missing BEFORE creating tenant indexes
    this.migrateAddTenantColumn();

    // Migration 002: Users table + tenant_id/user_id on ai_messages & session_handoffs
    this.migrateUsersAndTenantColumns();

    // Create indexes after migrations to avoid referencing missing columns on older databases
    this.createIndexes();

    console.log('🧠 Memory database initialized');
  }

  private migrateAddTenantColumn(): void {
    // Check and add tenant_id to existing tables (for backward compatibility)
    const tables = ['individual_memory', 'shared_memory', 'tasks', 'shared_knowledge', 'consensus_history', 'project_artifacts'];

    for (const table of tables) {
      try {
        // Check if tenant_id column exists
        const pragma = this.db.prepare(`PRAGMA table_info(${table})`).all() as any[];
        const hasTenantId = pragma.some((col: any) => col.name === 'tenant_id');

        if (!hasTenantId) {
          this.db.exec(`ALTER TABLE ${table} ADD COLUMN tenant_id TEXT DEFAULT 'default'`);
          this.db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id)`);
          console.log(`🔧 Migration: Added tenant_id column to ${table}`);
        }
      } catch (error) {
        // Table might not exist yet, which is fine
        console.debug(`Migration: Could not check ${table}:`, error);
      }
    }
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
  }

  private createIndexes(): void {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_individual_agent_id ON individual_memory(agent_id);
      CREATE INDEX IF NOT EXISTS idx_individual_type ON individual_memory(memory_type);
      CREATE INDEX IF NOT EXISTS idx_individual_importance ON individual_memory(importance);
      CREATE INDEX IF NOT EXISTS idx_individual_tenant ON individual_memory(tenant_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_shared_type ON shared_memory(memory_type);
      CREATE INDEX IF NOT EXISTS idx_shared_created_by ON shared_memory(created_by);
      CREATE INDEX IF NOT EXISTS idx_shared_tenant ON shared_memory(tenant_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
      CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_type ON shared_knowledge(type);
      CREATE INDEX IF NOT EXISTS idx_knowledge_source ON shared_knowledge(source);
      CREATE INDEX IF NOT EXISTS idx_knowledge_confidence ON shared_knowledge(confidence);
      CREATE INDEX IF NOT EXISTS idx_knowledge_tenant ON shared_knowledge(tenant_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_consensus_tenant ON consensus_history(tenant_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_artifacts_tenant ON project_artifacts(tenant_id);
    `);
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

  async store(agentId: string, memory: any, scope: 'individual' | 'shared', type: string, tenantId: string = 'default'): Promise<string> {
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
      const stmt = this.db.prepare(`
        INSERT INTO shared_memory (id, tenant_id, memory_type, content, created_by, tags)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        tenantId,
        type,
        JSON.stringify(memory || {}),
        agentId,
        JSON.stringify((memory && memory.tags) || [])
      );

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
      // Store in Weaviate for semantic search (tenant-scoped)
      if (this.weaviateClient) {
        await this.weaviateClient.storeMemory({
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

  async search(query: string, scope: MemoryScope | string, tenantId: string = 'default'): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const searchTerm = query.toLowerCase();
    
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
      await this.searchInAdvancedSystems(query, searchScope, results, tenantId);
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
          LIMIT 50
        `);

        const individualRows = individualStmt.all(tenantId, `%${searchTerm}%`) as any[];
        
        for (const row of individualRows) {
          try {
            const content = JSON.parse(row.content);
            results.push({
              id: row.id,
              type: 'individual',
              content: content,
              relevance: row.importance || 0.5,
              source: row.agent_id,
              timestamp: new Date(row.created_at)
            });
          } catch (parseError) {
            // If JSON parse fails, include raw content
            results.push({
              id: row.id,
              type: 'individual', 
              content: { raw: row.content, type: row.memory_type },
              relevance: row.importance || 0.5,
              source: row.agent_id,
              timestamp: new Date(row.created_at)
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
          LIMIT 50
        `);
        const sizeRows = sizeStmt.all(tenantId, `%${searchTerm}%`) as any[];

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
                source: row.created_by, timestamp: new Date(row.created_at)
              });
            } catch {
              results.push({
                id: row.id, type: 'shared',
                content: { raw: row.content, type: row.memory_type },
                relevance: 0.6, source: row.created_by, timestamp: new Date(row.created_at)
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
          LIMIT 50
        `);

        const knowledgeRows = knowledgeStmt.all(tenantId, `%${searchTerm}%`, `%${searchTerm}%`) as any[];
        
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
            timestamp: new Date(row.created_at)
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
          LIMIT 50
        `);

        const taskRows = tasksStmt.all(tenantId, `%${searchTerm}%`, `%${searchTerm}%`) as any[];
        
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
            timestamp: new Date(row.created_at)
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

  private async searchInAdvancedSystems(query: string, scope: MemoryScope, results: SearchResult[], tenantId: string = 'default'): Promise<void> {
    try {
      // 1. Semantic search with Weaviate (post-filtered by tenant)
      if (this.weaviateClient && scope.shared) {
        console.log(`🔍 Performing semantic search with Weaviate: "${query}" (tenant: ${tenantId})`);
        const weaviateResults = await this.weaviateClient.searchMemories({
          query,
          tenantId,
        });

        for (const wResult of weaviateResults) {
          results.push({
            id: wResult.id,
            type: 'shared',
            content: {
              original: wResult.content,
              tags: wResult.tags,
              agentId: wResult.agentId,
              source: 'weaviate'
            },
            relevance: (wResult.priority || 5) / 10, // Convert back to 0-1 scale
            source: `weaviate:${wResult.agentId}`,
            timestamp: new Date(wResult.timestamp)
          });
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
      weaviate: { connected: false, type: 'Vector Database' },
      advancedSystemsEnabled: this.isAdvancedSystemsEnabled
    };

    if (this.isAdvancedSystemsEnabled) {
      if (this.weaviateClient) {
        status.weaviate.connected = await this.weaviateClient.healthCheck();
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

    // 2. Unread messages — count only via SQL COUNT (tenant-scoped)
    try {
      this.ensureReadAtColumn();
      const countRow = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM ai_messages WHERE to_agent = ? AND tenant_id = ? AND read_at IS NULL'
      ).get(agentId, tenantId) as any;
      bundle.unreadMessages = {
        count: countRow?.cnt ?? 0,
        hint: 'Use get_ai_messages(agentId) to retrieve',
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
    // Weaviate client doesn't need explicit closing
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
    tenantId: string = 'default'
  ): Promise<string> {
    const id = uuidv4();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO ai_messages (id, from_agent, from_source, to_agent, content, message_type, priority, metadata, tenant_id)
        VALUES (?, ?, 'direct', ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, from, to, content, messageType, priority, JSON.stringify(metadata || {}), tenantId);
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
        }, 'shared', 'ai_message', tenantId);
      }
      throw err;
    }

    // Also store in Weaviate for semantic search if available
    if (this.isAdvancedSystemsEnabled && this.weaviateClient) {
      try {
        await this.weaviateClient.storeMemory({
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
        // Non-critical: Weaviate write failure shouldn't break messaging
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
    } = {}
  ): any[] {
    const limit = options.limit || 50;
    const tenantId = options.tenantId || 'default';

    try {
      // Ensure read_at + archived_at columns exist (idempotent migration)
      this.ensureReadAtColumn();
      this.ensureArchivedAtColumn();

      let query = 'SELECT * FROM ai_messages WHERE to_agent = ? AND tenant_id = ?';
      const params: any[] = [agentId, tenantId];

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
        console.warn('⚠️ ai_messages table not found, falling back to search');
        return [];
      }
      throw err;
    }
  }

  /**
   * Ensure read_at column exists on ai_messages table (idempotent).
   */
  private _readAtColumnChecked = false;
  private ensureReadAtColumn(): void {
    if (this._readAtColumnChecked) return;
    try {
      const cols = this.db.prepare("PRAGMA table_info(ai_messages)").all() as any[];
      const hasReadAt = cols.some((c: any) => c.name === 'read_at');
      if (!hasReadAt) {
        this.db.prepare("ALTER TABLE ai_messages ADD COLUMN read_at TEXT").run();
        console.log('📬 Added read_at column to ai_messages');
      }
      this._readAtColumnChecked = true;
    } catch {
      // Table might not exist yet — skip
    }
  }

  // ─── Task 1200: archived_at column migration ───
  private _archivedAtColumnChecked = false;
  private ensureArchivedAtColumn(): void {
    if (this._archivedAtColumnChecked) return;
    try {
      const cols = this.db.prepare("PRAGMA table_info(ai_messages)").all() as any[];
      const hasArchivedAt = cols.some((c: any) => c.name === 'archived_at');
      if (!hasArchivedAt) {
        this.db.prepare("ALTER TABLE ai_messages ADD COLUMN archived_at TEXT").run();
        this.db.prepare("CREATE INDEX IF NOT EXISTS idx_ai_messages_archived ON ai_messages(archived_at)").run();
        console.log('📦 Added archived_at column + index to ai_messages');
      }
      this._archivedAtColumnChecked = true;
    } catch {
      // Table might not exist yet — skip
    }
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

    if (messageIds && messageIds.length > 0) {
      // Mark specific messages
      const placeholders = messageIds.map(() => '?').join(',');
      const result = this.db.prepare(
        `UPDATE ai_messages SET read_at = ? WHERE id IN (${placeholders}) AND to_agent = ? AND tenant_id = ? AND read_at IS NULL`
      ).run(now, ...messageIds, agentId, tenantId);
      return result.changes;
    } else {
      // Mark all unread for this agent
      const result = this.db.prepare(
        `UPDATE ai_messages SET read_at = ? WHERE to_agent = ? AND tenant_id = ? AND read_at IS NULL`
      ).run(now, agentId, tenantId);
      return result.changes;
    }
  }

  /**
   * Task 1200: Archive messages older than N days for an agent.
   * Returns count of messages archived.
   */
  archiveMessages(
    agentId: string,
    olderThanDays: number,
    tenantId: string = 'default'
  ): number {
    this.ensureArchivedAtColumn();
    const now = new Date().toISOString();
    const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();

    const result = this.db.prepare(
      `UPDATE ai_messages SET archived_at = ? WHERE to_agent = ? AND tenant_id = ? AND created_at < ? AND archived_at IS NULL`
    ).run(now, agentId, tenantId, cutoff);
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
    // Dev auth → trusted
    if (context.authType === 'dev') {
      return { authorized: true };
    }

    // API key auth → require explicit graph:write or * scope
    if (context.authType === 'api_key') {
      const scopes = context.scopes || [];
      const hasWrite = scopes.includes('*') || scopes.includes('graph:write');
      const allowLegacy = process.env.ALLOW_LEGACY_GRAPH_MUTATIONS === '1';
      if (hasWrite || (allowLegacy && scopes.length === 0)) {
        return { authorized: true };
      }
      return { authorized: false, reason: 'API key lacks graph:write scope' };
    }

    // JWT → require admin or owner role
    if (context.authType === 'jwt') {
      if (context.roles.includes('admin') || context.roles.includes('owner')) {
        return { authorized: true };
      }
      return { authorized: false, reason: 'JWT caller requires admin or owner role for graph mutations' };
    }

    return { authorized: false, reason: 'Unknown auth type' };
  }

  /**
   * Find entity rows by name (case-insensitive, tenant-scoped).
   * Codex finding #4: LOWER(json_extract()) for case-insensitive matching.
   */
  findEntitiesByName(entityName: string, tenantId: string): any[] {
    return this.db.prepare(
      `SELECT id, content, created_by, created_at FROM shared_memory
       WHERE tenant_id = ? AND memory_type = 'entity'
       AND LOWER(json_extract(content, '$.name')) = LOWER(?)`
    ).all(tenantId, entityName) as any[];
  }

  /**
   * Find observation rows for an entity (case-insensitive, tenant-scoped).
   */
  findObservationsByEntity(entityName: string, tenantId: string): any[] {
    return this.db.prepare(
      `SELECT id, content, created_by, created_at FROM shared_memory
       WHERE tenant_id = ? AND memory_type = 'observation'
       AND LOWER(json_extract(content, '$.entityName')) = LOWER(?)`
    ).all(tenantId, entityName) as any[];
  }

  /**
   * Find relation rows involving an entity (case-insensitive, tenant-scoped).
   */
  findRelationsByEntity(entityName: string, tenantId: string): any[] {
    return this.db.prepare(
      `SELECT id, content, created_by, created_at FROM shared_memory
       WHERE tenant_id = ? AND memory_type = 'relation'
       AND (LOWER(json_extract(content, '$.from')) = LOWER(?)
            OR LOWER(json_extract(content, '$.to')) = LOWER(?))`
    ).all(tenantId, entityName, entityName) as any[];
  }

  /**
   * Find observations by containsAny substrings (case-insensitive, tenant-scoped).
   * Codex finding #7: escapes % and _ in patterns.
   */
  findObservationsByContainsAny(entityName: string, containsAny: string[], tenantId: string): any[] {
    if (containsAny.length === 0) return [];

    const escapedPatterns = containsAny.map(s => `%${MemoryManager.escapeLikePattern(s)}%`);
    const likeConditions = escapedPatterns.map(() => `LOWER(content) LIKE LOWER(?) ESCAPE '\\'`).join(' OR ');

    const sql = `SELECT id, content, created_by, created_at FROM shared_memory
       WHERE tenant_id = ? AND memory_type = 'observation'
       AND LOWER(json_extract(content, '$.entityName')) = LOWER(?)
       AND (${likeConditions})`;

    return this.db.prepare(sql).all(tenantId, entityName, ...escapedPatterns) as any[];
  }

  /**
   * Delete graph rows from SQLite in a transaction, then attempt Weaviate cleanup.
   * Weaviate failures are tombstoned (codex finding #5).
   */
  async deleteGraphRows(ids: string[], tenantId: string): Promise<{ deleted: number; weaviateCleanup: number; weaviateFailures: number }> {
    if (ids.length === 0) return { deleted: 0, weaviateCleanup: 0, weaviateFailures: 0 };

    // SQLite transaction delete
    const placeholders = ids.map(() => '?').join(',');
    const txn = this.db.transaction(() => {
      return this.db.prepare(
        `DELETE FROM shared_memory WHERE id IN (${placeholders})`
      ).run(...ids);
    });
    const result = txn();

    // Weaviate cleanup (best-effort with tombstone on failure)
    let weaviateCleanup = 0;
    let weaviateFailures = 0;

    if (this.weaviateClient) {
      for (const id of ids) {
        try {
          await this.weaviateClient.deleteMemory(id);
          weaviateCleanup++;
        } catch (err: any) {
          weaviateFailures++;
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
    if (weaviateFailures > 0) {
      void this.retryFailedWeaviateDeletes(25).catch(() => {});
    }

    return { deleted: result.changes, weaviateCleanup, weaviateFailures };
  }

  /**
   * Update observation content in SQLite and re-embed in Weaviate.
   * Codex finding #5: delete+reinsert in Weaviate for vector re-embedding.
   */
  async updateObservationContent(
    obsId: string,
    newContent: string,
    contentIndex: number | undefined,
    tenantId: string
  ): Promise<{ updated: boolean; weaviateReindexed: boolean }> {
    // Fetch current row (constrained to observations only)
    const row = this.db.prepare(
      "SELECT id, content, created_by FROM shared_memory WHERE id = ? AND tenant_id = ? AND memory_type = 'observation'"
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

    // Weaviate: delete + reinsert for vector re-embedding
    let weaviateReindexed = false;
    if (this.weaviateClient) {
      try {
        await this.weaviateClient.deleteMemory(obsId);
        await this.weaviateClient.storeMemory({
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
        weaviateReindexed = true;
      } catch (err: any) {
        // Tombstone for failed Weaviate operation
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

    return { updated: true, weaviateReindexed };
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
   * Retry failed Weaviate deletes from the tombstone queue.
   * Processes oldest-first, removes on success, bumps retry_count on failure.
   */
  async retryFailedWeaviateDeletes(limit = 100): Promise<{ attempted: number; succeeded: number; failed: number }> {
    if (!this.weaviateClient) return { attempted: 0, succeeded: 0, failed: 0 };

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
        await this.weaviateClient.deleteMemory(row.weaviate_id);
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
}
