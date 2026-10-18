import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { defaultWorkspace } from '@/lib/storage'
import { useWorkspace } from '@/state/workspace'
import { EditorPanel } from './EditorPanel'
import { useFileDialogs } from './FileDialogs'

vi.mock('@monaco-editor/react', () => import('@/test/monacoStub'))

const ws = () => useWorkspace.getState()

function renderPanel() {
  return render(<EditorPanel onCursorChange={() => {}} onRunShortcut={() => {}} />)
}

beforeEach(() => {
  useWorkspace.setState({ ...defaultWorkspace(), ready: true, saveStatus: 'saved', lastSavedAt: null })
  useFileDialogs.setState({ kind: null, fileId: null })
})

test('shows the active file content in the editor', async () => {
  renderPanel()
  expect(await screen.findByTestId('monaco')).toHaveValue(ws().files[0].content)
})

test('typing calls updateContent for active file', async () => {
  renderPanel()
  const editor = await screen.findByTestId('monaco')
  await userEvent.clear(editor)
  await userEvent.type(editor, 'hi')
  expect(ws().files[0].content).toBe('hi')
})

test('editor language follows file extension', async () => {
  ws().createFile('two.py')
  renderPanel()
  expect(await screen.findByTestId('monaco')).toHaveAttribute('data-language', 'python')
})

test('each file gets its own model path (keeps undo history per file)', async () => {
  renderPanel()
  expect(await screen.findByTestId('monaco')).toHaveAttribute('data-path', ws().files[0].id)
})

test('no active file → EmptyState with "New file" button', async () => {
  useWorkspace.setState({ openIds: [], activeId: null })
  renderPanel()
  expect(screen.queryByTestId('monaco')).not.toBeInTheDocument()
  await userEvent.click(within(screen.getByTestId('empty-state')).getByRole('button', { name: 'New file' }))
  expect(useFileDialogs.getState().kind).toBe('new')
})

test('no files at all → EmptyState', () => {
  useWorkspace.setState({ files: [], openIds: [], activeId: null })
  renderPanel()
  expect(screen.getByText(/no file open/i)).toBeInTheDocument()
})

test('shows a loading state until files have loaded from disk', () => {
  useWorkspace.setState({ ready: false })
  renderPanel()
  expect(screen.queryByTestId('monaco')).not.toBeInTheDocument()
  expect(screen.getByText(/loading files/i)).toBeInTheDocument()
})
