import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFileDialogs } from '@/components/editor/FileDialogs'
import { defaultWorkspace } from '@/lib/storage'
import { useRun } from '@/state/run'
import { useSettings } from '@/state/settings'
import { useSettingsDialog } from '@/state/settingsDialog'
import { useWorkspace } from '@/state/workspace'
import { focusEditor } from '@/components/editor/editorFocus'
import { CommandMenu, useCommandMenu } from './CommandMenu'

vi.mock('@/components/editor/editorFocus', () => ({ focusEditor: vi.fn(), registerEditor: vi.fn(() => () => {}) }))

const ws = () => useWorkspace.getState()

beforeEach(() => {
  useWorkspace.setState({ ...defaultWorkspace(), saveStatus: 'saved', lastSavedAt: null })
  ws().createFile('two.py')
  ws().createFile('graph.java')
  ws().closeTab(ws().files[1].id)
  ws().setActive(ws().files[0].id)
  useCommandMenu.setState({ open: false })
  useFileDialogs.setState({ kind: null, fileId: null })
  useSettingsDialog.setState({ open: false })
  useSettings.setState({ theme: 'dark' })
})

test.each([
  ['⌘K', { metaKey: true }],
  ['Ctrl+K', { ctrlKey: true }],
])('%s opens the menu', async (_, mods) => {
  render(<CommandMenu />)
  fireEvent.keyDown(window, { key: 'k', ...mods })
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
})

test('⌘K toggles the menu closed again', async () => {
  render(<CommandMenu />)
  fireEvent.keyDown(window, { key: 'k', metaKey: true })
  await screen.findByRole('dialog')
  fireEvent.keyDown(window, { key: 'k', metaKey: true })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('useCommandMenu.open() opens it (used by the top-bar search)', async () => {
  render(<CommandMenu />)
  useCommandMenu.getState().setOpen(true)
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
})

test('typing filters files fuzzily; Enter opens that file (even if its tab was closed)', async () => {
  useCommandMenu.setState({ open: true })
  render(<CommandMenu />)
  await userEvent.type(screen.getByRole('combobox'), 'tw')
  expect(screen.getByRole('option', { name: /two\.py/ })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: /graph\.java/ })).not.toBeInTheDocument()
  await userEvent.keyboard('{Enter}')
  expect(ws().activeFile()!.name).toBe('two.py')
  expect(ws().openIds).toContain(ws().files[1].id)
  expect(useCommandMenu.getState().open).toBe(false)
})

async function choose(name: RegExp) {
  useCommandMenu.setState({ open: true })
  render(<CommandMenu />)
  await userEvent.click(screen.getByRole('option', { name }))
  expect(useCommandMenu.getState().open).toBe(false)
}

test('New file opens the new-file dialog', async () => {
  await choose(/new file/i)
  expect(useFileDialogs.getState().kind).toBe('new')
})

test('Run runs the active file', async () => {
  const runActiveFile = vi.fn(async () => {})
  useRun.setState({ runActiveFile })
  await choose(/^run/i)
  expect(runActiveFile).toHaveBeenCalledOnce()
})

test('Toggle theme flips dark → light', async () => {
  await choose(/toggle theme/i)
  expect(useSettings.getState().theme).toBe('light')
})

test('Check setup opens the setup check', async () => {
  await choose(/check setup/i)
  expect(useSettingsDialog.getState().open).toBe(true)
})

test('⌘K works even when the focused element (e.g. Monaco) stops propagation', async () => {
  render(<CommandMenu />)
  const editorLike = document.createElement('textarea')
  document.body.appendChild(editorLike)
  editorLike.addEventListener('keydown', (e) => e.stopPropagation())
  fireEvent.keyDown(editorLike, { key: 'k', ctrlKey: true })
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  editorLike.remove()
})

test('after picking a file the cursor goes back into the editor', async () => {
  vi.mocked(focusEditor).mockClear()
  useCommandMenu.setState({ open: true })
  render(<CommandMenu />)
  await userEvent.type(screen.getByRole('combobox'), 'tw')
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(focusEditor).toHaveBeenCalled())
})

test('command moves the output to the bottom', async () => {
  useSettings.setState({ outputPosition: 'right' })
  await choose(/move output to the bottom/i)
  expect(useSettings.getState().outputPosition).toBe('bottom')
})

test('command hides the output', async () => {
  useSettings.setState({ outputOpen: true })
  await choose(/hide output/i)
  expect(useSettings.getState().outputOpen).toBe(false)
})

test('Ask Claude opens the Claude panel', async () => {
  useSettings.setState({ aiOpen: false })
  await choose(/ask claude/i)
  expect(useSettings.getState().aiOpen).toBe(true)
})

test('Open notes opens the Notes section', async () => {
  useSettings.setState({ section: 'code' })
  await choose(/open notes/i)
  expect(useSettings.getState().section).toBe('notes')
})

test('Open Playground switches to the Playground', async () => {
  useSettings.setState({ section: 'code' })
  await choose(/open playground/i)
  expect(useSettings.getState().section).toBe('dryruns')
})
