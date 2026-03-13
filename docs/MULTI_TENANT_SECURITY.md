# Multi-Tenant Security & Operations Guide

## Production Checklist

### 1. Admin Key Configuration

```bash
# Generate a strong admin key (32+ bytes of entropy)
ADMIN_API_KEY=$(openssl rand -hex 32)
echo "ADMIN_API_KEY=$ADMIN_API_KEY" >> .env

# Rotation: Generate new key, update env, restart services
# Old key becomes invalid immediately (no grace period)
```

**Requirements:**
- [ ] Set `ADMIN_API_KEY` in production environment
- [ ] Use 256+ bits of entropy (64 hex chars minimum)
- [ ] Rotate quarterly or after any suspected compromise
- [ ] Never commit admin keys to version control

### 2. Database Security

```bash
# Set restrictive permissions on tenant database
chmod 600 ./data/tenants.db
chown app-user:app-group ./data/tenants.db

# For SQLCipher (if required):
# npm install better-sqlite3-sqlcipher
# Set SQLITE_KEY environment variable
```

**Backup Runbook:**
```bash
# Daily backup
sqlite3 ./data/tenants.db ".backup ./backups/tenants-$(date +%Y%m%d).db"

# Restore
cp ./backups/tenants-YYYYMMDD.db ./data/tenants.db
chmod 600 ./data/tenants.db
```

**Requirements:**
- [ ] `chmod 600` on all .db files
- [ ] Regular backups (daily recommended)
- [ ] Tested restore procedure
- [ ] Consider encrypted filesystem for sensitive deployments

### 3. Network Posture

**Internal-only services (never expose publicly):**
- Redis: `redis://redis:6379` (Docker internal network)
- Neo4j: `bolt://neo4j:7687` (Docker internal network)
- Weaviate: `http://weaviate:8080` (Docker internal network)

**Auth-gated endpoints:**
- `/admin/*` - Requires `X-Admin-Key` or `isAdmin` API key
- `/api/observability/*` - Requires valid API key
- `/api/metrics` - Requires valid API key

**Public endpoints (no auth):**
- `/health.json` - Health check only
- `/` - Dashboard (if enabled)

**Requirements:**
- [ ] Docker network isolation for backend services
- [ ] No public ports for Redis/Neo4j/Weaviate
- [ ] Reverse proxy with TLS for public endpoints
- [ ] Regular port scan to verify posture

### 4. API Key Security

**Key Generation (high entropy):**
```typescript
// Current implementation uses crypto.randomBytes(32) = 256 bits
const keySecret = crypto.randomBytes(32).toString('hex');
const key = `nac_${tenantId.substring(0, 8)}_${keySecret}`;
```

**Key Rotation Procedure:**
1. Generate new key via admin API
2. Update client applications with new key
3. Revoke old key via admin API
4. Monitor for failed auth attempts (old key usage)

```bash
# Generate new key
curl -X POST "http://localhost:3000/admin/tenants/{id}/keys" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Production Key v2", "permissions": ["*"]}'

# Revoke old key
curl -X DELETE "http://localhost:3000/admin/keys/{keyId}" \
  -H "X-Admin-Key: $ADMIN_API_KEY"
```

**Requirements:**
- [ ] Document key rotation schedule (quarterly recommended)
- [ ] Monitor `AUTH_INVALID_KEY_TOTAL` metric for compromised keys
- [ ] Use expiring keys (`expiresInDays`) for temporary access

### 5. Default Tenant Protection

**Feature flag behavior:**
- `MULTI_TENANT_ENABLED=false`: Legacy mode, single-tenant, no tenant isolation
- `MULTI_TENANT_ENABLED=true`: Multi-tenant mode with full isolation

**Default tenant (`id: 'default'`):**
- Tier: `enterprise` (unlimited quotas for backward compatibility)
- Protected: Cannot be deleted
- Purpose: Catch-all for legacy requests when multi-tenant enabled

**Verification:**
```bash
# Confirm default tenant exists and is protected
npx tsx -e "
import { getTenantManager } from './src/tenant/index.js';
const tm = getTenantManager();
const def = tm.getTenant('default');
console.log('Default tenant:', def);
try { tm.deleteTenant('default'); } catch(e) { console.log('Protected:', e.message); }
tm.close();
"
```

### 6. Quota & Rate Limit Monitoring

**Metrics to monitor:**
```
# Tenant quota exceeded (daily limits)
rate_limit_tenant_quota_exceeded_total

# Tenant rate limit exceeded (per-minute)
rate_limit_tenant_exceeded_total

# Tenant message quota exceeded
rate_limit_tenant_message_quota_exceeded_total
```

**Alert thresholds:**
- `rate_limit_*_exceeded_total` > 10/min: Possible misconfiguration or abuse
- `AUTH_INVALID_KEY_TOTAL` > 5/min: Possible key compromise or brute force

**Quota adjustment:**
```bash
# Increase quotas for a tenant
curl -X PUT "http://localhost:3000/admin/tenants/{id}/quotas" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"requestsPerMinute": 500, "requestsPerDay": 50000}'
```

## Tier Defaults Reference

| Quota | Free | Pro | Enterprise |
|-------|------|-----|------------|
| Requests/min | 60 | 300 | 1000 |
| Requests/day | 1000 | 10000 | Unlimited |
| Storage | 10 MB | 100 MB | 1 GB |
| Memory entries | 1000 | 10000 | Unlimited |
| Agents | 5 | 25 | Unlimited |
| Messages/min | 10 | 60 | 300 |
| Messages/day | 100 | 1000 | Unlimited |
| Connections | 2 | 10 | 100 |
| Event retention | 7 days | 30 days | 365 days |

## Incident Response

### Suspected Key Compromise
1. Immediately revoke the compromised key
2. Generate new key for affected tenant
3. Check audit logs for unauthorized access
4. Review `last_used_at` timestamps for unusual patterns

### Tenant Data Breach
1. Disable tenant (set tier to 'free' with 0 quotas)
2. Revoke all API keys for tenant
3. Export tenant data for forensics
4. Delete tenant after investigation

### Rate Limit Abuse
1. Check `get_usage` for tenant to see current consumption
2. Lower quotas temporarily if needed
3. Review access patterns for anomalies
4. Consider IP-based blocking at reverse proxy level
