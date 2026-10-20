import { describe, expect, it } from 'vitest'
import { CASE_MARK, RESULT_MARK } from './cppHarness'
import {
  buildStdin,
  casesFor,
  describeInput,
  judgeOutput,
  problemProblems,
  runTests,
  sameAnswer,
  slugify,
  uniqueSlug,
  type Problem,
  type TestCase,
} from './problems'
import type { CodeRunner, RunResult } from './runner/types'

const tc = (input: string[], expected: string, extra: Partial<TestCase> = {}): TestCase => ({
  input,
  expected,
  example: false,
  addedBy: 'problem',
  ...extra,
})

const caseOut = (output: string, printed = '') => `${printed}\n${RESULT_MARK}\n${output}\n${CASE_MARK}\n`

const problem: Problem = {
  title: 'Two Sum',
  difficulty: 'easy',
  description: 'Find two numbers.',
  params: [
    { name: 'nums', type: 'vector<int>' },
    { name: 'target', type: 'int' },
  ],
  compare: 'exact',
  tests: [
    tc(['[2,7,11,15]', '9'], '[0,1]', { example: true }),
    tc(['[3,2,4]', '6'], '[1,2]'),
    tc(['[3,3]', '6'], '[0,1]', { addedBy: 'user' }),
  ],
  createdAt: 1,
}

const ok = (stdout: string): RunResult => ({
  status: 'success',
  statusText: 'Accepted',
  stdout,
  stderr: '',
  compileOutput: '',
  timeMs: 4,
  memoryKb: 100,
})

describe('slugs', () => {
  it('turns a title into a folder name', () => {
    expect(slugify('Two Sum II — Input Array Is Sorted')).toBe('two-sum-ii-input-array-is-sorted')
    expect(slugify('!!!')).toBe('problem')
  })

  it('adds a number when the name is taken', () => {
    expect(uniqueSlug('Two Sum', [])).toBe('two-sum')
    expect(uniqueSlug('Two Sum', ['two-sum', 'two-sum-2'])).toBe('two-sum-3')
  })
})

describe('test input', () => {
  it('starts with the case count, then one line per value', () => {
    expect(buildStdin(problem.tests.slice(0, 2))).toBe('2\n[2,7,11,15]\n9\n[3,2,4]\n6\n')
  })

  it('names each value after its parameter', () => {
    expect(describeInput(problem.params, problem.tests[0])).toBe('nums = [2,7,11,15], target = 9')
  })

  it('Run checks examples and your own cases; Submit checks all', () => {
    expect(casesFor(problem, 'run')).toEqual([0, 2])
    expect(casesFor(problem, 'submit')).toEqual([0, 1, 2])
  })
})

describe('comparing answers', () => {
  it('ignores spacing', () => {
    expect(sameAnswer('[0, 1]', '[0,1]', 'exact')).toBe(true)
    expect(sameAnswer('[1,0]', '[0,1]', 'exact')).toBe(false)
  })

  it('can ignore order at the top level or at every level', () => {
    expect(sameAnswer('[[2,1],[3]]', '[[3],[2,1]]', 'any_order')).toBe(true)
    expect(sameAnswer('[[1,2],[3]]', '[[3],[2,1]]', 'any_order')).toBe(false)
    expect(sameAnswer('[[1,2],[3]]', '[[3],[2,1]]', 'any_order_nested')).toBe(true)
  })

  it('compares text that is not JSON as trimmed text', () => {
    expect(sameAnswer(' 2.50000 \n', '2.50000', 'exact')).toBe(true)
  })
})

describe('judgeOutput', () => {
  it('marks each case and keeps what the code printed', () => {
    const results = judgeOutput(caseOut('[0,1]', 'i=0') + caseOut('[2,1]'), problem.tests.slice(0, 2), 'exact', true)
    expect(results).toEqual([
      { status: 'pass', output: '[0,1]', stdout: 'i=0' },
      { status: 'fail', output: '[2,1]', stdout: '' },
    ])
  })

  it('blames the case that crashed and skips the rest', () => {
    const results = judgeOutput(caseOut('[0,1]') + 'about to crash', problem.tests, 'exact', false)
    expect(results.map((r) => r.status)).toEqual(['pass', 'error', 'not_run'])
    expect(results[1].stdout).toBe('about to crash')
  })
})

describe('runTests', () => {
  const runnerFor = (result: RunResult) => {
    const calls: { source: string; stdin: string }[] = []
    const runner: CodeRunner = {
      async run(req) {
        calls.push({ source: req.source, stdin: req.stdin })
        return result
      },
    }
    return { runner, calls }
  }

  it('compiles once with the solution and driver and checks the chosen cases', async () => {
    const { runner, calls } = runnerFor(ok(caseOut('[0,1]') + caseOut('[0,1]')))
    const run = await runTests(runner, { problem, solution: 'class Solution {};', driver: 'int main(){}' }, 'run')
    expect(calls).toHaveLength(1)
    expect(calls[0].source).toContain('#line 1 "solution.cpp"\nclass Solution {};')
    expect(calls[0].stdin).toBe('2\n[2,7,11,15]\n9\n[3,3]\n6\n')
    expect(run).toMatchObject({ cases: [0, 2], passed: 2, total: 2, statusText: 'Accepted' })
  })

  it('reports a wrong answer', async () => {
    const { runner } = runnerFor(ok(caseOut('[0,1]') + caseOut('[9,9]') + caseOut('[0,1]')))
    const run = await runTests(runner, { problem, solution: '', driver: '' }, 'submit')
    expect(run).toMatchObject({ passed: 2, total: 3, statusText: 'Wrong Answer' })
  })

  it('shows compiler errors and runs no cases', async () => {
    const { runner } = runnerFor({ ...ok(''), status: 'compile_error', statusText: 'Compilation Error', compileOutput: 'solution.cpp:3: error' })
    const run = await runTests(runner, { problem, solution: '', driver: '' }, 'submit')
    expect(run.errorText).toBe('solution.cpp:3: error')
    expect(run.results.every((r) => r.status === 'not_run')).toBe(true)
    expect(run.passed).toBe(0)
  })
})

describe('problemProblems', () => {
  it('accepts a good problem', () => {
    expect(problemProblems(problem)).toEqual([])
  })

  it('catches input that does not match the parameters', () => {
    const bad = { params: problem.params, tests: [tc(['[1]'], '', { example: true })] }
    expect(problemProblems(bad)).toEqual(['Test 1 has 1 input lines but there are 2 params.', 'Test 1 has no expected answer.'])
  })
})
