import { useEffect } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { defaultWorkspace } from '@/lib/storage'
import { useFilesPanel } from '@/state/filesPanel'
import { useSettings } from '@/state/settings'
import { useWorkspace } from '@/state/workspace'
import { mockMatchMedia } from '@/test/matchMedia'
import { AppShell } from './AppShell'

type ShellProps = Partial<React.ComponentProps<typeof AppShell>>

function renderShell(props: ShellProps = {}) {
  return render(
    <AppShell
      editor={<div>EDITOR</div>}
      output={<div>OUTPUT</div>}
      onRun={() => {}}
      running={false}
      canRun
      connection="connected"
      cursor={{ line: 7, col: 42 }}
      onOpenCommand={() => {}}
      {...props}
    />,
  )
}

beforeEach(() => {
  useSettings.setState({ runner: 'piston', outputPosition: 'right', outputOpen: true, aiOpen: false, notesOpen: false, screen: 'editor' })
  useFilesPanel.setState({ open: false })
  mockMatchMedia(() => false)
  useWorkspace.setState({ ...defaultWorkspace(), saveStatus: 'saved', lastSavedAt: Date.now() })
})

test('top bar shows active file name and run shortcut hint', () => {
  renderShell()
  expect(screen.getByTestId('active-file-name')).toHaveTextContent('main.cpp')
  expect(screen.getByRole('button', { name: 'Run' })).toHaveTextContent(/⌘↵|Ctrl ↵/)
})

test('top bar shows a placeholder when no file is open', () => {
  useWorkspace.setState({ files: [], openIds: [], activeId: null })
  renderShell({ canRun: false })
  expect(screen.getByTestId('active-file-name')).toHaveTextContent('No file open')
})

test('renders editor and output slots', () => {
  renderShell()
  expect(screen.getByText('EDITOR')).toBeInTheDocument()
  expect(screen.getByText('OUTPUT')).toBeInTheDocument()
})

test('Run button calls onRun', async () => {
  const onRun = vi.fn()
  renderShell({ onRun })
  await userEvent.click(screen.getByRole('button', { name: 'Run' }))
  expect(onRun).toHaveBeenCalledOnce()
})

test('Run button disabled when canRun=false', () => {
  renderShell({ canRun: false })
  expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
})

test('Run button disabled and busy while running', () => {
  renderShell({ running: true })
  const run = screen.getByRole('button', { name: 'Run' })
  expect(run).toBeDisabled()
  expect(run).toHaveAttribute('aria-busy', 'true')
})

