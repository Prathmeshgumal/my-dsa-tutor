// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { CodeRunner, RunResult } from '@dsa/core/runner/types'
import { createEditorTools, toSdkTools, type ApprovalRequest, type EditorToolDeps } from './editorTools'
import { CASE_MARK, RESULT_MARK } from '@dsa/core/cppHarness'
import { readEntry } from './problemStore.ts'

let dir: string
let notesDir: string
let playgroundDir: string
let problemsDir: string
const ok: RunResult = {
  status: 'success',
  statusText: 'Accepted',
  stdout: '0 1\n',
  stderr: '',
  compileOutput: '',
  timeMs: 12,
  memoryKb: 3400,
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'agent-'))
  await writeFile(path.join(dir, 'sort.cpp'), 'int main() {\n  int a = 1;\n  return 0;\n}\n')
  await writeFile(path.join(dir, 'bfs.py'), 'print("bfs")\n')
  notesDir = await mkdtemp(path.join(tmpdir(), 'agent-notes-'))
  playgroundDir = await mkdtemp(path.join(tmpdir(), 'agent-playground-'))
  problemsDir = await mkdtemp(path.join(tmpdir(), 'agent-problems-'))
  await writeFile(path.join(notesDir, 'note-1.md'), '# Two pointers\n\n- works on sorted arrays\n')
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
  await rm(notesDir, { recursive: true, force: true })
  await rm(playgroundDir, { recursive: true, force: true })
  await rm(problemsDir, { recursive: true, force: true })
})

function setup(overrides: Partial<EditorToolDeps> = {}) {
  const runner = { run: vi.fn(async () => ok) } satisfies CodeRunner
  const approvals: ApprovalRequest[] = []
  const deps: EditorToolDeps = {
    dir,
    notesDir,
    playgroundDir,
    problemsDir,
    context: {
      activeFile: { name: 'sort.cpp', content: 'ignored: tools read from disk' },
      openFiles: ['sort.cpp', 'bfs.py'],
      lastRun: null,
      openNote: null,
      openProblem: null,
    },
    runner,
    requestApproval: vi.fn(async (req: ApprovalRequest) => {
      approvals.push(req)
      return true
    }),
    onRun: vi.fn(),
    onFileChanged: vi.fn(),
    onNoteChanged: vi.fn(),
    onVisualization: vi.fn(),
    onProblemChanged: vi.fn(),
    ...overrides,
  }
  return { tools: createEditorTools(deps), deps, runner, approvals }
}

describe('reading', () => {
  test('get_editor_state names the open file and tabs', async () => {
    const { tools } = setup()
    const text = (await tools.get_editor_state({})).text
    expect(text).toContain('sort.cpp')
    expect(text).toContain('bfs.py')
    expect(text).toContain('C++')
  })

  test('list_files lists solution files with their size', async () => {
    const text = (await setup().tools.list_files({})).text
    expect(text).toMatch(/bfs\.py.*1 line/)
    expect(text).toMatch(/sort\.cpp.*4 lines/)
  })

  test('read_file shows numbered lines, optionally a range', async () => {
    const { tools } = setup()
    expect((await tools.read_file({ name: 'sort.cpp' })).text).toContain('2\t  int a = 1;')
    const part = (await tools.read_file({ name: 'sort.cpp', start_line: 2, end_line: 3 })).text
    expect(part).toContain('2\t  int a = 1;')
    expect(part).not.toContain('int main')
  })

  test.each(['../secret.cpp', '.env', 'notes.txt', 'missing.cpp'])('read_file refuses %s', async (name) => {
    const result = await setup().tools.read_file({ name })
    expect(result.isError).toBe(true)
  })

  test('get_last_run reports the output panel, or that nothing ran yet', async () => {
    expect((await setup().tools.get_last_run({})).text).toMatch(/hasn’t run/i)
    const { tools } = setup({
      context: {
        activeFile: null,
        openFiles: [],
        lastRun: { file: 'sort.cpp', result: { ...ok, status: 'compile_error', statusText: 'Compilation Error', compileOutput: "error: expected ';'" } },
      },
    })
    const text = (await tools.get_last_run({})).text
    expect(text).toContain('sort.cpp')
    expect(text).toContain('Compilation Error')
    expect(text).toContain("error: expected ';'")
  })
})

