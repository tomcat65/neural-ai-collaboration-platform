# BV-S0: Build Verification Gate

## Type: Pre-Phase Gate
## Risk: Low
## Phase: P0
## Team: All

## Description
Verify the Vue UI project builds and type-checks cleanly before any brain-viz work begins. Catches pre-existing issues early. Mandatory gate from claude-desktop + codex.

## Acceptance Criteria
- [ ] `cd ui/vue-ui && npm ci` succeeds
- [ ] `cd ui/vue-ui && npm run build` succeeds with zero errors
- [ ] `cd ui/vue-ui && npm run type-check` succeeds with zero errors
- [ ] If any fail, fix pre-existing issues before proceeding

## Files
- reads: `ui/vue-ui/package.json`, `ui/vue-ui/tsconfig.json`

## Wiring Proof
```bash
cd ui/vue-ui && npm ci && npm run build && npm run type-check
```

## Status: **PENDING**
