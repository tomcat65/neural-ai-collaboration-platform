// Hierarchical Memory Manager Implementation
import Database from 'better-sqlite3';
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
  public weaviateClient?: WeaviateClient;
  private isAdvancedSystemsEnabled: boolean = false;
  private isDualWriteEnabled: boolean = false;

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

    // Migration: Add tenant_id column to existing tables if missing BEFORE creating tenant indexes
    this.migrateAddTenantColumn();

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
    // Load individual memory
    const individualStmt = this.db.prepare(`
      SELECT agent_id, memory_type, content, importance, tags, created_at, updated_at
      FROM individual_memory
      ORDER BY agent_id, importance DESC
    `);

    const individualRows = individualStmt.all() as any[];
    const agentGroups = new Map<string, any[]>();

    for (const row of individualRows) {
      if (!agentGroups.has((row as any).agent_id)) {
        agentGroups.set((row as any).agent_id, []);
      }
      agentGroups.get((row as any).agent_id)!.push(row);
    }

    for (const [agentId, rows] of agentGroups) {
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

      this.memorySystem.individual.set(agentId, memory);
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

  async store(agentId: string, memory: any, scope: 'individual' | 'shared', type: string): Promise<string> {
    const id = uuidv4();
    
    // 1. Store in SQLite (primary storage)
    if (scope === 'individual') {
      const stmt = this.db.prepare(`
        INSERT INTO individual_memory (id, agent_id, memory_type, content, importance, tags)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        id,
        agentId,
        type,
        JSON.stringify(memory),
        (memory && memory.importance) || 0.5,
        JSON.stringify((memory && memory.tags) || [])
      );

      // Update in-memory cache
      if (!this.memorySystem.individual.has(agentId)) {
        this.memorySystem.individual.set(agentId, {
          agentId,
          preferences: {} as AgentPreferences,
          learnings: [],
          privateContext: [],
          capabilities: []
        });
      }

      const agentMemory = this.memorySystem.individual.get(agentId)!;
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
        INSERT INTO shared_memory (id, memory_type, content, created_by, tags)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
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
      await this.storeInAdvancedSystems(id, agentId, memory, scope, type);
    }

    console.log(`💾 Stored ${scope} memory (${type}) for agent ${agentId}${this.isAdvancedSystemsEnabled ? ' [Multi-DB]' : ' [SQLite]'}`);
    return id;
  }

  private async storeInAdvancedSystems(id: string, agentId: string, memory: any, scope: string, type: string): Promise<void> {
    try {
      // Store in Weaviate for semantic search
      if (this.weaviateClient) {
        await this.weaviateClient.storeMemory({
          id,
          agentId,
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

  async search(query: string, scope: MemoryScope | string): Promise<SearchResult[]> {
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

    // 2. Enhanced search with advanced systems
    if (this.isAdvancedSystemsEnabled) {
      await this.searchInAdvancedSystems(query, searchScope, results);
    }

    // Search in-memory data first
    if (searchScope.individual) {
      for (const [agentId, memory] of this.memorySystem.individual) {
        // Search in learnings and private context
        for (const learning of memory.learnings) {
          if (learning.lesson.toLowerCase().includes(searchTerm) ||
              learning.context.toLowerCase().includes(searchTerm)) {
            results.push({
              id: learning.id,
              type: 'individual',
              content: learning,
              relevance: 0.8,
              source: agentId,
              timestamp: learning.timestamp
            });
          }
        }

        for (const context of memory.privateContext) {
          if (context.content.toLowerCase().includes(searchTerm)) {
            results.push({
              id: context.id,
              type: 'individual',
              content: context,
              relevance: context.importance,
              source: agentId,
              timestamp: context.createdAt
            });
          }
        }
      }
      
      // Search individual_memory table directly
      try {
        const individualStmt = this.db.prepare(`
          SELECT id, agent_id, memory_type, content, importance, created_at 
          FROM individual_memory 
          WHERE LOWER(content) LIKE ? 
          ORDER BY importance DESC 
          LIMIT 50
        `);
        
        const individualRows = individualStmt.all(`%${searchTerm}%`) as any[];
        
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
      // Search in shared knowledge
      for (const knowledge of this.memorySystem.shared.knowledge) {
        if (knowledge.title.toLowerCase().includes(searchTerm) ||
            knowledge.content.toLowerCase().includes(searchTerm)) {
          results.push({
            id: knowledge.id,
            type: 'shared',
            content: knowledge,
            relevance: knowledge.confidence,
            source: knowledge.source,
            timestamp: knowledge.createdAt
          });
        }
      }

      // Search in tasks
      for (const task of this.memorySystem.shared.tasks.tasks.values()) {
        if (task.title.toLowerCase().includes(searchTerm) ||
            task.description.toLowerCase().includes(searchTerm)) {
          results.push({
            id: task.id,
            type: 'shared',
            content: task,
            relevance: 0.7,
            source: task.createdBy,
            timestamp: task.createdAt
          });
        }
      }
      
      // Search shared_memory table directly
      try {
        const sharedStmt = this.db.prepare(`
          SELECT id, memory_type, content, created_by, created_at 
          FROM shared_memory 
          WHERE LOWER(content) LIKE ? 
          ORDER BY created_at DESC 
          LIMIT 50
        `);
        
        const sharedRows = sharedStmt.all(`%${searchTerm}%`) as any[];
        
        for (const row of sharedRows) {
          try {
            const content = JSON.parse(row.content);
            results.push({
              id: row.id,
              type: 'shared',
              content: content,
              relevance: 0.6,
              source: row.created_by,
              timestamp: new Date(row.created_at)
            });
          } catch (parseError) {
            // If JSON parse fails, include raw content
            results.push({
              id: row.id,
              type: 'shared',
              content: { raw: row.content, type: row.memory_type },
              relevance: 0.6,
              source: row.created_by,
              timestamp: new Date(row.created_at)
            });
          }
        }
      } catch (dbError) {
        console.warn('🔍 Database search error for shared memory:', dbError);
      }
      
      // Search shared_knowledge table directly
      try {
        const knowledgeStmt = this.db.prepare(`
          SELECT id, title, content, type, source, confidence, created_at 
          FROM shared_knowledge 
          WHERE LOWER(title) LIKE ? OR LOWER(content) LIKE ?
          ORDER BY confidence DESC 
          LIMIT 50
        `);
        
        const knowledgeRows = knowledgeStmt.all(`%${searchTerm}%`, `%${searchTerm}%`) as any[];
        
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
      
      // Search tasks table directly
      try {
        const tasksStmt = this.db.prepare(`
          SELECT id, title, description, status, created_by, created_at 
          FROM tasks 
          WHERE LOWER(title) LIKE ? OR LOWER(description) LIKE ?
          ORDER BY created_at DESC 
          LIMIT 50
        `);
        
        const taskRows = tasksStmt.all(`%${searchTerm}%`, `%${searchTerm}%`) as any[];
        
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

  private async searchInAdvancedSystems(query: string, scope: MemoryScope, results: SearchResult[]): Promise<void> {
    try {
      // 1. Semantic search with Weaviate
      if (this.weaviateClient && scope.shared) {
        console.log(`🔍 Performing semantic search with Weaviate: "${query}"`);
        const weaviateResults = await this.weaviateClient.searchMemories(query);
        
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

  getAgentMemory(agentId: string): IndividualMemory | undefined {
    return this.memorySystem.individual.get(agentId);
  }

  getSharedMemory(): SharedMemory {
    return this.memorySystem.shared;
  }

  async recordLearning(agentId: string, context: string, lesson: string, confidence: number = 0.8): Promise<void> {
    const learning: LearningHistory = {
      id: uuidv4(),
      timestamp: new Date(),
      context,
      lesson,
      confidence,
      reinforcements: 1
    };

    await this.store(agentId, learning, 'individual', 'learning');
  }

  async updateAgentPreferences(agentId: string, preferences: Partial<AgentPreferences>): Promise<void> {
    const currentMemory = this.memorySystem.individual.get(agentId);
    if (currentMemory) {
      currentMemory.preferences = { ...currentMemory.preferences, ...preferences };
      await this.store(agentId, currentMemory.preferences, 'individual', 'preferences');
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
    metadata?: Record<string, any>
  ): Promise<string> {
    const id = uuidv4();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO ai_messages (id, from_agent, from_source, to_agent, content, message_type, priority, metadata)
        VALUES (?, ?, 'direct', ?, ?, ?, ?, ?)
      `);
      stmt.run(id, from, to, content, messageType, priority, JSON.stringify(metadata || {}));
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
        }, 'shared', 'ai_message');
      }
      throw err;
    }

    // Also store in Weaviate for semantic search if available
    if (this.isAdvancedSystemsEnabled && this.weaviateClient) {
      try {
        await this.weaviateClient.storeMemory({
          id,
          agentId: from,
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
    } = {}
  ): any[] {
    const limit = options.limit || 50;

    try {
      let query = 'SELECT * FROM ai_messages WHERE to_agent = ?';
      const params: any[] = [agentId];

      if (options.messageType) {
        query += ' AND message_type = ?';
        params.push(options.messageType);
      }
      if (options.since) {
        query += ' AND created_at >= ?';
        params.push(options.since);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      return this.db.prepare(query).all(...params) as any[];
    } catch (err: any) {
      if (err.message?.includes('no such table')) {
        console.warn('⚠️ ai_messages table not found, falling back to search');
        return [];
      }
      throw err;
    }
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
}
