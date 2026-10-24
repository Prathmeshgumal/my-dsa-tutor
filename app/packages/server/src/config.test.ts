// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ConfigError, loadConfig } from './config.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'config-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const writeConfig = (body: unknown) => writeFile(path.join(dir, 'dsa-tutor.json'), JSON.stringify(body))

test('with no file and no settings, everything lives in the data folder', () => {
  expect(loadConfig({ env: {}, defaultDataDir: dir })).toEqual({
    port: 5199,
    host: '127.0.0.1',
    pistonUrl: 'http://127.0.0.1:2000',
    dataDir: dir,
    folders: {
      solutions: path.join(dir, 'solutions'),
      notes: path.join(dir, 'notes'),
      playground: path.join(dir, 'playground'),
      problems: path.join(dir, 'problems'),
      logs: path.join(dir, 'logs'),
      state: path.join(dir, 'state'),
    },
  })
})

test('DATA_DIR moves the data folder, and its config file is the one read', async () => {
  await writeConfig({ port: 6000 })
  const config = loadConfig({ env: { DATA_DIR: dir }, defaultDataDir: '/nowhere' })
  expect(config.dataDir).toBe(dir)
  expect(config.port).toBe(6000)
  expect(config.folders.notes).toBe(path.join(dir, 'notes'))
})

test('the config file sets the port, Piston and folders; relative folders are inside the data folder', async () => {
  await writeConfig({ port: 7000, host: '0.0.0.0', pistonUrl: 'http://piston:2000', folders: { notes: 'my-notes', logs: '/var/log/dsa' } })
  const config = loadConfig({ env: {}, defaultDataDir: dir })
  expect(config).toMatchObject({ port: 7000, host: '0.0.0.0', pistonUrl: 'http://piston:2000' })
  expect(config.folders.notes).toBe(path.join(dir, 'my-notes'))
  expect(config.folders.logs).toBe('/var/log/dsa')
  expect(config.folders.solutions).toBe(path.join(dir, 'solutions'))
})

test('environment settings win over the config file', async () => {
  await writeConfig({ port: 7000, pistonUrl: 'http://piston:2000', folders: { notes: 'my-notes' } })
  const config = loadConfig({
    env: { PORT: '8000', HOST: '0.0.0.0', PISTON_URL: 'http://other:2000', NOTES_DIR: '/elsewhere/notes', STATE_DIR: '/s' },
    defaultDataDir: dir,
  })
  expect(config).toMatchObject({ port: 8000, host: '0.0.0.0', pistonUrl: 'http://other:2000' })
  expect(config.folders.notes).toBe('/elsewhere/notes')
  expect(config.folders.state).toBe('/s')
})

test('a broken config file says which file and what is wrong', async () => {
  await writeFile(path.join(dir, 'dsa-tutor.json'), '{ port: 1')
  expect(() => loadConfig({ env: {}, defaultDataDir: dir })).toThrow(ConfigError)
  expect(() => loadConfig({ env: {}, defaultDataDir: dir })).toThrow(`${path.join(dir, 'dsa-tutor.json')} isn’t valid JSON`)
  await writeConfig({ port: 'soon', folders: { music: 'x' } })
  expect(() => loadConfig({ env: {}, defaultDataDir: dir })).toThrow(/port/)
  expect(() => loadConfig({ env: {}, defaultDataDir: dir })).toThrow(/music/)
})

test('a bad PORT setting is refused, not ignored', () => {
  expect(() => loadConfig({ env: { PORT: 'eighty' }, defaultDataDir: dir })).toThrow('PORT must be a whole number from 1 to 65535')
})
