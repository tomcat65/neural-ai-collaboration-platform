# NE-P1-S1: Users Table + Schema Extensions

## Type: Schema Migration
## Risk: high (data migration)
## Phase: P1a
## Codex Findings Addressed: #3 (session_handoffs uniqueness), #9 (tenant naming inconsistency)

## Description
Create `users` table in the main SQLite DB. Add `tenant_id` and `user_id` columns (nullable) to `ai_messages` and `session_handoffs`. Create canonical `tenant_memberships(user_id, tenant_id, role)` for multi-tenant authz. Backfill all existing rows to tenant_id='default'. Create bootstrap user (Tommy). Update session_handoffs unique constraint to be tenant-scoped.

## Naming Convention (codex #9)
- Canonical tenant ID for legacy/default data: `'default'` (NOT `'tenant_default'`)
- All stories, code, and backfill use `'default'` consistently

## Schema: users table
```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  display_name TEXT NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  locale TEXT DEFAULT 'en-US',
  date_format TEXT DEFAULT 'YYYY-MM-DD',
  units TEXT DEFAULT 'metric',
  working_hours TEXT DEFAULT '{"start":"09:00","end":"17:00"}',
  last_seen_tz TEXT,
  prefs_version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_tenant ON users(tenant_id);
```
- Note: `users.tenant_id` is a deprecated read-only compatibility shadow during rollout. Canonical tenancy membership lives in `tenant_memberships`.

## Schema: tenant memberships (canonical)
```sql
CREATE TABLE IF NOT EXISTS tenant_memberships (
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX idx_tenant_memberships_user ON tenant_memberships(user_id);
CREATE INDEX idx_tenant_memberships_tenant_role ON tenant_memberships(tenant_id, role);
```

## Schema: column additions
```sql
ALTER TABLE ai_messages ADD COLUMN tenant_id TEXT DEFAULT 'default';
ALTER TABLE ai_messages ADD COLUMN user_id TEXT;
ALTER TABLE session_handoffs ADD COLUMN tenant_id TEXT DEFAULT 'default';
ALTER TABLE session_handoffs ADD COLUMN user_id TEXT;
CREATE INDEX idx_ai_messages_tenant ON ai_messages(tenant_id);
CREATE INDEX idx_session_handoffs_tenant ON session_handoffs(tenant_id);
```

## Schema: session_handoffs uniqueness fix (codex #3)
The current partial unique index is global by project_id:
```sql
-- CURRENT (unsafe for multi-tenant):
CREATE UNIQUE INDEX idx_session_handoffs_active ON session_handoffs(project_id) WHERE active = 1;
-- NEW (tenant-scoped):
DROP INDEX IF EXISTS idx_session_handoffs_active;
CREATE UNIQUE INDEX idx_session_handoffs_active ON session_handoffs(tenant_id, project_id) WHERE active = 1;
```
This prevents cross-tenant handoff collisions on the same project_id.

## Backfill
- All existing ai_messages rows: tenant_id = 'default'
- All existing session_handoffs rows: tenant_id = 'default'
- Bootstrap user: id='tommy', tenant_id='default', display_name='Tommy', timezone='America/Chicago', locale='en-US'
- Bootstrap membership: (`user_id`='tommy', `tenant_id`='default', `role`='owner') in `tenant_memberships`

## Acceptance Criteria
- [ ] users table created with all columns + index
- [ ] tenant_memberships created as canonical membership model with fields (user_id, tenant_id, role)
- [ ] tenant_memberships has unique constraint on (tenant_id, user_id)
- [ ] tenant_memberships has index on user_id
- [ ] tenant_memberships has index on (tenant_id, role)
- [ ] ai_messages has tenant_id + user_id columns with index
- [ ] session_handoffs has tenant_id + user_id columns with index
- [ ] session_handoffs unique constraint is now (tenant_id, project_id) WHERE active=1
- [ ] All existing rows backfilled with tenant_id='default'
- [ ] Bootstrap user 'tommy' created
- [ ] Bootstrap membership for 'tommy' in tenant 'default' exists
- [ ] users.tenant_id retained as deprecated read-only shadow (not canonical membership source)
- [ ] Migration is idempotent (safe to re-run)
- [ ] All existing contract tests still pass
- [ ] Zero data loss on ai_messages and session_handoffs
- [ ] Parity assertions: row counts match pre/post, no NULLs in tenant_id after backfill

## Files
- creates: src/migrations/002-users-tenant-columns.ts
- touches: src/unified-server/memory/index.ts (add users table to init, add migration call)
