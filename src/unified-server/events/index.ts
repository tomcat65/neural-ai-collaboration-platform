// Collaborative Event System Implementation
import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { 
  CollaborativeEvent, 
  EventType, 
  EventCallback, 
  EventFilter,
  EventPayload,
  MemoryUpdate,
  CoordinationData 
} from '../types/events.js';

export class CollaborativeEventSystem extends EventEmitter {
  private db: Database.Database;
  private subscribers: Map<string, Set<EventCallback>>;
  private wsClients: Map<string, WebSocket>;
  private eventHistory: CollaborativeEvent[];
  private readonly MAX_HISTORY = 10000;

  constructor(dbPath: string = './data/unified-platform.db') {
    super();
    this.db = new Database(dbPath);
    this.subscribers = new Map();
    this.wsClients = new Map();
    this.eventHistory = [];
    
    this.initializeDatabase();
    this.loadRecentEvents();
  }

  private initializeDatabase(): void {
    // Create events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        memory_update TEXT,
        coordination_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
      CREATE INDEX IF NOT EXISTS idx_events_agent_id ON events(agent_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    `);

    console.log('📊 Collaborative event database initialized');
  }

  private loadRecentEvents(): void {
    const stmt = this.db.prepare(`
      SELECT * FROM events 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    
    const rows = stmt.all(this.MAX_HISTORY);
    this.eventHistory = rows.map(row => this.rowToEvent(row)).reverse();
    
    console.log(`📚 Loaded ${this.eventHistory.length} recent events`);
  }

  private rowToEvent(row: any): CollaborativeEvent {
    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      sessionId: row.session_id,
      agentId: row.agent_id,
      type: row.event_type as EventType,
      payload: JSON.parse(row.payload),
      memory: row.memory_update ? JSON.parse(row.memory_update) : undefined,
      coordination: row.coordination_data ? JSON.parse(row.coordination_data) : undefined
    };
  }

  async publishEvent(event: Omit<CollaborativeEvent, 'id' | 'timestamp'>): Promise<string> {
    const fullEvent: CollaborativeEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      ...event
    };

