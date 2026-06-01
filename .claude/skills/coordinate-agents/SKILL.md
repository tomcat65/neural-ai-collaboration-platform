---
name: coordinate-agents
description: >-
  Start a durable, polling-based collaboration with one or more other AI agents
  over the neural-ai-collaboration MCP, using the [ACP-HB] heartbeat protocol so a
  busy peer is never mistaken for an absent one. Trigger when the user says
  "coordinate with <agent(s)>", "collaborate with <agent>", "work with
  codex/cowork/gemini", "poll for messages from <agent>", or otherwise asks to set
  up cross-agent messaging + shared-memory collaboration. Examples: "coordinate with
  cowork and codex-desktop", "collaborate with codex on the dashboard", "start
  working with gemini and cowork".
---

# Coordinate with other agents

Sets up and runs a collaboration loop with one or more peer agents (codex-desktop,
cowork, gemini, etc.) using the `mcp__neural-ai-collaboration__*` tools. Messages
are the **turn signal**; a shared knowledge-graph **entity is the durable record**.
Coordination runs on the **`[ACP-HB]` heartbeat protocol** (below): peers exchange
lightweight liveness heartbeats so a peer that is busy reviewing/testing is never
mistaken for one that has gone away.

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
   entity (only if not already present), then **send each peer an opening `[ACP-HB]`
   heartbeat** (`send_ai_message`, `messageType: collaboration`) pointing them at the
   entity. Tell them: converse by appending observations to the entity (`kind` ∈
   proposal/decision/question/blocker/progress/done/correction), disagree via
   `kind: correction` + `supersedes`, and ping only as a turn-signal / heartbeat.

4. **Start the polling loop** by invoking the `loop` skill in **dynamic cadence**
   (see "Cadence" below — default ~3-5 min). Run the first poll immediately.

## The `[ACP-HB]` heartbeat protocol

The agreed cross-agent protocol (spec of record: the `agent-coordination-protocol`
ledger entity). Each poll, emit **one** heartbeat to each active peer — but **skip it
on a poll where you already sent that peer a substantive message**, which itself
counts as a heartbeat:

`[ACP-HB] coord=<entity> from=claude-engram status=<one-word> ball=<me|you|none> next_hb=<Nm> ledger=<entity> [eta=<when>] — <one line of state>`

**Two clocks — keep them separate:**
- **Liveness** = heartbeat freshness. A fresh heartbeat means the peer is *reachable*.
- **Progress** = substantive movement only: a PR/code change, a test result, a
  decision, a blocker, or a useful ETA change. **A heartbeat is NOT progress.**

A fresh heartbeat proves the peer is alive but does **not** reset the progress clock.
This is what prevents an immortal keepalive loop (two agents heartbeating forever with
no work).

**Cadence** (`next_hb`) is a *forecast*, not a fixed interval — advertise when you'll
next check in. Guardrails: min 1m, normal 3-5m, max 15m unless you state a concrete
ETA / long-running task; beyond max without an ETA, the coordinator caps it or asks
for one. Liveness timeout derives from cadence: treat a peer as unreachable after
**3× its advertised `next_hb`, or 15m, whichever is greater**.

## Polling (each iteration)
- **Read the ledger**, not just the inbox: `search_entities({query:<entity>,
  searchType:"exact", agentFilter:<peer>})` for each peer + `get_ai_messages
  ({agentId:"claude-engram", unreadOnly:true})`. The ledger is authoritative; the
  inbox is the doorbell. Mark handled peer messages read (`mark_messages_read`).
- **Emit your heartbeat** (per the protocol above) unless you sent a substantive
  message this poll.
- **Act on new peer observations** (newer than my last post): answer questions,
  evaluate corrections, record decisions/progress. Use `correction`+`supersedes` to
  disagree; converge with one `kind: decision` that supersedes open `question`s.
- **Reply via the ledger** (append an observation), then send a one-line `[ACP-HB]`
  ping referencing the observation id(s). Substantive movement resets the progress
  clock for both sides.
- **Idle-stop on PROGRESS, not emptiness.** If a peer is *reachable* (heartbeats
  fresh) but there has been **no substantive progress for ~5 polls / ~15 min**, record
  a `kind: progress` "reachable-but-idle" note and **ask the peer for a substantive
  update**; stop only if there is still nothing AND no local action remains. End
  normally on an explicit close (`status=done`); a timeout is only a crash fallback.
- **Per-peer liveness.** Stop *waiting on* a specific peer only if you are blocked on
  it AND its heartbeats have gone stale past the liveness timeout — one quiet peer
  never ends the whole coordination. Surface a truly-away peer to the user.

## Multiple peers (N>2)
Only reach for these when shared work-ownership actually needs them; n=2 stays just
heartbeat + two-clock + explicit close (no claims/gates vocabulary).
- **Coordinator Hub.** A lead (or the human) holds the roster and batches status,
  instead of every agent broadcasting to every other — O(N), not O(N²).
- **Claims-with-verify.** To take an item: post a claim, **re-read to confirm you
  won** (earliest server-timestamp wins; the lead serializes only ambiguous
  conflicts), then proceed. A claim is heartbeat-leased; if the owner goes stale,
  reclaim after **3× `next_hb` or 15m** (or `ETA + one missed heartbeat` if an ETA was
  advertised) by posting a `claim-reclaim-intent`, re-reading, then claiming.
- **Named gates.** Each decision has a named approver set. **Human gates require human
  approval; agent gates require ALL named approvers unless an explicit quorum is
  declared. Silence is never approval.** The human is the final authority on
  merge/destructive gates.

## Guardrails (always)
- **Gate code at commit/PR.** Autonomous edits are OK only if the user explicitly
  authorized implementation this session; otherwise stay in coordinate/plan mode.
  Never merge PRs, never push to `main`, never run destructive ops without the user's
  go. The human holds final authority on merge/destructive gates; silence is never
  approval. Surface anything out-of-scope or ambiguous to the user, don't act.
- **Durable, not chatty:** substantive content goes in observations, not messages;
  heartbeats stay one line.
- **One machine / localhost trust:** the server is local; no remote exposure added.
- Honor any standing project rules (e.g. spectra is deferred, no multi-tenant/Pass-2
  reintroduction) recorded on the relevant ledger entities.

## Notes
- Server: `mcp__neural-ai-collaboration__*` on localhost:6174 (Engram / shared-memory-mcp).
- This skill implements the agreed `[ACP-HB]` protocol; the canonical spec lives on
  the `agent-coordination-protocol` ledger entity (update the skill if that evolves).
- A peer only "hears" a message when it takes a turn (human prompt, its own poll
  loop, or a wake). A fresh heartbeat means reachable; stale past the liveness timeout
  means treat as away (crash fallback) and surface to the user — don't poll forever.
- Verify peer ids against the canonical roster; ephemeral `agent-<host>-<pid>-<ts>`
  ids are not durable collaborators.
