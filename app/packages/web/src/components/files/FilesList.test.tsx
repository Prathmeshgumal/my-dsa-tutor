import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFileDialogs } from '@/components/editor/FileDialogs'
import { defaultWorkspace } from '@/lib/storage'
import { useWorkspace } from '@/state/workspace'
import { focusEditor } from '@/components/editor/editorFocus'
import { FilesList } from './FilesList'

vi.mock('@/components/editor/editorFocus', () => ({ focusEditor: vi.fn(), registerEditor: vi.fn(() => () => {}) }))

const ws = () => useWorkspace.getState()
const rows = () => within(screen.getByRole('list', { name: 'Files' })).getAllByRole('listitem')

beforeEach(() => {
  useWorkspace.setState({ ...defaultWorkspace(), ready: true, saveStatus: 'saved', lastSavedAt: null })
  useFileDialogs.setState({ kind: null, fileId: null })
  ws().createFile('two_sum.py')
  ws().createFile('bfs.java')
  ws().closeTab(ws().files.find((f) => f.name === 'two_sum.py')!.id)
})

test('lists every file sorted by name, including files whose tabs are closed', () => {
  render(<FilesList />)
  expect(rows().map((r) => r.textContent)).toEqual([
    expect.stringContaining('bfs.java'),
    expect.stringContaining('main.cpp'),
    expect.stringContaining('two_sum.py'),
  ])
  expect(screen.getByRole('region', { name: 'Files' })).toHaveTextContent('3')
})

test('marks the active file', () => {
  render(<FilesList />)
  expect(screen.getByRole('button', { name: 'bfs.java' })).toHaveAttribute('aria-current', 'true')
  expect(screen.getByRole('button', { name: 'main.cpp' })).not.toHaveAttribute('aria-current')
})

test('clicking a closed file reopens its tab, makes it active and focuses the editor', async () => {
  vi.mocked(focusEditor).mockClear()
  render(<FilesList />)
  await userEvent.click(screen.getByRole('button', { name: 'two_sum.py' }))
  expect(ws().activeFile()!.name).toBe('two_sum.py')
  expect(ws().openIds).toContain(ws().activeId)
  expect(focusEditor).toHaveBeenCalled()
})

test('search finds a file by name', async () => {
  render(<FilesList />)
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search files' }), 'sum')
  expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('two_sum.py')])
})

test('+ opens the new-file dialog', async () => {
  render(<FilesList />)
  await userEvent.click(screen.getByRole('button', { name: 'New file' }))
  expect(useFileDialogs.getState().kind).toBe('new')
})

test('double-click opens rename for that file', async () => {
  render(<FilesList />)
  await userEvent.dblClick(screen.getByRole('button', { name: 'main.cpp' }))
  const main = ws().files.find((f) => f.name === 'main.cpp')!
  expect(useFileDialogs.getState()).toEqual({ kind: 'rename', fileId: main.id })
})

test('row menu opens the delete dialog', async () => {
  render(<FilesList />)
  const main = ws().files.find((f) => f.name === 'main.cpp')!
  await userEvent.click(screen.getByRole('button', { name: 'Actions for main.cpp' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: /delete/i }))
  expect(useFileDialogs.getState()).toEqual({ kind: 'delete', fileId: main.id })
})

test('no files → empty message with a New file button', async () => {
  useWorkspace.setState({ files: [], openIds: [], activeId: null })
  render(<FilesList />)
  expect(screen.getByText(/no files yet/i)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'New file' }))
  expect(useFileDialogs.getState().kind).toBe('new')
})
