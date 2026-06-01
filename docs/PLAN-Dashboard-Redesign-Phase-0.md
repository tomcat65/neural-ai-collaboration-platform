# PLAN — Dashboard Redesign, Phase 0

**Store-level noise filter + deterministic digest/selector model**

Status: **SPEC FOR SIGN-OFF** (no further code until codex + Tomás approve).
Scope of code: PR #30, branch `engram/dashboard-redesign-phase0`.
Written in response to codex pushback `b485cc4f` (2026-06-01), which (correctly)
withdrew a too-complacent concurrence and demanded acceptance criteria, data
contracts, failure modes, and a narrower Phase 0 before implementation.

This document is the contract. Where PR #30 as-shipped diverges from it, the
divergence is called out and becomes the hardening work to do **after** sign-off.

---

## 1. Scope & contract (addresses pushback pt1: "bold redesign too broad")

**IN scope — Phase 0 is store-level only:**
- Pure selectors + a `showTestData` toggle in
  `ui/vue-ui/src/stores/command-center.ts` and matching types in
  `ui/vue-ui/src/types/command-center.ts`.
- Unit/selector tests in `command-center.spec.ts`.

**OUT of scope — explicitly NOT in Phase 0:**
- No layout rewrite, no new views/components, no visual polish.
- No LLM / AI-generated summaries (all summaries are deterministic string ops).
- No server changes.
- Phase 1 (a later PR) is the UI that *consumes* these selectors.

**Determinism rule:** every selector is a pure function of already-fetched store
state (`messages`, `knowledge`, `availableProjects`, `activeAgents`). No network,
no randomness, no wall-clock branching (ordering by `createdAt` only).

---

## 2. Data contracts (addresses pt4/pt5: what the data actually carries)

| Shape | Key fields | Source |
|---|---|---|
| `Message` | `id, fromAgent, toAgent, content, messageType, createdAt, isRead, isArchived, readAt` | `/api/recent-events` (`read_at`/`archived_at` → `isRead`/`isArchived`) |
| `KnowledgeChange` | `entityName, entityType, observationCount, latestObservation, updatedAt, isNew` | `/api/graph-export` (nodes + observations) |
| `ProjectInfo` | `name, observationCount` | graph-export nodes with `entityType ∈ {project, spectra-project}` |

**KNOWN CONTRACT GAPS (the honest part):**
- **No canonical `projectId`** on messages or entities. Project association is
  therefore a *heuristic* (see §6), never canonical.
- **No entity metadata** (`purpose` / `verifier`) and **no source-agent** field on
  `/api/graph-export` nodes. So metadata/source-based fixture detection (pt5) is
  **not possible from the current server contract** — see §7 follow-ups.
- **No message `priority`** on `/api/recent-events`. So the ACP
  `priority`/`expected_reply` envelope cannot inform Needs-You (pt3) yet — §7.

---

## 3. Fixture / noise taxonomy (addresses pt5)

`isFixtureEntity(name, entityType = '')` → an entity is a fixture (hidden unless
`showTestData`) **iff ANY** of:

| # | Dimension | Rule |
|---|---|---|
| a | empty | `name` is empty/falsy |
| b | name-prefix | lowercased `name` startsWith `_session_test_`, `_contract_test_`, `_security_test_`, `_tenant_iso_` |
| c | generated-stamp | `name` matches `/\d{13,}/` (13+ consecutive digits — epoch-ms / long handles) |
| d | entity-type | `entityType` matches `/smoke\|fixture\|[-_]test$/i` (e.g. `project-smoke-test`, `*_test`, `*-fixture`) |
| e | manual substrings | lowercased `name` includes any `NOISE_NAME_SUBSTRINGS` entry (currently `[]`, editable config) |

**Dimensions covered:** name-prefix, generated-stamp, entity-type, manual list.
**Dimensions NOT covered (server gap → §7):** `metadata.purpose/verifier`, source agent.

**Honest boundary:** an entity whose `name` has **no** 13+ digit stamp and whose
`entityType` is exactly `"project"` (e.g. a bare `"houston blenders"`) is **NOT**
auto-detected by a–d. The Houston-Blenders fixtures *currently in prod* ARE caught
because they carry 13+ digit stamps and/or `project-smoke-test` types. Any
unstamped, plainly-typed fixture must be handled by adding it to
`NOISE_NAME_SUBSTRINGS`, or by the source-tagged server filter in §7.

---

## 4. Acceptance criteria (addresses pt2: exact hidden/shown + counts)

Encoded as a fixed dataset in `command-center.spec.ts`.

### Knowledge dataset **D**

| id | name | entityType | verdict | why |
|---|---|---|---|---|
| E1 | `engram` | `project` | **REAL — shown** | no fixture signal |
| E2 | `spectra` | `spectra-project` | **REAL — shown** | no fixture signal |
| E3 | `houston-blenders-1717123456789` | `project-smoke-test` | **FIXTURE — hidden** | stamp (c) + smoke type (d) |
| E4 | `houston blenders` | `project` | **shown (documents the §3 boundary)** | no stamp, plain type — slips a–d |
| E5 | `_session_test_abc` | `memory` | **FIXTURE — hidden** | prefix (b) |
| E6 | `contract_test` | `contract-test` | **FIXTURE — hidden** | type `…-test$` (d) |

- `cleanKnowledge` with `showTestData=false` over **D** = `[E1, E2, E4]`
  (hides E3, E5, E6).
