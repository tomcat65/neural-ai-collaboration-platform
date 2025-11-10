Project Status – Continuation Guide (Quick Re‑Onboard)

Date: 2025-09-30

Purpose
Use this file to quickly regain full context after restart. It lists exactly what changed, which files to open, what remains, and the next enhancements required for backup naming and project isolation.

Files To Open First (for full picture)
1) docker/docker-compose.unified-neural-mcp.yml
   - Weaviate + sidecar wiring (in progress)
   - Unified MCP env (vectorizer)
2) scripts/neural-unified-up.sh
   - Starts unified stack (project: unified), stops simple stack, health check
3) scripts/neural-unified-down.sh
   - Stops unified (and best‑effort simple) cleanly
4) scripts/validate-hf-key.sh
   - Validates your HF token & model and checks container env wiring
5) scripts/agent-pairing.sh
   - Quick cross‑CLI messaging sanity test
6) src/unified-neural-mcp-server.ts, src/mcp-http-server.ts, src/message-hub/hub-integration.ts
   - Messaging routes, retrieval filters, hub logging
7) src/memory/neo4j-client.ts
   - toNeoProp() fix to quiet Neo4j map property errors
8) README.md (Cross‑CLI, port reference)
9) docker/docker-compose.simple.yml and docker/docker-compose.simple.override.yml
   - Simple stack ports remapped to 5300/5301/5175

What We Finished
- Cross-CLI messaging works (send_ai_message/get_ai_messages) with retrieval filters and better logging.
- Neo4j errors quieted by coercing non-primitives.
- Simple stack remapped to avoid port 3000/3001 conflicts; up/down scripts target distinct projects (unified/simple).
- HF token & model validated; Weaviate receives envs correctly.
- Observed that text2vec-huggingface returns 404 "Not Found" on vector writes (module→HF inference mismatch).
- MCP bridge identity tooling now in place: `set_agent_identity` auto-sends a bridge command and we can re-register agents on demand (Codex now registers as `codex`, Cursor as `cursor-neural`).
- `scripts/neural-unified-up.sh` now exports the API key before launching compose so docker no longer warns about a blank `API_KEY`.
- Project context now stored via `.project-context`/`NEURAL_PROJECT`; interactive startup prompts for slugs, safe shutdown/backups include the project in their names, and restore flows set the slug automatically when possible.
- MCP HTTP initialize handler now echoes the client protocol version (Claude Desktop handshake fixed; registered agents stay connected).
- Planning underway to add full per-project namespaces (Redis/Neo4j/Weaviate/SQLite) so we can switch projects, reuse snippets, and run backups without tearing down containers.

What’s In‑Progress (Vectors)
- Moving to Weaviate text2vec‑transformers (local sidecar) to remove external HF dependency and 404s.
- Compose currently partially updated; needs final tidy:
  - Define t2v-transformers service under services: (same level as weaviate)
  - Set DEFAULT_VECTORIZER_MODULE to text2vec-transformers
  - ENABLE_MODULES to 'text2vec-transformers'
  - TRANSFORMERS_INFERENCE_API: http://t2v-transformers:8080 under weaviate env
  - Remove HUGGINGFACE_APIKEY/HUGGINGFACE_EMBEDDING_MODEL from weaviate env
  - Set unified‑neural‑mcp WEAVIATE_VECTORIZER=text2vec-transformers

Exact Compose Snippet (Drop‑in)
services:
  weaviate:
    image: semitechnologies/weaviate:1.22.4
    ports:
      - "8080:8080"
    environment:
      QUERY_DEFAULTS_LIMIT: 25
      AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED: 'true'
      PERSISTENCE_DATA_PATH: '/var/lib/weaviate'
      DEFAULT_VECTORIZER_MODULE: text2vec-transformers
      ENABLE_MODULES: 'text2vec-transformers'
      CLUSTER_HOSTNAME: 'node1'
      TRANSFORMERS_INFERENCE_API: http://t2v-transformers:8080
    volumes:
      - weaviate_data:/var/lib/weaviate
    networks: [neural_network]
    healthcheck:
      test: ["CMD-SHELL", "nc -z localhost 8080 || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s

  t2v-transformers:
    image: cr.weaviate.io/semitechnologies/transformers-inference:sentence-transformers-all-MiniLM-L6-v2
    environment:
      ENABLE_CUDA: 0
    networks: [neural_network]

In unified-neural-mcp service env:
- WEAVIATE_VECTORIZER=text2vec-transformers

Vector Setup – Finish Steps (Post‑Restart)
1) Edit compose as above (services: weaviate + t2v-transformers, unified env change).
2) Drop Weaviate class so it recreates with new vectorizer:
   curl -s -X DELETE http://localhost:8080/v1/schema/AIMemory
