# Cloud-Deployed Neural Collaboration Server (SaaS Blueprint)

This document outlines a production-ready design to deploy the Unified Neural MCP server as a multi-tenant SaaS with per-customer API keys and isolated memory clusters. It extends the current local stack to secure, scalable cloud hosting with proper tenancy, quotas, billing, and observability.

## Goals
- Multi-tenant SaaS: each customer (and optionally each project) receives unique API keys.
- Data isolation: separate memory clusters by tenant (and optionally by project).
- Secure MCP over HTTPS with API key enforcement; health endpoint remains public.
- Elastic scalability: scale horizontally and support managed DB backends.
- Usage metering and billing integration (Stripe) with quotas and rate limits.
- Operational excellence: backups, disaster recovery, observability, and SLOs.

## High-Level Architecture
- Edge and TLS
  - Cloud LB + reverse proxy (Nginx, Traefik, or Cloudflare) terminates TLS and routes HTTPS.
  - Route `/mcp` to the Unified MCP app; `/health` stays public; optional `/ws` for message hub.
- Application Layer
  - Unified MCP server container (HTTP JSON-RPC) with API key auth middleware.
  - Optional WebSocket message hub (configure only if required by your use cases).
- Multi-Tenant Data Layer (per-tenant isolation choices)
  - Option A (Strong isolation): per-tenant databases (e.g., one Postgres DB per tenant, one Redis DB per tenant namespace, Weaviate per-tenant class prefix, Neo4j per-tenant labels).
  - Option B (Logical isolation): single DB with `tenant_id` column/labels for every table/node and enforced at query time.
  - Option C (Hybrid): shared primary + dedicated advanced stores for large tenants.
- Control Plane
  - Key management and quotas (Admin API + DB tables) with periodic usage rollups.
  - Stripe Billing: subscription + metered usage (tool calls) + webhook integration.
- Observability
  - Centralized logs, metrics (requests, latency, errors, key violations), and traces.
  - Per-tenant dashboards and alerting thresholds.

## Tenancy Model and Isolation
- Tenants
  - A tenant represents a customer org; optionally model “project” as a sub-tenant (child scope).
  - Every request must carry `x-api-key: <key>`; the server resolves key → tenant and enforces policy.
- Isolation options
  - SQLite (local) not recommended for SaaS multitenancy; prefer Postgres for primary storage.
  - Postgres: per-tenant database or schema; or shared with `tenant_id` and RLS (Row Level Security).
  - Redis: prefix keys with `tenant:<id>:` and optionally use separate logical DB numbers per tenant.
  - Weaviate: per-tenant class prefix, e.g., `Tenant123_Entity`. Alternatively multi-tenant objects using the built-in tenancy feature if available in your version.
  - Neo4j: label nodes with `Tenant_<id>`; all queries must filter by `tenant_id` label/property.
- Recommendation
  - Start with logical isolation + strict RLS in Postgres and label conventions for Weaviate/Neo4j/Redis.
  - Promote heavy tenants to dedicated clusters using configuration maps.

## API Key Management and Quotas
- Database schema (primary Postgres)
  - `tenants` (id, name, status, created_at)
  - `projects` (id, tenant_id, name, status, created_at)
  - `api_keys` (key, tenant_id, project_id nullable, plan, status, quota_monthly_calls, calls_used_month, reset_at, created_at)
  - `usage_events` (id, api_key, tenant_id, project_id, tool_name, ts, latency_ms, status_code)
  - `invoices` (optional, for reporting or reconciliation)
- Middleware
  - Validate `x-api-key` against `api_keys` table.
  - Enforce `status` (active/suspended), `quota_monthly_calls`, and per-request rate limit.
  - Attach `tenant_id`/`project_id` to request context for all downstream operations.
- Quotas and rate limits
  - Rate limit per key (e.g., 10 rps) at proxy and app (token bucket or sliding window).
  - Monthly quota on tool calls; reject with 429 and clear message when exceeded.
