// @vitest-environment node
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { isTempFile, removeLeftoverTempFiles, writeFileAtomic } from './atomicWrite.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'atomic-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('writes a new file and replaces an existing one, leaving no temporary files', async () => {
  const file = path.join(dir, 'a.cpp')
  await writeFileAtomic(file, 'one')
  await writeFileAtomic(file, 'two')
  expect(await readFile(file, 'utf8')).toBe('two')
  expect(await readdir(dir)).toEqual(['a.cpp'])
})

test('exclusive refuses to replace an existing file and keeps its content', async () => {
  const file = path.join(dir, 'a.md')
  await writeFile(file, 'mine')
  await expect(writeFileAtomic(file, 'theirs', { exclusive: true })).rejects.toMatchObject({ code: 'EEXIST' })
  expect(await readFile(file, 'utf8')).toBe('mine')
  expect(await readdir(dir)).toEqual(['a.md'])
})

test('a failed write leaves the old file untouched and no temporary file behind', async () => {
  const file = path.join(dir, 'missing-folder', 'a.cpp')
  await expect(writeFileAtomic(file, 'x')).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readdir(dir)).toEqual([])
})

test('temporary files are recognisable', () => {
  expect(isTempFile('.a.cpp.1a2b3c4d.saving')).toBe(true)
  expect(isTempFile('a.cpp')).toBe(false)
})

test('temporary files left by a save that crashed are removed, in subfolders too; a save in progress is left alone', async () => {
  await mkdir(path.join(dir, 'two-sum', 'attempts'), { recursive: true })
  const old = [path.join(dir, '.a.cpp.1a2b3c4d.saving'), path.join(dir, 'two-sum', 'attempts', '.1.json.1a2b3c4d.saving')]
  const fresh = path.join(dir, '.b.cpp.5e6f7a8b.saving')
  for (const f of [...old, fresh]) await writeFile(f, 'half')
  await writeFile(path.join(dir, 'a.cpp'), 'mine')
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
  for (const f of old) await utimes(f, hourAgo, hourAgo)
  await removeLeftoverTempFiles([dir, path.join(dir, 'missing')])
  expect((await readdir(dir)).sort()).toEqual(['.b.cpp.5e6f7a8b.saving', 'a.cpp', 'two-sum'])
  expect(await readdir(path.join(dir, 'two-sum', 'attempts'))).toEqual([])
})