- `cleanKnowledge` with `showTestData=true` = all six (cap 50).
- `fetchProjects` over **D** → `availableProjects = [engram, spectra]` (+ E4 also
  passes the project filter until added to `NOISE_NAME_SUBSTRINGS` — documents the boundary).

### Message dataset **M** (6 messages)

| id | from → to | type | state |
|---|---|---|---|
| m1 | codex-desktop → tomas | info | unread |
| m2 | tomas → claude-engram | info | unread |
| m3 | claude-engram → codex-desktop | query | unread |
| m4 | codex-desktop → claude-engram | response | **read** |
| m5 | agent-x → agent-y | urgent | unread |
| m6 | codex-desktop → tomas | info | **archived** |

Expected selector outputs over **M** (+ **D**):

| selector | expected |
|---|---|
| `needsYou` | `[m1, m3, m5]` (count **3**), newest-first |
| `messageThreads` | **4** threads: `codex-desktop↔tomas`(1, needsYou), `claude-engram↔tomas`(1), `claude-engram↔codex-desktop`(2, unread 1, needsYou), `agent-x↔agent-y`(1, needsYou). m6 excluded (archived) |
| `projectDigests` | **2**: `engram`(msgs 2 = m1,m3; unread 2; knowledgeChanges 1=E1) before `spectra`(msgs 1 = m5; unread 1; knowledgeChanges 1=E2) |
| `pulse.needsYou` | 3 |
| `pulse.threads` | 4 |
| `pulse.projects` | 2 |
| `pulse.knowledgeChanges` | 3 (= `cleanKnowledge.length` over D) |

---

## 5. Needs-You classifier (addresses pt3: deterministic + FP/FN)

**Config (explicit, edit-to-match — NOT guessed from content):**
- `HUMAN_ALIASES = {tomas, tommy, tomcat65}`
- `NEEDS_YOU_TYPES = {query, question, urgent}`

**Rule** `messageNeedsYou(m)`:
`!isRead && !isArchived && ( toAgent∈HUMAN_ALIASES  OR  messageType∈NEEDS_YOU_TYPES )`

**Truth table (encoded as tests):**

| case | to | type | state | result | guards |
|---|---|---|---|---|---|
| TP1 | tomas | info | unread | **YES** | human-addressed |
| TP2 | codex-desktop | query | unread | **YES** | explicit query |
| TP3 | agent-y | urgent | unread | **YES** | urgent |
| TN1 | tomas | info | **read** | NO | false-positive on already-handled |
| TN2 | claude-engram | info | unread | NO | false-positive on agent↔agent chatter |
| TN3 | tomas | query | **archived** | NO | archived |
| TN4 | agent (from=tomas) | info | unread | NO | human's *outgoing*, not addressed TO a human |

**Limitation:** priority / `expected_reply` from the ACP envelope are unavailable
(server gap, §7) and therefore unused.

---

## 6. Project association is a HEURISTIC (addresses pt4)

`isMessageAboutProject(m, proj)` returns true iff ANY:
- `fromAgent` or `toAgent` includes `proj` (e.g. `spectra-builder-agent`), OR
- `proj` appears in the first 200 chars of `content` (headline), OR
- `proj` appears **≥ 2 times** in `content`.

This **over- and under-matches** by construction. Therefore:
- In Phase 1 UI it MUST be labeled **best-effort**, never presented as canonical.
- `projectDigests.knowledgeChanges` uses a looser `entityName.includes(proj)` than
  the relation-aware `filteredKnowledge`; acceptable for a count, noted here.
- The real fix is a server-emitted `projectId` (§7).

---

## 7. Failure modes & server follow-ups

| Concern | Phase-0 behavior | Proper fix (follow-up issue) |
|---|---|---|
| No `projectId` | heuristic §6, labeled best-effort | server emits `projectId` on messages + entities |
| No entity metadata/source | fixture taxonomy limited to name/type §3 | graph-export exposes `metadata.purpose/verifier` + source agent |
| No message priority | Needs-You ignores priority §5 | recent-events exposes `priority` |
| Zero messages | `pulse` all-zero, no throw | — |
| Zero projects | `projectDigests = []` | — |

---

## 8. ACTION / STATUS / CONTEXT taxonomy (addresses pt6) — deferred to Phase 1

Card taxonomy is a **Phase-1 (UI)** concern, not Phase 0. Gate to carry forward:
**any card that cannot be classified `ACTION | STATUS | CONTEXT` does not ship in
the default overview** — it falls back to the raw stream. Not implemented here.

---

## 9. Test plan

- **Unit:** `isFixtureEntity` (rules a–e + E1–E6), `messageNeedsYou` (TP1–3, TN1–4).
- **Selector:** `cleanKnowledge` toggle (D), `messageThreads` grouping,
  `needsYou` ordering, `projectDigests` counts/filter/sort, `pulse` aggregation (M+D).
- All pure & synchronous (no network).
- Gate: `npm run type-check && npm run test:run && npm run build` in `ui/vue-ui`.

---

## 10. Sign-off

- [ ] codex-desktop — taxonomy, acceptance criteria, FP/FN cases, heuristic honesty
- [ ] Tomás — `HUMAN_ALIASES` set + go for the hardening pass on PR #30

Once both are checked: harden PR #30 to match §3–§5 (add the D/M acceptance tests,
the FP/FN cases, the best-effort relabeling for §6), file the §7 follow-ups, then
codex reviews the final code. **Phase 1 UI does not start until PR #30 merges.**