- Rotation and lifecycle
  - Admin API to create/rotate/revoke keys; email delivery optional.
  - Keys are secrets; store hashed if you need to prevent plaintext exposure (present only once on creation).

## Billing (Stripe)
- Plans
  - Starter, Team, Enterprise with included monthly tool calls and support levels.
  - Overage priced per 1K tool calls beyond plan.
- Stripe setup
  - Products for plans and a metered price for “tool_calls”.
  - Webhook: `invoice.upcoming`, `invoice.finalized`, `customer.subscription.updated`.
  - On successful subscription, create and activate API key(s) for tenant.
  - Nightly job (or near-real-time) to report usage for the period (aggregate usage_events).
- Admin and self-serve
  - Admin API to sync Stripe data with tenants and key status.
  - Self-serve portal link for plan changes; show usage in the dashboard per tenant.

## Networking and Security
- TLS and proxy
  - Terminate TLS at Nginx/Traefik; route `/mcp` to MCP container.
  - Health `/health` public; `/mcp` requires `x-api-key` and is rate-limited.
- Firewall
  - Only expose 80/443 publicly; keep Redis, Neo4j, Weaviate internal (no public ports).
  - Use SGs/NSGs to restrict egress as required.
- Secrets management
  - Use cloud secret managers (AWS Secrets Manager, GCP Secret Manager) for API keys, DB passwords.
  - Mount secrets as env vars; avoid committing secrets to images.
- Compliance
  - Audit logs for admin operations and key creation/rotation.
  - Data retention policies per plan; data export endpoint for compliance.

## Deployment Patterns
- Single VM + Docker Compose (fastest path)
  - Create `docker/docker-compose.override.cloud.yml` to remove public DB ports and add proxy container.
  - Reverse proxy (Traefik/Caddy) issues Let’s Encrypt certs automatically.
  - Scale vertically or add more VMs by sharding tenants across stacks.
- Cloud Run / ECS / Kubernetes (cloud-native)
  - Unified MCP as a stateless service; configure managed Redis/Weaviate/Neo4j/Postgres.
  - K8s: Ingress + cert-manager for TLS; HPA for autoscaling.
  - Run message hub as a separate service if WebSockets required.
- Storage and backups
  - Use managed Postgres with automated backups and point-in-time recovery.
  - For Weaviate/Neo4j, choose managed offerings or back up volumes to object storage.

## Example: Docker Compose (Cloud Override)
```yaml
# docker/docker-compose.override.cloud.yml
services:
  unified-neural-mcp:
    ports:
      - "6174:6174"  # or remove and front with reverse proxy at 443
  redis:
    # remove ports to keep internal
    ports: []
  neo4j:
    ports: []
  weaviate:
    ports: []
```

## Example: Nginx TLS Reverse Proxy
```nginx
server {
  listen 80;
  server_name mcp.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name mcp.example.com;
  ssl_certificate /etc/letsencrypt/live/mcp.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/mcp.example.com/privkey.pem;

  # Public health check
  location /health {
    proxy_pass http://unified-neural-mcp:6174/health;
  }

  # MCP JSON-RPC with API key
  location /mcp {
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_pass http://unified-neural-mcp:6174/mcp;
    # Optional basic rate limit zone here
  }

  # Optional: message hub WS
  location /ws {
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_pass http://unified-neural-mcp:3004;
  }
}
```

## Application Changes (Server)
- Multi-key middleware
  - Replace single `API_KEY` check with DB-backed key validation.
  - Parse tenant/project from key record; add to request context.
  - Increment usage counters and write a usage_event on successful tool calls.
  - Enforce per-key rate limits and monthly quota.
- Tool handlers
  - Pass `tenant_id`/`project_id` into memory manager.
  - Ensure all read/write paths filter by tenant/project.
