import { EventEmitter } from 'events';
import ConflictResolver, { 
  ConflictingSelection, 
  ConflictContext, 
  ConflictResolution, 
  ResolutionOutcome 
} from './conflict-resolver.js';
import { SelectedNode } from '../selection/capability-selector.js';

export interface IConflictResolutionEngine {
  // Main engine operations
  processSelections(selections: SelectedNode[], context: EngineContext): Promise<ProcessedSelections>;
  resolveConflicts(conflicts: ConflictingSelection[], context: ConflictContext): Promise<ConflictResolution>;
  
  // Engine management
  enableStrategy(strategy: ResolutionStrategy): Promise<void>;
  disableStrategy(strategy: ResolutionStrategy): Promise<void>;
  getEngineStatus(): Promise<EngineStatus>;
  
  // Integration points
  integrateWithVotingConsensus(): Promise<void>;
  integrateWithTopologyManager(): Promise<void>;
  integrateWithMLSystems(): Promise<void>;
}

export interface EngineContext {
  systemLoad: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  priority: 'speed' | 'accuracy' | 'consensus';
  availableVoters: string[];
  topologyConstraints: string[];
  mlEnabled: boolean;
  votingTimeout: number;
}

export interface ProcessedSelections {
  originalSelections: SelectedNode[];
  resolvedSelections: SelectedNode[];
  conflictsDetected: number;
  conflictsResolved: number;
  processingTime: number;
  engineMetrics: EngineMetrics;
}

export type ResolutionStrategy = 'voting' | 'topology' | 'ml' | 'hybrid' | 'auto';

export interface EngineStatus {
  active: boolean;
  enabledStrategies: ResolutionStrategy[];
  processingQueue: number;
  lastProcessingTime: number;
  totalProcessed: number;
  successRate: number;
}

export interface EngineMetrics {
  totalProcessed: number;
  conflictsDetected: number;
  conflictsResolved: number;
  averageProcessingTime: number;
  strategyUsage: Map<ResolutionStrategy, number>;
  successRates: Map<ResolutionStrategy, number>;
  stakeholderSatisfaction: number;
}

export class ConflictResolutionEngine extends EventEmitter implements IConflictResolutionEngine {
  private conflictResolver: ConflictResolver;
  private enabledStrategies: Set<ResolutionStrategy> = new Set(['auto']);
  private processingQueue: Array<{ selections: SelectedNode[]; context: EngineContext }> = [];
  private isProcessing: boolean = false;
  private metrics: EngineMetrics = {
    totalProcessed: 0,
    conflictsDetected: 0,
    conflictsResolved: 0,
    averageProcessingTime: 0,
    strategyUsage: new Map(),
    successRates: new Map(),
    stakeholderSatisfaction: 0
  };

  constructor() {
    super();
    this.conflictResolver = new ConflictResolver();
    console.log('⚙️ ConflictResolutionEngine initialized');
    
    // Set up event listeners
    this.setupEventListeners();
  }

  async processSelections(selections: SelectedNode[], context: EngineContext): Promise<ProcessedSelections> {
    const startTime = Date.now();
    console.log(`⚙️ Processing ${selections.length} selections`);
    
    try {
      const processingTime = Date.now() - startTime;
      
      // Detect conflicts
      const conflictAnalysis = await this.conflictResolver.detectConflicts(selections);
      const conflictsDetected = conflictAnalysis.totalConflicts;
      
      let resolvedSelections = selections;
      let conflictsResolved = 0;
      
      // Resolve conflicts if any detected
      if (conflictsDetected > 0) {
        const conflictContext: ConflictContext = {
          availableVoters: context.availableVoters,
          topologyConstraints: context.topologyConstraints,
          mlEnabled: context.mlEnabled,
          votingTimeout: context.votingTimeout,
          priority: context.priority
        };
        
        const resolution = await this.resolveConflicts(conflictAnalysis.conflicts, conflictContext);
        resolvedSelections = resolution.resolvedNodes;
        conflictsResolved = 1;
      }
      
      // Update metrics
      this.updateMetrics(processingTime, conflictsDetected, conflictsResolved);
      
      const result: ProcessedSelections = {
        originalSelections: selections,
        resolvedSelections,
        conflictsDetected,
        conflictsResolved,
        processingTime,
        engineMetrics: { ...this.metrics }
      };
      
      this.emit('selections.processed', { result, context });
      return result;
      
    } catch (error) {
      console.error(`❌ Error processing selections: ${error}`);
      this.emit('processing.error', { error, selections, context });
      throw error;
    }
  }