describe('running', () => {
  test('get_last_run says what input the run got, and when there was none', async () => {
    const lastRun = { file: 'sort.cpp', result: ok, stdin: '' }
    const { tools } = setup({ context: { activeFile: null, openFiles: [], lastRun, openNote: null, openProblem: null } })
    expect((await tools.get_last_run({})).text).toContain('Input (stdin):\n(nothing typed)')
  })

  test('run_code runs the saved file with optional input and shows it in the output panel', async () => {
    const { tools, runner, deps } = setup()
    const text = (await tools.run_code({ name: 'bfs.py', stdin: '3\n1 2 3' })).text
    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'print("bfs")\n', stdin: '3\n1 2 3', language: expect.objectContaining({ id: 'python' }) }),
    )
    expect(deps.onRun).toHaveBeenCalledWith('bfs.py', ok, '3\n1 2 3')
    expect(text).toContain('Accepted')
    expect(text).toContain('0 1')
    expect(text).toContain('Input (stdin):\n3\n1 2 3')
  })

  test('run_code defaults to the open file', async () => {
    const { tools, runner } = setup()
    await tools.run_code({})
    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({ source: expect.stringContaining('int main') }))
  })

  test('run_code reports runner failures as tool errors', async () => {
    const { tools } = setup({ runner: { run: async () => Promise.reject(new Error('Couldn’t reach Piston')) } })
    const result = await tools.run_code({})
    expect(result.isError).toBe(true)
    expect(result.text).toContain('Couldn’t reach Piston')
  })
})

describe('changing files (always asks first)', () => {
  test('edit_file asks with the exact before/after, then applies it', async () => {
    const { tools, approvals, deps } = setup()
    const result = await tools.edit_file({ name: 'sort.cpp', old_text: 'int a = 1;', new_text: 'int a = 2;', explanation: 'fix value' })
    expect(approvals).toEqual([
      {
        kind: 'edit',
        file: 'sort.cpp',
        before: 'int a = 1;',
        after: 'int a = 2;',
        explanation: 'fix value',
        change: { type: 'edit_file', name: 'sort.cpp', oldText: 'int a = 1;', newText: 'int a = 2;' },
      },
    ])
    expect(await readFile(path.join(dir, 'sort.cpp'), 'utf8')).toContain('int a = 2;')
    expect(result.isError).toBeFalsy()
    expect(deps.onFileChanged).toHaveBeenCalledWith('sort.cpp')
  })

  test('a rejected edit leaves the file alone and tells Claude', async () => {
    const { tools, deps } = setup({ requestApproval: async () => false })
    const result = await tools.edit_file({ name: 'sort.cpp', old_text: 'int a = 1;', new_text: 'int a = 2;', explanation: '' })
    expect(await readFile(path.join(dir, 'sort.cpp'), 'utf8')).toContain('int a = 1;')
    expect(result.text).toMatch(/declined/i)
    expect(deps.onFileChanged).not.toHaveBeenCalled()
  })

  test('edit_file needs text that appears exactly once (no approval asked otherwise)', async () => {
    await writeFile(path.join(dir, 'dup.cpp'), 'x;\nx;\n')
    const { tools, approvals } = setup()
    expect((await tools.edit_file({ name: 'sort.cpp', old_text: 'nope', new_text: 'y', explanation: '' })).isError).toBe(true)
    expect((await tools.edit_file({ name: 'dup.cpp', old_text: 'x;', new_text: 'y;', explanation: '' })).isError).toBe(true)
    expect(approvals).toEqual([])
  })

  test('create_file asks, then writes a new file; it never overwrites', async () => {
    const { tools, approvals } = setup()
    await tools.create_file({ name: 'brute.cpp', content: 'int main(){}', explanation: 'brute force to compare' })
    expect(approvals[0]).toMatchObject({ kind: 'create', file: 'brute.cpp', before: '', after: 'int main(){}' })
    expect(await readFile(path.join(dir, 'brute.cpp'), 'utf8')).toBe('int main(){}')
    expect((await tools.create_file({ name: 'sort.cpp', content: 'x', explanation: '' })).isError).toBe(true)
    expect((await tools.create_file({ name: '../escape.cpp', content: 'x', explanation: '' })).isError).toBe(true)
  })
})

