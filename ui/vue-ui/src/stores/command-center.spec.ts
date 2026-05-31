/**
 * Store parsing tests for the Engram dashboard canonical agent-status + real
 * DB size contract (collaboration Decision C with codex-desktop; requested in
 * PR #19 review obs 0bd18dd6). Covers:
 *  - stable agent-<host> with isEphemeral:false stays a real agent
 *  - isEphemeral:true is excluded from realAgents (hidden/de-emphasized)
 *  - canonicalAgentId / displayName are preferred over legacy fields
 *  - overview.actualDbBytes renders a non-estimated MB; null falls back to the
 *    "~MB" estimate
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCommandCenterStore } from './command-center'

function mockFetch(routes: Record<string, any>) {
  return vi.fn(async (url: string) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k))
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => (key ? routes[key] : {}),
    } as any
  })
}

describe('command-center store — canonical agent-status + DB size parsing', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  afterEach(() => { vi.restoreAllMocks() })

  it('keeps a stable agent-<host> (isEphemeral:false) as a real agent, hides isEphemeral:true', async () => {
    const now = new Date().toISOString()
    vi.stubGlobal('fetch', mockFetch({
      '/api/agent-status': {
        raw: false,
        totalCanonicalAgents: 3,
        agents: [
          { canonicalAgentId: 'codex-desktop', displayName: 'Codex Desktop', status: 'active', isEphemeral: false, lastSeen: now, eventsCount: 4, capabilities: [] },
          { canonicalAgentId: 'agent-ErikaDesktop', displayName: 'stdio-bridge-ErikaDesktop', status: 'active', isEphemeral: false, lastSeen: now, eventsCount: 1, capabilities: [] },
          { canonicalAgentId: 'agent-ErikaDesktop-12345-abc', displayName: 'stdio-bridge-ErikaDesktop', status: 'idle', isEphemeral: true, lastSeen: now, eventsCount: 0, capabilities: [] },
        ],
      },
    }))
    const store = useCommandCenterStore()
    await store.fetchAgents()

    const realIds = store.realAgents.map((a) => a.id)
    expect(realIds).toContain('codex-desktop')
    expect(realIds).toContain('agent-ErikaDesktop')        // stable agent-<host> is NOT filtered out
    expect(realIds).not.toContain('agent-ErikaDesktop-12345-abc') // ephemeral hidden via server flag
  })

  it('prefers canonicalAgentId / displayName over legacy fields', async () => {
    const now = new Date().toISOString()
    vi.stubGlobal('fetch', mockFetch({
      '/api/agent-status': {
        raw: false,
        agents: [
          { canonicalAgentId: 'gemini', displayName: 'Gemini CLI', agentId: 'gemini-legacy', name: 'old-name', status: 'idle', isEphemeral: false, lastSeen: now, eventsCount: 0, capabilities: [] },
        ],
      },
    }))
    const store = useCommandCenterStore()
    await store.fetchAgents()
    const a = store.agents[0]
    expect(a.id).toBe('gemini')                 // canonicalAgentId preferred over legacy agentId
    expect(a.displayName).toBe('Gemini CLI')    // displayName preferred over legacy name
  })

  it('uses overview.actualDbBytes for DB size (non-estimated MB)', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/analytics': {
        overview: { totalEvents: 10, activeAgents: 2, entityCount: 5, relationCount: 1, observationCount: 9,
          actualDbBytes: 286_855_168, dbSizeSource: 'pragma', dbSizeAt: new Date().toISOString() },
        agentPerformance: [],
      },
    }))
    const store = useCommandCenterStore()
    await store.fetchAnalytics()
    // 286855168 bytes ≈ 273.6 MB, and NOT prefixed with '~' (the estimate marker).
    expect(store.systemHealth.dbSize).toBe('273.6 MB')
    expect(store.systemHealth.dbSize.startsWith('~')).toBe(false)
  })

  it('falls back to the estimated ~MB when actualDbBytes is null', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/analytics': {
        overview: { totalEvents: 100, activeAgents: 2, entityCount: 50, relationCount: 5, observationCount: 200,
          actualDbBytes: null, dbSizeSource: null, dbSizeAt: null },
        agentPerformance: [],
      },
    }))
    const store = useCommandCenterStore()
    await store.fetchAnalytics()
    // No real size → estimate, which is prefixed with '~'.
    expect(store.systemHealth.dbSize.startsWith('~')).toBe(true)
    expect(store.systemHealth.dbSize).toMatch(/MB$/)
  })
})
