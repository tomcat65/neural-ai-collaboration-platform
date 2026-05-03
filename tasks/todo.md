# Broken Runbook/Docs Cleanup

## Classification

| File | Type | Action |
|------|------|--------|
| `deploy-gateway.md` | Operational guide — all refs deleted | **Delete** |
| `SAFE-SHUTDOWN-BACKUP.md` | Operational guide — refs Redis/Neo4j/Weaviate/deleted compose | **Delete** |
| `COMPLETE_TOOL_REFERENCE.md` | Operational — outdated arch, broken startup cmd | **Delete** |
| `ADVANCED_MEMORY_API_TESTS.md` | Operational — wrong port (5174), refs non-existent services | **Delete** |
| `NEURAL_AI_QUICKSTART.md` | Stale runbook — depends on legacy `neural-ai-control.sh` and removed endpoints | **Archive** |
| `RESTORE_FROM_BACKUP.md` | Stale restore guide — depends on legacy `neural-ai-control.sh` workflow | **Archive** |
| `project-status.md` | Historical continuation guide — refs deleted compose files and old vector stack | **Archive** |
| `CONFIGURATION-TEMPLATES.md` | Operational — still valid | Keep |
| `CLOUD_DEPLOYED_NEURAL_COLLABORATION_SERVER.md` | Blueprint/future — no broken ops | Keep |
| `docker-unified-neural-mcp-1-container-logs.md` | Historical log dump | Keep |
| `.spectra/*` | Planning artifacts | Keep (not operational) |
| `docs/2025-07-*` | Historical project updates | Keep |

## Plan

- [x] 1. Delete broken operational docs (4 files)
- [x] 2. Archive stale top-level runbooks that still depend on the removed runtime surface
- [x] 3. Patch surviving doc references that pointed at deleted files
- [x] 4. Verify no remaining non-archived root-level docs tell users to run deleted compose files or `neural-ai-control.sh`
- [x] 5. Report completion

## Results
- Deleted broken top-level runbooks/docs:
  - `deploy-gateway.md`
  - `SAFE-SHUTDOWN-BACKUP.md`
  - `COMPLETE_TOOL_REFERENCE.md`
  - `ADVANCED_MEMORY_API_TESTS.md`
- Archived stale top-level runbooks that still described the removed legacy stack:
  - `NEURAL_AI_QUICKSTART.md.archived`
  - `RESTORE_FROM_BACKUP.md.archived`
  - `project-status.md.archived`
- Updated surviving docs to avoid links to deleted files.
- Verification target: no non-archived root-level Markdown file now instructs operators to use deleted compose files or `neural-ai-control.sh`.
