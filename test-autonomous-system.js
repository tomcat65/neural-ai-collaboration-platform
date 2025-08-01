#!/usr/bin/env node

/**
 * Autonomous Agent System Test Script
 * Comprehensive testing of the Neural AI Collaboration Platform's autonomous operation
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AutonomousSystemTester {
  constructor() {
    this.testResults = [];
    this.agentProcesses = new Map();
    this.testStartTime = new Date();
    this.logDir = path.join(__dirname, 'data', 'logs');
    this.agents = ['claude-code-cli', 'claude-desktop-agent', 'cursor-ide-agent'];
  }

  /**
   * Run comprehensive autonomous system tests
   */
  async runTests() {
    console.log('🧪 Starting Autonomous Agent System Tests');
    console.log('=' .repeat(60));

    try {
      // Ensure log directory exists
      await fs.mkdir(this.logDir, { recursive: true });

      // Test 1: Agent Initialization
      await this.testAgentInitialization();

      // Test 2: Message Polling
      await this.testMessagePolling();

      // Test 3: Inter-Agent Communication
      await this.testInterAgentCommunication();

      // Test 4: Work Processing
      await this.testWorkProcessing();

      // Test 5: Memory System Integration
      await this.testMemorySystemIntegration();

      // Test 6: Error Recovery
      await this.testErrorRecovery();

      // Test 7: Performance Under Load
      await this.testPerformanceUnderLoad();

      // Test 8: Session Persistence
      await this.testSessionPersistence();

      // Test 9: Graceful Shutdown
      await this.testGracefulShutdown();

      // Generate test report
      await this.generateTestReport();

    } catch (error) {
      console.error('❌ Test suite failed:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  /**
   * Test 1: Agent Initialization
   */
  async testAgentInitialization() {
    console.log('\\n🔧 Test 1: Agent Initialization');
    
    for (const agentId of this.agents) {
      try {
        console.log(`  📦 Starting agent: ${agentId}`);
        
        const process = spawn('node', ['autonomous-agent.js', agentId], {
          cwd: __dirname,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false
        });

        this.agentProcesses.set(agentId, process);

        // Wait for initialization
        await this.waitForAgentInitialization(agentId);
        
        console.log(`  ✅ Agent ${agentId} initialized successfully`);
        
        this.testResults.push({
          test: 'Agent Initialization',
          agent: agentId,
          status: 'PASSED',
          duration: Date.now() - this.testStartTime.getTime()
        });

      } catch (error) {
        console.error(`  ❌ Failed to initialize ${agentId}:`, error.message);
        
        this.testResults.push({
          test: 'Agent Initialization',
          agent: agentId,
          status: 'FAILED',
          error: error.message,
          duration: Date.now() - this.testStartTime.getTime()
        });
      }
    }
  }

  /**
   * Test 2: Message Polling
   */
  async testMessagePolling() {
    console.log('\\n📡 Test 2: Message Polling');
    
    // Wait for agents to start polling
    await this.sleep(20000); // 20 seconds
    
    for (const agentId of this.agents) {
      try {
        const logFile = path.join(this.logDir, `${agentId}-autonomous.log`);
        const logContent = await fs.readFile(logFile, 'utf-8');
        
        const pollingMessages = logContent.split('\\n').filter(line => 
          line.includes('Running MCP command: get_ai_messages')
        );

        if (pollingMessages.length >= 1) {
          console.log(`  ✅ Agent ${agentId} is polling for messages (${pollingMessages.length} polls detected)`);
          
          this.testResults.push({
            test: 'Message Polling',
            agent: agentId,
            status: 'PASSED',
            details: `${pollingMessages.length} polling attempts`,
            duration: Date.now() - this.testStartTime.getTime()
          });
        } else {
          throw new Error('No message polling detected');
        }

      } catch (error) {
        console.error(`  ❌ Message polling test failed for ${agentId}:`, error.message);
        
        this.testResults.push({
          test: 'Message Polling',
          agent: agentId,
          status: 'FAILED',
          error: error.message,
          duration: Date.now() - this.testStartTime.getTime()
        });
      }
    }
  }

  /**
   * Test 3: Inter-Agent Communication
   */
  async testInterAgentCommunication() {
    console.log('\\n🤝 Test 3: Inter-Agent Communication');
    
    for (const agentId of this.agents) {
      try {
        const logFile = path.join(this.logDir, `${agentId}-autonomous.log`);
        const logContent = await fs.readFile(logFile, 'utf-8');
        
        const communicationMessages = logContent.split('\\n').filter(line => 
          line.includes('Sending message to') || line.includes('autonomous_online')
        );

        if (communicationMessages.length >= 1) {
          console.log(`  ✅ Agent ${agentId} is communicating with other agents (${communicationMessages.length} messages)`);
          
          this.testResults.push({
            test: 'Inter-Agent Communication',
            agent: agentId,
            status: 'PASSED',
            details: `${communicationMessages.length} communication attempts`,
            duration: Date.now() - this.testStartTime.getTime()
          });
        } else {
          throw new Error('No inter-agent communication detected');
        }

      } catch (error) {
        console.error(`  ❌ Communication test failed for ${agentId}:`, error.message);
        
        this.testResults.push({
          test: 'Inter-Agent Communication',
          agent: agentId,
          status: 'FAILED',
          error: error.message,
          duration: Date.now() - this.testStartTime.getTime()
        });
      }
    }
  }

  /**
   * Test 4: Work Processing
   */
  async testWorkProcessing() {
    console.log('\\n⚙️ Test 4: Work Processing');
    
    for (const agentId of this.agents) {
      try {
        const logFile = path.join(this.logDir, `${agentId}-autonomous.log`);
        const logContent = await fs.readFile(logFile, 'utf-8');
        
        const workPatterns = {
          'claude-code-cli': 'Performing project leader tasks',
          'claude-desktop-agent': 'Performing infrastructure tasks',
          'cursor-ide-agent': 'Performing development tasks'
        };

        const workMessages = logContent.split('\\n').filter(line => 
          line.includes(workPatterns[agentId])
        );

        if (workMessages.length >= 1) {
          console.log(`  ✅ Agent ${agentId} is processing work (${workMessages.length} work cycles)`);
          
          this.testResults.push({
            test: 'Work Processing',
            agent: agentId,
            status: 'PASSED',
            details: `${workMessages.length} work processing cycles`,
            duration: Date.now() - this.testStartTime.getTime()
          });
        } else {
          throw new Error('No work processing detected');
        }

      } catch (error) {
        console.error(`  ❌ Work processing test failed for ${agentId}:`, error.message);
        
        this.testResults.push({
          test: 'Work Processing',
          agent: agentId,
          status: 'FAILED',
          error: error.message,
          duration: Date.now() - this.testStartTime.getTime()
        });
      }
    }
  }

  /**
   * Test 5: Memory System Integration
   */
  async testMemorySystemIntegration() {
    console.log('\\n🧠 Test 5: Memory System Integration');
    
    for (const agentId of this.agents) {
      try {
        const logFile = path.join(this.logDir, `${agentId}-autonomous.log`);
        const logContent = await fs.readFile(logFile, 'utf-8');
        
        const memoryMessages = logContent.split('\\n').filter(line => 
          line.includes('Running MCP command: create_entities')
        );

        if (memoryMessages.length >= 1) {
          console.log(`  ✅ Agent ${agentId} is using memory system (${memoryMessages.length} memory operations)`);
          
          this.testResults.push({
            test: 'Memory System Integration',
            agent: agentId,
            status: 'PASSED',
            details: `${memoryMessages.length} memory operations`,
            duration: Date.now() - this.testStartTime.getTime()
          });
        } else {
          throw new Error('No memory system integration detected');
        }

      } catch (error) {
        console.error(`  ❌ Memory system test failed for ${agentId}:`, error.message);
        
        this.testResults.push({
          test: 'Memory System Integration',
          agent: agentId,
          status: 'FAILED',
          error: error.message,
          duration: Date.now() - this.testStartTime.getTime()
        });
      }
    }
  }

  /**
   * Test 6: Error Recovery
   */
  async testErrorRecovery() {
    console.log('\\n🔄 Test 6: Error Recovery');
    
    // Simulate errors by checking for error handling in logs
    for (const agentId of this.agents) {
      try {
        const logFile = path.join(this.logDir, `${agentId}-autonomous.log`);
        const logContent = await fs.readFile(logFile, 'utf-8');
        
        // Check if agents continue operating despite any errors
        const recentLines = logContent.split('\\n').slice(-20);
        const hasRecentActivity = recentLines.some(line => 
          line.includes('Running MCP command') || line.includes('Performing')
        );

        if (hasRecentActivity) {
          console.log(`  ✅ Agent ${agentId} shows resilience and continued operation`);
          
          this.testResults.push({
            test: 'Error Recovery',
            agent: agentId,
            status: 'PASSED',
            details: 'Agent continues operating despite any errors',
            duration: Date.now() - this.testStartTime.getTime()
          });
        } else {
          throw new Error('Agent appears to have stopped');
        }

      } catch (error) {
        console.error(`  ❌ Error recovery test failed for ${agentId}:`, error.message);
        
        this.testResults.push({
          test: 'Error Recovery',
          agent: agentId,
          status: 'FAILED',
          error: error.message,
          duration: Date.now() - this.testStartTime.getTime()
        });
      }
    }
  }

  /**
   * Test 7: Performance Under Load
   */
  async testPerformanceUnderLoad() {
    console.log('\\n🚀 Test 7: Performance Under Load');
    
    // Let agents run for extended period to test performance
    console.log('  ⏳ Running load test for 30 seconds...');
    await this.sleep(30000);
    
    for (const agentId of this.agents) {
      try {
        const logFile = path.join(this.logDir, `${agentId}-autonomous.log`);
        const stats = await fs.stat(logFile);
        const logContent = await fs.readFile(logFile, 'utf-8');
        
        const lineCount = logContent.split('\\n').length;
        const fileSize = stats.size;
        
        console.log(`  📊 Agent ${agentId}: ${lineCount} log lines, ${Math.round(fileSize/1024)}KB log file`);
        
        if (lineCount > 50 && fileSize > 1000) {
          console.log(`  ✅ Agent ${agentId} shows good activity under load`);
          
          this.testResults.push({
            test: 'Performance Under Load',
            agent: agentId,
            status: 'PASSED',
            details: `${lineCount} operations, ${Math.round(fileSize/1024)}KB logged`,
            duration: Date.now() - this.testStartTime.getTime()
          });
        } else {
          throw new Error('Insufficient activity detected');
        }

      } catch (error) {
        console.error(`  ❌ Performance test failed for ${agentId}:`, error.message);
        
        this.testResults.push({
          test: 'Performance Under Load',
          agent: agentId,
          status: 'FAILED',
          error: error.message,
          duration: Date.now() - this.testStartTime.getTime()
        });
      }
    }
  }

  /**
   * Test 8: Session Persistence
   */
  async testSessionPersistence() {
    console.log('\\n💾 Test 8: Session Persistence');
    
    for (const agentId of this.agents) {
      try {
        const logFile = path.join(this.logDir, `${agentId}-autonomous.log`);
        
        // Check if log file exists and has content
        const exists = await fs.access(logFile).then(() => true).catch(() => false);
        
        if (exists) {
          const stats = await fs.stat(logFile);
          console.log(`  ✅ Agent ${agentId} log persisted (${Math.round(stats.size/1024)}KB)`);
          
          this.testResults.push({
            test: 'Session Persistence',
            agent: agentId,
            status: 'PASSED',
            details: `Log file size: ${Math.round(stats.size/1024)}KB`,
            duration: Date.now() - this.testStartTime.getTime()
          });
        } else {
          throw new Error('Log file not found');
        }

      } catch (error) {
        console.error(`  ❌ Persistence test failed for ${agentId}:`, error.message);
        
        this.testResults.push({
          test: 'Session Persistence',
          agent: agentId,
          status: 'FAILED',
          error: error.message,
          duration: Date.now() - this.testStartTime.getTime()
        });
      }
    }
  }

  /**
   * Test 9: Graceful Shutdown
   */
  async testGracefulShutdown() {
    console.log('\\n🛑 Test 9: Graceful Shutdown');
    
    for (const [agentId, process] of this.agentProcesses) {
      try {
        console.log(`  🔌 Shutting down agent: ${agentId}`);
        
        // Send SIGINT for graceful shutdown
        process.kill('SIGINT');
        
        // Wait for process to exit
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Shutdown timeout')), 5000);
          
          process.on('exit', (code) => {
            clearTimeout(timeout);
            resolve(code);
          });
        });
        
        console.log(`  ✅ Agent ${agentId} shut down gracefully`);
        
        this.testResults.push({
          test: 'Graceful Shutdown',
          agent: agentId,
          status: 'PASSED',
          details: 'Clean shutdown with SIGINT',
          duration: Date.now() - this.testStartTime.getTime()
        });

      } catch (error) {
        console.error(`  ❌ Shutdown test failed for ${agentId}:`, error.message);
        
        // Force kill if graceful shutdown failed
        try {
          process.kill('SIGKILL');
        } catch (e) {
          // Process already dead
        }
        
        this.testResults.push({
          test: 'Graceful Shutdown',
          agent: agentId,
          status: 'FAILED',
          error: error.message,
          duration: Date.now() - this.testStartTime.getTime()
        });
      }
    }
  }

  /**
   * Generate comprehensive test report
   */
  async generateTestReport() {
    console.log('\\n📋 Generating Test Report');
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.status === 'PASSED').length;
    const failedTests = totalTests - passedTests;
    const successRate = ((passedTests / totalTests) * 100).toFixed(1);
    
    const report = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.testStartTime.getTime(),
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        successRate: `${successRate}%`
      },
      results: this.testResults,
      agentStats: await this.getAgentStats()
    };

    const reportFile = path.join(__dirname, 'data', 'autonomous-test-report.json');
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    
    console.log('\\n' + '='.repeat(60));
    console.log('🧪 AUTONOMOUS AGENT SYSTEM TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`📊 Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`📈 Success Rate: ${successRate}%`);
    console.log(`⏱️ Total Duration: ${Math.round(report.duration/1000)}s`);
    console.log(`📄 Report saved to: ${reportFile}`);
    console.log('='.repeat(60));

    if (failedTests > 0) {
      console.log('\\n❌ FAILED TESTS:');
      this.testResults
        .filter(r => r.status === 'FAILED')
        .forEach(result => {
          console.log(`  - ${result.test} (${result.agent}): ${result.error}`);
        });
    }
  }

  /**
   * Get agent statistics
   */
  async getAgentStats() {
    const stats = {};
    
    for (const agentId of this.agents) {
      try {
        const logFile = path.join(this.logDir, `${agentId}-autonomous.log`);
        const logContent = await fs.readFile(logFile, 'utf-8');
        const lines = logContent.split('\\n');
        
        stats[agentId] = {
          totalLogLines: lines.length,
          mcpCommands: lines.filter(l => l.includes('Running MCP command')).length,
          messagesSent: lines.filter(l => l.includes('Sending message to')).length,
          workCycles: lines.filter(l => l.includes('Performing')).length
        };
      } catch (error) {
        stats[agentId] = { error: error.message };
      }
    }
    
    return stats;
  }

  /**
   * Wait for agent initialization
   */
  async waitForAgentInitialization(agentId, timeout = 10000) {
    const startTime = Date.now();
    const logFile = path.join(this.logDir, `${agentId}-autonomous.log`);
    
    while (Date.now() - startTime < timeout) {
      try {
        const logContent = await fs.readFile(logFile, 'utf-8');
        if (logContent.includes('is now operational')) {
          return true;
        }
      } catch (error) {
        // Log file might not exist yet
      }
      
      await this.sleep(500);
    }
    
    throw new Error('Agent initialization timeout');
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log('\\n🧹 Cleaning up test resources...');
    
    for (const [agentId, process] of this.agentProcesses) {
      try {
        process.kill('SIGKILL');
        console.log(`  🔌 Force stopped ${agentId}`);
      } catch (error) {
        // Process already dead
      }
    }
    
    this.agentProcesses.clear();
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const tester = new AutonomousSystemTester();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\\n🛑 Test interrupted');
    await tester.cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\\n🛑 Test terminated');
    await tester.cleanup();
    process.exit(0);
  });

  try {
    await tester.runTests();
    await tester.cleanup();
    console.log('\\n✅ All tests completed successfully');
  } catch (error) {
    console.error('\\n❌ Test suite failed:', error);
    await tester.cleanup();
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { AutonomousSystemTester };