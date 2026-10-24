import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import { defaultWorkspace } from '@/lib/storage'
import { useRun } from '@/state/run'
import { useWorkspace } from '@/state/workspace'
import { CodeToolbar } from './CodeToolbar'

const runActiveFile = vi.fn(async () => {})
const renderBar = () =>
  render(
    <TooltipProvider>
      <CodeToolbar />
    </TooltipProvider>,
  )

beforeEach(() => {
  runActiveFile.mockClear()
  useWorkspace.setState({ ...defaultWorkspace(), ready: true, saveStatus: 'saved', lastSavedAt: null })
  useRun.setState({ state: 'idle', runActiveFile })
})

test('Run runs the open file and shows its shortcut', async () => {
  renderBar()
  const run = screen.getByRole('button', { name: 'Run' })
  expect(run).toHaveTextContent(/⌘↵|Ctrl ↵/)
  await userEvent.click(run)
  expect(runActiveFile).toHaveBeenCalledOnce()
})

test('Run is disabled with no file open, and busy while running', () => {
  useWorkspace.setState({ files: [], openIds: [], activeId: null })
  const { unmount } = renderBar()
  expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
  unmount()
  useWorkspace.setState({ ...defaultWorkspace(), ready: true })
  useRun.setState({ state: 'running' })
  renderBar()
  expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Run' })).toHaveAttribute('aria-busy', 'true')
})

test('the language picker shows and changes the open file’s language', async () => {
  renderBar()
  const picker = screen.getByRole('combobox', { name: 'Language' })
  expect(picker).toHaveTextContent('C++')
  await userEvent.click(picker)
  await userEvent.click(await screen.findByRole('option', { name: 'Python' }))
  expect(useWorkspace.getState().activeFile()!.name).toBe('main.py')
})
