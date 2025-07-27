-- Neural AI Collaboration Platform - Database Schema
-- SQLite Schema for Message Hub and System Data

-- Enable foreign key support
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- Messages table for inter-agent communication
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    content TEXT NOT NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('collaboration', 'research', 'coordination', 'general', 'consensus')),
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    source TEXT NOT NULL CHECK (source IN ('file', 'http', 'websocket', 'mcp', 'hub')),
    original_location TEXT,
    tags TEXT, -- JSON array
    metadata TEXT, -- JSON object
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'read', 'failed')),
    retry_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Agents table for registration and tracking
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    capabilities TEXT, -- JSON array
    status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'error')),
    trust_score REAL DEFAULT 0.8 CHECK (trust_score >= 0 AND trust_score <= 1),
    last_seen TEXT NOT NULL,
    connection_count INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    instance_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Message events for delivery tracking
CREATE TABLE IF NOT EXISTS message_events (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'delivered', 'read', 'error', 'retry')),
    event_data TEXT, -- JSON object
    timestamp TEXT NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- Consensus proposals and voting
CREATE TABLE IF NOT EXISTS consensus_proposals (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data TEXT NOT NULL, -- JSON object
    proposer_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'voting', 'approved', 'rejected', 'expired')),
    required_majority REAL DEFAULT 0.67,
    timeout_ms INTEGER DEFAULT 10000,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (proposer_id) REFERENCES agents(id)
);

-- Consensus votes
CREATE TABLE IF NOT EXISTS consensus_votes (
    id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    voter_id TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject', 'abstain')),
    confidence REAL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    reasoning TEXT,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (proposal_id) REFERENCES consensus_proposals(id) ON DELETE CASCADE,
    FOREIGN KEY (voter_id) REFERENCES agents(id),
    UNIQUE(proposal_id, voter_id)
);

-- ML performance outcomes for learning
CREATE TABLE IF NOT EXISTS performance_outcomes (
    id TEXT PRIMARY KEY,
    selection_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    actual_response_time REAL NOT NULL,
    actual_reliability REAL NOT NULL,
    actual_success_rate REAL NOT NULL,
    expected_response_time REAL NOT NULL,
    expected_reliability REAL NOT NULL,
    expected_success_rate REAL NOT NULL,
    context TEXT NOT NULL, -- JSON object
    timestamp TEXT NOT NULL,
    FOREIGN KEY (node_id) REFERENCES agents(id)
);

-- ML learned weights for capability selection
CREATE TABLE IF NOT EXISTS learned_weights (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    capability_weights TEXT NOT NULL, -- JSON object
    context_weights TEXT NOT NULL, -- JSON object
    reliability_score REAL DEFAULT 0.5 CHECK (reliability_score >= 0 AND reliability_score <= 1),
    performance_score REAL DEFAULT 0.5 CHECK (performance_score >= 0 AND performance_score <= 1),
    last_updated TEXT NOT NULL,
    FOREIGN KEY (node_id) REFERENCES agents(id),
    UNIQUE(node_id)
);

-- Topology assignments and metrics
CREATE TABLE IF NOT EXISTS topology_assignments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    topology_type TEXT NOT NULL CHECK (topology_type IN ('hierarchical', 'mesh', 'ring', 'star')),
    assigned_nodes TEXT NOT NULL, -- JSON array
    performance_metrics TEXT, -- JSON object
    execution_time INTEGER,
    success BOOLEAN DEFAULT FALSE,
    created_at TEXT NOT NULL,
    completed_at TEXT
);

-- System metrics and monitoring
CREATE TABLE IF NOT EXISTS system_metrics (
    id TEXT PRIMARY KEY,
    metric_type TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT,
    labels TEXT, -- JSON object
    timestamp TEXT NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_from_agent ON messages(from_agent);
CREATE INDEX IF NOT EXISTS idx_messages_to_agent ON messages(to_agent);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(message_type);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);
CREATE INDEX IF NOT EXISTS idx_agents_last_seen ON agents(last_seen);

CREATE INDEX IF NOT EXISTS idx_message_events_message_id ON message_events(message_id);
CREATE INDEX IF NOT EXISTS idx_message_events_timestamp ON message_events(timestamp);

CREATE INDEX IF NOT EXISTS idx_consensus_proposals_status ON consensus_proposals(status);
CREATE INDEX IF NOT EXISTS idx_consensus_votes_proposal_id ON consensus_votes(proposal_id);

CREATE INDEX IF NOT EXISTS idx_performance_outcomes_node_id ON performance_outcomes(node_id);
CREATE INDEX IF NOT EXISTS idx_performance_outcomes_timestamp ON performance_outcomes(timestamp);

CREATE INDEX IF NOT EXISTS idx_topology_assignments_task_id ON topology_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_topology_assignments_topology_type ON topology_assignments(topology_type);

CREATE INDEX IF NOT EXISTS idx_system_metrics_type ON system_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp);