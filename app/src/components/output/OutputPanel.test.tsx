import { render as rtlRender, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useSettings } from '@/state/settings'
import { mockMatchMedia } from '@/test/matchMedia'
import { RunnerError, type RunResult } from '@/lib/runner/types'
import { useRun } from '@/state/run'
import { useStdin } from '@/state/stdin'
import { useWorkspace } from '@/state/workspace'
import userEvent from '@testing-library/user-event'
import { OutputPanel } from './OutputPanel'

vi.mock('@/components/editor/editorFocus', () => ({ focusEditor: vi.fn(), registerEditor: vi.fn(() => () => {}) }))


// The app provides tooltips from AppShell; isolated renders need the provider too.
const render = (ui: React.ReactElement) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>)

const base: RunResult = {
  status: 'success',
  statusText: 'Accepted',
  stdout: '0 1\n',
  stderr: '',
  compileOutput: '',
  timeMs: 12,
  memoryKb: 3400,
}

function showResult(result: Partial<RunResult>) {
  useRun.setState({ state: 'done', result: { ...base, ...result }, error: null })
}

beforeEach(() => {
  mockMatchMedia(() => false)
  useSettings.setState({ outputPosition: 'right' })
  useRun.setState({ state: 'idle', result: null, error: null, connection: 'connected' })
})

test('idle shows run hint', () => {
  render(<OutputPanel />)
  expect(
    screen.getByText((_, el) => el?.tagName === 'P' && /Press (⌘↵|Ctrl ↵) to run/.test(el.textContent ?? '')),
  ).toBeInTheDocument()
})

test('running shows progress', () => {
  useRun.setState({ state: 'running' })
  render(<OutputPanel />)
  expect(screen.getByText('Running…')).toBeInTheDocument()
})

test('success shows green "Success" badge, stdout, "12 ms", "3.3 MB"', () => {
  showResult({})
  render(<OutputPanel />)
  expect(screen.getByTestId('status-badge')).toHaveTextContent('Success')
  expect(screen.getByTestId('status-badge')).toHaveAttribute('data-tone', 'success')
  expect(screen.getByTestId('stdout')).toHaveTextContent('0 1')
  expect(screen.getByText('12 ms')).toBeInTheDocument()
  expect(screen.getByText('3.3 MB')).toBeInTheDocument()
})

test('small memory is shown in KB', () => {
  showResult({ memoryKb: 900 })
  render(<OutputPanel />)
  expect(screen.getByText('900 KB')).toBeInTheDocument()
})

test('success with empty stdout says so', () => {
  showResult({ stdout: '' })
  render(<OutputPanel />)
  expect(screen.getByTestId('stdout')).toHaveTextContent('(no output)')
})

test('compile_error switches to Errors tab and shows compileOutput; badge count 1', () => {
  showResult({
    status: 'compile_error',
    statusText: 'Compilation Error',
    stdout: '',
    compileOutput: "error: expected ';'",
  })
  render(<OutputPanel />)
  expect(screen.getByRole('tab', { name: /errors/i })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tab', { name: /errors/i })).toHaveTextContent('1')
  expect(screen.getByTestId('errors')).toHaveTextContent("error: expected ';'")
  expect(screen.getByTestId('status-badge')).toHaveTextContent('Compilation error')
  expect(screen.getByTestId('status-badge')).toHaveAttribute('data-tone', 'error')
})

test('time_limit shows amber "Time limit exceeded"', () => {
  showResult({ status: 'time_limit', statusText: 'Time Limit Exceeded', stdout: '' })
  render(<OutputPanel />)
  expect(screen.getByTestId('status-badge')).toHaveTextContent('Time limit exceeded')
  expect(screen.getByTestId('status-badge')).toHaveAttribute('data-tone', 'warning')
})

test('runtime_error shows red badge with statusText and stderr', () => {
  showResult({
    status: 'runtime_error',
    statusText: 'Runtime Error (SIGSEGV)',
    stdout: '',
    stderr: 'Segmentation fault',
  })
  render(<OutputPanel />)
  expect(screen.getByTestId('status-badge')).toHaveTextContent('Runtime Error (SIGSEGV)')
  expect(screen.getByTestId('status-badge')).toHaveAttribute('data-tone', 'error')
  expect(screen.getByTestId('errors')).toHaveTextContent('Segmentation fault')
})

test('Errors tab count is 0 on success', () => {
  showResult({})
  render(<OutputPanel />)
  expect(screen.getByRole('tab', { name: /errors/i })).toHaveTextContent('0')
  expect(screen.getByRole('tab', { name: /output/i })).toHaveAttribute('aria-selected', 'true')
})

test('runner error shows message inline', () => {
  useRun.setState({
    state: 'error',
    error: new RunnerError('quota', 'Daily Judge0 quota used up. Try again tomorrow.'),
  })
  render(<OutputPanel />)
  expect(screen.getByRole('alert')).toHaveTextContent('Daily Judge0 quota used up. Try again tomorrow.')
})

test('the output panel has no layout buttons (they live in the status bar)', () => {
  render(<OutputPanel />)
  expect(screen.queryByRole('button', { name: /output options|collapse output/i })).not.toBeInTheDocument()
})

describe('program input', () => {
  beforeEach(() => {
    useStdin.setState({ inputs: {} })
    useWorkspace.setState({
      files: [{ id: 'f1', name: 'arrays.cpp', content: 'int x; cin >> x;' }],
      openIds: ['f1'],
      activeId: 'f1',
      ready: true,
    })
  })

  test('the Input tab holds what the program reads, for the open file', async () => {
    render(<OutputPanel />)
    await userEvent.click(screen.getByRole('tab', { name: /input/i }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Program input' }), '4 5')
    expect(useStdin.getState().inputs).toEqual({ f1: '4 5' })
  })

  test('code that reads input with an empty box gets a warning that opens the Input tab', async () => {
    render(<OutputPanel />)
    expect(screen.getByRole('note')).toHaveTextContent(/reads input, but the Input box is empty/)
    await userEvent.click(screen.getByRole('button', { name: 'Add input' }))
    expect(screen.getByRole('textbox', { name: 'Program input' })).toBeInTheDocument()
  })

  test('no warning once there is input', () => {
    useStdin.setState({ inputs: { f1: '3' } })
    render(<OutputPanel />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})

test('the output shows what input the run was given', () => {
  useRun.setState({ state: 'done', result: base, error: null, lastStdin: '1 2\n3 4\n' })
  render(<OutputPanel />)
  expect(screen.getByTestId('stdin-used')).toHaveTextContent(/Input given:\s*1 2 ⏎ 3 4/)
})
