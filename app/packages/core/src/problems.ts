// A practice problem, LeetCode style: description, test cases, a hidden driver and the student's solution.
// Saved in problems/<slug>/ (problem.json, driver.cpp, solution.cpp, attempts/*.json). Shared by server and browser.
import { buildCppSource, CASE_MARK, RESULT_MARK } from './cppHarness.ts'
import { LANGUAGES } from './languages.ts'
import type { CodeRunner, RunResult } from './runner/types.ts'

export type Difficulty = 'easy' | 'medium' | 'hard'

/** How an answer is compared with the expected one. */
export type Compare = 'exact' | 'any_order' | 'any_order_nested'

export interface Param {
  name: string
  /** C++ type, e.g. vector<int> */
  type: string
}

export interface TestCase {
  /** One line per parameter, LeetCode style: `[2,7,11,15]`, `9`, `"abc"` */
  input: string[]
  expected: string
  /** Shown in the description and checked by Run. */
  example: boolean
  addedBy: 'problem' | 'user' | 'claude'
}

export interface Problem {
  title: string
  difficulty: Difficulty
  /** Markdown */
  description: string
  params: Param[]
  compare: Compare
  tests: TestCase[]
  createdAt: number
  /** Notes (in notes/) that belong to this problem */
  notes?: string[]
}

/** A C++ file in the problem's folder: solution.cpp, or another version such as brute-force.cpp. */
export interface CodeFile {
  name: string
  content: string
}

/** Everything the browser needs for one problem. */
export interface ProblemEntry {
  slug: string
  problem: Problem
  solution: string
  /** Other versions of the code, besides solution.cpp */
  versions: CodeFile[]
  driver: string
  solved: boolean
  attempts: number
}

export type CaseStatus = 'pass' | 'fail' | 'error' | 'not_run'

export interface CaseResult {
  status: CaseStatus
  /** The answer the code returned, as printed */
  output: string
  /** Anything the student's code printed itself while running this case */
  stdout: string
}

export interface TestRun {
  kind: 'run' | 'submit'
  /** Indices into problem.tests that ran */
  cases: number[]
  results: CaseResult[]
  /** compile_error / runtime_error / time_limit / internal_error stop the run part-way */
  status: RunResult['status']
  statusText: string
  /** Compiler errors, or the error output of the case that crashed */
  errorText: string
  timeMs: number | null
  passed: number
  total: number
}

export interface Attempt {
  at: number
  /** Which code file was submitted (solution.cpp if missing) */
  file?: string
  code: string
  passed: number
  total: number
  statusText: string
  results: CaseResult[]
}

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

/** "Two Sum II" → "two-sum-ii" */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return slug || 'problem'
}

