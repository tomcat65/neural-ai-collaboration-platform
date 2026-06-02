import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useCommandCenterStore } from '@/stores/command-center'
import { useDataStewardStore } from '@/stores/data-steward'
import App from '@/App.vue'
import CommandCenter from '@/views/CommandCenter.vue'
import DataStewardView from '@/views/DataStewardView.vue'

// 2c: the Command Center store lifecycle (live fetches + 3s/15s/30s polling) is scoped
// to its own component (the /activity route), NOT run globally in App.vue. The Data
// Steward home ('/') must not start that background traffic.
const mountOpts = { global: { stubs: { RouterView: true, RouterLink: true } } }

describe('Command Center store lifecycle (2c — scoped to /activity)', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('the App shell does NOT initialize the Command Center store globally', () => {
    const cc = useCommandCenterStore()
    const init = vi.spyOn(cc, 'initialize').mockImplementation(async () => {})
    shallowMount(App, mountOpts)
    expect(init).not.toHaveBeenCalled()
  })

  it('CommandCenter (/activity) initializes on mount and destroys on unmount', () => {
    const cc = useCommandCenterStore()
    const init = vi.spyOn(cc, 'initialize').mockImplementation(async () => {})
    const destroy = vi.spyOn(cc, 'destroy').mockImplementation(() => {})
    const wrapper = shallowMount(CommandCenter, mountOpts)
    expect(init).toHaveBeenCalledOnce()
    expect(destroy).not.toHaveBeenCalled()
    wrapper.unmount()
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('the Data Steward home (/) does NOT start Command Center polling', () => {
    const cc = useCommandCenterStore()
    const ccInit = vi.spyOn(cc, 'initialize').mockImplementation(async () => {})
    const ds = useDataStewardStore()
    vi.spyOn(ds, 'initialize').mockImplementation(async () => {}) // stub the Steward's own init
    shallowMount(DataStewardView, mountOpts)
    expect(ccInit).not.toHaveBeenCalled()
  })
})
