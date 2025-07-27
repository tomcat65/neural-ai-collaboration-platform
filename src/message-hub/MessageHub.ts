import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

// Types for the Message Hub
export interface AIMessage {
  id: string;
  timestamp: string;
  from_agent: string;
  to_agent: string;
  content: string;
  message_type: 'collaboration' | 'research' | 'coordination' | 'general' | 'consensus';
  priority: 'low' | 'medium' | 'high' | 'critical';
  source: 'file' | 'http' | 'websocket' | 'mcp' | 'hub';
  original_location?: string | undefined;
  tags?: string[] | undefined;
  metadata?: Record<string, any> | undefined;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  name: string;
  type: string;
  capabilities?: string[] | undefined;
  status: 'active' | 'inactive' | 'error';
  last_seen: string;
  created_at: string;
  updated_at: string;
}

export interface MessageFilters {
  from_agent?: string;
  to_agent?: string;
  message_type?: string;
  priority?: string;
  source?: string;
  limit?: number;
  offset?: number;
  since?: string;
  until?: string;
}

export interface MessageEvent {
  id: string;
  message_id: string;
  event_type: 'sent' | 'delivered' | 'read' | 'error';
  event_data?: Record<string, any> | undefined;
  timestamp: string;
}

export class MessageHub {
  private db: Database | null = null;
  private dbPath: string;
  private isInitialized = false;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'message-hub.db');
  }

  /**
   * Initialize the Message Hub database
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Open database connection
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });

      // Initialize schema
      await this.initializeSchema();
      
      this.isInitialized = true;
      console.log('✅ Message Hub initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Message Hub:', error);
      throw error;
    }
  }

  /**
   * Initialize database schema
   */
  private async initializeSchema(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Set performance optimization settings (must be outside transaction)
    await this.db.exec('PRAGMA journal_mode = WAL');
    await this.db.exec('PRAGMA synchronous = NORMAL');
    await this.db.exec('PRAGMA cache_size = 10000');
    await this.db.exec('PRAGMA temp_store = MEMORY');
    await this.db.exec('PRAGMA mmap_size = 268435456');

    const schemaPath = path.join(__dirname, 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute schema in transactions
    await this.db.exec('BEGIN TRANSACTION');
    try {
      await this.db.exec(schema);
      await this.db.exec('COMMIT');
    } catch (error) {
      await this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Store a new message
   */
  async storeMessage(message: Omit<AIMessage, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    const id = uuidv4();
    const now = new Date().toISOString();

    const messageData: AIMessage = {
      id,
      timestamp: message.timestamp,
      from_agent: message.from_agent,
      to_agent: message.to_agent,
      content: message.content,
      message_type: message.message_type,
      priority: message.priority,
      source: message.source,
      original_location: message.original_location,
      tags: message.tags,
      metadata: message.metadata,
      created_at: now,
      updated_at: now
    };

    // Convert tags and metadata to JSON strings for storage
    const tagsJson = messageData.tags ? JSON.stringify(messageData.tags) : null;
    const metadataJson = messageData.metadata ? JSON.stringify(messageData.metadata) : null;

    await this.db.run(`
      INSERT INTO messages (
        id, timestamp, from_agent, to_agent, content, message_type, 
        priority, source, original_location, tags, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      messageData.id, messageData.timestamp, messageData.from_agent, messageData.to_agent,
      messageData.content, messageData.message_type, messageData.priority, messageData.source,
      messageData.original_location, tagsJson, metadataJson,
      messageData.created_at, messageData.updated_at
    ]);

    // Log message event
    await this.logMessageEvent(id, 'sent', { from: message.from_agent, to: message.to_agent });

    return id;
  }

  /**
   * Retrieve a specific message by ID
   */
  async getMessage(messageId: string): Promise<AIMessage | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = await this.db.get('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (!row) return null;

    return this.parseMessageRow(row);
  }

  /**
   * List messages with optional filters
   */
  async listMessages(filters: MessageFilters = {}): Promise<AIMessage[]> {
    if (!this.db) throw new Error('Database not initialized');

    let query = 'SELECT * FROM messages WHERE 1=1';
    const params: any[] = [];

    if (filters.from_agent) {
      query += ' AND from_agent = ?';
      params.push(filters.from_agent);
    }

    if (filters.to_agent) {
      query += ' AND to_agent = ?';
      params.push(filters.to_agent);
    }

    if (filters.message_type) {
      query += ' AND message_type = ?';
      params.push(filters.message_type);
    }

    if (filters.priority) {
      query += ' AND priority = ?';
      params.push(filters.priority);
    }

    if (filters.source) {
      query += ' AND source = ?';
      params.push(filters.source);
    }

    if (filters.since) {
      query += ' AND timestamp >= ?';
      params.push(filters.since);
    }

    if (filters.until) {
      query += ' AND timestamp <= ?';
      params.push(filters.until);
    }

    query += ' ORDER BY timestamp DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const rows = await this.db.all(query, params);
    return rows.map(row => this.parseMessageRow(row));
  }

  /**
   * Get recent messages (last 50 by default)
   */
  async getRecentMessages(limit: number = 50): Promise<AIMessage[]> {
    return this.listMessages({ limit });
  }

  /**
   * Get messages for a specific agent
   */
  async getAgentMessages(agentId: string, limit: number = 50): Promise<AIMessage[]> {
    return this.listMessages({ 
      to_agent: agentId, 
      limit 
    });
  }

  /**
   * Search messages by content
   */
  async searchMessages(query: string, limit: number = 50): Promise<AIMessage[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.all(`
      SELECT * FROM messages 
      WHERE content LIKE ? OR from_agent LIKE ? OR to_agent LIKE ?
      ORDER BY timestamp DESC 
      LIMIT ?
    `, [`%${query}%`, `%${query}%`, `%${query}%`, limit]);

    return rows.map(row => this.parseMessageRow(row));
  }

  /**
   * Register or update an agent
   */
  async registerAgent(agent: Omit<Agent, 'created_at' | 'updated_at'>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const capabilities = agent.capabilities ? JSON.stringify(agent.capabilities) : null;

    await this.db.run(`
      INSERT OR REPLACE INTO agents (
        id, name, type, capabilities, status, last_seen, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      agent.id, agent.name, agent.type, capabilities, agent.status, 
      agent.last_seen, now, now
    ]);
  }

  /**
   * Get all registered agents
   */
  async getAgents(): Promise<Agent[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.all('SELECT * FROM agents ORDER BY last_seen DESC');
    return rows.map(row => ({
      ...row,
      capabilities: row.capabilities ? JSON.parse(row.capabilities) : undefined
    }));
  }

  /**
   * Log a message event
   */
  private async logMessageEvent(messageId: string, eventType: string, eventData?: Record<string, any>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const id = uuidv4();
    const now = new Date().toISOString();
    const data = eventData ? JSON.stringify(eventData) : null;

    await this.db.run(`
      INSERT INTO message_events (id, message_id, event_type, event_data, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `, [id, messageId, eventType, data, now]);
  }

  /**
   * Parse database row to AIMessage object
   */
  private parseMessageRow(row: any): AIMessage {
    return {
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalMessages: number;
    totalAgents: number;
    recentActivity: number;
    averageResponseTime: number;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    const [messageCount] = await this.db.get('SELECT COUNT(*) as count FROM messages');
    const [agentCount] = await this.db.get('SELECT COUNT(*) as count FROM agents');
    const [recentCount] = await this.db.get(`
      SELECT COUNT(*) as count FROM messages 
      WHERE timestamp >= datetime('now', '-1 hour')
    `);

    return {
      totalMessages: messageCount.count,
      totalAgents: agentCount.count,
      recentActivity: recentCount.count,
      averageResponseTime: 0 // TODO: Calculate from message events
    };
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
} 