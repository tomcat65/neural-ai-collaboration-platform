/**
 * Multi-Tenant Integration Test
 * Tests: tenant creation, API keys, cross-tenant isolation, quotas
 */

import { TenantManager } from '../src/tenant/tenant-manager.js';
import { TIER_QUOTAS } from '../src/tenant/types.js';
import * as fs from 'fs';

const TEST_DB_PATH = './data/test-tenants.db';

// Test results
interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

function logTest(name: string, passed: boolean, details?: string, error?: string) {
  const result: TestResult = { name, passed, details, error };
  results.push(result);
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}${details ? `: ${details}` : ''}${error ? ` - ERROR: ${error}` : ''}`);
}

async function runTests() {
  console.log('🧪 Multi-Tenant Integration Test Suite');
  console.log('=' .repeat(50));
  console.log('');

  // Clean up any previous test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const tenantManager = new TenantManager(TEST_DB_PATH);

  // ============================================================================
  // Test 1: Create Two Tenants
  // ============================================================================
  console.log('\n📦 Test 1: Tenant Creation');
  let tenantA, tenantB;
  try {
    tenantA = tenantManager.createTenant({ name: 'Tenant A', tier: 'free' });
    logTest('Create Tenant A (free tier)', true, `ID: ${tenantA.id}`);
  } catch (e: any) {
    logTest('Create Tenant A (free tier)', false, undefined, e.message);
  }

  try {
    tenantB = tenantManager.createTenant({ name: 'Tenant B', tier: 'pro' });
    logTest('Create Tenant B (pro tier)', true, `ID: ${tenantB.id}`);
  } catch (e: any) {
    logTest('Create Tenant B (pro tier)', false, undefined, e.message);
  }

  // ============================================================================
  // Test 2: Generate API Keys for Each Tenant
  // ============================================================================
  console.log('\n🔑 Test 2: API Key Generation');
  let keyA, keyB, adminKeyA;

  if (tenantA) {
    try {
      const { key, record } = tenantManager.generateApiKey({
        tenantId: tenantA.id,
        name: 'Tenant A API Key',
        permissions: ['read', 'write']
      });
      keyA = key;
      logTest('Generate API key for Tenant A', true, `Key prefix: ${key.substring(0, 15)}...`);

      // Verify key format: nac_{tenantId prefix}_{secret}
      const isValidFormat = key.startsWith('nac_');
      logTest('API key format validation', isValidFormat, `Format: nac_<tenant>_<secret>`);
    } catch (e: any) {
      logTest('Generate API key for Tenant A', false, undefined, e.message);
    }

    try {
      const { key, record } = tenantManager.generateApiKey({
        tenantId: tenantA.id,
        name: 'Tenant A Admin Key',
        isAdmin: true
      });
      adminKeyA = key;
      logTest('Generate admin API key for Tenant A', true, `isAdmin: ${record.isAdmin}`);
    } catch (e: any) {
      logTest('Generate admin API key for Tenant A', false, undefined, e.message);
    }
  }

  if (tenantB) {
    try {
      const { key, record } = tenantManager.generateApiKey({
        tenantId: tenantB.id,
        name: 'Tenant B API Key',
        permissions: ['*']
      });
      keyB = key;
      logTest('Generate API key for Tenant B', true, `Key prefix: ${key.substring(0, 15)}...`);
    } catch (e: any) {
      logTest('Generate API key for Tenant B', false, undefined, e.message);
    }
  }

  // ============================================================================
  // Test 3: API Key Validation (Hashing Check)
  // ============================================================================
  console.log('\n🔐 Test 3: API Key Validation & Hashing');

  if (keyA) {
    const validationA = tenantManager.validateApiKey(keyA);
    logTest('Validate Tenant A key', validationA.valid, `Tenant: ${validationA.tenant?.name}`);

    // Verify key is hashed (not stored in plaintext)
    const keys = tenantManager.listApiKeys(tenantA!.id);
    const hasHiddenHash = keys.every(k => k.keyHash === '[HIDDEN]');
    logTest('API key hash hidden in list', hasHiddenHash, 'keyHash shows [HIDDEN]');
  }

  // Test invalid key
  const invalidValidation = tenantManager.validateApiKey('invalid_key_12345');
  logTest('Reject invalid key', !invalidValidation.valid, `Reason: ${invalidValidation.reason}`);

  // ============================================================================
  // Test 4: Cross-Tenant Isolation
  // ============================================================================
  console.log('\n🔒 Test 4: Cross-Tenant Isolation');

  if (keyA && keyB && tenantA && tenantB) {
    // Validate key A returns tenant A
    const valA = tenantManager.validateApiKey(keyA);
    const isolationA = valA.tenant?.id === tenantA.id;
    logTest('Key A resolves to Tenant A', isolationA, `Expected: ${tenantA.id}, Got: ${valA.tenant?.id}`);

    // Validate key B returns tenant B
    const valB = tenantManager.validateApiKey(keyB);
    const isolationB = valB.tenant?.id === tenantB.id;
    logTest('Key B resolves to Tenant B', isolationB, `Expected: ${tenantB.id}, Got: ${valB.tenant?.id}`);

    // Keys should never cross tenants
    const noCrossTenant = valA.tenant?.id !== valB.tenant?.id;
    logTest('No cross-tenant key leakage', noCrossTenant);
  }

  // ============================================================================
  // Test 5: Tier Quotas
  // ============================================================================
  console.log('\n📊 Test 5: Tier Quotas');

  if (tenantA && tenantB) {
    const quotasA = tenantManager.getQuotas(tenantA.id);
    const quotasB = tenantManager.getQuotas(tenantB.id);

    // Free tier should have lower limits than pro
    const freeHasLowerLimits = quotasA.requestsPerMinute < quotasB.requestsPerMinute;
    logTest('Free tier has lower limits than Pro', freeHasLowerLimits,
      `Free: ${quotasA.requestsPerMinute}/min, Pro: ${quotasB.requestsPerMinute}/min`);

    // Verify quotas match tier defaults
    const matchesFreeDefaults = quotasA.requestsPerMinute === TIER_QUOTAS.free.requestsPerMinute;
    logTest('Tenant A quotas match free tier defaults', matchesFreeDefaults);

    const matchesProDefaults = quotasB.requestsPerMinute === TIER_QUOTAS.pro.requestsPerMinute;
    logTest('Tenant B quotas match pro tier defaults', matchesProDefaults);
  }

  // ============================================================================
  // Test 6: Usage Tracking
  // ============================================================================
  console.log('\n📈 Test 6: Usage Tracking');

  if (tenantA) {
    // Increment usage
    tenantManager.incrementUsage(tenantA.id, 'requests', 10);
    tenantManager.incrementUsage(tenantA.id, 'messages', 5);

    const usage = tenantManager.getUsage(tenantA.id);
    logTest('Usage tracking (requests)', usage.requestCount === 10, `Count: ${usage.requestCount}`);
    logTest('Usage tracking (messages)', usage.messagesSent === 5, `Count: ${usage.messagesSent}`);

    // Check quota
    const quotaCheck = tenantManager.checkQuota(tenantA.id, 'requests_per_day');
    logTest('Quota check allowed', quotaCheck.allowed,
      `Current: ${quotaCheck.current}/${quotaCheck.limit} (${quotaCheck.percentUsed.toFixed(1)}%)`);
  }

  // ============================================================================
  // Test 7: Admin Operations
  // ============================================================================
  console.log('\n👑 Test 7: Admin Operations');

  if (tenantA && adminKeyA) {
    // Validate admin key
    const adminValidation = tenantManager.validateApiKey(adminKeyA);
    logTest('Admin key has isAdmin=true', adminValidation.record?.isAdmin === true);

    // Update tenant
    const updated = tenantManager.updateTenant(tenantA.id, { name: 'Tenant A (Updated)' });
    logTest('Update tenant name', updated?.name === 'Tenant A (Updated)');

    // Set custom quotas
    tenantManager.setQuotas(tenantA.id, { requestsPerMinute: 100 });
    const newQuotas = tenantManager.getQuotas(tenantA.id);
    logTest('Set custom quota', newQuotas.requestsPerMinute === 100,
      `Custom: ${newQuotas.requestsPerMinute}/min`);
  }

  // ============================================================================
  // Test 8: Key Revocation
  // ============================================================================
  console.log('\n🗑️ Test 8: Key Revocation');

  if (tenantA && keyA) {
    // Get the key ID (we need to find it by listing)
    const keys = tenantManager.listApiKeys(tenantA.id);
    const regularKey = keys.find(k => !k.isAdmin);

    if (regularKey) {
      const revoked = tenantManager.revokeApiKey(regularKey.id);
      logTest('Revoke API key', revoked);

      // Verify revoked key no longer works
      const revokedValidation = tenantManager.validateApiKey(keyA);
      logTest('Revoked key rejected', !revokedValidation.valid,
        `Reason: ${revokedValidation.reason}`);
    }
  }

  // ============================================================================
  // Test 9: Delete Tenant
  // ============================================================================
  console.log('\n🗑️ Test 9: Tenant Deletion');

  if (tenantB) {
    const deleted = tenantManager.deleteTenant(tenantB.id);
    logTest('Delete Tenant B', deleted);

    // Verify tenant no longer exists
    const fetchDeleted = tenantManager.getTenant(tenantB.id);
    logTest('Deleted tenant returns null', fetchDeleted === null);

    // Verify associated keys are gone
    const orphanedKeys = tenantManager.listApiKeys(tenantB.id);
    logTest('Deleted tenant keys cleaned up', orphanedKeys.length === 0);
  }

  // ============================================================================
  // Test 10: Default Tenant Protection
  // ============================================================================
  console.log('\n🛡️ Test 10: Default Tenant Protection');

  try {
    tenantManager.deleteTenant('default');
    logTest('Prevent default tenant deletion', false, 'Should have thrown error');
  } catch (e: any) {
    logTest('Prevent default tenant deletion', true, 'Correctly threw error');
  }

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('\n' + '=' .repeat(50));
  console.log('📋 TEST SUMMARY');
  console.log('=' .repeat(50));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total:  ${results.length}`);
  console.log(`🎯 Rate:   ${((passed / results.length) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.error || 'No details'}`);
    });
  }

  // Cleanup
  tenantManager.close();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  console.log('\n🧹 Test database cleaned up');
  console.log('');

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
