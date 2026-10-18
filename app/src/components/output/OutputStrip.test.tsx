import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RunnerError, type RunResult } from '@/lib/runner/types'
import { useRun } from '@/state/run'
import { useSettings } from '@/state/settings'
import { focusEditor } from '@/components/editor/editorFocus'
import { OutputStrip } from './OutputStrip'

vi.mock('@/components/editor/editorFocus', () => ({ focusEditor: vi.fn(), registerEditor: vi.fn(() => () => {}) }))


const ok: RunResult = {
  status: 'success',
  statusText: 'Accepted',
  stdout: '',
  stderr: '',
  compileOutput: '',
  timeMs: 12,
  memoryKb: 900,
}

beforeEach(() => {
  useSettings.setState({ outputOpen: false })
  useRun.setState({ state: 'idle', result: null, error: null })
})

test('clicking the strip opens the output', async () => {
  render(<OutputStrip />)
  await userEvent.click(screen.getByRole('button', { name: /show output/i }))
  expect(useSettings.getState().outputOpen).toBe(true)
})

test('shows the last result and its time', () => {
  useRun.setState({ state: 'done', result: ok })
  render(<OutputStrip />)
  expect(screen.getByText('Success')).toBeInTheDocument()
  expect(screen.getByText('12 ms')).toBeInTheDocument()
})

test('shows a compile error result', () => {
  useRun.setState({
    state: 'done',
    result: { ...ok, status: 'compile_error', statusText: 'Compilation Error', timeMs: null },
  })
  render(<OutputStrip />)
  expect(screen.getByText('Compilation error')).toBeInTheDocument()
})

test('shows a runner error', () => {
  useRun.setState({ state: 'error', error: new RunnerError('network', 'Couldn’t reach Piston') })
  render(<OutputStrip />)
  expect(screen.getByText('Run failed')).toBeInTheDocument()
})

test('idle → "No runs yet"', () => {
  render(<OutputStrip />)
  expect(screen.getByText('No runs yet')).toBeInTheDocument()
})

test('expanding from the strip returns the cursor to the editor', async () => {
  vi.mocked(focusEditor).mockClear()
  render(<OutputStrip />)
  await userEvent.click(screen.getByRole('button', { name: /show output/i }))
  expect(focusEditor).toHaveBeenCalled()
})
