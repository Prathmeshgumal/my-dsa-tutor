import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { defaultWorkspace } from '@/lib/storage'
import { useWorkspace } from '@/state/workspace'
import { FileDialogs, useFileDialogs } from './FileDialogs'
import { FileTabs } from './FileTabs'

const ws = () => useWorkspace.getState()

function renderTabs() {
  return render(
    <>
      <FileTabs />
      <FileDialogs />
    </>,
  )
}

beforeEach(() => {
  useWorkspace.setState({ ...defaultWorkspace(), saveStatus: 'saved', lastSavedAt: null })
  useFileDialogs.setState({ kind: null, fileId: null })
  ws().createFile('two.py')
})

test('renders a tab per open file, active tab marked selected with the violet dot', () => {
  renderTabs()
  const tabs = screen.getAllByRole('tab')
  expect(tabs.map((t) => t.textContent)).toEqual([expect.stringContaining('main.cpp'), expect.stringContaining('two.py')])
  const active = screen.getByRole('tab', { selected: true })
  expect(active).toHaveTextContent('two.py')
  expect(within(active).getByTestId('active-dot')).toBeInTheDocument()
})

test('clicking a tab activates it', async () => {
  renderTabs()
  await userEvent.click(screen.getByRole('tab', { name: /main\.cpp/ }))
  expect(ws().activeFile()!.name).toBe('main.cpp')
})

test('× closes a tab', async () => {
  renderTabs()
  await userEvent.click(screen.getByRole('button', { name: 'Close two.py' }))
  expect(screen.getAllByRole('tab')).toHaveLength(1)
  expect(ws().files).toHaveLength(2)
})

test('+ opens New file dialog; invalid name shows error inline and keeps dialog open', async () => {
  renderTabs()
  await userEvent.click(screen.getByRole('button', { name: 'New file' }))
  const dialog = await screen.findByRole('dialog')
  const input = within(dialog).getByRole('textbox')
  await userEvent.clear(input)
  await userEvent.type(input, 'notes.txt{Enter}')
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Use .cpp, .java or .py')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

test('New file dialog creates the file and closes', async () => {
  renderTabs()
  await userEvent.click(screen.getByRole('button', { name: 'New file' }))
  const input = within(await screen.findByRole('dialog')).getByRole('textbox')
  await userEvent.clear(input)
  await userEvent.type(input, 'bfs.java{Enter}')
  expect(ws().activeFile()!.name).toBe('bfs.java')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('double-click tab opens rename; Enter saves', async () => {
  renderTabs()
  await userEvent.dblClick(screen.getByRole('tab', { name: /main\.cpp/ }))
  const input = within(await screen.findByRole('dialog')).getByRole('textbox')
  expect(input).toHaveValue('main.cpp')
  await userEvent.clear(input)
  await userEvent.type(input, 'sol.cpp{Enter}')
  expect(ws().files.map((f) => f.name)).toContain('sol.cpp')
})

test('Escape cancels rename', async () => {
  renderTabs()
  await userEvent.dblClick(screen.getByRole('tab', { name: /main\.cpp/ }))
  const input = within(await screen.findByRole('dialog')).getByRole('textbox')
  await userEvent.type(input, 'xx{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(ws().files.map((f) => f.name)).toContain('main.cpp')
})

test('delete asks for confirmation via AlertDialog', async () => {
  renderTabs()
  await userEvent.click(screen.getByRole('button', { name: 'File actions' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: /delete/i }))
  const alert = await screen.findByRole('alertdialog')
  expect(alert).toHaveTextContent('two.py')
  expect(ws().files).toHaveLength(2)
  await userEvent.click(within(alert).getByRole('button', { name: 'Delete' }))
  expect(ws().files.map((f) => f.name)).toEqual(['main.cpp'])
})
