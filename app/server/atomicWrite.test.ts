// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { isTempFile, writeFileAtomic } from './atomicWrite'

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
