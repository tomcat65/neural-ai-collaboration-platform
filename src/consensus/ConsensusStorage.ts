import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { 
  RaftNode, 
  RaftLogEntry, 
  VoteRequest, 
  VoteResponse, 
  AppendEntriesRequest 
} from './RaftStateMachine';

export interface ConsensusNodeRecord {
  id: string;
  nodeId: string;
  state: string;
  currentTerm: number;
  votedFor: string | null;
  lastHeartbeat: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VoteRequestRecord {
  id: string;
  requestId: string;
  term: number;
  candidateId: string;
  lastLogIndex: number;
  lastLogTerm: number;
  timestamp: string;
  createdAt: string;
}

export interface VoteResponseRecord {
  id: string;
  requestId: string;
  voterId: string;
  term: number;
  voteGranted: boolean;
  timestamp: string;
  createdAt: string;
}

export interface ConsensusLogRecord {
  id: string;
  term: number;
  logIndex: number;
  command: string;
  data: string;
  isCommitted: boolean;
  timestamp: string;
  createdAt: string;
}

export class ConsensusStorage {
  private db: Database | null = null;
  private dbPath: string;
  private isInitialized = false;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'consensus.db');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });

      // Set performance optimization settings (must be outside transaction)
      await this.db.exec('PRAGMA journal_mode = WAL');
      await this.db.exec('PRAGMA synchronous = NORMAL');
      await this.db.exec('PRAGMA cache_size = 10000');
      await this.db.exec('PRAGMA temp_store = MEMORY');
      await this.db.exec('PRAGMA mmap_size = 268435456');

      await this.initializeSchema();
      this.isInitialized = true;
      console.log('✅ Consensus Storage initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Consensus Storage:', error);
      throw error;
    }
  }

  private async initializeSchema(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const schemaPath = path.join(__dirname, 'database', 'consensus-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await this.db.exec(schema);
  }

  // Node management
  async registerNode(node: RaftNode): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.run(`
      INSERT OR REPLACE INTO consensus_nodes 
      (id, node_id, state, current_term, voted_for, last_heartbeat, is_active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      uuidv4(),
      node.id,
      node.state,
      node.currentTerm,
      node.votedFor,
      new Date(node.lastHeartbeat).toISOString(),
      1
    ]);
  }

  async updateNodeState(nodeId: string, state: string, term: number, votedFor?: string | null): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.run(`
      UPDATE consensus_nodes 
      SET state = ?, current_term = ?, voted_for = ?, updated_at = datetime('now')
      WHERE node_id = ?
    `, [state, term, votedFor, nodeId]);
  }

  async getNode(nodeId: string): Promise<ConsensusNodeRecord | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.get(`
      SELECT * FROM consensus_nodes WHERE node_id = ?
    `, [nodeId]);
    
    return result || null;
  }

  async getAllActiveNodes(): Promise<ConsensusNodeRecord[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    return await this.db.all(`
      SELECT * FROM consensus_nodes WHERE is_active = 1
    `);
  }

  // Vote management
  async storeVoteRequest(request: VoteRequest): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');
    
    const requestId = uuidv4();
    await this.db.run(`
      INSERT INTO vote_requests 
      (id, request_id, term, candidate_id, last_log_index, last_log_term, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      uuidv4(),
      requestId,
      request.term,
      request.candidateId,
      request.lastLogIndex,
      request.lastLogTerm,
      new Date().toISOString()
    ]);
    
    return requestId;
  }

  async storeVoteResponse(requestId: string, response: VoteResponse, voterId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.run(`
      INSERT INTO vote_responses 
      (id, request_id, voter_id, term, vote_granted, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      uuidv4(),
      requestId,
      voterId,
      response.term,
      response.voteGranted ? 1 : 0,
      new Date().toISOString()
    ]);
  }

  async getVoteResponses(requestId: string): Promise<VoteResponseRecord[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    return await this.db.all(`
      SELECT * FROM vote_responses WHERE request_id = ?
    `, [requestId]);
  }

  async countVotesForTerm(term: number): Promise<{ total: number; granted: number }> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN vote_granted THEN 1 ELSE 0 END) as granted
      FROM vote_responses 
      WHERE term = ?
    `, [term]);
    
    return {
      total: result?.total || 0,
      granted: result?.granted || 0
    };
  }

  // Log management
  async appendLogEntry(entry: RaftLogEntry): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.run(`
      INSERT INTO consensus_log 
      (id, term, log_index, command, data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      uuidv4(),
      entry.term,
      entry.index,
      entry.command,
      JSON.stringify(entry.data),
      new Date().toISOString()
    ]);
  }

  async getLogEntries(fromIndex: number, toIndex: number): Promise<ConsensusLogRecord[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    return await this.db.all(`
      SELECT * FROM consensus_log 
      WHERE log_index >= ? AND log_index <= ?
      ORDER BY log_index ASC
    `, [fromIndex, toIndex]);
  }

  async getLastLogEntry(): Promise<ConsensusLogRecord | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.get(`
      SELECT * FROM consensus_log 
      ORDER BY log_index DESC 
      LIMIT 1
    `);
    
    return result || null;
  }

  async commitLogEntries(upToIndex: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.run(`
      UPDATE consensus_log 
      SET is_committed = 1 
      WHERE log_index <= ?
    `, [upToIndex]);
  }

  // Term management
  async startNewTerm(term: number, leaderId?: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    // End previous term
    await this.db.run(`
      UPDATE consensus_terms 
      SET end_time = datetime('now') 
      WHERE end_time IS NULL
    `);
    
    // Start new term
    await this.db.run(`
      INSERT INTO consensus_terms 
      (id, term_number, leader_id, start_time)
      VALUES (?, ?, ?, datetime('now'))
    `, [uuidv4(), term, leaderId]);
  }

  async updateCurrentTerm(term: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.run(`
      UPDATE consensus_state 
      SET current_term = ?, last_updated = datetime('now')
      WHERE id = 'default'
    `, [term]);
  }

  async getCurrentTerm(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.get(`
      SELECT current_term FROM consensus_state WHERE id = 'default'
    `);
    
    return result?.current_term || 0;
  }

  // Election tracking
  async recordElection(term: number, candidateId: string, totalVotes: number): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');
    
    const electionId = uuidv4();
    await this.db.run(`
      INSERT INTO election_history 
      (id, term, candidate_id, total_votes, election_start)
      VALUES (?, ?, ?, ?, datetime('now'))
    `, [electionId, term, candidateId, totalVotes]);
    
    return electionId;
  }

  async completeElection(electionId: string, votesReceived: number, result: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.run(`
      UPDATE election_history 
      SET votes_received = ?, election_end = datetime('now'), result = ?
      WHERE id = ?
    `, [votesReceived, result, electionId]);
  }

  // Statistics and monitoring
  async getClusterStats(): Promise<{
    totalNodes: number;
    activeNodes: number;
    currentTerm: number;
    currentLeader: string | null;
    totalLogEntries: number;
    committedEntries: number;
  }> {
    if (!this.db) throw new Error('Database not initialized');
    
    const [nodeStats, logStats, leader] = await Promise.all([
      this.db.get('SELECT COUNT(*) as total, SUM(is_active) as active FROM consensus_nodes'),
      this.db.get('SELECT COUNT(*) as total, SUM(is_committed) as committed FROM consensus_log'),
      this.db.get('SELECT node_id FROM consensus_nodes WHERE state = "leader" AND is_active = 1 LIMIT 1'),
      this.getCurrentTerm()
    ]);
    
    return {
      totalNodes: nodeStats?.total || 0,
      activeNodes: nodeStats?.active || 0,
      currentTerm: await this.getCurrentTerm(),
      currentLeader: leader?.node_id || null,
      totalLogEntries: logStats?.total || 0,
      committedEntries: logStats?.committed || 0
    };
  }

  // Cleanup and maintenance
  async cleanupOldData(daysToKeep: number = 30): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    await Promise.all([
      this.db.run('DELETE FROM vote_requests WHERE created_at < ?', [cutoffDate.toISOString()]),
      this.db.run('DELETE FROM vote_responses WHERE created_at < ?', [cutoffDate.toISOString()]),
      this.db.run('DELETE FROM election_history WHERE created_at < ?', [cutoffDate.toISOString()])
    ]);
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
} 