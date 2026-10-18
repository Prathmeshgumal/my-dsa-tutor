import { render as rtlRender, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import userEvent from '@testing-library/user-event'
import { useSettings } from '@/state/settings'
import { mockMatchMedia } from '@/test/matchMedia'
import { RunnerError, type RunResult } from '@/lib/runner/types'
import { useRun } from '@/state/run'
import { OutputPanel } from './OutputPanel'

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
  showResult({ status: 'compile_error', statusText: 'Compilation Error', stdout: '', compileOutput: "error: expected ';'" })
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
  showResult({ status: 'runtime_error', statusText: 'Runtime Error (SIGSEGV)', stdout: '', stderr: 'Segmentation fault' })
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
  useRun.setState({ state: 'error', error: new RunnerError('quota', 'Daily Judge0 quota used up. Try again tomorrow.') })
  render(<OutputPanel />)
  expect(screen.getByRole('alert')).toHaveTextContent('Daily Judge0 quota used up. Try again tomorrow.')
})

test('layout button moves the output to the bottom and back', async () => {
  render(<OutputPanel />)
  await userEvent.click(screen.getByRole('button', { name: 'Move output to the bottom' }))
  expect(useSettings.getState().outputPosition).toBe('bottom')
  await userEvent.click(screen.getByRole('button', { name: 'Move output to the right' }))
  expect(useSettings.getState().outputPosition).toBe('right')
})

test('narrow window: no layout button (output is always at the bottom there)', () => {
  mockMatchMedia((q) => q === '(max-width: 899px)')
  render(<OutputPanel />)
  expect(screen.queryByRole('button', { name: /move output/i })).not.toBeInTheDocument()
})

test('close button hides the output', async () => {
  useSettings.setState({ outputOpen: true })
  render(<OutputPanel />)
  await userEvent.click(screen.getByRole('button', { name: 'Hide output' }))
  expect(useSettings.getState().outputOpen).toBe(false)
})