test('Notes button opens the notes panel, and it shares the right side with Claude', async () => {
  renderShell()
  await userEvent.click(screen.getByRole('button', { name: 'Notes' }))
  expect(screen.getByRole('complementary', { name: 'Notes' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Claude' }))
  expect(screen.getByRole('complementary', { name: 'Claude' })).toBeInTheDocument()
  expect(screen.queryByRole('complementary', { name: 'Notes' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-pressed', 'false')
})

test('search bar calls onOpenCommand', async () => {
  const onOpenCommand = vi.fn()
  renderShell({ onOpenCommand })
  await userEvent.click(screen.getByRole('button', { name: /search or run a command/i }))
  expect(onOpenCommand).toHaveBeenCalledOnce()
})

test.each([
  ['saved', 'Saved just now'],
  ['saving', 'Saving…'],
  ['error', 'Couldn’t save'],
] as const)('status bar shows save status %s', (saveStatus, text) => {
  useWorkspace.setState({ saveStatus, lastSavedAt: Date.now() })
  renderShell()
  expect(screen.getByText(text)).toBeInTheDocument()
})

test('status bar shows minutes since last save', () => {
  useWorkspace.setState({ saveStatus: 'saved', lastSavedAt: Date.now() - 2 * 60_000 })
  renderShell()
  expect(screen.getByText('Saved 2m ago')).toBeInTheDocument()
})

test.each([
  ['no_key', 'No API key'],
  ['connected', 'Piston connected'],
  ['failed', 'Last run failed'],
] as const)('status bar connection %s', (connection, text) => {
  renderShell({ connection })
  expect(screen.getByText(text)).toBeInTheDocument()
})

test('status bar shows cursor and compiler label', () => {
  renderShell()
  expect(screen.getByText('Ln 7, Col 42')).toBeInTheDocument()
  expect(screen.getByText('C++ · GCC')).toBeInTheDocument()
})

test('wide window uses horizontal panels', () => {
  renderShell()
  expect(screen.getByTestId('workspace-panels')).toHaveStyle({ flexDirection: 'row' })
})

test('below 900px uses vertical panel direction', () => {
  mockMatchMedia((q) => q === '(max-width: 899px)')
  renderShell()
  expect(screen.getByTestId('workspace-panels')).toHaveStyle({ flexDirection: 'column' })
})

test('rail settings button opens the settings dialog', async () => {
  const { useSettingsDialog } = await import('@/state/settingsDialog')
  useSettingsDialog.setState({ open: false })
  renderShell()
  await userEvent.click(screen.getByRole('button', { name: 'Settings' }))
  expect(useSettingsDialog.getState()).toMatchObject({ open: true, reason: 'manual' })
})

test('status bar names Judge0 when that runner is selected', () => {
  useSettings.setState({ runner: 'judge0' })
  renderShell({ connection: 'connected' })
  expect(screen.getByText('Judge0 connected')).toBeInTheDocument()
})

test('Files button toggles the files panel and reflects its state', async () => {
  renderShell()
  const button = screen.getByRole('button', { name: 'Files' })
  expect(button).toHaveAttribute('aria-pressed', 'false')
  expect(screen.queryByRole('complementary', { name: 'Files' })).not.toBeInTheDocument()
  await userEvent.click(button)
  expect(button).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('complementary', { name: 'Files' })).toBeInTheDocument()
  await userEvent.click(button)
  expect(screen.queryByRole('complementary', { name: 'Files' })).not.toBeInTheDocument()
})

test('clicking anywhere outside the files panel (e.g. the code) closes it', async () => {
  renderShell()
  await userEvent.click(screen.getByRole('button', { name: 'Files' }))
  await userEvent.click(screen.getByText('EDITOR'))
  expect(screen.queryByRole('complementary', { name: 'Files' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Files' })).toHaveAttribute('aria-pressed', 'false')
})

test('Escape closes the files panel', async () => {
  renderShell()
  await userEvent.click(screen.getByRole('button', { name: 'Files' }))
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('complementary', { name: 'Files' })).not.toBeInTheDocument()
})

test('clicking inside the files panel keeps it open', async () => {
  renderShell()
  await userEvent.click(screen.getByRole('button', { name: 'Files' }))
  await userEvent.click(screen.getByText('solutions/'))
  expect(screen.getByRole('complementary', { name: 'Files' })).toBeInTheDocument()
})

test('picking a file in the panel opens it and closes the panel', async () => {
  useWorkspace.getState().createFile('two.py')
  renderShell()
  await userEvent.click(screen.getByRole('button', { name: 'Files' }))
  await userEvent.click(screen.getByRole('button', { name: 'main.cpp' }))
  expect(useWorkspace.getState().activeFile()!.name).toBe('main.cpp')
  expect(screen.queryByRole('complementary', { name: 'Files' })).not.toBeInTheDocument()
})

test('the files panel is closed after a reload', () => {
  renderShell()
  expect(screen.queryByRole('complementary', { name: 'Files' })).not.toBeInTheDocument()
})

test('output position "bottom" stacks the output under the editor on a wide window', () => {
  useSettings.setState({ outputPosition: 'bottom' })
  renderShell()
  expect(screen.getByTestId('workspace-panels')).toHaveStyle({ flexDirection: 'column' })
})

test('hidden output: the editor takes the whole area and the output slot is gone', () => {
  useSettings.setState({ outputOpen: false })
  renderShell()
  expect(screen.queryByText('OUTPUT')).not.toBeInTheDocument()
  expect(screen.queryByRole('separator')).not.toBeInTheDocument()
  expect(screen.getByText('EDITOR')).toBeInTheDocument()
})

test('no output button in the top bar', () => {
  renderShell()
  expect(screen.queryByRole('button', { name: 'Output' })).not.toBeInTheDocument()
})

test('layout switch in the status bar: bottom, right, hidden', async () => {
  renderShell()
  const group = screen.getByRole('radiogroup', { name: 'Output layout' })
  expect(within(group).getByRole('radio', { name: 'Output on the right' })).toBeChecked()

  await userEvent.click(within(group).getByRole('radio', { name: 'Hide output' }))
  expect(useSettings.getState().outputOpen).toBe(false)
  expect(screen.queryByText('OUTPUT')).not.toBeInTheDocument()
  expect(within(group).getByRole('radio', { name: 'Hide output' })).toBeChecked()

  await userEvent.click(within(group).getByRole('radio', { name: 'Output at the bottom' }))
  expect(useSettings.getState()).toMatchObject({ outputOpen: true, outputPosition: 'bottom' })
  expect(screen.getByText('OUTPUT')).toBeInTheDocument()
})

test('hidden output leaves nothing behind (no strip)', () => {
  useSettings.setState({ outputOpen: false })
  renderShell()
  expect(screen.queryByRole('button', { name: /show output/i })).not.toBeInTheDocument()
})

test('narrow window: the switch has no "right" choice', () => {
  mockMatchMedia((q) => q === '(max-width: 899px)')
  renderShell()
  expect(screen.queryByRole('radio', { name: 'Output on the right' })).not.toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Output at the bottom' })).toBeChecked()
})

test('hiding and showing the output keeps the same editor mounted (cursor and scroll survive)', async () => {
  const mounts = vi.fn()
  function EditorProbe() {
    useEffect(() => mounts(), [])
    return <div>EDITOR</div>
  }
  renderShell({ editor: <EditorProbe /> })
  act(() => useSettings.getState().setOutputOpen(false))
  await userEvent.click(screen.getByRole('radio', { name: 'Output on the right' }))
  expect(mounts).toHaveBeenCalledTimes(1)
})

test('Claude button opens and closes the Claude panel', async () => {
  renderShell()
  const button = screen.getByRole('button', { name: 'Claude' })
  expect(button).toHaveAttribute('aria-pressed', 'false')
  await userEvent.click(button)
  expect(screen.getByRole('complementary', { name: 'Claude' })).toBeInTheDocument()
  expect(button).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(button)
  expect(screen.queryByRole('complementary', { name: 'Claude' })).not.toBeInTheDocument()
})

test('Claude panel stays open while you click into the code', async () => {
  useSettings.setState({ aiOpen: true })
  renderShell()
  await userEvent.click(screen.getByText('EDITOR'))
  expect(screen.getByRole('complementary', { name: 'Claude' })).toBeInTheDocument()
})

test('the Claude and Notes panels use the remembered width and can be resized', () => {
  useSettings.setState({ aiOpen: true, sidePanelWidth: 520 })
  renderShell()
  expect(screen.getByRole('complementary', { name: 'Claude' })).toHaveStyle({ width: '520px' })
  expect(screen.getByRole('separator', { name: 'Resize panel' })).toBeInTheDocument()
  act(() => useSettings.getState().setNotesOpen(true))
  expect(screen.getByRole('complementary', { name: 'Notes' })).toHaveStyle({ width: '520px' })
})

test('the Playground button switches the main area; the editor stays loaded behind it', async () => {
  const mounts = vi.fn()
  function EditorProbe() {
    useEffect(() => mounts(), [])
    return <div>EDITOR</div>
  }
  renderShell({ editor: <EditorProbe /> })
  const editorBtn = screen.getByRole('button', { name: 'Editor' })
  const playgroundBtn = screen.getByRole('button', { name: 'Playground' })
  expect(editorBtn).toHaveAttribute('aria-current', 'page')
  await userEvent.click(playgroundBtn)
  expect(screen.getByRole('main', { name: 'Playground' })).toBeInTheDocument()
  expect(playgroundBtn).toHaveAttribute('aria-current', 'page')
  expect(screen.getByText('EDITOR')).not.toBeVisible()
  await userEvent.click(editorBtn)
  expect(screen.queryByRole('main', { name: 'Playground' })).not.toBeInTheDocument()
  expect(screen.getByText('EDITOR')).toBeVisible()
  expect(mounts).toHaveBeenCalledTimes(1)
})
