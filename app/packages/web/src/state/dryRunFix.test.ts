import { CASE_MARK, RESULT_MARK } from '@dsa/core/cppHarness'
import type { DryRun } from '@dsa/core/dryRun'
import type { ProblemEntry } from '@dsa/core/problems'
import type { CodeRunner } from '@dsa/core/runner/types'
import { defaultWorkspace } from '@/lib/storage'
import { useAiChat } from './aiChat'
import { currentCode, dryRunSource, editCode, redoPrompt, useDryRunFix } from './dryRunFix'
import { usePlayground } from './playground'
import { useProblems } from './problems'
import { useWorkspace } from './workspace'

const run = (extra: Partial<DryRun> = {}): DryRun => ({
  id: 'old',
  title: 'Dry run: shiftRight',
  file: 'solution.cpp',
  problem: 'shift',
  input: 'arr = [1,2,3]',
  createdAt: 1,
  steps: [{ note: 'start' }],
  ...extra,
})

const entry: ProblemEntry = {
  slug: 'shift',
  problem: {
    title: 'Shift',
    difficulty: 'easy',
    description: '',
    params: [{ name: 'n', type: 'int' }],
    compare: 'exact',
    tests: [
      { input: ['1'], expected: '1', example: true, addedBy: 'problem' },
      { input: ['2'], expected: '2', example: false, addedBy: 'problem' },
    ],
    createdAt: 1,
  },
  solution: 'fixed code',
  versions: [],
  driver: '',
  solved: false,
  attempts: 0,
}

const out = (...answers: string[]) => answers.map((a) => `\n${RESULT_MARK}\n${a}\n${CASE_MARK}\n`).join('')
const runner = (stdout: string): CodeRunner => ({
  run: vi.fn(async () => ({ status: 'success' as const, statusText: 'Accepted', stdout, stderr: '', compileOutput: '', timeMs: 1, memoryKb: 1 })),
})

beforeEach(() => {
  useProblems.setState({ entries: [entry], activeSlug: null })
  usePlayground.setState({ runs: [run()], activeId: 'old' })
  useDryRunFix.setState({ redoing: null, redoError: null, tests: null })
  useAiChat.setState({ chats: [], activeChatId: null, status: 'idle' })
  useWorkspace.setState({ ...defaultWorkspace(), ready: true })
})

test('a dry run knows where its code lives', () => {
  expect(dryRunSource(run())).toEqual({ kind: 'problem', slug: 'shift', file: 'solution.cpp' })
  expect(dryRunSource(run({ problem: undefined, file: 'two_sum.cpp' }))).toEqual({ kind: 'file', name: 'two_sum.cpp' })
  expect(dryRunSource(run({ file: undefined }))).toBeNull()
})

test('the current code comes from the problem, and edits go back to it', () => {
  const source = dryRunSource(run())!
  expect(currentCode(source)).toBe('fixed code')
  const editCodeSpy = vi.fn()
  useProblems.setState({ editCode: editCodeSpy })
  editCode(source, 'new')
  expect(editCodeSpy).toHaveBeenCalledWith('shift', 'solution.cpp', 'new')
})

test('edits to a dry run of a solutions file go to that file', () => {
  const name = useWorkspace.getState().files[0].name
  const source = dryRunSource(run({ problem: undefined, file: name }))!
  editCode(source, 'int main() { return 1; }')
  expect(currentCode(source)).toBe('int main() { return 1; }')
})

test('Claude is asked for the same input on the changed code', () => {
  const prompt = redoPrompt(run(), dryRunSource(run())!)
  expect(prompt).toContain('same input (arr = [1,2,3])')
  expect(prompt).toContain('problem "shift" and file "solution.cpp"')
  expect(prompt).toContain("Don't edit my code")
})

test('redo asks Claude, runs every test, and opens the new dry run when it arrives', async () => {
  const send = vi.fn(async () => {
    usePlayground.getState().add(run({ id: 'new', createdAt: 2 }))
  })
  useAiChat.setState({ send })
  await useDryRunFix.getState().redo(run(), { runner: runner(out('1', '2')) })
  expect(send).toHaveBeenCalledWith(expect.stringContaining('I changed my code'))
  expect(usePlayground.getState().activeId).toBe('new')
  expect(useDryRunFix.getState().redoing).toBeNull()
  await vi.waitFor(() => expect(useDryRunFix.getState().tests?.status).toBe('done'))
  expect(useDryRunFix.getState().tests).toMatchObject({ forRuns: ['old', 'new'], result: { passed: 2, total: 2 } })
})

test('if Claude makes no dry run, the Playground says so', async () => {
  useAiChat.setState({ send: vi.fn(async () => {}) })
  await useDryRunFix.getState().redo(run(), { runner: runner(out('1', '2')) })
  expect(useDryRunFix.getState().redoError).toMatch(/didn’t make a new dry run/)
})

test('nothing happens while Claude is busy, or for a dry run without code', async () => {
  const send = vi.fn(async () => {})
  useAiChat.setState({ send, status: 'streaming' })
  await useDryRunFix.getState().redo(run())
  useAiChat.setState({ status: 'idle' })
  await useDryRunFix.getState().redo(run({ file: undefined }))
  expect(send).not.toHaveBeenCalled()
})