describe('notes', () => {
  test('list_notes shows each note with its title', async () => {
    const text = (await setup().tools.list_notes({})).text
    expect(text).toContain('note-1.md')
    expect(text).toContain('Two pointers')
  })

  test('read_note returns the markdown', async () => {
    expect((await setup().tools.read_note({ name: 'note-1.md' })).text).toContain('- works on sorted arrays')
    expect((await setup().tools.read_note({ name: '../x.md' })).isError).toBe(true)
    expect((await setup().tools.read_note({ name: 'main.cpp' })).isError).toBe(true)
  })

  test('create_note asks first, then saves it under the next free name', async () => {
    const { tools, approvals, deps } = setup()
    const result = await tools.create_note({ content: '# Two Sum approaches\n\n1. Brute force', explanation: 'save the plan' })
    expect(approvals[0]).toMatchObject({ kind: 'create_note', file: 'note-2.md', before: '', after: '# Two Sum approaches\n\n1. Brute force' })
    expect(await readFile(path.join(notesDir, 'note-2.md'), 'utf8')).toBe('# Two Sum approaches\n\n1. Brute force')
    expect(deps.onNoteChanged).toHaveBeenCalledWith('note-2.md')
    expect(result.text).toContain('note-2.md')
  })

  test('edit_note asks first, then replaces the exact text', async () => {
    const { tools, approvals, deps } = setup()
    await tools.edit_note({ name: 'note-1.md', old_text: '- works on sorted arrays', new_text: '- works on sorted arrays\n- O(n)', explanation: '' })
    expect(approvals[0]).toMatchObject({ kind: 'edit_note', file: 'note-1.md' })
    expect(await readFile(path.join(notesDir, 'note-1.md'), 'utf8')).toContain('- O(n)')
    expect(deps.onNoteChanged).toHaveBeenCalledWith('note-1.md')
  })

  test('declined note changes are not written', async () => {
    const { tools, deps } = setup({ requestApproval: async () => false })
    await tools.create_note({ content: '# x', explanation: '' })
    await tools.edit_note({ name: 'note-1.md', old_text: '# Two pointers', new_text: '# Changed', explanation: '' })
    expect(await readFile(path.join(notesDir, 'note-1.md'), 'utf8')).toContain('# Two pointers')
    expect(deps.onNoteChanged).not.toHaveBeenCalled()
  })
})

describe('visualizations', () => {
  const steps = [
    { line: 2, note: 'a starts at 1', vars: { a: 1 }, structures: [{ kind: 'array' as const, name: 'arr', values: [3, 1, 2], pointers: { i: 0 } }] },
    { line: 3, note: 'return', vars: { a: 1 } },
  ]

  test('create_visualization uses the real file as the code, saves it and shows it in the Playground', async () => {
    const { tools, deps } = setup()
    const result = await tools.create_visualization({ title: 'Dry run of sort.cpp', file: 'sort.cpp', input: '3 1 2', steps })
    expect(result.isError).toBeFalsy()
    const run = vi.mocked(deps.onVisualization).mock.calls[0][0]
    expect(run).toMatchObject({ title: 'Dry run of sort.cpp', file: 'sort.cpp', language: 'cpp', input: '3 1 2', steps })
    expect(run.code).toContain('int a = 1;')
    const saved = JSON.parse(await readFile(path.join(playgroundDir, `${run.id}.json`), 'utf8'))
    expect(saved).toEqual({ ...run, formatVersion: 1 })
    expect(result.text).toContain('Playground')
  })

  test('create_visualization keeps the expected answer and each step’s phase', async () => {
    const { tools, deps } = setup()
    const phased = [{ ...steps[0], phase: 'Set up' }, ...steps.slice(1)]
    await tools.create_visualization({ title: 'x', file: 'sort.cpp', input: '3 1 2', expected: '1 2 3', steps: phased })
    expect(vi.mocked(deps.onVisualization).mock.calls[0][0]).toMatchObject({ expected: '1 2 3', steps: phased })
  })

  test('the model is told about expected and phase', () => {
    const viz = toSdkTools(setup().tools).find((t) => t.name === 'create_visualization')!
    const shape = viz.inputSchema as unknown as { expected?: unknown; steps: { element: { shape: Record<string, unknown> } } }
    expect(shape.expected).toBeDefined()
    expect(shape.steps.element.shape).toHaveProperty('phase')
  })

  test('without a file it can still visualize an idea (no code panel)', async () => {
    const { tools, deps } = setup()
    await tools.create_visualization({ title: 'Two pointers idea', steps: [{ note: 'start', structures: [] }] })
    expect(vi.mocked(deps.onVisualization).mock.calls[0][0].code).toBeUndefined()
  })

  test('a broken trace is sent back to Claude to fix, and nothing is saved', async () => {
    const { tools, deps } = setup()
    const result = await tools.create_visualization({ title: 'x', file: 'sort.cpp', steps: [{ line: 99, note: 'nope' }] })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/line 99/)
    expect(deps.onVisualization).not.toHaveBeenCalled()
  })
})

