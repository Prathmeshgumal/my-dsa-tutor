import { act, render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useNotes } from '@/state/notes'
import { useSettings } from '@/state/settings'
import { NotesPanel } from './NotesPanel'

const render = (ui: React.ReactElement) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>)
const load = vi.fn(async () => {})
const create = vi.fn(async () => {})
const select = vi.fn(async () => {})
const edit = vi.fn()
const remove = vi.fn(async () => {})

beforeEach(() => {
  for (const f of [load, create, select, edit, remove]) f.mockClear()
  useSettings.setState({ notesOpen: true })
  useNotes.setState({
    notes: [
      { name: 'note-1.md', content: '# Graphs\n\n- **BFS** uses a queue' },
      { name: 'note-2.md', content: '# DP' },
    ],
    activeName: 'note-1.md',
    status: 'ready',
    saveStatus: 'saved',
    load,
    create,
    select,
    edit,
    remove,
  })
})

test('is a labelled side panel that loads notes from disk', () => {
  render(<NotesPanel />)
  expect(screen.getByRole('complementary', { name: 'Notes' })).toBeInTheDocument()
  expect(load).toHaveBeenCalled()
})

test('shows the open note as editable markdown and saves as you type', async () => {
  render(<NotesPanel />)
  const box = screen.getByRole('textbox', { name: 'Note' })
  expect(box).toHaveValue('# Graphs\n\n- **BFS** uses a queue')
  await userEvent.type(box, '!')
  expect(edit).toHaveBeenLastCalledWith('# Graphs\n\n- **BFS** uses a queue!')
})

test('preview renders the markdown', async () => {
  render(<NotesPanel />)
  await userEvent.click(screen.getByRole('radio', { name: 'Preview' }))
  expect(screen.getByText('BFS').tagName).toBe('STRONG')
  expect(screen.queryByRole('textbox', { name: 'Note' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('radio', { name: 'Edit' }))
  expect(screen.getByRole('textbox', { name: 'Note' })).toBeInTheDocument()
})

test('the header shows the note title; the list switches notes', async () => {
  render(<NotesPanel />)
  const toggle = screen.getByRole('button', { name: 'All notes' })
  expect(toggle).toHaveTextContent('Graphs')
  await userEvent.click(toggle)
  const list = screen.getByRole('list', { name: 'Notes' })
  expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  await userEvent.click(within(list).getByRole('button', { name: 'DP' }))
  expect(select).toHaveBeenCalledWith('note-2.md')
  expect(screen.queryByRole('list', { name: 'Notes' })).not.toBeInTheDocument()
})

test('new note button creates one', async () => {
  render(<NotesPanel />)
  await userEvent.click(screen.getByRole('button', { name: 'New note' }))
  expect(create).toHaveBeenCalled()
})

test('deleting a note asks for a second click', async () => {
  render(<NotesPanel />)
  await userEvent.click(screen.getByRole('button', { name: 'All notes' }))
  await userEvent.click(screen.getByRole('button', { name: 'Delete note: DP' }))
  expect(remove).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Confirm delete note: DP' }))
  expect(remove).toHaveBeenCalledWith('note-2.md')
})

test('shows whether the note is saved', () => {
  render(<NotesPanel />)
  expect(screen.getByTestId('note-save-status')).toHaveTextContent(/saved/i)
  act(() => useNotes.setState({ saveStatus: 'error' }))
  expect(screen.getByTestId('note-save-status')).toHaveTextContent(/couldn’t save/i)
})

test('with no notes yet, offers to create the first one', async () => {
  useNotes.setState({ notes: [], activeName: null })
  render(<NotesPanel />)
  await userEvent.click(screen.getByRole('button', { name: 'Create a note' }))
  expect(create).toHaveBeenCalled()
})

test('close button hides the panel', async () => {
  render(<NotesPanel />)
  await userEvent.click(screen.getByRole('button', { name: 'Close notes' }))
  expect(useSettings.getState().notesOpen).toBe(false)
})

test('a new note puts the cursor at the end, so typing goes after the heading', async () => {
  create.mockImplementation(async () => {
    useNotes.setState((s) => ({ notes: [...s.notes, { name: 'note-3.md', content: '# Untitled note\n\n' }], activeName: 'note-3.md' }))
  })
  // Like Chrome: focusing a freshly shown textarea puts the cursor at the start (jsdom would put it at the end).
  const realFocus = HTMLTextAreaElement.prototype.focus
  HTMLTextAreaElement.prototype.focus = function (this: HTMLTextAreaElement, ...args) {
    this.setSelectionRange(0, 0)
    realFocus.apply(this, args)
  }
  try {
    render(<NotesPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'New note' }))
    const box = screen.getByRole('textbox', { name: 'Note' }) as HTMLTextAreaElement
    await vi.waitFor(() => expect(box).toHaveFocus())
    expect(box.selectionStart).toBe(box.value.length)
  } finally {
    HTMLTextAreaElement.prototype.focus = realFocus
  }
})
