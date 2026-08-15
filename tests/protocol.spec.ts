import { describe, expect, it } from 'vitest'
import { injectDesktopBoot } from '../src/protocol.js'

describe('desktop protocol HTML injection', () => {
  it('loads the IPC boot graph and custom chrome before the Web frontend', () => {
    const html = '<!doctype html><html><head><script src="/app.js"></script></head></html>'
    const result = injectDesktopBoot(html)

    expect(result).toContain('<script src="/__oi/boot.js"></script>')
    expect(result).toContain('<link rel="stylesheet" href="/__oi/chrome.css">')
    expect(result).toContain('<script defer src="/__oi/chrome.js"></script>')
    expect(result.indexOf('/__oi/boot.js')).toBeLessThan(result.indexOf('/app.js'))
  })
})