- Memory manager tenancy
  - Postgres: add `tenant_id` columns and RLS policies or per-tenant schema.
  - Redis: prefix all keys with `tenant:<id>` and optional DB number per tenant.
  - Weaviate: prefix classes per tenant (e.g., `T123_Entity`) or use multi-tenancy if enabled.
  - Neo4j: label patterns like `(:Entity:Tenant_123 { ... })` and filter every query by label.

## Example: DB Tables (Postgres)
```sql
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table api_keys (
  key text primary key,
  tenant_id uuid not null references tenants(id),
  project_id uuid references projects(id),
  plan text not null,
  status text not null default 'active',
  quota_monthly_calls int not null default 100000,
  calls_used_month int not null default 0,
  reset_at date not null,
  created_at timestamptz not null default now()
);

create table usage_events (
  id bigserial primary key,
  ts timestamptz not null default now(),
  api_key text not null,
  tenant_id uuid not null,
  project_id uuid,
  tool_name text,
  latency_ms int,
  status_code int
);
```

## Example: Admin API (sketch)
- POST `/admin/tenants` → create tenant
- POST `/admin/projects` → create project for tenant
- POST `/admin/api-keys` → create API key for tenant/project
- POST `/admin/api-keys/:key/rotate` → rotate
- POST `/admin/api-keys/:key/suspend` → suspend
- GET `/admin/usage?tenant_id=...&since=...` → aggregated usage

## Example: MCP Client Configs (Internet)
- Claude Desktop (Windows)
  - `npx mcp-remote --header "x-api-key:YOUR_KEY" https://mcp.example.com/mcp`
- Cursor / Claude Code CLI (bridge)
  - `env = { MCP_HOST = "mcp.example.com", MCP_PORT = "443", API_KEY = "YOUR_KEY" }`
  - Prefer `mcp-remote` for HTTPS if you do not want to rely on env in the bridge.
- Codex CLI (TOML)
  - Same as local, but set host to your domain and port 443.

## Observability and SLOs
- Metrics
  - Requests, latency, error rate, 401/429 counts, tool call mix, per-tenant usage.
- Logs
  - Structured logs with `tenant_id`, `api_key`, `tool_name`, `request_id`.
- Traces
  - Optional OpenTelemetry spans per tool call and DB operation for hotspot analysis.
- SLOs
  - Availability (99.9%), latency targets (<250ms p95 for tools/list, <500ms p95 for tools/call typical operations).

## Backups and DR
- Postgres automatic backups + PITR; test restores quarterly.
- Weaviate/Neo4j: regular snapshots to object storage; document recovery runbooks.
- Configuration backups (Docker/K8s manifests, proxy config) in repo with secrets externalized.

## Rollout Plan
- Phase 1: Multi-key auth + quotas in the existing app; admin CLI to issue keys; usage_events table.
- Phase 2: Stripe billing (plans + metered usage), webhook to activate/suspend keys.
- Phase 3: Tenant-aware memory manager and isolation across all stores; migrations + data backfill.
- Phase 4: Observability and SLOs with dashboards and alerts.
- Phase 5: Cloud rollout behind TLS proxy; private DBs; rate limit at edge.

## Security Checklist
- Enforce `x-api-key` on `/mcp` and rate limit.
- No public DB ports; lock down SGs.
- Secrets in secret manager; rotate regularly.
- Audit logs for admin operations.
- Per-tenant data export and deletion endpoints.

## Ready-To-Do Tasks
- Implement multi-key middleware, DB schema, and usage metering in the app.
- Add `docker-compose.override.cloud.yml` with removed DB ports and a reverse proxy.
- Provide Nginx/Traefik sample configuration with TLS.
- Add admin CLI (`scripts/keys.ts`) to create/rotate/suspend keys.
- Integrate Stripe Billing for plan activation and metered usage.

This blueprint prepares the system to operate as a secure, scalable SaaS with clean tenant isolation and standard operational controls.

