import { describe, it, expect } from 'vitest'
import router from './index'

// 2c router re-org: the Data Steward is the primary surface; the live Command
// Center moves to /activity; the legacy /steward path redirects to the home.
describe('router (2c re-org)', () => {
  it('serves the Data Steward at the root path', () => {
    expect(router.resolve('/').name).toBe('DataSteward')
  })

  it('serves the Command Center at /activity', () => {
    expect(router.resolve('/activity').name).toBe('CommandCenter')
  })

  it('redirects the legacy /steward path to the home', () => {
    const steward = router.getRoutes().find((r) => r.path === '/steward')
    expect(steward?.redirect).toBe('/')
  })

  it('keeps /brain and /stream', () => {
    expect(router.resolve('/brain').name).toBe('Brain')
    expect(router.resolve('/stream').name).toBe('LiveStream')
  })
})
