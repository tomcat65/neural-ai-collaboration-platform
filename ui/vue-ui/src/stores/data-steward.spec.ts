import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDataStewardStore, DataMgmtDisabled } from './data-steward'

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

// Method-aware mock: keys are "METHOD /url/fragment". Needed because restore
// (POST /api/data/trash/:id/restore) and the list (GET /api/data/trash) share a URL
// prefix — only the method disambiguates them.
function mockFetchMethod(routes: Record<string, { status?: number; body?: any }>) {
  return vi.fn(async (url: string, init?: any) => {
    const method = (init?.method || 'GET').toUpperCase()
    const key = Object.keys(routes).find((k) => {
      const sp = k.indexOf(' ')
      return k.slice(0, sp) === method && String(url).includes(k.slice(sp + 1))
    })
    const r = key ? routes[key] : { status: 404, body: { error: 'no route' } }
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

describe('data-steward store (Phase 2b — destructive trash lifecycle)', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('retire soft-deletes via DELETE /api/data/retire (entityNames + reason) and refreshes trash + prefixes', async () => {
    const fetchSpy = mockFetchMethod({
      'DELETE /api/data/retire': { body: { trashId: 't-1', counts: { entities: 1, observations: 3, relations: 0 }, deleted: 4 } },
      'GET /api/data/trash': { body: { trash: [{ trashId: 't-1', retiredAt: '2026-06-01T20:00:00Z', reason: 'cleanup', entityNames: ['Old-Thing'], counts: { entities: 1, observations: 3, relations: 0 }, restoredAt: null }] } },
      'GET /api/data/entity-prefixes': { body: { prefixes: ['engram'] } },
    })
    vi.stubGlobal('fetch', fetchSpy)
    const store = useDataStewardStore()
    store.preview = { namePrefix: 'Old', entityNames: ['Old-Thing'], counts: { entities: 1, observations: 3, relations: 0 } }

    const res = await store.retire(['Old-Thing'], 'cleanup')

    expect(res.trashId).toBe('t-1')
    expect(res.deleted).toBe(4)
    // the DELETE carried a JSON body with the explicit names + reason
    const del = fetchSpy.mock.calls.find((c: any) => c[1]?.method === 'DELETE')!
    expect(JSON.parse(del[1].body)).toEqual({ entityNames: ['Old-Thing'], reason: 'cleanup' })
    // refreshed views; stale preview cleared; busy released
    expect(store.trash.length).toBe(1)
    expect(store.trash[0].trashId).toBe('t-1')
    expect(store.preview).toBeNull()
    expect(store.busy).toBeNull()
  })

  it('retire surfaces the server error message on a 404 no-match (nothing thrown silently)', async () => {
    vi.stubGlobal('fetch', mockFetchMethod({
      'DELETE /api/data/retire': { status: 404, body: { error: 'No matching entities to retire' } },
    }))
    const store = useDataStewardStore()
    await expect(store.retire(['Ghost'])).rejects.toThrow(/No matching entities/)
    expect(store.error).toMatch(/No matching entities/)
    expect(store.busy).toBeNull()
  })

  it('fetchTrash loads the durable trash list (metadata only)', async () => {
    vi.stubGlobal('fetch', mockFetchMethod({
      'GET /api/data/trash': { body: { trash: [{ trashId: 'a', retiredAt: 'x', reason: null, entityNames: ['E'], counts: { entities: 1, observations: 0, relations: 0 }, restoredAt: null }] } },
    }))
    const store = useDataStewardStore()
    await store.fetchTrash()
    expect(store.trash.length).toBe(1)
    expect(store.trash[0].trashId).toBe('a')
  })

  it('restoreTrash POSTs to /restore and refreshes trash + prefixes', async () => {
    const fetchSpy = mockFetchMethod({
      'POST /api/data/trash': { body: { trashId: 't-1', restored: { entities: 1 } } },
      'GET /api/data/trash': { body: { trash: [] } },
      'GET /api/data/entity-prefixes': { body: { prefixes: ['engram', 'Recovered'] } },
    })
    vi.stubGlobal('fetch', fetchSpy)
    const store = useDataStewardStore()
    await store.restoreTrash('t-1')
    const post = fetchSpy.mock.calls.find((c: any) => c[1]?.method === 'POST')!
    expect(String(post[0])).toContain('/api/data/trash/t-1/restore')
    expect(store.trash).toEqual([])
    expect(store.prefixes).toContain('Recovered')
    expect(store.busy).toBeNull()
  })

  it('purgeTrash DELETEs the entry by id and refreshes the trash list', async () => {
    const fetchSpy = mockFetchMethod({
      'DELETE /api/data/trash': { body: { trashId: 't-9', purged: 1 } },
      'GET /api/data/trash': { body: { trash: [] } },
    })
    vi.stubGlobal('fetch', fetchSpy)
    const store = useDataStewardStore()
    await store.purgeTrash('t-9')
    const del = fetchSpy.mock.calls.find((c: any) => c[1]?.method === 'DELETE')!
    expect(String(del[0])).toContain('/api/data/trash/t-9')
    expect(store.trash).toEqual([])
  })

  it('purgeTrash surfaces a 404 (unknown trashId) as an error', async () => {
    vi.stubGlobal('fetch', mockFetchMethod({
      'DELETE /api/data/trash': { status: 404, body: { error: 'Trash entry not found: x' } },
    }))
    const store = useDataStewardStore()
    await expect(store.purgeTrash('x')).rejects.toThrow(/not found/)
    expect(store.error).toMatch(/not found/)
  })

  it('a destructive call when the feature flag is off throws DataMgmtDisabled and flips available=false', async () => {
    vi.stubGlobal('fetch', mockFetchMethod({
      'DELETE /api/data/retire': { status: 403, body: { code: 'DATA_MANAGEMENT_DISABLED' } },
    }))
    const store = useDataStewardStore()
    await expect(store.retire(['X'])).rejects.toBeInstanceOf(DataMgmtDisabled)
    expect(store.available).toBe(false)
  })
})
