import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDataStewardStore } from './data-steward'

// Response-like mock that supports status codes, json(), clone() and blob().
function mockFetch(routes: Record<string, { status?: number; body?: any }>) {
  return vi.fn(async (url: string) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k))
    const r = key ? routes[key] : { status: 404, body: {} }
    const status = r.status ?? 200
    const body = r.body ?? {}
    const make = (): any => ({
      ok: status >= 200 && status < 300,
      status,
      statusText: 'mock',
      json: async () => body,
      blob: async () => ({ size: JSON.stringify(body).length }),
      clone: () => make(),
    })
    return make()
  })
}

describe('data-steward store (Phase 2a)', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('initialize loads prefixes/snapshots/locations/audit when enabled', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/data/entity-prefixes': { body: { prefixes: ['engram', 'spectra', ''] } },
      '/api/data/snapshots': { body: { snapshots: [{ snapshotId: 's1', filename: 'a.db', sizeBytes: 10, createdAt: 'x', label: 'm', location: 'data/backups' }] } },
      '/api/data/backup-locations': { body: { locations: [{ id: 'default', path: 'data/backups', label: 'Internal', writable: true, freeBytes: 1, totalBytes: 2 }] } },
      '/admin/audit-log': { body: [{ action: 'snapshot_create', at: 'x' }] },
    }))
    const store = useDataStewardStore()
    await store.initialize()
    expect(store.available).toBe(true)
    expect(store.prefixes).toEqual(['engram', 'spectra']) // empty filtered out
    expect(store.snapshots.length).toBe(1)
    expect(store.locations[0].label).toBe('Internal')
    expect(store.auditAvailable).toBe(true)
    expect(store.auditEntries.length).toBe(1)
  })

  it('sets available=false when the feature flag is off (403 DATA_MANAGEMENT_DISABLED)', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/data/entity-prefixes': { status: 403, body: { code: 'DATA_MANAGEMENT_DISABLED' } },
    }))
    const store = useDataStewardStore()
    await store.initialize()
    expect(store.available).toBe(false)
    expect(store.error).toBeNull() // disabled is a state, not an error
    expect(store.prefixes).toEqual([])
  })

  it('exportPreview returns entity/observation/relation counts', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/data/export': { body: { namePrefix: 'engram', entityNames: ['engram', 'engram-dashboard-redesign'], counts: { entities: 2, observations: 111, relations: 7 } } },
    }))
    const store = useDataStewardStore()
    await store.exportPreview({ namePrefix: 'engram' })
    expect(store.preview?.counts).toEqual({ entities: 2, observations: 111, relations: 7 })
    expect(store.preview?.entityNames).toContain('engram')
  })

  it('createSnapshot posts and refreshes the snapshot list', async () => {
    const fetchSpy = mockFetch({
      '/api/data/snapshots': { body: { snapshots: [{ snapshotId: 's9', filename: 'snap.db', sizeBytes: 999, createdAt: 'x', label: 'manual', location: 'data/backups' }] } },
    })
    vi.stubGlobal('fetch', fetchSpy)
    const store = useDataStewardStore()
    await store.createSnapshot('manual')
    // POST then GET (refresh) both hit /api/data/snapshots
    const methods = fetchSpy.mock.calls.map((c: any) => (c[1]?.method || 'GET'))
    expect(methods).toContain('POST')
    expect(store.snapshots.length).toBe(1)
    expect(store.snapshots[0].snapshotId).toBe('s9')
  })

  it('fetchAudit degrades gracefully when /admin/audit-log is unavailable', async () => {
    vi.stubGlobal('fetch', mockFetch({ '/admin/audit-log': { status: 404, body: {} } }))
    const store = useDataStewardStore()
    await store.fetchAudit()
    expect(store.auditAvailable).toBe(false)
    expect(store.auditEntries).toEqual([])
  })
})
