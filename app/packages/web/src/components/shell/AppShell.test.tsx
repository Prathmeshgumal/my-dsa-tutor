import { useEffect } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { defaultWorkspace } from '@/lib/storage'
import { useAiChat } from '@/state/aiChat'
import { useNotes } from '@/state/notes'
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
      connection="connected"
      cursor={{ line: 7, col: 42 }}
      onOpenCommand={() => {}}
      {...props}
    />,
  )
}

const rail = () => within(screen.getByRole('navigation', { name: 'Sidebar' }))

beforeEach(() => {
  useSettings.setState({
    outputPosition: 'right',
    outputOpen: true,
    aiOpen: false,
    section: 'code',
    listOpen: { problems: true, code: true, notes: true, dryruns: true, chats: true },
    foldedForClaude: false,
  })
  mockMatchMedia(() => false)
  useWorkspace.setState({ ...defaultWorkspace(), saveStatus: 'saved', lastSavedAt: Date.now() })
})

test('top bar shows where you are: section and open file, and no Run', () => {
  renderShell()
  expect(screen.getByRole('navigation', { name: 'You are here' })).toHaveTextContent('Codemain.cpp')
  expect(within(screen.getByRole('banner')).queryByRole('button', { name: 'Run' })).not.toBeInTheDocument()
  expect(within(screen.getByRole('banner')).queryByRole('combobox', { name: 'Language' })).not.toBeInTheDocument()
})

test('top bar shows a placeholder when no file is open', () => {
  useWorkspace.setState({ files: [], openIds: [], activeId: null })
  renderShell()
  expect(screen.getByRole('navigation', { name: 'You are here' })).toHaveTextContent('CodeNo file open')
})

test('top bar names the open item on every section', async () => {
  useNotes.setState({ notes: [{ name: 'note-1.md', content: '# Two pointers' }], activeName: 'note-1.md' })
  useAiChat.setState({ chats: [{ id: 'c', title: 'Why BFS?', sessionId: null, messages: [], updatedAt: 0 }], activeChatId: 'c' })
  renderShell()
  const here = () => screen.getByRole('navigation', { name: 'You are here' })
  await userEvent.click(rail().getByRole('button', { name: 'Notes' }))
  expect(here()).toHaveTextContent('NotesTwo pointers')
  await userEvent.click(rail().getByRole('button', { name: 'Chats' }))
  expect(here()).toHaveTextContent('ChatsWhy BFS?')
  await userEvent.click(rail().getByRole('button', { name: 'Problems' }))
  expect(here()).toHaveTextContent('ProblemsNo problem open')
  await userEvent.click(rail().getByRole('button', { name: 'Dry runs' }))
  expect(here()).toHaveTextContent('Dry runsNo dry run open')
})

test('renders editor and output slots', () => {
  renderShell()
  expect(screen.getByText('EDITOR')).toBeInTheDocument()
  expect(screen.getByText('OUTPUT')).toBeInTheDocument()
})

test('the left bar: five sections, then Claude, then Setup', () => {
  renderShell()
  expect(rail().getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
    'Problems',
    'Code',
    'Notes',
    'Dry runs',
    'Chats',
    'Claude',
    'Setup',
  ])
  expect(rail().getByRole('button', { name: 'Code' })).toHaveAttribute('aria-current', 'page')
  expect(rail().getByRole('button', { name: 'Claude' })).toHaveAttribute('aria-pressed', 'false')
})

test('Notes opens as a section, and Claude can sit beside it', async () => {
  renderShell()
  await userEvent.click(rail().getByRole('button', { name: 'Notes' }))
  expect(rail().getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('complementary', { name: 'Notes' })).toBeInTheDocument()
  expect(screen.getByText('EDITOR')).not.toBeVisible()
  await userEvent.click(rail().getByRole('button', { name: 'Claude' }))
  expect(screen.getByRole('complementary', { name: 'Claude' })).toBeInTheDocument()
  expect(screen.getByRole('complementary', { name: 'Notes' })).toBeInTheDocument()
})

test('on the Chats section the chat is the page, so Claude isn’t also on the right', async () => {
  useSettings.setState({ aiOpen: true })
  renderShell()
  await userEvent.click(rail().getByRole('button', { name: 'Chats' }))
  expect(screen.getAllByRole('complementary', { name: 'Claude' })).toHaveLength(1)
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

test('rail Setup button opens the setup check', async () => {
  const { useSettingsDialog } = await import('@/state/settingsDialog')
  useSettingsDialog.setState({ open: false })
  renderShell()
  await userEvent.click(screen.getByRole('button', { name: 'Setup' }))
  expect(useSettingsDialog.getState().open).toBe(true)
})

test('the Code section lists the files; pressing Code again hides and shows the list', async () => {
  renderShell()
  expect(screen.getByRole('region', { name: 'Files' })).toBeInTheDocument()
  await userEvent.click(rail().getByRole('button', { name: 'Code' }))
  expect(screen.queryByRole('region', { name: 'Files' })).not.toBeInTheDocument()
  await userEvent.click(rail().getByRole('button', { name: 'Code' }))
  expect(screen.getByRole('region', { name: 'Files' })).toBeInTheDocument()
})

test('picking a file in the list opens it and the list stays', async () => {
  useWorkspace.getState().createFile('two_sum.py')
  useWorkspace.getState().closeTab(useWorkspace.getState().activeId!)
  renderShell()
  await userEvent.click(screen.getByRole('button', { name: 'two_sum.py' }))
  expect(useWorkspace.getState().activeFile()!.name).toBe('two_sum.py')
  expect(screen.getByRole('region', { name: 'Files' })).toBeInTheDocument()
})

test.each([false, true])('opening Claude folds the list away and closing it brings it back (narrow: %s)', async (narrow) => {
  mockMatchMedia(() => narrow)
  renderShell()
  await userEvent.click(rail().getByRole('button', { name: 'Claude' }))
  expect(screen.queryByRole('region', { name: 'Files' })).not.toBeInTheDocument()
  expect(screen.getByRole('complementary', { name: 'Claude' })).toBeInTheDocument()
  await userEvent.click(rail().getByRole('button', { name: 'Claude' }))
  expect(screen.getByRole('region', { name: 'Files' })).toBeInTheDocument()
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

test('the Claude panel uses the remembered width and can be resized', () => {
  useSettings.setState({ aiOpen: true, sidePanelWidth: 520 })
  renderShell()
  expect(screen.getByRole('complementary', { name: 'Claude' })).toHaveStyle({ width: '520px' })
  expect(screen.getByRole('separator', { name: 'Resize panel' })).toBeInTheDocument()
})

test('the Dry runs button switches the main area; the editor stays loaded behind it', async () => {
  const mounts = vi.fn()
  function EditorProbe() {
    useEffect(() => mounts(), [])
    return <div>EDITOR</div>
  }
  renderShell({ editor: <EditorProbe /> })
  const editorBtn = rail().getByRole('button', { name: 'Code' })
  const playgroundBtn = rail().getByRole('button', { name: 'Dry runs' })
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

test('making the window narrow while the editor is open keeps working', () => {
  let narrow = false
  const listeners = new Set<() => void>()
  window.matchMedia = ((query: string) => ({
    get matches() { return query === '(max-width: 899px)' && narrow },
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  })) as unknown as typeof window.matchMedia
  renderShell()
  act(() => {
    narrow = true
    listeners.forEach((fn) => fn())
  })
  expect(screen.getByText('EDITOR')).toBeInTheDocument()
})
