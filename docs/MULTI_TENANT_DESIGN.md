# Multi-Tenant Isolation & Quotas Design

## Phase 4.6: Design Document

### Overview

This document outlines the design for multi-tenant support in the Neural AI Collaboration Platform, including tenant identification, data isolation, resource quotas, and enforcement mechanisms.

---

## 1. Tenant Identification

### Approach: API Key-Based Tenant Binding

Each API key will be associated with a tenant ID. This leverages the existing security middleware.

```typescript
interface TenantInfo {
  tenantId: string;
  name: string;
  tier: 'free' | 'pro' | 'enterprise';
  createdAt: Date;
  metadata?: Record<string, any>;
}

interface ApiKeyRecord {
  keyHash: string;
  tenantId: string;
  permissions: string[];
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt?: Date;
}
```

### Implementation Points

1. **API Key Generation**: Modify `generateApiKey()` to accept tenant ID
2. **Key Validation**: Extend `validateApiKey()` to return tenant context
3. **Request Context**: Attach tenant info to Express request object

```typescript
// Extended request with tenant context
interface TenantRequest extends Request {
  tenant?: TenantInfo;
  apiKey?: string;
}
```

---

## 2. Data Isolation

### Isolation Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| **Logical** | Tenant ID prefix on all data | Default |
| **Physical** | Separate databases per tenant | Enterprise |

### Logical Isolation Strategy

All data operations include tenant scoping:

```typescript
// Memory storage with tenant scoping
async store(tenantId: string, agentId: string, memory: any): Promise<string> {
  const scopedId = `${tenantId}:${agentId}`;
  // Store with tenant prefix
}

// Search with tenant filtering
async search(tenantId: string, query: string): Promise<SearchResult[]> {
  // Filter results to tenant's data only
}
```

### Database Schema Updates

```sql
-- Add tenant_id to all tables
ALTER TABLE shared_memory ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE individual_memory ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE events ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

-- Create indices for tenant queries
CREATE INDEX idx_shared_memory_tenant ON shared_memory(tenant_id);
CREATE INDEX idx_individual_memory_tenant ON individual_memory(tenant_id);
CREATE INDEX idx_events_tenant ON events(tenant_id);
```

### Cross-System Isolation

| System | Isolation Method |
|--------|-----------------|
| **SQLite** | tenant_id column filter |
| **Redis** | Key prefix: `{tenantId}:` |
| **Weaviate** | Tenant filter in queries |
| **Neo4j** | Tenant property on nodes |

---

## 3. Resource Quotas

### Quota Dimensions

```typescript
interface TenantQuotas {
  // Request limits
  requestsPerMinute: number;       // API rate limit
  requestsPerDay: number;          // Daily cap

  // Storage limits
  maxStorageBytes: number;         // Total data storage
  maxMemoryEntries: number;        // Individual memory entries
  maxAgents: number;               // Registered agents

  // Message limits
  messagesPerMinute: number;       // AI messages
  messagesPerDay: number;          // Daily message cap

  // Feature limits
  maxConcurrentConnections: number; // WebSocket connections
  maxEventRetentionDays: number;    // Event log retention
}
```

### Tier-Based Defaults

```typescript
const TIER_QUOTAS: Record<string, TenantQuotas> = {
  free: {
    requestsPerMinute: 60,
    requestsPerDay: 1000,
    maxStorageBytes: 10 * 1024 * 1024,  // 10 MB
    maxMemoryEntries: 1000,
    maxAgents: 5,
    messagesPerMinute: 10,
    messagesPerDay: 100,
    maxConcurrentConnections: 2,
    maxEventRetentionDays: 7
  },
  pro: {
    requestsPerMinute: 300,
    requestsPerDay: 10000,
    maxStorageBytes: 100 * 1024 * 1024, // 100 MB
    maxMemoryEntries: 10000,
    maxAgents: 25,
    messagesPerMinute: 60,
    messagesPerDay: 1000,
    maxConcurrentConnections: 10,
    maxEventRetentionDays: 30
  },
  enterprise: {
    requestsPerMinute: 1000,
    requestsPerDay: -1,  // Unlimited
    maxStorageBytes: 1024 * 1024 * 1024, // 1 GB
    maxMemoryEntries: -1,  // Unlimited
    maxAgents: -1,  // Unlimited
    messagesPerMinute: 300,
    messagesPerDay: -1,  // Unlimited
    maxConcurrentConnections: 100,
    maxEventRetentionDays: 365
  }
};
```

---

## 4. Enforcement Mechanisms

### Enforcement Levels

| Level | Behavior | When Used |
|-------|----------|-----------|
| **Hard** | Request rejected with 429/403 | Rate limits, storage caps |
| **Soft** | Warning logged, request allowed | Approaching limits |
| **Info** | Metrics tracked only | Usage monitoring |

