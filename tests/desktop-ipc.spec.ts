import { describe, expect, it } from 'vitest'
import { parseDesktopRequest } from '../src/desktop-ipc.js'

describe('desktop IPC request validation', () => {
  it('accepts an internal request', () => {
    expect(parseDesktopRequest({
      path: '/api/host.describe?source=desktop',
      method: 'POST',
      headers: [['content-type', 'application/json']],
      body: '{}',
    })).toEqual({
      path: '/api/host.describe?source=desktop',
      method: 'POST',
      headers: [['content-type', 'application/json']],
      body: '{}',
    })
  })

  it.each([
    'https://example.com/api',
    '//example.com/api',
    '/api\\escape',
    '/api#fragment',
  ])('rejects a path outside the process-local Host: %s', path => {
    expect(() => parseDesktopRequest({ path, method: 'GET', headers: [] })).toThrow()
  })
})
