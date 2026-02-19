# SPECTRA Execution Plan — Neural Enhancement (Session Protocol)

## Project: shared-memory-mcp
## Level: 3 (Large Feature — multi-phase with cross-model validation)
## Generated: 2026-02-19
## Agents: claude-opus (builder), codex (reviewer), claude-sonnet (coordinator)
## Branch: neural-redesign (continues from P0-P8 redesign)

## Preservation Target: existing 14/14 contract tests MUST pass after every story

---

## Overview

3 new MCP tools that give every LLM agent persistent project context across stateless sessions:
- `get_agent_context(agentId, projectId?, depth?)` — tiered HOT/WARM/COLD context bundle
- `begin_session(agentId, projectId)` — context load + Slack notification + handoff flag
- `end_session(agentId, projectId, summary)` — flag_for_next_session + Slack notification

Plus: delete GuaranteedDeliverySystem (657 lines of dead code, agreed by all 3 agents).

---

## Architecture Decisions

### AD-1: Where does context assembly live?
**Decision:** New `getAgentContext()` method on MemoryManager.
**Rationale:** It queries individual_memory (learnings, preferences), ai_messages (unread), and shared_memory (entities, guardrails). MemoryManager already has access to all three. The tool handler in NeuralMCPServer is a thin wrapper.

### AD-2: How is flag_for_next_session stored?
**Decision:** Dedicated `session_handoffs` table with partial unique index.
**Rationale:** (Codex override, claude-sonnet approved) Tagged observations have no enforcement — nothing prevents two `[HANDOFF]` tags existing simultaneously. A dedicated table with `CREATE UNIQUE INDEX ... ON session_handoffs(project_id) WHERE active = 1` enforces exactly one active flag per project at the SQLite level. `end_session` deactivates prior handoff (active=0) + inserts new active one in a single transaction.

Schema:
```sql
CREATE TABLE session_handoffs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  summary TEXT NOT NULL,
  open_items_json TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  consumed_at DATETIME NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_confirmed DATETIME NULL
);
CREATE UNIQUE INDEX idx_session_handoffs_active ON session_handoffs(project_id) WHERE active = 1;
CREATE INDEX idx_session_handoffs_project ON session_handoffs(project_id, created_at DESC);
```

### AD-3: How does Slack notification work?
**Decision:** `NotificationPort` interface with `SlackNotificationAdapter` implementation.
**Rationale:** (Codex override, claude-sonnet approved) Wrapping Slack behind a `NotificationPort` keeps it swappable. Slack failure MUST NEVER fail the tool — the tool succeeds, notification status is reported in response metadata as `notificationStatus: 'sent' | 'skipped' | 'failed'`.

```typescript
interface NotificationPort {
  send(message: string): Promise<{ sent: boolean; error?: string }>;
}
```

### AD-4: Session model
**Decision:** Ephemeral — no `session_runs` table for Stage A. `session_handoffs` provides the minimal durable state.
**Rationale:** "Ephemeral by default" per spec. Codex proposed `session_runs` for idempotency but claude-sonnet confirmed it's overkill for Stage A. Revisit if retry/idempotency becomes a problem.

### AD-5: Context budget
**Decision:** Approximate token count as `Math.ceil(JSON.stringify(bundle).length / 4)`. If over 2000 tokens, truncate COLD first, then WARM. Never truncate HOT.
**Rationale:** Rough approximation is sufficient for context sizing. Deterministic truncation order: COLD > WARM > (HOT never truncated).

### AD-6: Memory tiers
- **HOT:** observations tagged `[HOT]`, entities of type `guardrail`, unread ai_messages, handoff flag
- **WARM:** project entity observations from last 30 days, recent decisions (last 5)
- **COLD:** everything else — all observations, full entity content, all decisions

---

## Task NE-S0: Delete GuaranteedDeliverySystem [Pre-flight]
- [x] NE-S0: Delete dead code before adding new features
- AC:
  - src/message-hub/guaranteed-delivery.ts deleted (657 lines)
  - Zero imports of GuaranteedDeliverySystem in codebase
  - TypeScript compiles clean
  - 14/14 contract tests pass
  - Server starts normally
- Files:
  - deletes: src/message-hub/guaranteed-delivery.ts
  - may touch: any file importing it (check for zero references first)
- Risk: low (confirmed dead code — never instantiated)
- Max-iterations: 1
- Blocked-by: none
- Status: **DONE**

---

## Task NE-S1: get_agent_context tool + session_handoffs table [Core]
- [x] NE-S1: Implement tiered context assembly with HOT/WARM/COLD + handoff schema
- AC:
  - Create `session_handoffs` table with partial unique index (idempotent migration)
  - Create `NotificationPort` interface + `SlackNotificationAdapter` in src/notifications/
  - New `getAgentContext(agentId, projectId?, depth?)` method on MemoryManager
  - Returns structured bundle:
    ```json
    {
      "identity": { "learnings": [...], "preferences": {} },
      "project": {
        "summary": "...",
        "openItems": [...],
        "recentDecisions": [...],
        "activeEntities": [...]
      },
      "handoff": { "flag": "...", "timestamp": "..." },
      "unreadMessages": [...],
      "guardrails": [...]
    }
    ```
  - HOT: identity + unread messages + handoff flag + guardrails
  - WARM: HOT + project summary + open items + recent decisions (default for project sessions)
  - COLD: everything including full entity observations
  - Context budget: if bundle > 2000 tokens (approx len/4), summarize WARM tier
  - New tool schema in toolSchemas.ts: `get_agent_context`
  - New handler in NeuralMCPServer switch statement
  - Tools list returns 16 tools (was 15)
  - 14/14 existing contract tests pass
