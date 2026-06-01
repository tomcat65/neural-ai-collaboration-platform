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
import { useCommandCenterStore, isFixtureEntity, parseHumanAliases, messageNeedsYou } from './command-center'
import type { Message } from '../types/command-center'

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

  it('derives read/unread/archived state + unread total from /api/recent-events', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/recent-events': {
        messages: [
          { id: 'u1', from_agent: 'codex-desktop', to_agent: 'claude-engram', content: 'unread', message_type: 'info', created_at: '2026-05-31 10:00:00', read_at: null, archived_at: null },
          { id: 'r1', from_agent: 'codex-desktop', to_agent: 'claude-engram', content: 'read', message_type: 'info', created_at: '2026-05-31 10:01:00', read_at: '2026-05-31 10:05:00', archived_at: null },
          { id: 'a1', from_agent: 'codex-desktop', to_agent: 'claude-engram', content: 'archived', message_type: 'info', created_at: '2026-05-31 10:02:00', read_at: null, archived_at: '2026-05-31 10:06:00' },
        ],
        unreadByAgent: { 'claude-engram': 5 },
      },
    }))
    const store = useCommandCenterStore()
    await store.fetchMessages()

    const byId = Object.fromEntries(store.messages.map((m) => [m.id, m]))
    expect(byId['u1'].isRead).toBe(false)
    expect(byId['u1'].isArchived).toBe(false)
    expect(byId['r1'].isRead).toBe(true)
    expect(byId['r1'].readAt).toBeInstanceOf(Date)
    expect(byId['a1'].isArchived).toBe(true)

    // Server-provided unread total (accurate past the returned page).
    expect(store.totalUnread).toBe(5)
  })

  it('readState filter: all hides archived, unread shows only unread, archived only archived', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/recent-events': {
        messages: [
          { id: 'u1', from_agent: 'a', to_agent: 'b', content: 'unread', message_type: 'info', created_at: '2026-05-31 10:00:00', read_at: null, archived_at: null },
          { id: 'r1', from_agent: 'a', to_agent: 'b', content: 'read', message_type: 'info', created_at: '2026-05-31 10:01:00', read_at: '2026-05-31 10:05:00', archived_at: null },
          { id: 'a1', from_agent: 'a', to_agent: 'b', content: 'archived', message_type: 'info', created_at: '2026-05-31 10:02:00', read_at: null, archived_at: '2026-05-31 10:06:00' },
        ],
      },
    }))
    const store = useCommandCenterStore()
    await store.fetchMessages()

    // default 'all' hides archived
    expect(store.filteredMessages.map((m) => m.id).sort()).toEqual(['r1', 'u1'])

    store.setFilter({ readState: 'unread' })
    expect(store.filteredMessages.map((m) => m.id)).toEqual(['u1'])

    store.setFilter({ readState: 'archived' })
    expect(store.filteredMessages.map((m) => m.id)).toEqual(['a1'])
  })

  it('unreadInbox groups unread messages by recipient with server counts', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/recent-events': {
        messages: [
          { id: 'm1', from_agent: 'a', to_agent: 'claude-engram', content: 'x', message_type: 'info', created_at: '2026-05-31 10:00:00', read_at: null, archived_at: null },
          { id: 'm2', from_agent: 'b', to_agent: 'claude-engram', content: 'y', message_type: 'info', created_at: '2026-05-31 10:01:00', read_at: null, archived_at: null },
          { id: 'm3', from_agent: 'a', to_agent: 'codex-desktop', content: 'z', message_type: 'info', created_at: '2026-05-31 10:02:00', read_at: null, archived_at: null },
          { id: 'm4', from_agent: 'a', to_agent: 'claude-engram', content: 'read', message_type: 'info', created_at: '2026-05-31 10:03:00', read_at: '2026-05-31 10:05:00', archived_at: null },
        ],
        unreadByAgent: { 'claude-engram': 2, 'codex-desktop': 1 },
      },
    }))
    const store = useCommandCenterStore()
    await store.fetchMessages()

    const ce = store.unreadInbox.find((g) => g.agent === 'claude-engram')
    const cd = store.unreadInbox.find((g) => g.agent === 'codex-desktop')
    expect(ce?.count).toBe(2)
    expect(ce?.previews.map((m) => m.id).sort()).toEqual(['m1', 'm2']) // m4 excluded (already read)
    expect(cd?.count).toBe(1)
    expect(cd?.previews.map((m) => m.id)).toEqual(['m3'])
  })

  it('markRead POSTs mark_messages_read to /api/tools with the message ids', async () => {
    const fetchSpy = mockFetch({
      '/api/recent-events': { messages: [], unreadByAgent: {} },
      '/api/tools/mark_messages_read': { status: 'ok' },
    })
    vi.stubGlobal('fetch', fetchSpy)
    const store = useCommandCenterStore()
    await store.markRead('claude-engram', ['u1', 'u2'])

    const call: any = fetchSpy.mock.calls.find((c: any[]) => String(c[0]).includes('/api/tools/mark_messages_read'))
    expect(call).toBeTruthy()
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({ agentId: 'claude-engram', messageIds: ['u1', 'u2'] })
  })

  it('archive POSTs archive_messages to /api/tools with the message ids', async () => {
    const fetchSpy = mockFetch({
      '/api/recent-events': { messages: [], unreadByAgent: {} },
      '/api/tools/archive_messages': { status: 'ok' },
    })
    vi.stubGlobal('fetch', fetchSpy)
    const store = useCommandCenterStore()
    await store.archive('claude-engram', ['a1'])

    const call: any = fetchSpy.mock.calls.find((c: any[]) => String(c[0]).includes('/api/tools/archive_messages'))
    expect(call).toBeTruthy()
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({ agentId: 'claude-engram', messageIds: ['a1'] })
  })

  // ── Redesign Phase 0 ─────────────────────────────────────────
  it('Phase 0: isFixtureEntity flags test fixtures, keeps real entities', () => {
    expect(isFixtureEntity('Houston Blenders Voice Launch 1777490848475', 'project')).toBe(true) // stamped name
    expect(isFixtureEntity('Houston Blenders Voice Timestamp 20260429194025-32716', 'project')).toBe(true)
    expect(isFixtureEntity('hb', 'project-smoke-test')).toBe(true) // fixture type
    expect(isFixtureEntity('_contract_test_x', 'project')).toBe(true) // prefix
    expect(isFixtureEntity('engram', 'project')).toBe(false)
    expect(isFixtureEntity('houston-blenders', 'project')).toBe(false) // real project (no stamp)
  })

  it('Phase 0: cleanKnowledge hides fixtures unless showTestData', () => {
    const store = useCommandCenterStore()
    store.knowledge.push(
      { entityName: 'engram', entityType: 'project', observationCount: 5, latestObservation: 'x', updatedAt: new Date(), isNew: false },
      { entityName: 'Houston Blenders Voice Launch 1777490848475', entityType: 'project', observationCount: 1, latestObservation: 'y', updatedAt: new Date(), isNew: false },
    )
    expect(store.cleanKnowledge.map((k) => k.entityName)).toEqual(['engram'])
    store.setShowTestData(true)
    expect(store.cleanKnowledge.length).toBe(2)
  })

  it('Phase 0: digest selectors group threads, flag needs-you, compute pulse', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/recent-events': {
        messages: [
          { id: 't1', from_agent: 'codex-desktop', to_agent: 'claude-engram', content: 'hi', message_type: 'info', created_at: '2026-05-31 10:00:00', read_at: null, archived_at: null },
          { id: 't2', from_agent: 'claude-engram', to_agent: 'codex-desktop', content: 'reply', message_type: 'info', created_at: '2026-05-31 10:01:00', read_at: '2026-05-31 10:02:00', archived_at: null },
          { id: 'q1', from_agent: 'codex-desktop', to_agent: 'tomas', content: 'decision needed?', message_type: 'query', created_at: '2026-05-31 10:03:00', read_at: null, archived_at: null },
        ],
        unreadByAgent: { 'claude-engram': 1, tomas: 1 },
      },
    }))
    const store = useCommandCenterStore()
    await store.fetchMessages()

    // t1 + t2 collapse into one agent-pair thread; q1 is its own.
    expect(store.messageThreads.length).toBe(2)
    const cc = store.messageThreads.find((t) => t.key.includes('claude-engram') && t.key.includes('codex-desktop'))
    expect(cc?.count).toBe(2)
    expect(cc?.unreadCount).toBe(1) // t1 unread, t2 read

    // needs-you: q1 is unread, to a human alias (tomas) AND a query.
    expect(store.needsYou.map((m) => m.id)).toEqual(['q1'])

    // pulse headline counts
    expect(store.pulse.threads).toBe(2)
    expect(store.pulse.needsYou).toBe(1)
    expect(store.pulse.unread).toBe(2) // totalUnread = sum(unreadByAgent)
  })

  it('Phase 0 (blocker 3): parseHumanAliases parses env list, lowercases, falls back', () => {
    expect([...parseHumanAliases('Tomas, Tommy')].sort()).toEqual(['tomas', 'tommy'])
    expect([...parseHumanAliases('alice bob')].sort()).toEqual(['alice', 'bob']) // space-separated
    expect([...parseHumanAliases('')].sort()).toEqual(['tomas', 'tomcat65', 'tommy']) // empty → default
    expect([...parseHumanAliases(undefined)].sort()).toEqual(['tomas', 'tomcat65', 'tommy'])
  })

  it('Phase 0 (blocker 3 + §5): messageNeedsYou FP/FN truth table — you, or any urgent', () => {
    const aliases = new Set(['tomas'])
    const base: Message = {
      id: 'm', fromAgent: 'a', toAgent: 'x', content: '', messageType: 'info',
      createdAt: new Date(), isExpanded: false, isRead: false, isArchived: false, readAt: null,
    }
    const mk = (o: Partial<Message>): Message => ({ ...base, ...o })
    // True-positives
    expect(messageNeedsYou(mk({ toAgent: 'tomas' }), aliases)).toBe(true)                                  // TP1 addressed to you (any type)
    expect(messageNeedsYou(mk({ toAgent: 'tomas', messageType: 'query' }), aliases)).toBe(true)            // TP2 query addressed to you
    expect(messageNeedsYou(mk({ toAgent: 'agent-y', messageType: 'urgent' }), aliases)).toBe(true)          // TP3 urgent (any recipient)
    // True-negatives (guard against false-positives)
    expect(messageNeedsYou(mk({ toAgent: 'tomas', isRead: true }), aliases)).toBe(false)                    // TN1 already read
    expect(messageNeedsYou(mk({ toAgent: 'claude-engram' }), aliases)).toBe(false)                          // TN2 agent↔agent chatter
    expect(messageNeedsYou(mk({ toAgent: 'codex-desktop', messageType: 'query' }), aliases)).toBe(false)    // TN3 §5: query to ANOTHER agent is not your work
    expect(messageNeedsYou(mk({ toAgent: 'tomas', messageType: 'query', isArchived: true }), aliases)).toBe(false) // TN4 archived
    expect(messageNeedsYou(mk({ fromAgent: 'tomas', toAgent: 'agent' }), aliases)).toBe(false)              // TN5 your outgoing
  })

  it('Phase 0 (blocker 3): setHumanAliases re-targets needsYou at runtime', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/recent-events': {
        messages: [
          { id: 'a1', from_agent: 'codex-desktop', to_agent: 'alice', content: 'ping', message_type: 'info', created_at: '2026-05-31 10:00:00', read_at: null, archived_at: null },
        ],
        unreadByAgent: { alice: 1 },
      },
    }))
    const store = useCommandCenterStore()
    await store.fetchMessages()
    expect(store.needsYou.length).toBe(0) // 'alice' is not a human alias, type info
    store.setHumanAliases(['alice'])
    expect(store.needsYou.map((m) => m.id)).toEqual(['a1']) // now alice means "you"
  })

  it('Phase 0 (blocker 1): showTestData reveals fixture PROJECTS, not just knowledge', () => {
    const store = useCommandCenterStore()
    store.rawProjects.push(
      { name: 'engram', observationCount: 10 },
      { name: 'Houston Blenders Voice Launch 1777490848475', observationCount: 1 }, // stamped fixture
    )
    expect(store.availableProjects.map((p) => p.name)).toEqual(['engram'])
    store.setShowTestData(true)
    expect(store.availableProjects.length).toBe(2)
  })

  it('Phase 0 (blocker 2): fetchKnowledge keeps real entities beyond the old 200-row cap (filter precedes cutoff)', async () => {
    const nodes: any[] = []
    for (let i = 0; i < 201; i++) {
      // fixtures with 13+ digit stamps, NEWEST — these filled the old slice(0,200).
      nodes.push({ name: `fixture-${1700000000000 + i}`, entityType: 'memory', observationCount: 1, id: `f${i}`, createdAt: '2026-05-31 12:00:00' })
    }
    // real entities, OLDEST → sorted past index 200, dropped under the old cap.
    nodes.push({ name: 'engram', entityType: 'project', observationCount: 9, id: 'r1', createdAt: '2026-05-30 12:00:00' })
    nodes.push({ name: 'spectra', entityType: 'spectra-project', observationCount: 8, id: 'r2', createdAt: '2026-05-30 11:00:00' })
    vi.stubGlobal('fetch', mockFetch({
      '/api/graph-export': { nodes, links: [], observations: [], nextCursor: null, totals: { nodes: nodes.length, links: 0, observations: 0 }, generatedAt: '2026-05-31 12:00:00' },
    }))
    const store = useCommandCenterStore()
    await store.fetchKnowledge()
    const names = store.cleanKnowledge.map((k) => k.entityName)
    expect(names).toContain('engram')  // survives: filtering now precedes the 50-row cutoff
    expect(names).toContain('spectra')
    expect(names.every((n) => !n.startsWith('fixture-'))).toBe(true) // fixtures hidden
  })
})
