---
name: coordinate-agents
description: >-
  Start a durable, polling-based collaboration with one or more other AI agents
  over the neural-ai-collaboration MCP. Trigger when the user says "coordinate
  with <agent(s)>", "collaborate with <agent>", "work with codex/cowork/gemini",
  "poll for messages from <agent>", or otherwise asks to set up cross-agent
  messaging + shared-memory collaboration. Examples: "coordinate with cowork and
  codex-desktop", "collaborate with codex on the dashboard", "start working with
  gemini and cowork".
---

# Coordinate with other agents

Sets up and runs a collaboration loop with one or more peer agents (codex-desktop,
cowork, gemini, etc.) using the `mcp__neural-ai-collaboration__*` tools. Messages
are the **turn signal**; a shared knowledge-graph **entity is the durable record**.

## My identity
I send/receive as **`claude-engram`** (register it if needed via `register_agent`).
Override only if the user specifies a different `from` id.

## On invocation

1. **Parse the peer agent id(s)** from the request (e.g. "coordinate with cowork and
   codex-desktop" → `["cowork", "codex-desktop"]`). If ambiguous, call
   `get_agent_status` (canonical roster) and confirm the intended ids with the user.
   Use exact registered ids (`codex-desktop`, `cowork`, `gemini`, …), not nicknames.

2. **Establish the ledger entity.** If the user named a task/topic, use or create a
   shared entity for it (`create_entities`, type `task`); otherwise ask one line:
   "What are we collaborating on?" Seed it with an `agentBootstrap` note and the
   objective. This entity is the system of record. Add `COLLABORATES_ON` relations
   from each agent id to the entity.

3. **Post the collaboration protocol** as a `kind: protocol` observation on the
   entity (only if not already present), then **send each peer a turn-signal
   message** (`send_ai_message`, `messageType: collaboration`) pointing them at the
   entity and the protocol. Tell them: converse by appending observations to the
   entity (`kind` ∈ proposal/decision/question/blocker/progress/done/correction),
   disagree via `kind: correction` + `supersedes`, and ping only as a turn-signal.

4. **Start the polling loop** by invoking the `loop` skill in fixed 3-minute mode
   with bounded idle-stop (see "Polling" below). Run the first poll immediately.

## Polling (each iteration)
- **Read the ledger**, not just the inbox: `search_entities({query:<entity>,
  searchType:"exact", agentFilter:<peer>})` for each peer + `get_ai_messages
  ({agentId:"claude-engram", unreadOnly:false, from:<peer>})`. The ledger is
  authoritative; the inbox is the doorbell.
- **Act on new peer observations** (newer than my last post): answer questions,
  evaluate corrections, record decisions/progress. Use `correction`+`supersedes`
  to disagree; converge with one `kind: decision` that supersedes open `question`s.
- **Reply via the ledger** (append an observation), then send a one-line ping
  referencing the observation id(s).
- **Idle-stop:** track `consecutiveIdlePolls`; increment when a poll finds nothing
  new (no unread peer message AND no new ledger observation since last check),
  reset to 0 on activity, and **STOP at 5** (~15 min silence). On stop, post a
  `kind: progress` "idle-stopped after N empty polls; re-ping to resume" and exit.
  Resume when the user re-invokes or a new message arrives.

## Guardrails (always)
- **Gate code at commit/PR.** Autonomous edits are OK only if the user explicitly
  authorized implementation this session; otherwise stay in coordinate/plan mode.
  Never merge PRs, never push to `main`, never run destructive ops without the
  user's go. Surface anything out-of-scope or ambiguous to the user, don't act.
- **Durable, not chatty:** substantive content goes in observations, not messages.
- **One machine / localhost trust:** the server is local; no remote exposure added.
- Honor any standing project rules (e.g. spectra is deferred, no multi-tenant/Pass-2
  reintroduction) recorded on the relevant ledger entities.

## Notes
- Server: `mcp__neural-ai-collaboration__*` on localhost:6174 (Engram / shared-memory-mcp).
- A peer only "hears" a message when it takes a turn (human prompt, its own poll
  loop, or a wake). If a peer stays silent, its loop may be stopped/FS-blocked —
  surface that to the user rather than polling forever.
- Verify peer ids against the canonical roster; ephemeral `agent-<host>-<pid>-<ts>`
  ids are not durable collaborators.
