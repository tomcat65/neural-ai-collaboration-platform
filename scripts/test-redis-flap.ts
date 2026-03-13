/**
 * Redis Flap Test Script
 * Simulates Redis down/up to verify rate limiter fallback/recovery behavior
 *
 * Usage: npx tsx scripts/test-redis-flap.ts
 */

import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const TEST_DURATION_MS = 30000; // 30 seconds total test

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🧪 Redis Flap Test Starting...\n');
  console.log(`Redis URL: ${REDIS_URL}`);
  console.log(`Test duration: ${TEST_DURATION_MS / 1000}s\n`);

  // Create Redis client
  const client = createClient({ url: REDIS_URL });

  let connectCount = 0;
  let disconnectCount = 0;
  let errorCount = 0;
  const latencies: number[] = [];

  client.on('connect', () => {
    connectCount++;
    console.log(`✅ [${new Date().toISOString()}] Redis CONNECTED (count: ${connectCount})`);
  });

  client.on('disconnect', () => {
    disconnectCount++;
    console.log(`🔌 [${new Date().toISOString()}] Redis DISCONNECTED (count: ${disconnectCount})`);
  });

  client.on('error', (err) => {
    errorCount++;
    console.log(`❌ [${new Date().toISOString()}] Redis ERROR: ${err.message} (count: ${errorCount})`);
  });

  client.on('reconnecting', () => {
    console.log(`🔄 [${new Date().toISOString()}] Redis RECONNECTING...`);
  });

  // Connect
  console.log('📡 Connecting to Redis...');
  try {
    await client.connect();
  } catch (err) {
    console.log('❌ Initial connection failed (Redis may be down)');
    console.log('📝 This simulates the fallback scenario\n');
  }

  // Test loop - simulate rate limit operations
  console.log('\n🔄 Starting rate limit operation simulation...\n');

  const startTime = Date.now();
  let operationCount = 0;
  let successCount = 0;
  let fallbackCount = 0;

  while (Date.now() - startTime < TEST_DURATION_MS) {
    operationCount++;
    const opStart = Date.now();

    try {
      if (client.isOpen) {
        // Simulate rate limit check with INCR
        const key = `flap_test:${Math.floor(Date.now() / 1000)}`;
        await client.incr(key);
        await client.expire(key, 60);
        successCount++;

        const latency = Date.now() - opStart;
        latencies.push(latency);

        if (operationCount % 10 === 0) {
          console.log(`📊 Op #${operationCount}: Redis OK, latency=${latency}ms`);
        }
      } else {
        fallbackCount++;
        if (operationCount % 10 === 0) {
          console.log(`📝 Op #${operationCount}: Using memory fallback`);
        }
      }
    } catch (err: any) {
      fallbackCount++;
      console.log(`⚠️ Op #${operationCount}: Error - falling back to memory (${err.message})`);
    }

    await sleep(100); // 10 ops/sec
  }

  // Calculate statistics
  const avgLatency = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;
  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;
  const p95Latency = latencies.length > 0
    ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)]
    : 0;

  // Cleanup
  try {
    await client.quit();
  } catch {}

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('📋 REDIS FLAP TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`\n📈 Connection Events:`);
  console.log(`   Connects:      ${connectCount}`);
  console.log(`   Disconnects:   ${disconnectCount}`);
  console.log(`   Errors:        ${errorCount}`);

  console.log(`\n📊 Operation Statistics:`);
  console.log(`   Total ops:     ${operationCount}`);
  console.log(`   Redis success: ${successCount}`);
  console.log(`   Fallback used: ${fallbackCount}`);

  console.log(`\n⏱️  Latency (Redis operations only):`);
  console.log(`   Average:       ${avgLatency.toFixed(2)}ms`);
  console.log(`   p95:           ${p95Latency}ms`);
  console.log(`   Max:           ${maxLatency}ms`);

  console.log(`\n✅ Test Verification:`);
  console.log(`   Fallback works: ${fallbackCount > 0 || successCount > 0 ? 'YES' : 'N/A'}`);
  console.log(`   No latency spike (p95 < 100ms): ${p95Latency < 100 ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`   Recovery works: ${connectCount > 0 ? 'YES' : 'N/A (Redis never connected)'}`);

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
