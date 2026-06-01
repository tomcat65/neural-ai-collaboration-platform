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
- `fetchProjects` collects project-typed nodes into `rawProjects`; `availableProjects`
  (computed) filters fixtures by name. Over **D**: `rawProjects = [engram, spectra,
  houston blenders]` (E3 is `project-smoke-test`, not project-typed, so it is never a
  project node; E5/E6 are not project-typed either). `availableProjects` (showTestData
  off) = `[engram, spectra, houston blenders]` — E4 "houston blenders" **appears** (the
  §3 boundary leak: plain type, no stamp; add to `NOISE_NAME_SUBSTRINGS` to hide). A
  *stamped* project-typed fixture is hidden when off and revealed when on — exercised by
  the blocker-1 test. (This resolves the earlier §4 contradiction: E4 both passes the
  project filter **and** is listed; it is no longer omitted.)

### Message dataset **M** (6 messages)

| id | from → to | type | content (drives `isMessageAboutProject`) | state |
|---|---|---|---|---|
| m1 | codex-desktop → tomas | info | `"engram review ready"` | unread |
| m2 | tomas → claude-engram | info | `"proceed"` | unread |
| m3 | claude-engram → codex-desktop | query | `"engram spec ok?"` | unread |
| m4 | codex-desktop → claude-engram | response | `"lgtm"` | **read** |
| m5 | agent-x → agent-y | urgent | `"spectra build failing"` | unread |
| m6 | codex-desktop → tomas | info | `"old note"` | **archived** |

Expected selector outputs over **M** (+ **D**):

| selector | expected |
|---|---|
| `needsYou` | `[m1, m5]` (count **2**), newest-first — m1 is to you, m5 is urgent; m3 (query to another agent) does NOT flag (§5) |
| `messageThreads` | **4** threads: `codex-desktop↔tomas`(1, needsYou), `claude-engram↔tomas`(1), `claude-engram↔codex-desktop`(2, unread 1, **not** needsYou — m3 is a query to an agent), `agent-x↔agent-y`(1, needsYou). m6 excluded (archived) |
| `projectDigests` | **2**: `engram`(msgs 2 = m1,m3; unread 2; knowledgeChanges 1=E1) before `spectra`(msgs 1 = m5; unread 1; knowledgeChanges 1=E2) |
| `pulse.needsYou` | 2 |
| `pulse.threads` | 4 |
| `pulse.projects` | 3 (= `availableProjects.length`; includes the houston-blenders leak) |
| `pulse.knowledgeChanges` | 3 (= `cleanKnowledge.length` over D) |

---

## 5. Needs-You classifier (addresses pt3 + codex §5: deterministic + FP/FN)

**Config — genuinely configurable, never guessed from content:**
- `HUMAN_ALIASES` — default `{tomas, tommy, tomcat65}`; overridden at load by the
  `VITE_HUMAN_ALIASES` env var (comma/space-separated, lowercased via
  `parseHumanAliases`) and at runtime by the store's `setHumanAliases(ids)` action.
- `NEEDS_YOU_ANYWHERE = {urgent}` — message types that flag you regardless of recipient.

**Rule** `messageNeedsYou(m, humanAliases)`:
`!isRead && !isArchived && ( toAgent∈humanAliases  OR  messageType∈NEEDS_YOU_ANYWHERE )`

**Semantics (Tomás's call on codex §5 — "you, or any urgent"):** anything **addressed
to you** flags (any type); **urgent** flags from anywhere (rare, high-signal); a
**query/question between two other agents is their conversation, not your work** and
does NOT flag. `messageNeedsYou` takes `humanAliases` as a parameter, so it stays a
pure, unit-testable function.

**Truth table (encoded as tests):**

| case | to | type | state | result | rationale |
|---|---|---|---|---|---|
| TP1 | tomas | info | unread | **YES** | addressed to you (any type) |
| TP2 | tomas | query | unread | **YES** | query addressed to you |
| TP3 | agent-y | urgent | unread | **YES** | urgent — any recipient |
| TN1 | tomas | info | **read** | NO | already handled |
| TN2 | claude-engram | info | unread | NO | agent↔agent chatter |
| TN3 | codex-desktop | query | unread | NO | **§5: query to another agent ≠ your work** |
| TN4 | tomas | query | **archived** | NO | archived |
| TN5 | agent (from=tomas) | info | unread | NO | your *outgoing*, not addressed TO you |

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

- [ ] codex-desktop — re-review the reconciled **spec + hardened code** (code blockers
  1–3 AND spec blockers S1–S4 closed, see below)
- [x] Tomás — (1) make `HUMAN_ALIASES` genuinely configurable (env `VITE_HUMAN_ALIASES`
  + `setHumanAliases()`), default `{tomas, tommy, tomcat65}`; (2) Needs-You = "you, or any
  urgent" (codex §5); GO for the hardening pass.

**Hardening implemented in this PR** (closes codex reviews `bf4b90a1` + `017cb653`):
- **blocker 1** — `showTestData` now reaches the project list: `fetchProjects` retains
  `rawProjects` (incl. fixtures) and `availableProjects` is a computed that filters.
- **blocker 2** — the knowledge raw set is retained in full; the visible cutoff (50) is
  applied in `cleanKnowledge` *after* fixture filtering (no premature 200-row cap).
- **blocker 3** — `HUMAN_ALIASES` is genuinely configurable (env + `setHumanAliases()`),
  with `parseHumanAliases`, an FP/FN truth-table test, and a runtime-retarget test.
- `projectDigests` labeled best-effort/heuristic in code (§6); ACTION/STATUS/CONTEXT
  named out-of-scope (§8); §7 server follow-ups stand.

**Spec reconciliation** (closes codex spec review `ef49d7c9`): S1 §4 E4 contradiction
fixed (E4 now appears **and** is listed, no longer omitted); S2 §5 Needs-You semantics
set to "you, or any urgent" in code + spec; S3 Dataset M now carries exact content
strings; S4 `HUMAN_ALIASES` contract stated (env + setter + parse).

Tests: 17/17 green; vue-tsc + vite build clean.
**Phase 1 UI does not start until PR #30 merges.**
