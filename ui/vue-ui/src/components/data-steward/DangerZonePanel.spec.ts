import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DangerZonePanel from './DangerZonePanel.vue'
import { useDataStewardStore } from '@/stores/data-steward'

// Teleport stubbed so the ConfirmDialog renders inline in the wrapper.
const mountOpts = { global: { stubs: { teleport: true } } }

function seededStore() {
  const store = useDataStewardStore()
  store.snapshots = [
    { snapshotId: 's1', filename: 'snap-A.db', sizeBytes: 100, createdAt: '2026-06-01T20:00:00Z', label: 'manual', location: 'data/backups' },
  ]
  return store
}

describe('DangerZonePanel (full-DB restore typed gate)', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('will not restore the DB until RESTORE is typed exactly', async () => {
    const store = seededStore()
    const spy = vi.spyOn(store, 'restoreSnapshot').mockResolvedValue({ restoredFrom: 'snap-A.db', preRestoreBackup: 'pre-restore-1.db', refreshFailed: false })
    const wrapper = mount(DangerZonePanel, mountOpts)

    await wrapper.find('.restore-btn').trigger('click') // open the confirm
    await wrapper.find('.btn.go').trigger('click')        // gated — nothing typed
    expect(spy).not.toHaveBeenCalled()

    await wrapper.find('.confirm-input').setValue('restore') // wrong case — still gated
    await wrapper.find('.btn.go').trigger('click')
    expect(spy).not.toHaveBeenCalled()

    await wrapper.find('.confirm-input').setValue('RESTORE') // exact — unlocks
    await wrapper.find('.btn.go').trigger('click')
    expect(spy).toHaveBeenCalledWith('s1')
  })

  it('surfaces the pre-restore safety backup after a successful restore', async () => {
    const store = seededStore()
    vi.spyOn(store, 'restoreSnapshot').mockResolvedValue({ restoredFrom: 'snap-A.db', preRestoreBackup: 'pre-restore-1.db', refreshFailed: false })
    const wrapper = mount(DangerZonePanel, mountOpts)

    await wrapper.find('.restore-btn').trigger('click')
    await wrapper.find('.confirm-input').setValue('RESTORE')
    await wrapper.find('.btn.go').trigger('click')
    await flushPromises()

    const result = wrapper.find('.result')
    expect(result.exists()).toBe(true)
    expect(result.text()).toContain('pre-restore-1.db')
  })

  it('warns that views may be stale when the restore succeeded but the refresh failed', async () => {
    const store = seededStore()
    vi.spyOn(store, 'restoreSnapshot').mockResolvedValue({ restoredFrom: 'snap-A.db', preRestoreBackup: 'pre-restore-1.db', refreshFailed: true })
    const wrapper = mount(DangerZonePanel, mountOpts)
    await wrapper.find('.restore-btn').trigger('click')
    await wrapper.find('.confirm-input').setValue('RESTORE')
    await wrapper.find('.btn.go').trigger('click')
    await flushPromises()
    expect(wrapper.find('.result').exists()).toBe(true)
    expect(wrapper.find('.stale-note').exists()).toBe(true) // "restored, but views may be stale"
  })

  it('renders an empty state (no restore button) when there are no snapshots', () => {
    const store = useDataStewardStore()
    store.snapshots = []
    const wrapper = mount(DangerZonePanel, mountOpts)
    expect(wrapper.find('.empty').exists()).toBe(true)
    expect(wrapper.find('.restore-btn').exists()).toBe(false)
  })
})
