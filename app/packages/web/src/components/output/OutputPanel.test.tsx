import { render as rtlRender, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useSettings } from '@/state/settings'
import { mockMatchMedia } from '@/test/matchMedia'
import { RunnerError, type RunResult } from '@dsa/core/runner/types'
import { useRun } from '@/state/run'
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
  useRun.setState({ state: 'idle', result: null, error: null, connection: 'connected', terminal: [], phase: null })
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
    error: new RunnerError('network', 'Couldn’t reach Piston — start it with “docker compose up -d”.'),
  })
  render(<OutputPanel />)
  expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t reach Piston')
})

test('the output panel has no layout buttons (they live in the status bar)', () => {
  render(<OutputPanel />)
  expect(screen.queryByRole('button', { name: /output options|collapse output/i })).not.toBeInTheDocument()
})

describe('running like a terminal', () => {
  test('while compiling there is nothing to type into yet', () => {
    useRun.setState({ state: 'running', phase: 'compiling' })
    render(<OutputPanel />)
    expect(screen.getByText('Compiling…')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  test('the program’s prompt shows, and what you type goes to it on Enter', async () => {
    const sendInput = vi.fn()
    useRun.setState({ state: 'running', phase: 'running', terminal: [{ kind: 'stdout', text: 'Enter rows: ' }], sendInput })
    render(<OutputPanel />)
    expect(screen.getByTestId('stdout')).toHaveTextContent('Enter rows:')
    const box = screen.getByRole('textbox', { name: 'Type input for the program' })
    expect(box).toHaveFocus()
    await userEvent.type(box, '3{Enter}')
    expect(sendInput).toHaveBeenCalledWith('3')
    expect(box).toHaveValue('')
  })

  test('Stop stops the program', async () => {
    const stop = vi.fn()
    useRun.setState({ state: 'running', phase: 'running', stop })
    render(<OutputPanel />)
    await userEvent.click(screen.getByRole('button', { name: /stop/i }))
    expect(stop).toHaveBeenCalled()
  })

  test('after the run, the terminal keeps what you typed, marked apart from the output', () => {
    useRun.setState({
      state: 'done',
      result: base,
      terminal: [
        { kind: 'stdout', text: 'rows: ' },
        { kind: 'input', text: '2\n' },
        { kind: 'stdout', text: 'ok\n' },
      ],
    })
    render(<OutputPanel />)
    expect(screen.getByTestId('stdout')).toHaveTextContent(/rows: 2\s*ok/)
    expect(screen.getByText('2', { selector: '[data-kind="input"]' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

test('a stopped run stays on its output, since there are no errors to show', () => {
  useRun.setState({
    state: 'done',
    result: { ...base, status: 'runtime_error', statusText: 'Stopped', stdout: 'rows: ' },
    terminal: [{ kind: 'stdout', text: 'rows: ' }],
  })
  render(<OutputPanel />)
  expect(screen.getByRole('tab', { name: 'Output' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByTestId('stdout')).toHaveTextContent('rows:')
})
