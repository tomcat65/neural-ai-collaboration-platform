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

export class MemoryManager {
  private db: Database.Database;
  private memorySystem: MemorySystem;

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
  }

  private initializeDatabase(): void {
    // Individual Memory Tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS individual_memory (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        content TEXT NOT NULL,
        importance REAL DEFAULT 0.5,
        tags TEXT,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_individual_agent_id ON individual_memory(agent_id);
      CREATE INDEX IF NOT EXISTS idx_individual_type ON individual_memory(memory_type);
      CREATE INDEX IF NOT EXISTS idx_individual_importance ON individual_memory(importance);
    `);

    // Shared Memory Tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shared_memory (
        id TEXT PRIMARY KEY,
        memory_type TEXT NOT NULL,
        content TEXT NOT NULL,
        created_by TEXT NOT NULL,
        tags TEXT,
        version INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_shared_type ON shared_memory(memory_type);
      CREATE INDEX IF NOT EXISTS idx_shared_created_by ON shared_memory(created_by);
    `);

    // Task Management Tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
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

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
    `);

    // Knowledge Base Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shared_knowledge (
        id TEXT PRIMARY KEY,
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

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_type ON shared_knowledge(type);
      CREATE INDEX IF NOT EXISTS idx_knowledge_source ON shared_knowledge(source);
      CREATE INDEX IF NOT EXISTS idx_knowledge_confidence ON shared_knowledge(confidence);
    `);

    // Consensus History Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS consensus_history (
        id TEXT PRIMARY KEY,
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

    // Project Artifacts Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_artifacts (
        id TEXT PRIMARY KEY,
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

    console.log('🧠 Memory database initialized');
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

    console.log(`💾 Stored ${scope} memory (${type}) for agent ${agentId}`);
    return id;
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

    return Array.from(uniqueResults.values()).sort((a, b) => b.relevance - a.relevance);
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

  close(): void {
    this.db.close();
    console.log('🧠 Memory manager closed');
  }
}