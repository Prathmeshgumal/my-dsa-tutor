// Practice problems on disk, one folder each:
//   problems/<slug>/problem.json   description, params, tests
//   problems/<slug>/driver.cpp     hidden main() that feeds the tests to Solution
//   problems/<slug>/solution.cpp   the student's code
//   problems/<slug>/attempts/<time>.json   one per Submit
// Used by the /api/problems routes and by Claude's problem tools.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isSlug, uniqueSlug, type Attempt, type Problem, type ProblemEntry, type TestCase } from '../src/lib/problems.ts'

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
          return JSON.parse(await readFile(path.join(attemptsDir, n), 'utf8')) as Attempt
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
    problem = JSON.parse(await readFile(path.join(base, 'problem.json'), 'utf8')) as Problem
  } catch {
    throw new ProblemNotFound(`There's no problem called "${slug}".`)
  }
  const attempts = await listAttempts(dir, slug)
  return {
    slug,
    problem,
    solution: await readText(path.join(base, 'solution.cpp')),
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

export async function createProblem(
  dir: string,
  { problem, solution, driver }: { problem: Problem; solution: string; driver: string },
): Promise<string> {
  const slug = uniqueSlug(problem.title, await slugs(dir))
  const base = folder(dir, slug)
  await mkdir(path.join(base, 'attempts'), { recursive: true })
  await writeFile(path.join(base, 'problem.json'), JSON.stringify(problem, null, 2), 'utf8')
  await writeFile(path.join(base, 'driver.cpp'), driver, 'utf8')
  await writeFile(path.join(base, 'solution.cpp'), solution, 'utf8')
  return slug
}

async function existing(dir: string, slug: string): Promise<string> {
  const base = folder(dir, slug)
  if (!(await isDir(base))) throw new ProblemNotFound(`There's no problem called "${slug}".`)
  return base
}

export async function writeSolution(dir: string, slug: string, content: string): Promise<void> {
  await writeFile(path.join(await existing(dir, slug), 'solution.cpp'), content, 'utf8')
}

export async function writeTests(dir: string, slug: string, tests: TestCase[]): Promise<void> {
  const { problem } = await readEntry(dir, slug)
  await writeFile(path.join(folder(dir, slug), 'problem.json'), JSON.stringify({ ...problem, tests }, null, 2), 'utf8')
}

export async function saveAttempt(dir: string, slug: string, attempt: Attempt): Promise<void> {
  const attemptsDir = path.join(await existing(dir, slug), 'attempts')
  await mkdir(attemptsDir, { recursive: true })
  await writeFile(path.join(attemptsDir, `${attempt.at}.json`), JSON.stringify(attempt), 'utf8')
}

export async function deleteProblem(dir: string, slug: string): Promise<void> {
  await rm(folder(dir, slug), { recursive: true, force: true })
}