### Quota Enforcement Middleware

```typescript
interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  currentUsage: number;
  limit: number;
  percentUsed: number;
}

async function checkQuota(
  tenantId: string,
  quotaType: keyof TenantQuotas
): Promise<QuotaCheckResult> {
  const tenant = await getTenant(tenantId);
  const quotas = getQuotasForTier(tenant.tier);
  const currentUsage = await getUsage(tenantId, quotaType);
  const limit = quotas[quotaType];

  // -1 means unlimited
  if (limit === -1) {
    return { allowed: true, currentUsage, limit, percentUsed: 0 };
  }

  const percentUsed = (currentUsage / limit) * 100;

  return {
    allowed: currentUsage < limit,
    reason: currentUsage >= limit ? `${quotaType} quota exceeded` : undefined,
    currentUsage,
    limit,
    percentUsed
  };
}
```

### Rate Limiting Integration

Extend existing Redis rate limiter to be tenant-aware:

```typescript
// Tenant-scoped rate limit key
const getRateLimitKey = (tenantId: string, type: string): string => {
  return `ratelimit:${tenantId}:${type}`;
};
```

---

## 5. Usage Tracking

### Metrics to Track

```typescript
interface TenantUsageMetrics {
  tenantId: string;

  // Request metrics
  requestCount: number;
  requestErrorCount: number;

  // Storage metrics
  storageBytes: number;
  memoryEntryCount: number;

  // Agent metrics
  registeredAgentCount: number;
  activeAgentCount: number;

  // Message metrics
  messagesSent: number;
  messagesReceived: number;

  // Connection metrics
  wsConnectionCount: number;
  peakWsConnections: number;

  // Timestamps
  periodStart: Date;
  lastUpdated: Date;
}
```

### Usage API Endpoints

```
GET /api/tenant/usage          - Current usage summary
GET /api/tenant/quotas         - Quota limits for tenant
GET /api/tenant/usage/history  - Historical usage data
```

---

## 6. Implementation Phases

### Phase 6a: Tenant Context (Week 1)
- [ ] Add TenantInfo interface
- [ ] Extend API key to include tenant ID
- [ ] Add tenant context to request middleware
- [ ] Update logging to include tenant ID

### Phase 6b: Data Isolation (Week 2)
- [ ] Add tenant_id columns to SQLite tables
- [ ] Update MemoryManager for tenant scoping
- [ ] Update Redis key prefixing
- [ ] Update Weaviate/Neo4j queries

### Phase 6c: Quota System (Week 3)
- [ ] Implement quota configuration
- [ ] Add quota check middleware
- [ ] Implement usage tracking
- [ ] Add quota enforcement to rate limiter

### Phase 6d: Management UI (Week 4)
- [ ] Usage dashboard endpoint
- [ ] Quota management API
- [ ] Alert on quota warnings

---

## 7. API Reference

### Tenant Management

```
POST /api/admin/tenants              - Create tenant
GET  /api/admin/tenants              - List tenants
GET  /api/admin/tenants/:id          - Get tenant
PATCH /api/admin/tenants/:id         - Update tenant
DELETE /api/admin/tenants/:id        - Delete tenant

POST /api/admin/tenants/:id/keys     - Generate API key
GET  /api/admin/tenants/:id/keys     - List API keys
DELETE /api/admin/tenants/:id/keys/:key - Revoke API key
```

### Usage & Quotas

```
GET /api/tenant/usage                - Current usage
GET /api/tenant/quotas               - Current quotas
GET /api/tenant/usage/history        - Usage over time
```

---

## 8. Security Considerations

1. **Tenant ID Validation**: Always validate tenant ID from authenticated context, never from request body
2. **Cross-Tenant Access**: Implement strict checks to prevent data leakage
3. **Admin Separation**: Admin endpoints require separate admin API keys
4. **Audit Logging**: Log all cross-tenant and admin operations
5. **Key Rotation**: Support API key rotation without downtime

---

## 9. Migration Strategy

For existing deployments:

1. All existing data assigned to `default` tenant
2. Existing API keys bound to `default` tenant
3. `default` tenant gets enterprise tier quotas
4. Gradual migration to tenant-specific keys

---

## Approval Status

- [ ] Architecture review
- [ ] Security review
- [ ] Implementation approved

---

## 10. Detailed Implementation Plan

### Step 1: Tenant Binding (API Key → Tenant)

**Files to modify:**
- `src/middleware/security.ts`
- `src/observability/logger.ts`

