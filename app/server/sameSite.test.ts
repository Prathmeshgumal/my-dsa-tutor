// @vitest-environment node
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createSameSiteGuard, fromAnotherSite } from './sameSite'

const req = (url: string, headers: Record<string, string> = {}) =>
  ({ url, headers: { host: 'localhost:5199', ...headers } }) as unknown as IncomingMessage

function call(r: IncomingMessage) {
  const res = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() }
  const next = vi.fn()
  createSameSiteGuard()(r, res as unknown as ServerResponse, next)
  return { res, next }
}

test.each([
  ['the editor’s own page', { 'sec-fetch-site': 'same-origin', origin: 'http://localhost:5199' }, false],
  ['typing the address', { 'sec-fetch-site': 'none' }, false],
  ['tools without browser headers (curl)', {}, false],
  ['another website', { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }, true],
  ['another app on localhost (same-site, other port)', { 'sec-fetch-site': 'same-site', origin: 'http://localhost:3000' }, true],
  ['an older browser sending only Origin', { origin: 'https://evil.example' }, true],
  ['a garbled Origin', { origin: 'not a url' }, true],
])('%s → refused: %s', (_name, headers, refused) => {
  expect(fromAnotherSite(req('/api/files', headers))).toBe(refused)
})

test('refuses guarded routes from another site with 403', () => {
  for (const url of ['/api/files', '/api/claude/chat?x=1', '/piston/execute', '/piston/connect']) {
    const { res, next } = call(req(url, { 'sec-fetch-site': 'cross-site' }))
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
  }
})

test('leaves the page itself and its assets alone', () => {
  for (const url of ['/', '/src/main.tsx', '/apiary.png']) {
    expect(call(req(url, { 'sec-fetch-site': 'cross-site' })).next).toHaveBeenCalled()
  }
})

test('lets the editor’s own requests through', () => {
  expect(call(req('/api/files', { 'sec-fetch-site': 'same-origin' })).next).toHaveBeenCalled()
})
