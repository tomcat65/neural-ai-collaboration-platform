# Dead-Code / Runtime-Surface Cleanup

## Classification

### Canonical (keep)
- `src/unified-neural-mcp-server.ts` — the production server
- `src/unified-server/memory/index.ts` — MemoryManager, imported by canonical
- `src/unified-server/types/memory.ts` — types for MemoryManager
- `src/message-hub/` — integrated into canonical via MessageHubIntegration
- `docker/Dockerfile.unified-neural-mcp` — canonical Docker image
- `docker/docker-compose.unified-neural-mcp.yml` — canonical compose
- `docker/docker-compose.unified-neural-mcp.dev.yml` — dev override (Vue dashboard)

### Dead — safe to delete
- `src/index.ts` — 7-line placeholder, no function
- `src/unified-server/index.ts` — 1373-line abandoned parallel server
- `src/unified-server/server.ts` — alternate UnifiedCollaborationServer, never invoked
- `src/unified-server/collaboration/` — not imported by canonical or memory
- `src/unified-server/onboarding/` — not imported by canonical or memory
- `src/unified-server/routes/` — not imported by canonical or memory
- `src/unified-server/events/` — not imported by canonical or memory
- `src/unified-server/utils/` — not imported by canonical or memory
- `src/unified-server/types/events.ts` — not imported by memory/index.ts
- `docker/Dockerfile` — legacy, points to unified:prod of old server
- `docker/Dockerfile.unified-server` — would run abandoned server
- `docker/Dockerfile.neural-ai-server` — superseded by Dockerfile.unified-neural-mcp
- `docker/Dockerfile.neural-ai` — legacy
- `docker/Dockerfile.smart-agent` — legacy
- `docker/Dockerfile.autonomous-agent` — legacy
- `docker/Dockerfile.config-server` — legacy
- `docker/Dockerfile.universal-gateway` — legacy
- `docker/Dockerfile.nginx` — legacy
- `docker-compose.yml` (root) — legacy full-platform stack
- `docker-compose-unified.yml` — legacy
- `docker-compose-simple.yml` — legacy (not in docker/)
- `docker-compose-mcp-only.yml` — legacy
- `docker/docker-compose.simple.yml` — legacy (refs Weaviate/Neo4j/Redis)
- `docker/docker-compose.simple.override.yml` — legacy
- `docker/docker-compose.gateway-only.yml` — legacy

### Dormant — keep but label
- `start-event-orchestrator.cjs` — not in canonical deployment but separate service
- `docker/Dockerfile.event-orchestrator` — builds event orchestrator

## Plan

- [x] 1. Delete dead src/ files (index.ts + unused unified-server subdirs)
- [x] 2. Delete dead Dockerfiles (9 files)
- [x] 3. Delete dead docker-compose files (7 files)
- [x] 4. Verified package.json scripts — all point to canonical runtime, no stale refs
- [x] 5. Build passes clean
- [x] 6. Canonical Docker path intact (Dockerfile.unified-neural-mcp + both compose files remain)
- [ ] 7. Report to Codex

## Results

**Deleted (src/):**
- src/index.ts (placeholder)
- src/unified-server/index.ts (1373-line abandoned server)
- src/unified-server/server.ts (UnifiedCollaborationServer)
- src/unified-server/types/events.ts
- src/unified-server/collaboration/ (entire dir)
- src/unified-server/onboarding/ (entire dir)
- src/unified-server/routes/ (entire dir)
- src/unified-server/events/ (entire dir)
- src/unified-server/utils/ (entire dir)

**Deleted (Docker):**
- docker/Dockerfile (legacy)
- docker/Dockerfile.unified-server
- docker/Dockerfile.neural-ai-server
- docker/Dockerfile.neural-ai
- docker/Dockerfile.smart-agent
- docker/Dockerfile.autonomous-agent
- docker/Dockerfile.config-server
- docker/Dockerfile.universal-gateway
- docker/Dockerfile.nginx

**Deleted (compose):**
- docker-compose.yml, docker-compose-unified.yml, docker-compose-simple.yml, docker-compose-mcp-only.yml
- docker/docker-compose.simple.yml, docker/docker-compose.simple.override.yml, docker/docker-compose.gateway-only.yml

**Kept:**
- src/unified-server/memory/index.ts (MemoryManager — imported by canonical)
- src/unified-server/types/memory.ts (types for MemoryManager)
- docker/Dockerfile.unified-neural-mcp (canonical)
- docker/Dockerfile.event-orchestrator (dormant but separate service)
- docker/docker-compose.unified-neural-mcp.yml + .dev.yml (canonical)
- start-event-orchestrator.cjs (dormant)

**Verification:** npm run build passes, canonical Docker/compose files intact
