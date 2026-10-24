import { fetchDiskFiles, syncToDisk } from './diskStore'
import type { CodeFile } from './storage'

function okFetch(body: unknown = null) {
  return vi.fn(async () => (body === null ? new Response(null, { status: 204 }) : new Response(JSON.stringify(body))))
}

const calls = (f: ReturnType<typeof vi.fn>) =>
  (f.mock.calls as unknown as [string, RequestInit][]).map(([url, init]) => ({
    url,
    method: init?.method ?? 'GET',
    body: init?.body ? JSON.parse(init.body as string) : undefined,
    keepalive: init?.keepalive,
  }))

const f = (id: string, name: string, content = ''): CodeFile => ({ id, name, content })

test('fetchDiskFiles returns the list', async () => {
  const fetchImpl = okFetch([{ name: 'a.cpp', content: 'x' }])
  await expect(fetchDiskFiles(fetchImpl)).resolves.toEqual([{ name: 'a.cpp', content: 'x' }])
  expect(calls(fetchImpl)[0].url).toBe('/api/files')
})

test('fetchDiskFiles throws when the API is unavailable', async () => {
  await expect(fetchDiskFiles(vi.fn(async () => new Response('nope', { status: 404 })))).rejects.toThrow()
  await expect(
    fetchDiskFiles(
      vi.fn(async () => {
        throw new TypeError('offline')
      }),
    ),
  ).rejects.toThrow()
})

test('nothing changed → no requests', async () => {
  const fetchImpl = okFetch()
  const files = [f('1', 'a.cpp', 'x')]
  await syncToDisk(files, files, fetchImpl)
  expect(fetchImpl).not.toHaveBeenCalled()
})

test('new file → PUT with content (name URL-encoded)', async () => {
  const fetchImpl = okFetch()
  await syncToDisk([], [f('1', 'two sum.cpp', 'x')], fetchImpl)
  expect(calls(fetchImpl)).toEqual([
    { url: '/api/files/two%20sum.cpp', method: 'PUT', body: { content: 'x' }, keepalive: undefined },
  ])
})

test('content change → PUT; deletion → DELETE; rename → POST rename', async () => {
  const fetchImpl = okFetch()
  await syncToDisk(
    [f('1', 'a.cpp', 'old'), f('2', 'b.cpp'), f('3', 'c.py')],
    [f('1', 'a.cpp', 'new'), f('3', 'd.py')],
    fetchImpl,
  )
  expect(calls(fetchImpl).map((c) => [c.method, c.url, c.body])).toEqual([
    ['DELETE', '/api/files/b.cpp', undefined],
    ['POST', '/api/files/c.py/rename', { to: 'd.py' }],
    ['PUT', '/api/files/a.cpp', { content: 'new' }],
  ])
})

test('rename plus edit → rename then PUT under the new name', async () => {
  const fetchImpl = okFetch()
  await syncToDisk([f('1', 'a.cpp', 'x')], [f('1', 'b.cpp', 'y')], fetchImpl)
  expect(calls(fetchImpl).map((c) => [c.method, c.url])).toEqual([
    ['POST', '/api/files/a.cpp/rename'],
    ['PUT', '/api/files/b.cpp'],
  ])
})

test('keepalive option is passed through (used when the page closes)', async () => {
  const fetchImpl = okFetch()
  await syncToDisk([], [f('1', 'a.cpp')], fetchImpl, { keepalive: true })
  expect(calls(fetchImpl)[0].keepalive).toBe(true)
})

test('a failed request rejects', async () => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'disk full' }), { status: 500 }))
  await expect(syncToDisk([], [f('1', 'a.cpp')], fetchImpl)).rejects.toThrow('disk full')
})