    // Store in database
    const stmt = this.db.prepare(`
      INSERT INTO events (
        id, session_id, agent_id, event_type, 
        payload, memory_update, coordination_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      fullEvent.id,
      fullEvent.sessionId,
      fullEvent.agentId,
      fullEvent.type,
      JSON.stringify(fullEvent.payload || {}),
      fullEvent.memory ? JSON.stringify(fullEvent.memory) : '{}',
      fullEvent.coordination ? JSON.stringify(fullEvent.coordination) : '{}'
    );

    // Add to in-memory history
    this.eventHistory.push(fullEvent);
    if (this.eventHistory.length > this.MAX_HISTORY) {
      this.eventHistory.shift();
    }

    // Notify subscribers
    await this.notifySubscribers(fullEvent);

    // Broadcast to WebSocket clients
    this.broadcastToClients(fullEvent);

    // Emit for internal listeners
    this.emit('event', fullEvent);

    console.log(`📡 Published event: ${fullEvent.type} from ${fullEvent.agentId}`);
    return fullEvent.id;
  }

  async subscribeToEvents(agentId: string, callback: EventCallback): Promise<void> {
    if (!this.subscribers.has(agentId)) {
      this.subscribers.set(agentId, new Set());
    }
    this.subscribers.get(agentId)!.add(callback);
    
    console.log(`🔔 Agent ${agentId} subscribed to events`);
  }

  async unsubscribeFromEvents(agentId: string, callback?: EventCallback): Promise<void> {
    const agentSubscribers = this.subscribers.get(agentId);
    if (!agentSubscribers) return;

    if (callback) {
      agentSubscribers.delete(callback);
    } else {
      agentSubscribers.clear();
    }

    if (agentSubscribers.size === 0) {
      this.subscribers.delete(agentId);
    }

    console.log(`🔕 Agent ${agentId} unsubscribed from events`);
  }

  async getEventHistory(filter: EventFilter = {}): Promise<CollaborativeEvent[]> {
    let query = 'SELECT * FROM events WHERE 1=1';
    const params: any[] = [];

    if (filter.sessionId) {
      query += ' AND session_id = ?';
      params.push(filter.sessionId);
    }

    if (filter.agentId) {
      query += ' AND agent_id = ?';
      params.push(filter.agentId);
    }

    if (filter.type) {
      query += ' AND event_type = ?';
      params.push(filter.type);
    }

    if (filter.startTime) {
      query += ' AND timestamp >= ?';
      params.push(filter.startTime.toISOString());
    }

    if (filter.endTime) {
      query += ' AND timestamp <= ?';
      params.push(filter.endTime.toISOString());
    }

    query += ' ORDER BY timestamp DESC';

    if (filter.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);
    
    return rows.map(row => this.rowToEvent(row));
  }

  getRecentEvents(count: number = 100): CollaborativeEvent[] {
    return this.eventHistory.slice(-count);
  }

  addWebSocketClient(agentId: string, ws: WebSocket): void {
    this.wsClients.set(agentId, ws);
    
    ws.on('close', () => {
      this.wsClients.delete(agentId);
      console.log(`🔌 WebSocket client ${agentId} disconnected`);
    });

    // Send recent events to new client
    const recentEvents = this.getRecentEvents(50);
    ws.send(JSON.stringify({
      type: 'event_history',
      events: recentEvents
    }));

    console.log(`🔌 WebSocket client ${agentId} connected`);
  }

  private async notifySubscribers(event: CollaborativeEvent): Promise<void> {
    for (const [agentId, callbacks] of this.subscribers) {
      // Skip notifying the agent who published the event (optional)
      if (agentId === event.agentId) continue;

      for (const callback of callbacks) {
        try {
          callback(event);
        } catch (error) {
          console.error(`❌ Error in event callback for agent ${agentId}:`, error);
        }
      }
    }
  }

  private broadcastToClients(event: CollaborativeEvent): void {
    const message = JSON.stringify({
      type: 'new_event',
      event: event
    });

    for (const [agentId, ws] of this.wsClients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
        } catch (error) {
          console.error(`❌ Error sending event to ${agentId}:`, error);
          this.wsClients.delete(agentId);
        }
      }
    }
  }

  // Utility methods for common event types
  async publishTaskEvent(
    agentId: string, 
    sessionId: string, 
    type: EventType, 
    payload: EventPayload,
    coordination?: CoordinationData
  ): Promise<string> {
    const eventData: Omit<CollaborativeEvent, 'id' | 'timestamp'> = {
      agentId,
      sessionId,
      type,
      payload
    };
    
    if (coordination) {
      eventData.coordination = coordination;
    }
    
    return this.publishEvent(eventData);
  }

  async publishAgentMessage(
    fromAgent: string,
    sessionId: string,
    message: string,
    toAgent?: string,
    messageType: 'info' | 'question' | 'request' | 'response' = 'info'
  ): Promise<string> {
    return this.publishEvent({
      agentId: fromAgent,
      sessionId,
      type: EventType.AGENT_MESSAGE,
      payload: {
        to: toAgent,
        message,
        messageType
      },
      coordination: {
        targetAgents: toAgent ? [toAgent] : undefined,
        requiresResponse: messageType === 'question' || messageType === 'request'
      }
    });
  }

  async publishMemoryUpdate(
    agentId: string,
    sessionId: string,
    memoryUpdate: MemoryUpdate
  ): Promise<string> {
    return this.publishEvent({
      agentId,
      sessionId,
      type: EventType.MEMORY_UPDATED,
      payload: {
        operation: memoryUpdate.operation,
        type: memoryUpdate.type
      },
      memory: memoryUpdate
    });
  }

  getAgentActivity(agentId: string, hours: number = 24): CollaborativeEvent[] {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.eventHistory.filter(event => 
      event.agentId === agentId && event.timestamp >= since
    );
  }

  getSessionActivity(sessionId: string): CollaborativeEvent[] {
    return this.eventHistory.filter(event => event.sessionId === sessionId);
  }

  close(): void {
    this.db.close();
    this.wsClients.clear();
    this.subscribers.clear();
    this.eventHistory = [];
    console.log('📡 Collaborative event system closed');
  }
}