/** A slug not in `taken`: two-sum, two-sum-2, two-sum-3… */
export function uniqueSlug(title: string, taken: string[]): string {
  const base = slugify(title)
  const used = new Set(taken)
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

export const isSlug = (s: string) => /^[a-z0-9][a-z0-9-]{0,79}$/.test(s)

export const SOLUTION_FILE = 'solution.cpp'

/** A code file name in a problem folder: brute-force.cpp, solution-2.cpp. Not the hidden driver. */
export const isCodeName = (name: string) => /^[a-z0-9][\w-]{0,59}\.cpp$/i.test(name) && name !== 'driver.cpp'

/** The code of one of a problem's files. */
export function codeOf(entry: Pick<ProblemEntry, 'solution' | 'versions'>, name: string): string | null {
  if (name === SOLUTION_FILE) return entry.solution
  return entry.versions.find((v) => v.name === name)?.content ?? null
}

/** A free name for a new version: solution-2.cpp, solution-3.cpp… */
export function nextVersionName(entry: Pick<ProblemEntry, 'versions'>): string {
  const taken = new Set([SOLUTION_FILE, ...entry.versions.map((v) => v.name)])
  let n = 2
  while (taken.has(`solution-${n}.cpp`)) n++
  return `solution-${n}.cpp`
}

/** Which cases a Run checks: the examples and the student's own cases. Submit checks all. */
export function casesFor(problem: Pick<Problem, 'tests'>, kind: TestRun['kind']): number[] {
  return problem.tests.flatMap((t, i) => (kind === 'submit' || t.example || t.addedBy === 'user' ? [i] : []))
}

export function buildStdin(tests: TestCase[]): string {
  return [String(tests.length), ...tests.flatMap((t) => t.input)].join('\n') + '\n'
}

/** "nums = [2,7,11,15], target = 9" */
export function describeInput(params: Param[], test: Pick<TestCase, 'input'>): string {
  return test.input.map((v, i) => `${params[i]?.name ?? `arg${i + 1}`} = ${v}`).join(', ')
}

function sortDeep(value: unknown, nested: boolean): unknown {
  if (!Array.isArray(value)) return value
  const items = nested ? value.map((v) => sortDeep(v, true)) : value
  return [...items].sort((a, b) => {
    const x = JSON.stringify(a)
    const y = JSON.stringify(b)
    return x < y ? -1 : x > y ? 1 : 0
  })
}

function normalize(text: string, compare: Compare): string {
  const trimmed = text.trim()
  let value: unknown
  try {
    value = JSON.parse(trimmed)
  } catch {
    return trimmed
  }
  return JSON.stringify(compare === 'exact' ? value : sortDeep(value, compare === 'any_order_nested'))
}

export function sameAnswer(output: string, expected: string, compare: Compare): boolean {
  return normalize(output, compare) === normalize(expected, compare)
}

/** Splits one program run into per-case results. */
export function judgeOutput(
  stdout: string,
  tests: Pick<TestCase, 'expected'>[],
  compare: Compare,
  finished: boolean,
): CaseResult[] {
  const chunks = stdout.split(`\n${CASE_MARK}\n`)
  return tests.map((test, i) => {
    const chunk = chunks[i]
    const complete = i < chunks.length - 1
    if (chunk === undefined || !complete) {
      // The case that was running when the program stopped gets its printed text; later ones never started.
      const stdout = chunk?.split(`\n${RESULT_MARK}\n`)[0].replace(/^\n/, '') ?? ''
      const status: CaseStatus = !finished && chunk !== undefined && i === chunks.length - 1 ? 'error' : 'not_run'
      return { status, output: '', stdout: status === 'error' ? stdout : '' }
    }
    const at = chunk.lastIndexOf(`\n${RESULT_MARK}\n`)
    const output = at === -1 ? '' : chunk.slice(at + RESULT_MARK.length + 2)
    const printed = (at === -1 ? chunk : chunk.slice(0, at)).replace(/^\n/, '')
    return { status: sameAnswer(output, test.expected, compare) ? 'pass' : 'fail', output, stdout: printed }
  })
}

/** Compiles the solution once and checks the chosen cases. */
export async function runTests(
  runner: CodeRunner,
  entry: Pick<ProblemEntry, 'problem' | 'solution' | 'driver'>,
  kind: TestRun['kind'],
  signal?: AbortSignal,
): Promise<TestRun> {
  const cases = casesFor(entry.problem, kind)
  const tests = cases.map((i) => entry.problem.tests[i])
  const result = await runner.run(
    { language: LANGUAGES.cpp, source: buildCppSource(entry.solution, entry.driver), stdin: buildStdin(tests) },
    signal,
  )
  const finished = result.status === 'success'
  const results =
    result.status === 'compile_error'
      ? tests.map((): CaseResult => ({ status: 'not_run', output: '', stdout: '' }))
      : judgeOutput(result.stdout, tests, entry.problem.compare, finished)
  const passed = results.filter((r) => r.status === 'pass').length
  const errorText = result.status === 'compile_error' ? result.compileOutput || result.stderr : finished ? '' : result.stderr
  const statusText = finished ? (passed === tests.length ? 'Accepted' : 'Wrong Answer') : result.statusText
  return { kind, cases, results, status: result.status, statusText, errorText, timeMs: result.timeMs, passed, total: tests.length }
}

/** Problems with a problem Claude is creating; empty when it's fine. */
export function problemProblems(p: Pick<Problem, 'params' | 'tests'>): string[] {
  const problems: string[] = []
  if (!p.params.length) problems.push('List the function parameters in "params".')
  if (!p.tests.length) problems.push('Add at least one test case.')
  if (!p.tests.some((t) => t.example)) problems.push('Mark the examples from the problem with example: true.')
  p.tests.forEach((t, i) => {
    if (t.input.length !== p.params.length) {
      problems.push(`Test ${i + 1} has ${t.input.length} input lines but there are ${p.params.length} params.`)
    }
    if (t.input.some((line) => line.includes('\n'))) problems.push(`Test ${i + 1}: each input value must be on one line.`)
    if (!t.expected.trim()) problems.push(`Test ${i + 1} has no expected answer.`)
  })
  return problems
}
