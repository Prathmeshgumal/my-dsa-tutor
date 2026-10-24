import { configureStateSync, flushState, loadSavedState, stateStorage } from './stateSync'

type Call = { url: string; method: string; body?: string; keepalive?: boolean }
let calls: Call[]
let server: Record<string, string | null>
let failPuts: number

function fakeFetch(url: string, init?: RequestInit) {
  const method = init?.method ?? 'GET'
  calls.push({ url, method, body: init?.body as string | undefined, keepalive: init?.keepalive })
  if (method === 'GET') return Promise.resolve(new Response(JSON.stringify(server)))
  if (failPuts > 0) {
    failPuts--
    return Promise.reject(new TypeError('Failed to fetch'))
  }
  server[url.split('/').pop()!] = init!.body as string
  return Promise.resolve(new Response(null, { status: 204 }))
}

const puts = () => calls.filter((c) => c.method === 'PUT')
let onProblem: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  localStorage.clear()
  calls = []
  server = { settings: null, workspace: null, ai: null, problems: null }
  failPuts = 0
  onProblem = vi.fn<() => void>()
  configureStateSync({ fetchImpl: fakeFetch as typeof fetch, delayMs: 20, onProblem })
})


test('what is saved on disk is what the browser starts with', async () => {
  server.settings = '{"state":{"theme":"dark"},"version":1}'
  localStorage.setItem('dsa-editor:settings', '{"state":{"theme":"light"},"version":1}')
  expect(await loadSavedState()).toBe(true)
  expect(localStorage.getItem('dsa-editor:settings')).toBe('{"state":{"theme":"dark"},"version":1}')
  expect(puts()).toHaveLength(0)
})

test('the first time, what this browser had is moved to disk', async () => {
  localStorage.setItem('dsa-editor:ai', '{"state":{"chats":[1]}}')
  await loadSavedState()
  await vi.waitFor(() => expect(server.ai).toBe('{"state":{"chats":[1]}}'))
  expect(localStorage.getItem('dsa-editor:ai')).toBe('{"state":{"chats":[1]}}')
})

test('a change that never reached disk (tab closed mid-save) wins over the older copy on disk', async () => {
  server.workspace = '{"old":true}'
  failPuts = 1
  stateStorage.setItem('dsa-editor:workspace', '{"new":true}')
  await vi.waitFor(() => expect(puts()).toHaveLength(1))
  // The page closes before the retry: next visit.
  configureStateSync({ fetchImpl: fakeFetch as typeof fetch, delayMs: 20, onProblem })
  await loadSavedState()
  expect(localStorage.getItem('dsa-editor:workspace')).toBe('{"new":true}')
  await vi.waitFor(() => expect(server.workspace).toBe('{"new":true}'))
})

test('changes are saved to disk after a short pause, only the latest, and only once confirmed is the change settled', async () => {
  stateStorage.setItem('dsa-editor:settings', '{"v":1}')
  stateStorage.setItem('dsa-editor:settings', '{"v":2}')
  expect(localStorage.getItem('dsa-editor:settings')).toBe('{"v":2}')
  await vi.waitFor(() => expect(server.settings).toBe('{"v":2}'))
  expect(puts()).toHaveLength(1)
  expect(puts()[0].url).toBe('/api/state/settings')
  // Settled: next visit takes disk's copy again.
  server.settings = '{"v":3}'
  await loadSavedState()
  expect(localStorage.getItem('dsa-editor:settings')).toBe('{"v":3}')
})

test('a failed save keeps trying, and says so once', async () => {
  failPuts = 3
  stateStorage.setItem('dsa-editor:ai', '{"chats":[]}')
  await vi.waitFor(() => expect(server.ai).toBe('{"chats":[]}'), { timeout: 3000 })
  expect(puts()).toHaveLength(4)
  expect(onProblem).toHaveBeenCalledOnce()
})

test('if the server can’t be reached at start, the browser’s copy is used', async () => {
  configureStateSync({ fetchImpl: (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch, delayMs: 20, onProblem })
  localStorage.setItem('dsa-editor:settings', '{"mine":true}')
  expect(await loadSavedState()).toBe(false)
  expect(localStorage.getItem('dsa-editor:settings')).toBe('{"mine":true}')
})

test('leaving the page sends what is still waiting right away', async () => {
  configureStateSync({ fetchImpl: fakeFetch as typeof fetch, delayMs: 60_000, onProblem })
  stateStorage.setItem('dsa-editor:problems', '{"activeSlug":"two-sum"}')
  expect(puts()).toHaveLength(0)
  flushState()
  expect(puts()).toEqual([expect.objectContaining({ url: '/api/state/problems', body: '{"activeSlug":"two-sum"}', keepalive: true })])
})

test('other browser keys are left alone', () => {
  stateStorage.setItem('something-else', '1')
  expect(localStorage.getItem('something-else')).toBe('1')
  expect(puts()).toHaveLength(0)
})
