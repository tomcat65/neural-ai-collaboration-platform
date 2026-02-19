# NE-P1-S6: Token Budget Ceiling Upgrade

## Type: Enhancement
## Risk: medium
## Phase: P1f
## Codex Findings Addressed: #8 (truncation already exists — reframe as upgrade)

## Description
Upgrade the existing token estimation/truncation in get_agent_context and begin_session to enforce a hard ceiling with priority-based smart truncation. The current implementation estimates tokens and caps warm-tier observations, but does NOT enforce an overall budget or truncate when the total exceeds a threshold. This story adds that enforcement layer.

## Current Behavior (what exists)
- get_agent_context returns tokenEstimate in meta
- Warm-tier observations capped at 5 most recent
- No overall budget enforcement — total context can still exceed any target
- No truncation metadata returned to caller

## Target Behavior (upgrade)
- Accept optional `maxTokens` parameter (default: 4000)
- Estimate tokens for each context section (identity, project, messages, guardrails)
- If total exceeds budget, truncate in priority order:
  1. Keep identity (always, ~100 tokens)
  2. Keep handoff (always, ~200 tokens)
  3. Keep guardrails (always, ~100 tokens)
  4. Trim recent observations (oldest first)
  5. Trim unread messages hint (keep count only)
  6. Trim project summary (truncate to fit)
- Return `meta.truncated: true` and `meta.sectionsDropped: [...]` when truncation occurs
- tokenEstimate in response reflects actual returned size (not pre-truncation)

## Acceptance Criteria
- [ ] maxTokens parameter accepted by get_agent_context and begin_session
- [ ] Existing observation cap preserved as baseline (upgraded, not replaced)
- [ ] Truncation follows priority order when total exceeds maxTokens
- [ ] meta.truncated flag set when ceiling hit
- [ ] meta.sectionsDropped lists what was trimmed
- [ ] Default 4000 token ceiling works for typical sessions
- [ ] Contract test: large context gets truncated correctly
- [ ] Existing tests still pass (they should be under 4k already)

## Files
- touches: src/unified-neural-mcp-server.ts, src/unified-server/memory/index.ts
- touches: tests/ (new + existing contract tests)