describe('problems', () => {
  const twoSum = {
    title: 'Two Sum',
    difficulty: 'easy' as const,
    description: 'Return indices of the two numbers that add up to target.',
    params: [
      { name: 'nums', type: 'vector<int>' },
      { name: 'target', type: 'int' },
    ],
    tests: [
      { input: ['[2,7,11,15]', '9'], expected: '[0,1]', example: true },
      { input: ['[3,3]', '6'], expected: '[0,1]', example: false },
    ],
    starter: 'class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n    }\n};\n',
    driver: 'int main() { judge::run([] { auto n = judge::read<vector<int>>(); auto t = judge::read<int>(); return Solution().twoSum(n, t); }); }',
    explanation: 'Set up Two Sum',
  }
  const out = (...answers: string[]) => answers.map((a) => `\n${RESULT_MARK}\n${a}\n${CASE_MARK}\n`).join('')

  test('create_problem checks it compiles, asks, saves and opens it', async () => {
    const { tools, deps, approvals, runner } = setup()
    const res = await tools.create_problem(twoSum)
    expect(res.isError).toBeFalsy()
    expect(runner.run).toHaveBeenCalledTimes(1)
    expect(approvals[0]).toMatchObject({ kind: 'create_problem', file: 'Two Sum' })
    expect(approvals[0].after).toContain('`nums = [2,7,11,15], target = 9` → `[0,1]` (example)')
    expect(deps.onProblemChanged).toHaveBeenCalledWith('two-sum', true)
    const entry = await readEntry(problemsDir, 'two-sum')
    expect(entry.solution).toBe(twoSum.starter)
    expect(entry.problem.tests[1]).toEqual({ input: ['[3,3]', '6'], expected: '[0,1]', example: false, addedBy: 'problem' })
  })

  test('create_problem refuses a driver that does not compile', async () => {
    const runner = { run: vi.fn(async () => ({ ...ok, status: 'compile_error' as const, compileOutput: 'driver.cpp:1: error' })) }
    const { tools, approvals } = setup({ runner })
    const res = await tools.create_problem(twoSum)
    expect(res.isError).toBe(true)
    expect(res.text).toContain('driver.cpp:1: error')
    expect(approvals).toHaveLength(0)
  })

  test('create_problem refuses tests that do not match the parameters', async () => {
    const { tools } = setup()
    const res = await tools.create_problem({ ...twoSum, tests: [{ input: ['[1]'], expected: '1', example: true }] })
    expect(res.isError).toBe(true)
    expect(res.text).toContain('1 input lines but there are 2 params')
  })

  test('the problem on screen is the default for the other tools', async () => {
    await setup().tools.create_problem(twoSum)
    const runner = { run: vi.fn(async () => ({ ...ok, stdout: out('[0,1]', '[1,0]') })) }
    const { tools } = setup({
      runner,
      context: { activeFile: null, openFiles: [], lastRun: null, openNote: null, openProblem: { slug: 'two-sum', title: 'Two Sum' } },
    })
    expect((await tools.get_problem({})).text).toContain('3\t    vector<int> twoSum')
    const run = (await tools.run_tests({ all: true })).text
    expect(run).toContain('Wrong Answer: 1/2 cases passed')
    expect(run).toContain('Case 2 [fail]: nums = [3,3], target = 6 → expected [0,1], got [1,0]')
    expect((await tools.list_problems({})).text).toContain('two-sum: Two Sum (easy), 0 attempts')
  })

  test('add_test_case and edit_solution need approval and tell the screen to reload', async () => {
    await setup().tools.create_problem(twoSum)
    const { tools, deps, approvals } = setup()
    await tools.add_test_case({ slug: 'two-sum', input: ['[1,5,5]', '10'], expected: '[1,2]', explanation: 'duplicates' })
    await tools.edit_solution({ slug: 'two-sum', old_text: '    }\n};', new_text: '        return {};\n    }\n};', explanation: 'compile' })
    expect(approvals.map((a) => a.kind)).toEqual(['add_test', 'edit_solution'])
    const entry = await readEntry(problemsDir, 'two-sum')
    expect(entry.problem.tests.at(-1)).toEqual({ input: ['[1,5,5]', '10'], expected: '[1,2]', example: false, addedBy: 'claude' })
    expect(entry.solution).toContain('return {};')
    expect(deps.onProblemChanged).toHaveBeenCalledWith('two-sum', false)
  })

  test('tools explain when no problem is open or it does not exist', async () => {
    const { tools } = setup()
    expect((await tools.get_problem({})).text).toContain('No problem is open')
    expect((await tools.get_problem({ slug: 'nope' })).text).toContain('list_problems')
  })

  test('dry runs and notes made while a problem is open belong to it', async () => {
    await setup().tools.create_problem(twoSum)
    const open = { activeFile: null, openFiles: [], lastRun: null, openNote: null, openProblem: { slug: 'two-sum', title: 'Two Sum' } }
    const { tools, deps } = setup({ context: open })
    const viz = await tools.create_visualization({ title: 'Dry run', problem: 'two-sum', steps: [{ line: 3, note: 'start' }] })
    expect(viz.isError).toBeFalsy()
    const run = (deps.onVisualization as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(run).toMatchObject({ problem: 'two-sum', file: 'solution.cpp', code: twoSum.starter })
    await tools.create_note({ content: '# Two Sum tricks\n', explanation: 'save' })
    expect((await readEntry(problemsDir, 'two-sum')).problem.notes).toEqual(['note-2.md'])
    const text = (await tools.get_problem({})).text
    expect(text).toContain('Notes linked to it: note-2.md')
    expect(text).toContain('Dry runs of it: "Dry run" (1 steps)')
  })

  test('save_code_version adds a version that edit_solution and run_tests can use', async () => {
    await setup().tools.create_problem(twoSum)
    const runner = { run: vi.fn(async () => ({ ...ok, stdout: out('[0,1]') })) }
    const { tools, approvals } = setup({ runner })
    await tools.save_code_version({ slug: 'two-sum', name: 'brute-force.cpp', content: 'class Solution { int x; };', explanation: 'compare' })
    expect(approvals[0]).toMatchObject({ kind: 'create', file: 'two-sum/brute-force.cpp' })
    await tools.edit_solution({ slug: 'two-sum', file: 'brute-force.cpp', old_text: 'int x;', new_text: 'int y;', explanation: 'rename' })
    expect((await readEntry(problemsDir, 'two-sum')).versions).toEqual([{ name: 'brute-force.cpp', content: 'class Solution { int y; };' }])
    const run = await tools.run_tests({ slug: 'two-sum', file: 'brute-force.cpp' })
    expect(run.text).toMatch(/^brute-force\.cpp: Accepted/)
    expect(runner.run.mock.calls.at(-1)![0].source).toContain('int y;')
    expect((await tools.run_tests({ slug: 'two-sum', file: 'nope.cpp' })).text).toContain('its code files are solution.cpp, brute-force.cpp')
  })
})
