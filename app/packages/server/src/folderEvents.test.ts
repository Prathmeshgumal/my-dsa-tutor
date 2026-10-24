// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { writeFileAtomic } from './atomicWrite.ts'
import { createFolderEventsMiddleware } from './folderEvents.ts'

let root: string
let server: Server
let base: string
let abort: AbortController

const dirs = () => ({
  files: path.join(root, 'solutions'),
  notes: path.join(root, 'notes'),
  playground: path.join(root, 'playground'),
  problems: path.join(root, 'problems'),
})

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'events-'))
  for (const d of Object.values(dirs())) await mkdir(d)
  const middleware = createFolderEventsMiddleware({ folders: dirs() })
  server = createServer((req, res) => middleware(req, res, () => res.end('next')))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  abort = new AbortController()
})

afterEach(async () => {
  abort.abort()
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  await rm(root, { recursive: true, force: true })
})

/** Opens the event stream and collects the areas it reports. */
async function listen() {
  const areas: string[] = []
  const res = await fetch(`${base}/api/events`, { signal: abort.signal })
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) return
        for (const m of value.matchAll(/^data: (.*)$/gm)) areas.push((JSON.parse(m[1]) as { area: string }).area)
      }
    } catch {
      // aborted
    }
  })()
  // Give the watchers a moment to start.
  await new Promise((r) => setTimeout(r, 100))
  return areas
}

const settle = () => new Promise((r) => setTimeout(r, 700))

test('an outside change is reported once per area, even in a burst', async () => {
  const areas = await listen()
  await writeFile(path.join(dirs().files, 'a.cpp'), '1')
  await writeFile(path.join(dirs().files, 'b.cpp'), '2')
  await mkdir(path.join(dirs().problems, 'two-sum'))
  await writeFile(path.join(dirs().problems, 'two-sum', 'solution.cpp'), 'x')
  await settle()
  expect(areas.sort()).toEqual(['files', 'problems'])
})

test('the server’s own saves are not reported back', async () => {
  const areas = await listen()
  await writeFileAtomic(path.join(dirs().notes, 'n.md'), 'hello')
  await settle()
  expect(areas).toEqual([])
})

test('an outside edit right after the server’s own save of the same file is still reported', async () => {
  const file = path.join(dirs().files, 'a.cpp')
  await writeFileAtomic(file, 'saved by the editor')
  const areas = await listen()
  await writeFile(file, 'edited in VS Code')
  await settle()
  expect(areas).toEqual(['files'])
})

test('other routes pass through', async () => {
  expect(await (await fetch(`${base}/api/files`)).text()).toBe('next')
})
