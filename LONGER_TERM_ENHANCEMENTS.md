# Longer-Term Enhancements Roadmap

This document collects medium-to-long range improvements to push the platform from “very productive” to “super‑productive” across security, reliability, observability, semantics, and developer ergonomics.

## 1) Security & Access Control
- API Tokens + RBAC: extend current API key to scoped tokens with roles (admin, writer, reader).
- Project/Namespace Isolation: add `projectId` across all writes/reads and enforce per‑project auth.
- TLS Termination: document reverse‑proxy setup (Traefik/Nginx) + HSTS.
- Audit Trails: append immutable audit events for tool calls, memory updates, and admin ops.

## 2) Observability & SLOs
- Prometheus `/metrics`: request counters, latencies, error rates, cache hit rate, DB round‑trip times.
- OpenTelemetry Tracing: span tools/call, memory store/search, vector/graph calls; ship to OTEL collector.
- Structured Logs: consistent fields (traceId, tool, agentId, projectId, durationMs, outcome).
- Golden Signals Dashboard: p95/p99 latency panels; alerting for sustained SLO breaches.

## 3) Memory & Semantics
- Vector Pipelines: configurable embedding backends (OpenAI, HF, local) + backfill job for existing data.
- Hybrid Ranking: BM25 + vector + graph signals; learning‑to‑rank for top‑N results.
- Graph Enrichment: typed edges, schema, constraints; higher‑level relation tools (MERGE_ENTITY, LINK_ENTITIES).
- Consolidation Jobs: periodic summarization of high‑volume observations into long‑term knowledge.

## 4) Project & Task Modeling
- First‑Class Project Context: enforce required `projectId` on shared memory writes/reads/search.
- Task Lifecycles: state machine with transitions/guards; webhooks on transitions; SLA timers.
- Artifact Indexing: code/doc ingestion + embeddings + links to tasks and decisions.

## 5) Multi‑Agent Collaboration UX
- Agent Registry & Presence: status heartbeat, capabilities discovery, availability windows.
- Conversation Threads: threaded `ai_message` with read receipts and user/agent mentions.
- Templates/Playbooks: reusable task recipes executing multi‑tool flows with checkpoints.

## 6) Reliability & Ops
- Backup/Restore: snapshot SQLite, Neo4j, Weaviate; scheduled rotations; restore script + docs.
- Blue/Green Deployments: health‑gated rollouts; schema migrations; data consistency checks.
- Disaster Recovery: runbook; RPO/RTO targets; periodic restore tests.

## 7) Client/IDE Experience
- Claude/Cursor Enhancements: quick‑pick palettes for top MCP tools; context macros for the 5 standard queries.
- Auth in Bridges: propagate API key/TLS from IDE to MCP over STDIO bridges.
- Examples Library: copy/paste JSON‑RPC library; Postman collection.

## 8) Compliance & Privacy (optional, enterprise)
- Data Retention Policies: TTL per memory type; right‑to‑forget for PII.
- Secrets Handling: vault integration for provider keys; zero‑trace logs.

## Suggested Sequence (Quarter Plan)
1. Observability (metrics, logs), Security (RBAC tokens), Project scoping
2. Vector/Graph ranking upgrades, consolidation jobs, agent registry
3. Backups/DR, CI integration tests, blue/green rollouts, client UX polish

---

Status: living roadmap. Propose additions via PR or open a discussion.

