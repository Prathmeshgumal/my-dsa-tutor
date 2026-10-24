import { configureStateSync, flushState, loadSavedState, resumeState, stateStorage } from './stateSync'

type Call = { url: string; method: string; body?: string; keepalive?: boolean }
let calls: Call[]
let server: Record<string, string | null>
let failPuts: number
/** While set, saves wait until released (in any order), as a slow disk can make them. */
let holdPuts: boolean
let held: ((ok?: boolean) => void)[]

function fakeFetch(url: string, init?: RequestInit) {
  const method = init?.method ?? 'GET'
  calls.push({ url, method, body: init?.body as string | undefined, keepalive: init?.keepalive })
  if (method === 'GET') return Promise.resolve(new Response(JSON.stringify(server)))
  if (failPuts > 0) {
    failPuts--
    return Promise.reject(new TypeError('Failed to fetch'))
  }
  const write = () => {
    server[url.split('/').pop()!] = init!.body as string
    return new Response(null, { status: 204 })
  }
  if (holdPuts) {
    return new Promise<Response>((resolve, reject) =>
      held.push((ok = true) => (ok ? resolve(write()) : reject(new TypeError('Failed to fetch')))),
    )
  }
  return Promise.resolve(write())
}

const puts = () => calls.filter((c) => c.method === 'PUT')
let onProblem: ReturnType<typeof vi.fn<() => void>>
let onRecovered: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  localStorage.clear()
  calls = []
  server = { settings: null, workspace: null, ai: null, problems: null }
  failPuts = 0
  holdPuts = false
  held = []
  onProblem = vi.fn<() => void>()
  onRecovered = vi.fn<() => void>()
  configureStateSync({ fetchImpl: fakeFetch as typeof fetch, delayMs: 20, onProblem, onRecovered })
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('one save of a kind at a time, so an older one can never land on disk after a newer one', async () => {
  holdPuts = true
  stateStorage.setItem('dsa-editor:ai', '{"v":1}')
  await vi.waitFor(() => expect(puts()).toHaveLength(1))
  stateStorage.setItem('dsa-editor:ai', '{"v":2}')
  await sleep(100)
  expect(puts()).toHaveLength(1)
  holdPuts = false
  held.shift()!()
  await vi.waitFor(() => expect(server.ai).toBe('{"v":2}'))
  await sleep(100)
  expect(puts().map((c) => c.body)).toEqual(['{"v":1}', '{"v":2}'])
  expect(localStorage.getItem('dsa-editor:unsaved:ai')).toBeNull()
})

test('a failed save with a newer change waiting sends that change once, not twice', async () => {
  holdPuts = true
  stateStorage.setItem('dsa-editor:ai', '{"v":1}')
  await vi.waitFor(() => expect(puts()).toHaveLength(1))
  // A newer change, and then the first save fails before the newer one has gone out.
  stateStorage.setItem('dsa-editor:ai', '{"v":2}')
  held.shift()!(false)
  await sleep(200)
  expect(puts().filter((c) => c.body === '{"v":2}')).toHaveLength(1)
  holdPuts = false
  while (held.length) held.shift()!()
  await vi.waitFor(() => expect(server.ai).toBe('{"v":2}'))
})

test('after saving works again, the next problem is reported again', async () => {
  failPuts = 1
  stateStorage.setItem('dsa-editor:settings', '{"v":1}')
  await vi.waitFor(() => expect(server.settings).toBe('{"v":1}'))
  expect(onProblem).toHaveBeenCalledOnce()
  expect(onRecovered).toHaveBeenCalledOnce()
  failPuts = 1
  stateStorage.setItem('dsa-editor:settings', '{"v":2}')
  await vi.waitFor(() => expect(server.settings).toBe('{"v":2}'))
  expect(onProblem).toHaveBeenCalledTimes(2)
})

test('a page that comes back after being left (back button) sends what was still waiting', async () => {
  stateStorage.setItem('dsa-editor:problems', '{"activeSlug":"two-sum"}')
  failPuts = 1
  flushState()
  resumeState()
  await vi.waitFor(() => expect(localStorage.getItem('dsa-editor:unsaved:problems')).toBeNull())
  expect(server.problems).toBe('{"activeSlug":"two-sum"}')
})

test('a big change is still sent when leaving, just not as a request that outlives the page', () => {
  configureStateSync({ fetchImpl: fakeFetch as typeof fetch, delayMs: 60_000, onProblem })
  stateStorage.setItem('dsa-editor:ai', JSON.stringify({ text: 'x'.repeat(70_000) }))
  flushState()
  expect(puts()).toEqual([expect.objectContaining({ url: '/api/state/ai', keepalive: false })])
})

test('when disk’s copy replaces this browser’s different one, the browser’s is kept as a backup', async () => {
  server.ai = '{"from":"disk"}'
  localStorage.setItem('dsa-editor:ai', '{"from":"browser"}')
  await loadSavedState()
  expect(localStorage.getItem('dsa-editor:ai')).toBe('{"from":"disk"}')
  expect(localStorage.getItem('dsa-editor:backup:ai')).toBe('{"from":"browser"}')
})
