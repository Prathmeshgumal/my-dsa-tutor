// Practice problems on disk, one folder each:
//   problems/<slug>/problem.json   description, params, tests
//   problems/<slug>/driver.cpp     hidden main() that feeds the tests to Solution
//   problems/<slug>/solution.cpp   the student's code
//   problems/<slug>/attempts/<time>.json   one per Submit
// Used by the /api/problems routes and by Claude's problem tools.
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  isCodeName,
  isSlug,
  SOLUTION_FILE,
  uniqueSlug,
  type Attempt,
  type Problem,
  type ProblemEntry,
  type TestCase,
} from '@dsa/core/problems'
import { NewerFormatError, parseSaved, stamp } from '@dsa/core/formats'
import { writeFileAtomic } from './atomicWrite.ts'
import { noteOwnChange } from './ownChanges.ts'

export class ProblemNotFound extends Error {}

function folder(dir: string, slug: string): string {
  if (!isSlug(slug)) throw new ProblemNotFound(`"${slug}" isn't a problem name.`)
  return path.join(dir, slug)
}

const isDir = (p: string) =>
  stat(p).then(
    (s) => s.isDirectory(),
    () => false,
  )

async function slugs(dir: string): Promise<string[]> {
  await mkdir(dir, { recursive: true })
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory() && isSlug(e.name)).map((e) => e.name)
}

const readText = (file: string) => readFile(file, 'utf8').catch(() => '')

export async function listAttempts(dir: string, slug: string): Promise<Attempt[]> {
  const attemptsDir = path.join(folder(dir, slug), 'attempts')
  const names = await readdir(attemptsDir).catch(() => [] as string[])
  const attempts = await Promise.all(
    names
      .filter((n) => /^\d+\.json$/.test(n))
      .map(async (n) => {
        try {
          return parseSaved<Attempt>('attempt', await readFile(path.join(attemptsDir, n), 'utf8'))
        } catch {
          return null
        }
      }),
  )
  return attempts.filter((a): a is Attempt => a !== null).sort((a, b) => b.at - a.at)
}

export async function readEntry(dir: string, slug: string): Promise<ProblemEntry> {
  const base = folder(dir, slug)
  let problem: Problem
  try {
    problem = parseSaved<Problem>('problem', await readFile(path.join(base, 'problem.json'), 'utf8'))
  } catch (e) {
    if (e instanceof NewerFormatError) throw new ProblemNotFound(`"${slug}" ${e.message.replace(/^This /, '')}`)
    throw new ProblemNotFound(`There's no problem called "${slug}".`)
  }
  const attempts = await listAttempts(dir, slug)
  const names = (await readdir(base)).filter((n) => isCodeName(n) && n !== SOLUTION_FILE).sort()
  return {
    slug,
    problem,
    solution: await readText(path.join(base, SOLUTION_FILE)),
    versions: await Promise.all(names.map(async (name) => ({ name, content: await readText(path.join(base, name)) }))),
    driver: await readText(path.join(base, 'driver.cpp')),
    solved: attempts.some((a) => a.total > 0 && a.passed === a.total),
    attempts: attempts.length,
  }
}

/** Every problem, newest first. Folders that aren't problems are skipped. */
export async function listEntries(dir: string): Promise<ProblemEntry[]> {
  const entries = await Promise.all(
    (await slugs(dir)).map((s) => readEntry(dir, s).catch(() => null)),
  )
  return entries.filter((e): e is ProblemEntry => e !== null).sort((a, b) => b.problem.createdAt - a.problem.createdAt)
}

/** Problems saved by a newer version of the editor, which listEntries leaves out. */
export async function listNewer(dir: string): Promise<string[]> {
  const newer = await Promise.all(
    (await slugs(dir)).map(async (slug) => {
      try {
        parseSaved<Problem>('problem', await readFile(path.join(dir, slug, 'problem.json'), 'utf8'))
        return null
      } catch (e) {
        return e instanceof NewerFormatError ? slug : null
      }
    }),
  )
  return newer.filter((s): s is string => s !== null).sort()
}

export async function createProblem(
  dir: string,
  { problem, solution, driver }: { problem: Problem; solution: string; driver: string },
): Promise<string> {
  const slug = uniqueSlug(problem.title, await slugs(dir))
  const base = folder(dir, slug)
  noteOwnChange(base)
  await mkdir(path.join(base, 'attempts'), { recursive: true })
  // The starting code is kept for Reset.
  const saved: Problem = { ...problem, starter: solution }
  await writeFileAtomic(path.join(base, 'problem.json'), JSON.stringify(stamp('problem', saved), null, 2))
  await writeFileAtomic(path.join(base, 'driver.cpp'), driver)
  await writeFileAtomic(path.join(base, 'solution.cpp'), solution)
  return slug
}

async function existing(dir: string, slug: string): Promise<string> {
  const base = folder(dir, slug)
  if (!(await isDir(base))) throw new ProblemNotFound(`There's no problem called "${slug}".`)
  return base
}

export async function writeSolution(dir: string, slug: string, content: string): Promise<void> {
  await writeCode(dir, slug, SOLUTION_FILE, content)
}

function checkCodeName(name: string): void {
  if (!isCodeName(name)) throw new BadName(`"${name}" isn't a code file name; use something like brute-force.cpp.`)
}

export class BadName extends Error {}

/** Writes solution.cpp or another version (created if new). */
export async function writeCode(dir: string, slug: string, name: string, content: string): Promise<void> {
  checkCodeName(name)
  await writeFileAtomic(path.join(await existing(dir, slug), name), content)
}

/** Deletes a version; solution.cpp always stays. */
export async function deleteCode(dir: string, slug: string, name: string): Promise<void> {
  checkCodeName(name)
  if (name === SOLUTION_FILE) throw new BadName(`${SOLUTION_FILE} can't be deleted.`)
  const file = path.join(await existing(dir, slug), name)
  noteOwnChange(file)
  await rm(file, { force: true })
}

async function updateProblem(dir: string, slug: string, change: (p: Problem) => Problem): Promise<Problem> {
  const { problem } = await readEntry(dir, slug)
  const next = change(problem)
  await writeFileAtomic(path.join(folder(dir, slug), 'problem.json'), JSON.stringify(stamp('problem', next), null, 2))
  return next
}

export async function writeTests(dir: string, slug: string, tests: TestCase[]): Promise<void> {
  await updateProblem(dir, slug, (p) => ({ ...p, tests }))
}

/** Ties a note (by its file name in notes/) to a problem. */
export async function linkNote(dir: string, slug: string, note: string): Promise<void> {
  await updateProblem(dir, slug, (p) => ({ ...p, notes: [...new Set([...(p.notes ?? []), note])] }))
}

export async function writeNoteLinks(dir: string, slug: string, notes: string[]): Promise<void> {
  await updateProblem(dir, slug, (p) => ({ ...p, notes: [...new Set(notes)] }))
}

export async function saveAttempt(dir: string, slug: string, attempt: Attempt): Promise<void> {
  const attemptsDir = path.join(await existing(dir, slug), 'attempts')
  noteOwnChange(attemptsDir)
  await mkdir(attemptsDir, { recursive: true })
  await writeFileAtomic(path.join(attemptsDir, `${attempt.at}.json`), JSON.stringify(stamp('attempt', attempt)))
}

export async function deleteProblem(dir: string, slug: string): Promise<void> {
  noteOwnChange(folder(dir, slug))
  await rm(folder(dir, slug), { recursive: true, force: true })
}
