# Scaffolding Cleanup — Restore Reviewability

## Context
`.gitignore` hides 3 `src/` directories and several scripts/docs under a "Scaffolding" comment.
Two of those directories (`src/observability/`, `src/tenant/`) are **live production code** imported by the runtime server.
Hiding them from git means fresh clones break and PRs can't review changes to critical auth/metrics code.

## Audit Results

| Path | Live? | Complete? | Action |
|------|-------|-----------|--------|
| `src/observability/` | **YES** — imported by server, security, memory | 100% | **Un-ignore, commit** |
| `src/tenant/` | **YES** — imported by security middleware, auth | 100% | **Un-ignore, commit** |
| `src/migrations/001-*`, `002-*` | No (CLI tools) | 100% | Already committed — no change |
| `src/migrations/migration-ledger.sql` | No | Stub | **Delete** — not imported anywhere |
| `src/migrations/reconciliation-job.ts` | No | Stub | **Delete** — not imported anywhere |
| `src/migrations/task-knowledge-migration.ts` | No | Stub | **Delete** — not imported anywhere |
| `docs/MULTI_TENANT_DESIGN.md` | No | Design doc | **Un-ignore, commit** — reference for tenant/ code |
| `docs/MULTI_TENANT_SECURITY.md` | No | Ops guide | **Un-ignore, commit** — reference for tenant/ code |
| `scripts/test-multi-tenant.ts` | No | 100% | **Un-ignore, commit** — useful integration test |
| `scripts/test-redis-flap.ts` | No | 100% | **Un-ignore, commit** — useful test |
| `scripts/test-redis-flap-with-restart.sh` | No | Stub (15 lines) | **Delete** — incomplete |

## Plan

- [x] 1. Remove scaffolding entries from `.gitignore` (lines 194-203)
- [x] 2. Delete dead stubs: `migration-ledger.sql`, `reconciliation-job.ts`, `task-knowledge-migration.ts`, `test-redis-flap-with-restart.sh`
- [x] 3. `git add` the un-ignored live files so they become tracked
- [x] 4. Verify: `npm run build` still succeeds (no import breakage)
- [x] 5. Verify: no secrets or sensitive data in newly tracked files
- [ ] 6. Report results to Codex

## Results

**Changes made:**
- `.gitignore`: Removed 10-line scaffolding block (lines 194-203). Kept `backups/` ignored.
- Deleted 4 dead files: `src/migrations/{migration-ledger.sql,reconciliation-job.ts,task-knowledge-migration.ts}`, `scripts/test-redis-flap-with-restart.sh`
- Un-ignored and ready to commit: `src/observability/` (4 files), `src/tenant/` (4 files), `docs/MULTI_TENANT_{DESIGN,SECURITY}.md`, `scripts/test-{multi-tenant,redis-flap}.ts`

**Verification:**
- `npm run build` — passes clean
- Secret scan — no hardcoded credentials in any newly tracked files
- No runtime behavior change — only git tracking changed