3) Restart unified:
   scripts/neural-unified-down.sh
   scripts/neural-unified-up.sh
4) Verify sidecar connectivity:
   docker exec unified-weaviate-1 sh -lc 'wget -qO- http://t2v-transformers:8080 | head -c 80 || true'
5) Trigger a write (agent registration happens automatically on CLI connect). Or run:
   curl -s -H 'Content-Type: application/json' http://localhost:6174/mcp \
     -d '{"jsonrpc":"2.0","id":102,"method":"tools/call","params":{"name":"register_agent","arguments":{"agentId":"local-txfr-test","name":"Local Transformers Test","capabilities":["bridge"]}}}' | jq -r '.result.content[0].text'
6) Confirm no vector errors:
   docker logs --tail=200 unified-unified-neural-mcp-1 | grep -E 'update vector:|Error storing memory in Weaviate' || echo '(none)'

Temporary Quiet Mode (if pressed for time)
- Set WEAVIATE_VECTORIZER=none (unified env), drop class, restart. All core features work; semantic search can be re‑enabled later.

Known Pitfalls
- Compose YAML must define sidecar under services: (not networks:). Ensure TRANSFORMERS_INFERENCE_API exists under weaviate env.
- Up script’s quick health check can warn just before the server becomes healthy (harmless); use curl http://localhost:6174/health to confirm.
- First pull of `cr.weaviate.io/semitechnologies/transformers-inference:sentence-transformers-all-MiniLM-L6-v2` is ~8.4 GB and can take several minutes; reruns reuse the cached image.

Why Sidecar
- Removes reliance on external HF Inference API (removes 401/404). Stable, documented path for embeddings under Docker Compose.

Contacts & Helpers
- scripts/validate-hf-key.sh – checks token + model + container env
- scripts/agent-pairing.sh – end-to-end messaging sanity test

Enhancement Plan – Backup Naming & Project Isolation

Context
- We maintain separate long-running projects (Vida Tea vs. Philly Wings) and their associated memory. Current backups use generic timestamped names, which makes project-specific recovery error-prone. Restarting a session should keep project context straight.
- When creating a brand-new project, the system should start with blank memory to avoid cross-pollinating knowledge from previous clients.

Goals
1. Attach the active project slug to backup directories (e.g., `backup-philly-wings-2025-09-30-1530`).
2. Provide an explicit mechanism to declare the current project before startup and ensure all scripts pick it up.
3. Guarantee that "fresh project" startup initializes empty memory stores (SQLite, Redis, Neo4j, Weaviate) without restoring legacy data unless requested.
4. Update documentation and helper scripts so the workflow is obvious and verifiable.

Progress Snapshot (2025-09-30)
- ✅ `.project-context` helper + interactive menu option keeps `NEURAL_PROJECT` in sync across scripts.
- ✅ Safe shutdown and backup helpers now prefix directories with the active project slug and record it in metadata.
- ✅ "Start Fresh Project" flow prompts for a slug and wipes persistent volumes/data before launch.
- 🔄 Remaining work: backup catalog refinements, restore CLI UX polish, bridge identity wiring, documentation deep dive (see tasks below).

Remaining Tasks
1. **Bridge Registration Reset**
   - Ensure `mcp-stdio-http-bridge.cjs` reads the project context and registers an agent with an appropriate ID (e.g., `codex-philly-wings`) or at least ensures the default identity lines up with the project's memory.
   - Document how to reset the bridge identity via `set_agent_identity` or environment variables when switching projects.

2. **Namespace Implementation**
   - Design namespace strategy per backend (SQLite/Redis/Neo4j/Weaviate) and introduce slug-aware helpers.
   - Update storage clients to scope read/write operations by slug and provide wipe/snapshot routines.

3. **Documentation & Cross-Project Docs**
   - Add a short example to `PROJECT_UPDATE.md` (or a new doc) about declaring a project, running fresh start, and verifying isolation.
   - Mention in `CURSOR_AGENT_ONBOARDING.md` how to confirm active project context via `get_agent_status {}` and how to intentionally reuse snippets from other slugs.

4. **Testing Checklist (Manual)**
   - Simulate backup creation while `NEURAL_PROJECT=philly-wings`; confirm directory naming and metadata lines include the slug.
   - Restore from the new backup; verify `get_agent_status` shows only project-specific agents and `.project-context` updates automatically.
   - Start a "fresh" project `NEURAL_PROJECT=test-fresh`; confirm no residual messages or agents, then run `safe-shutdown.sh` to ensure backups stay isolated.

Immediate Next Session
- Draft namespace design notes (per backend) and begin piping slug helpers into storage clients.
- Extend bridge tooling so agents pick up the current project slug automatically.

Remember to carry over this context when reconnecting so the next session resumes with the backup naming work.