**Changes:**
1. Create `tenants` SQLite table:
   ```sql
   CREATE TABLE tenants (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     tier TEXT DEFAULT 'free',
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     metadata TEXT
   );
   ```

2. Create `api_keys` SQLite table:
   ```sql
   CREATE TABLE api_keys (
     key_hash TEXT PRIMARY KEY,
     tenant_id TEXT NOT NULL REFERENCES tenants(id),
     name TEXT,
     permissions TEXT,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     last_used_at DATETIME,
     expires_at DATETIME
   );
   ```

3. Modify `validateApiKey()` to lookup tenant from `api_keys` table
4. Add tenant context to request: `req.tenant = { id, name, tier }`
5. Update logger correlation middleware to include `tenantId`

**Estimated effort:** 1-2 days

---

### Step 2: Namespacing/Prefixes + Tenant Columns

**Files to modify:**
- `src/unified-server/memory/index.ts`
- `src/memory/redis-client.ts`
- `src/memory/weaviate-client.ts`
- `src/memory/neo4j-client.ts`

**Changes:**
1. Add `tenant_id TEXT NOT NULL DEFAULT 'default'` to all memory tables
2. Add indices: `CREATE INDEX idx_*_tenant ON *(tenant_id)`
3. Update all queries to include `WHERE tenant_id = ?`
4. Redis: Update key format to `{tenantId}:{originalKey}`
5. Weaviate: Add tenant filter to all queries
6. Neo4j: Add `tenantId` property to all nodes/relationships

**Migration script:**
```sql
-- Add tenant_id to existing tables
ALTER TABLE shared_memory ADD COLUMN tenant_id TEXT DEFAULT 'default';
ALTER TABLE individual_memory ADD COLUMN tenant_id TEXT DEFAULT 'default';
-- etc.
```

**Estimated effort:** 2-3 days

---

### Step 3: Per-Tenant Rate Limits/Quotas

**Files to modify:**
- `src/middleware/security.ts`
- New: `src/middleware/quota.ts`

**Changes:**
1. Create `tenant_quotas` table:
   ```sql
   CREATE TABLE tenant_quotas (
     tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
     requests_per_minute INTEGER DEFAULT 100,
     requests_per_day INTEGER DEFAULT 10000,
     max_storage_bytes INTEGER DEFAULT 104857600,
     max_agents INTEGER DEFAULT 10,
     messages_per_minute INTEGER DEFAULT 20
   );
   ```

2. Create `tenant_usage` table:
   ```sql
   CREATE TABLE tenant_usage (
     tenant_id TEXT,
     metric TEXT,
     value INTEGER,
     period_start DATETIME,
     PRIMARY KEY (tenant_id, metric, period_start)
   );
   ```

3. Modify rate limiter to use tenant-scoped keys:
   ```typescript
   const key = `${tenantId}:${limiterType}:${clientKey}`;
   ```

4. Add quota middleware that checks usage before allowing requests

**Estimated effort:** 2-3 days

---

### Step 4: Basic Admin/Tenant Usage Endpoint

**Files to modify:**
- `src/unified-neural-mcp-server.ts`
- New: `src/routes/admin.ts`
- New: `src/routes/tenant.ts`

**New endpoints:**
```
# Admin (requires admin API key)
POST   /api/admin/tenants           - Create tenant
GET    /api/admin/tenants           - List tenants
GET    /api/admin/tenants/:id       - Get tenant
PATCH  /api/admin/tenants/:id       - Update tenant
DELETE /api/admin/tenants/:id       - Delete tenant
POST   /api/admin/tenants/:id/keys  - Generate API key

# Tenant (requires tenant API key)
GET    /api/tenant/usage            - Current usage summary
GET    /api/tenant/quotas           - Quota limits
```

**Estimated effort:** 1-2 days

---

### Implementation Summary

| Step | Description | Effort | Dependencies |
|------|-------------|--------|--------------|
| 1 | Tenant binding (API key → tenant) | 1-2 days | None |
| 2 | Namespacing/tenant columns | 2-3 days | Step 1 |
| 3 | Per-tenant rate limits/quotas | 2-3 days | Steps 1-2 |
| 4 | Admin/usage endpoints | 1-2 days | Steps 1-3 |
| **Total** | | **6-10 days** | |

---

### Risk Mitigation

1. **Backward Compatibility**: `default` tenant for existing data/keys
2. **Rollback Plan**: Feature flag `MULTI_TENANT_ENABLED` to disable
3. **Testing**: Unit tests for tenant isolation, integration tests for cross-tenant prevention
4. **Monitoring**: Metrics for tenant operations, alerts on cross-tenant attempts

---

*Document Version: 1.1*
*Updated: Phase 4 Review*
*Author: Claude (AI Engineer)*
