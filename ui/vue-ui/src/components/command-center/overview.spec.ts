// Phase 1 overview components — render straight off the deterministic Phase-0
// selectors. Mount with a real pinia + seeded store state (no network).
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useCommandCenterStore } from '@/stores/command-center'
import type { Message } from '@/types/command-center'
import PulseBand from './PulseBand.vue'
import NeedsYouQueue from './NeedsYouQueue.vue'
import ProjectDigestList from './ProjectDigestList.vue'

function mkMsg(o: Partial<Message>): Message {
  return {
    id: 'm', fromAgent: 'a', toAgent: 'x', content: '', messageType: 'info',
    createdAt: new Date(), isExpanded: false, isRead: false, isArchived: false, readAt: null,
    ...o,
  }
}

let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})
const opts = () => ({ global: { plugins: [pinia] } })

describe('Phase 1 overview components', () => {
  it('PulseBand renders the headline counts and emphasizes a non-zero needs-you', () => {
    const store = useCommandCenterStore()
    store.messages.push(mkMsg({ id: 'u1', toAgent: 'tomas', messageType: 'urgent' }))
    const w = mount(PulseBand, opts())
    expect(w.text()).toContain('Needs you')
    expect(w.text()).toContain('Active agents')
    expect(w.text()).toContain('Knowledge changes')
    expect(w.find('.pulse-tile.emphasize').exists()).toBe(true) // needs-you > 0
  })

  it('NeedsYouQueue shows the empty state, then lists a query addressed to you', () => {
    const store = useCommandCenterStore()
    let w = mount(NeedsYouQueue, opts())
    expect(w.text()).toContain("all clear")

    store.messages.push(mkMsg({ id: 'q1', fromAgent: 'codex', toAgent: 'tomas', messageType: 'query', content: 'need a decision' }))
    w = mount(NeedsYouQueue, opts())
    expect(w.text()).toContain('need a decision')
    expect(w.text()).toContain('QUERY')
    expect(w.text()).toContain('codex → tomas')
  })

  it('NeedsYouQueue excludes a query between two other agents (codex §5)', () => {
    const store = useCommandCenterStore()
    store.messages.push(mkMsg({ id: 'a2a', fromAgent: 'codex', toAgent: 'claude-engram', messageType: 'query', content: 'agent chatter' }))
    const w = mount(NeedsYouQueue, opts())
    expect(w.text()).toContain('all clear')
    expect(w.text()).not.toContain('agent chatter')
  })

  it('ProjectDigestList renders a best-effort label and emits open(project) on click', async () => {
    const store = useCommandCenterStore()
    store.rawProjects.push({ name: 'engram', observationCount: 5 })
    store.messages.push(mkMsg({ id: 'm1', fromAgent: 'a', toAgent: 'x', content: 'engram update shipped' }))
    const w = mount(ProjectDigestList, opts())
    expect(w.text().toLowerCase()).toContain('best-effort')
    expect(w.text()).toContain('engram')
    await w.find('.pd-card').trigger('click')
    expect(w.emitted('open')?.[0]).toEqual(['engram'])
  })
})
