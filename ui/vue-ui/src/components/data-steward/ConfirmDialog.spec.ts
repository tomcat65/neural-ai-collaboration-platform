import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmDialog from './ConfirmDialog.vue'

// Teleport is stubbed so the dialog renders inline in the wrapper (otherwise its
// content lands on document.body, out of the wrapper's reach). The tests assert
// BEHAVIOR (does confirm fire?) rather than the rendered disabled attribute — the
// guard lives in onConfirm()/canConfirm, which is the actual safety property.
const mountOpts = { global: { stubs: { teleport: true } } }

describe('ConfirmDialog (typed-confirmation safety gate)', () => {
  it('cannot confirm until the confirm word is typed EXACTLY', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, title: 'Purge?', confirmWord: 'PURGE', confirmLabel: 'Purge' },
      ...mountOpts,
    })
    // nothing typed → confirm is a no-op
    await wrapper.find('.btn.go').trigger('click')
    expect(wrapper.emitted('confirm')).toBeFalsy()

    // wrong case → still gated
    await wrapper.find('.confirm-input').setValue('purge')
    await wrapper.find('.btn.go').trigger('click')
    expect(wrapper.emitted('confirm')).toBeFalsy()

    // exact word → unlocked
    await wrapper.find('.confirm-input').setValue('PURGE')
    await wrapper.find('.btn.go').trigger('click')
    expect(wrapper.emitted('confirm')).toBeTruthy()
  })

  it('without a confirm word, confirm fires immediately', async () => {
    const wrapper = mount(ConfirmDialog, { props: { open: true, title: 'Restore?' }, ...mountOpts })
    await wrapper.find('.btn.go').trigger('click')
    expect(wrapper.emitted('confirm')).toBeTruthy()
  })

  it('busy blocks both confirm and cancel (no double-submit / no dismiss mid-flight)', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, title: 'Restore?', busy: true }, // no confirmWord, but busy
      ...mountOpts,
    })
    await wrapper.find('.btn.go').trigger('click')
    await wrapper.find('.btn.cancel').trigger('click')
    expect(wrapper.emitted('confirm')).toBeFalsy()
    expect(wrapper.emitted('cancel')).toBeFalsy()
  })

  it('cancel emits cancel when not busy', async () => {
    const wrapper = mount(ConfirmDialog, { props: { open: true, title: 'x' }, ...mountOpts })
    await wrapper.find('.btn.cancel').trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  it('renders nothing when closed', () => {
    const wrapper = mount(ConfirmDialog, { props: { open: false, title: 'x' }, ...mountOpts })
    expect(wrapper.find('.dialog').exists()).toBe(false)
  })
})