- Files:
  - creates: src/notifications/index.ts (NotificationPort + SlackNotificationAdapter)
  - touches: src/unified-server/memory/index.ts, src/unified-neural-mcp-server.ts, src/shared/toolSchemas.ts
- Risk: medium
- Max-iterations: 3
- Blocked-by: NE-S0
- Status: **DONE**

---

## Task NE-S2: begin_session tool [Session Entry]
- [x] NE-S2: Implement session open with context load + Slack
- AC:
  - Calls getAgentContext(agentId, projectId, 'warm') internally
  - Returns HOT context bundle to the agent
  - Returns the last `flag_for_next_session` if one exists
  - If no project entity exists in neural, creates a skeleton one via store()
  - Posts to Slack via NotificationPort: "projectId session open - agentId"
  - Returns `notificationStatus: 'sent' | 'skipped' | 'failed'` in response
  - Slack failure is non-blocking (tool succeeds, status in metadata)
  - New tool schema in toolSchemas.ts: `begin_session`
  - New handler in NeuralMCPServer
  - Tools list returns 17 tools
  - 14/14 existing contract tests pass
- Files:
  - touches: src/unified-neural-mcp-server.ts, src/shared/toolSchemas.ts, src/unified-server/memory/index.ts
  - touches: docker/docker-compose.unified-neural-mcp.yml (add SLACK_WEBHOOK_URL env var pass-through)
- Risk: low
- Max-iterations: 2
- Blocked-by: NE-S1
- Status: **DONE**

---

## Task NE-S3: end_session tool [Session Exit]
- [x] NE-S3: Implement session close with handoff flag + Slack
- AC:
  - Deactivates prior handoff (`UPDATE session_handoffs SET active=0 WHERE project_id=? AND active=1`)
  - Inserts new active handoff row in single transaction
  - Calls record_learning for anything passed in `learnings` array
  - Posts to Slack via NotificationPort: "projectId session closed - agentId - summary"
  - Returns `notificationStatus: 'sent' | 'skipped' | 'failed'` in response
  - New tool schema in toolSchemas.ts: `end_session`
  - New handler in NeuralMCPServer
  - Tools list returns 18 tools
  - 14/14 existing contract tests pass
- Files:
  - touches: src/unified-neural-mcp-server.ts, src/shared/toolSchemas.ts, src/unified-server/memory/index.ts
- Risk: low
- Max-iterations: 2
- Blocked-by: NE-S1
- Status: **DONE**

---

## Task NE-S4: Contract Tests [Gate]
- [x] NE-S4: Add contract tests for all 3 new tools
- AC:
  - tests/contract-session-protocol.test.ts with tests for:
    - get_agent_context: returns structured bundle, HOT/WARM/COLD tiers work
    - begin_session: creates project skeleton if missing, returns context + handoff flag
    - end_session: writes handoff flag, subsequent begin_session retrieves it
    - Round-trip: begin_session -> end_session -> begin_session confirms handoff persistence
  - All new tests pass
  - 14/14 existing contract tests still pass
  - Response time baselines logged
- Files:
  - creates: tests/contract-session-protocol.test.ts
- Risk: low
- Max-iterations: 2
- Blocked-by: NE-S2, NE-S3
- Status: **DONE** (13/13 tests passing)

---

## Task NE-S5: Docs + Neural Entity [Finalize]
- [x] NE-S5: Update docs and store design in neural graph
- AC:
  - README.md updated with 3 new tools in tool table (18 tools total)
  - EXAMPLES_OF_USE.md updated with curl examples for all 3 session tools
  - neural-enhancement entity created in graph with full design as observations
  - Report sent to claude-sonnet via send_ai_message
- Files:
  - touches: README.md, EXAMPLES_OF_USE.md
- Risk: low
- Blocked-by: NE-S4
- Status: **DONE**

---

## Summary

| Task | Phase | Risk | Est. Lines Changed | Blocked By |
|------|-------|------|-------------------|------------|
| NE-S0 | Pre-flight | low | -657 | — |
| NE-S1 | Core | medium | +200 | NE-S0 |
| NE-S2 | Session Entry | low | +100 | NE-S1 |
| NE-S3 | Session Exit | low | +80 | NE-S1 |
| NE-S4 | Gate | low | +150 | NE-S2, NE-S3 |
| NE-S5 | Finalize | low | ~50 mod | NE-S4 |

**Net: ~530 added, ~657 deleted = ~-127 lines**
