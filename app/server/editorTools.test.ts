// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { CodeRunner, RunResult } from '../src/lib/runner/types.ts'
import { createEditorTools, type ApprovalRequest, type EditorToolDeps } from './editorTools'

let dir: string
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
})
afterEach(() => rm(dir, { recursive: true, force: true }))

function setup(overrides: Partial<EditorToolDeps> = {}) {
  const runner = { run: vi.fn(async () => ok) } satisfies CodeRunner
  const approvals: ApprovalRequest[] = []
  const deps: EditorToolDeps = {
    dir,
    context: {
      activeFile: { name: 'sort.cpp', content: 'ignored: tools read from disk' },
      openFiles: ['sort.cpp', 'bfs.py'],
      lastRun: null,
    },
    runner,
    requestApproval: vi.fn(async (req: ApprovalRequest) => {
      approvals.push(req)
      return true
    }),
    onRun: vi.fn(),
    onFileChanged: vi.fn(),
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
  test('run_code runs the saved file with optional input and shows it in the output panel', async () => {
    const { tools, runner, deps } = setup()
    const text = (await tools.run_code({ name: 'bfs.py', stdin: '3\n1 2 3' })).text
    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'print("bfs")\n', stdin: '3\n1 2 3', language: expect.objectContaining({ id: 'python' }) }),
    )
    expect(deps.onRun).toHaveBeenCalledWith('bfs.py', ok)
    expect(text).toContain('Accepted')
    expect(text).toContain('0 1')
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
    expect(approvals).toEqual([{ kind: 'edit', file: 'sort.cpp', before: 'int a = 1;', after: 'int a = 2;', explanation: 'fix value' }])
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
