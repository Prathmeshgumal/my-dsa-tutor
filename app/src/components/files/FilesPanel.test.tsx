import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFileDialogs } from '@/components/editor/FileDialogs'
import { defaultWorkspace } from '@/lib/storage'
import { useWorkspace } from '@/state/workspace'
import { FilesPanel } from './FilesPanel'

const ws = () => useWorkspace.getState()
const rows = () => within(screen.getByRole('list', { name: 'All files' })).getAllByRole('listitem')

beforeEach(() => {
  useWorkspace.setState({ ...defaultWorkspace(), ready: true, saveStatus: 'saved', lastSavedAt: null })
  useFileDialogs.setState({ kind: null, fileId: null })
  ws().createFile('two_sum.py')
  ws().createFile('bfs.java')
  ws().closeTab(ws().files.find((f) => f.name === 'two_sum.py')!.id)
})

test('lists every file sorted by name, including files whose tabs are closed', () => {
  render(<FilesPanel />)
  expect(rows().map((r) => r.textContent)).toEqual([
    expect.stringContaining('bfs.java'),
    expect.stringContaining('main.cpp'),
    expect.stringContaining('two_sum.py'),
  ])
  expect(screen.getByText('3 files')).toBeInTheDocument()
})

test('marks the active file', () => {
  render(<FilesPanel />)
  expect(screen.getByRole('button', { name: 'bfs.java' })).toHaveAttribute('aria-current', 'true')
  expect(screen.getByRole('button', { name: 'main.cpp' })).not.toHaveAttribute('aria-current')
})

test('clicking a closed file reopens its tab and makes it active', async () => {
  render(<FilesPanel />)
  await userEvent.click(screen.getByRole('button', { name: 'two_sum.py' }))
  expect(ws().activeFile()!.name).toBe('two_sum.py')
  expect(ws().openIds).toContain(ws().activeId)
})

test('+ opens the new-file dialog', async () => {
  render(<FilesPanel />)
  await userEvent.click(screen.getByRole('button', { name: 'New file' }))
  expect(useFileDialogs.getState().kind).toBe('new')
})

test('double-click opens rename for that file', async () => {
  render(<FilesPanel />)
  await userEvent.dblClick(screen.getByRole('button', { name: 'main.cpp' }))
  const main = ws().files.find((f) => f.name === 'main.cpp')!
  expect(useFileDialogs.getState()).toEqual({ kind: 'rename', fileId: main.id })
})

test('row menu offers rename and delete for that file', async () => {
  render(<FilesPanel />)
  const main = ws().files.find((f) => f.name === 'main.cpp')!
  await userEvent.click(screen.getByRole('button', { name: 'Actions for main.cpp' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: /delete/i }))
  expect(useFileDialogs.getState()).toEqual({ kind: 'delete', fileId: main.id })
})

test('no files → empty message with a New file button', async () => {
  useWorkspace.setState({ files: [], openIds: [], activeId: null })
  render(<FilesPanel />)
  expect(screen.getByText(/no files yet/i)).toBeInTheDocument()
  expect(screen.getByText('0 files')).toBeInTheDocument()
})

test('shows the folder files are saved in', () => {
  render(<FilesPanel />)
  expect(screen.getByText('solutions/')).toBeInTheDocument()
})