  async resolveConflicts(conflicts: ConflictingSelection[], context: ConflictContext): Promise<ConflictResolution> {
    console.log(`⚙️ Resolving ${conflicts.length} conflicts with engine`);
    
    try {
      const resolution = await this.conflictResolver.resolveSelectionConflicts(conflicts, context);
      
      // Track strategy usage
      const currentUsage = this.metrics.strategyUsage.get(resolution.strategy) || 0;
      this.metrics.strategyUsage.set(resolution.strategy, currentUsage + 1);
      
      this.emit('conflicts.resolved', { resolution, conflicts });
      return resolution;
      
    } catch (error) {
      console.error(`❌ Error resolving conflicts: ${error}`);
      this.emit('resolution.error', { error, conflicts });
      throw error;
    }
  }

  async enableStrategy(strategy: ResolutionStrategy): Promise<void> {
    console.log(`⚙️ Enabling resolution strategy: ${strategy}`);
    this.enabledStrategies.add(strategy);
    this.emit('strategy.enabled', { strategy });
  }

  async disableStrategy(strategy: ResolutionStrategy): Promise<void> {
    console.log(`⚙️ Disabling resolution strategy: ${strategy}`);
    this.enabledStrategies.delete(strategy);
    this.emit('strategy.disabled', { strategy });
  }

  async getEngineStatus(): Promise<EngineStatus> {
    const status: EngineStatus = {
      active: this.enabledStrategies.size > 0,
      enabledStrategies: Array.from(this.enabledStrategies),
      processingQueue: this.processingQueue.length,
      lastProcessingTime: this.metrics.averageProcessingTime,
      totalProcessed: this.metrics.totalProcessed,
      successRate: this.calculateSuccessRate()
    };
    
    return status;
  }

  async integrateWithVotingConsensus(): Promise<void> {
    console.log('⚙️ Integrating with VotingConsensus system');
    
    // Simulate integration with voting consensus
    await new Promise(resolve => setTimeout(resolve, 100));
    
    this.emit('integration.completed', { system: 'voting-consensus' });
  }

  async integrateWithTopologyManager(): Promise<void> {
    console.log('⚙️ Integrating with TopologyManager system');
    
    // Simulate integration with topology manager
    await new Promise(resolve => setTimeout(resolve, 100));
    
    this.emit('integration.completed', { system: 'topology-manager' });
  }

  async integrateWithMLSystems(): Promise<void> {
    console.log('⚙️ Integrating with ML systems');
    
    // Simulate integration with ML systems
    await new Promise(resolve => setTimeout(resolve, 100));
    
    this.emit('integration.completed', { system: 'ml-systems' });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    console.log(`⚙️ Processing queue with ${this.processingQueue.length} items`);
    
    try {
      while (this.processingQueue.length > 0) {
        const item = this.processingQueue.shift();
        if (!item) continue;
        
        await this.processSelections(item.selections, item.context);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private setupEventListeners(): void {
    // Listen to conflict resolver events
    this.conflictResolver.on('conflict.resolved', (data) => {
      this.emit('engine.conflict.resolved', data);
    });
    
    this.conflictResolver.on('conflicts.detected', (data) => {
      this.emit('engine.conflicts.detected', data);
    });
    
    this.conflictResolver.on('learning.completed', (data) => {
      this.emit('engine.learning.completed', data);
    });
    
    // Listen to strategy-specific events
    this.conflictResolver.on('voting.resolution.completed', (data) => {
      this.emit('engine.voting.completed', data);
    });
    
    this.conflictResolver.on('topology.resolution.completed', (data) => {
      this.emit('engine.topology.completed', data);
    });
    
    this.conflictResolver.on('ml.resolution.completed', (data) => {
      this.emit('engine.ml.completed', data);
    });
  }

  private updateMetrics(processingTime: number, conflictsDetected: number, conflictsResolved: number): void {
    this.metrics.totalProcessed++;
    this.metrics.conflictsDetected += conflictsDetected;
    this.metrics.conflictsResolved += conflictsResolved;
    
    // Update average processing time
    this.metrics.averageProcessingTime = 
      (this.metrics.averageProcessingTime * (this.metrics.totalProcessed - 1) + processingTime) / this.metrics.totalProcessed;
  }

  private calculateSuccessRate(): number {
    if (this.metrics.totalProcessed === 0) return 0;
    return this.metrics.conflictsResolved / this.metrics.totalProcessed;
  }

  async shutdown(): Promise<void> {
    console.log('🛑 ConflictResolutionEngine shutdown complete');
    
    // Shutdown conflict resolver
    await this.conflictResolver.shutdown();
    
    this.removeAllListeners();
  }
}

export default ConflictResolutionEngine; 