# NE-P1-S0: Backup Gate + Baseline

## Type: Pre-Phase Gate
## Risk: low
## Phase: Pre-P1
## Codex Findings Addressed: #5 (backup omits tenants.db, lacks parity assertions)

## Description
Standard SPECTRA pre-phase: backup BOTH live DBs (unified-platform.db AND tenants.db), establish baseline contract tests on main after the neural-redesign merge. Confirms all 18 tools operational, token estimates under 4k.

## Acceptance Criteria
- [ ] Live Docker unified-platform.db backed up with PRAGMA integrity_check = ok
- [ ] Live Docker tenants.db backed up with PRAGMA integrity_check = ok (if exists; may not yet be created)
- [ ] Row counts captured with strict parity assertions:
  - ai_messages: exact count + NULL check on required columns + distribution by to_agent
  - shared_memory: exact count + NULL check on content column
  - individual_memory: exact count
  - session_handoffs: exact count
  - Sample hash check: SHA256 of first 10 ai_messages rows matches pre/post
- [ ] All existing contract tests pass (baseline + security + session protocol)
- [ ] begin_session token estimate < 4k confirmed

## Files
- Backup output only
- No code changes
