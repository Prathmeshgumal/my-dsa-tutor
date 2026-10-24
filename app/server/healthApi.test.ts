// @vitest-environment node
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { healthy } from '../src/lib/health'
import { checkHealth } from './healthApi'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'health-'))
})

afterEach(async () => {
  await chmod(dir, 0o755).catch(() => {})
  await rm(dir, { recursive: true, force: true })
})

const runtimes = (...languages: string[]) =>
  (async () => new Response(JSON.stringify(languages.map((language) => ({ language, version: '1' }))))) as unknown as typeof fetch

const base = (over: Partial<Parameters<typeof checkHealth>[0]> = {}) =>
  checkHealth({
    pistonUrl: 'http://piston',
    folders: { solutions: dir },
    env: { CLAUDE_CODE_OAUTH_TOKEN: 'x' },
    platform: 'linux',
    home: '/nonexistent-home',
    fetchImpl: runtimes('c++', 'java', 'python'),
    ...over,
  })

test('everything working is healthy', async () => {
  const h = await base()
  expect(h).toEqual({
    piston: { ok: true, languages: { cpp: true, java: true, python: true } },
    claude: { signedIn: true },
    folders: [{ name: 'solutions', ok: true }],
  })
  expect(healthy(h)).toBe(true)
})

test('names the languages Piston is missing', async () => {
  const h = await base({ fetchImpl: runtimes('c++') })
  expect(h.piston.languages).toEqual({ cpp: true, java: false, python: false })
  expect(h.piston.problem).toMatch(/^Java, Python aren’t installed yet/)
  expect(healthy(h)).toBe(false)
})

test('Piston not reachable', async () => {
  const fetchImpl = (async () => {
    throw new TypeError('fetch failed')
  }) as unknown as typeof fetch
  const h = await base({ fetchImpl })
  expect(h.piston).toMatchObject({ ok: false, problem: expect.stringMatching(/Can’t reach Piston/) })
})

test('Claude: a login file in CLAUDE_CONFIG_DIR counts as signed in', async () => {
  const config = path.join(dir, 'claude')
  await mkdir(config)
  await writeFile(path.join(config, '.credentials.json'), '{}')
  expect((await base({ env: { CLAUDE_CONFIG_DIR: config } })).claude).toEqual({ signedIn: true })
})

test('Claude: no token and no login file is not signed in, with how to fix it', async () => {
  const h = await base({ env: { CLAUDE_CONFIG_DIR: path.join(dir, 'nothing') } })
  expect(h.claude).toMatchObject({ signedIn: false, problem: expect.stringMatching(/claude setup-token/) })
  expect(healthy(h)).toBe(false)
})

test('Claude: on macOS the keychain login can’t be seen, so it is unknown, not a problem', async () => {
  const h = await base({ env: {}, platform: 'darwin' })
  expect(h.claude).toEqual({ signedIn: 'unknown' })
  expect(healthy(h)).toBe(true)
})

test('a missing folder is reported, and the check leaves no files behind', async () => {
  const h = await base({ folders: { solutions: dir, notes: path.join(dir, 'missing') } })
  expect(h.folders).toEqual([
    { name: 'solutions', ok: true },
    { name: 'notes', ok: false, problem: 'The notes folder doesn’t exist, so work there won’t be saved.' },
  ])
  const { readdir } = await import('node:fs/promises')
  expect(await readdir(dir)).toEqual([])
})
