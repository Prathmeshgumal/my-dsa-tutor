import { act, render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useSettings } from '@/state/settings'
import { configureNotes, useNotes } from '@/state/notes'
import { NotesScreen } from './NotesScreen'

const render = (ui: React.ReactElement) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>)
const load = vi.fn(async () => {})
const create = vi.fn(async () => {})
const select = vi.fn(async () => {})
const edit = vi.fn()
const remove = vi.fn(async () => {})

beforeEach(() => {
  for (const f of [load, create, select, edit, remove]) f.mockClear()
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

test('is a page with the list of notes beside the open one, loaded from disk', () => {
  render(<NotesScreen />)
  expect(screen.getByRole('main', { name: 'Note' })).toBeInTheDocument()
  expect(within(screen.getByRole('list', { name: 'Notes' })).getAllByRole('listitem')).toHaveLength(2)
  expect(load).toHaveBeenCalled()
})

test('shows the open note as editable markdown and saves as you type', async () => {
  render(<NotesScreen />)
  const box = screen.getByRole('textbox', { name: 'Note' })
  expect(box).toHaveValue('# Graphs\n\n- **BFS** uses a queue')
  await userEvent.type(box, '!')
  expect(edit).toHaveBeenLastCalledWith('# Graphs\n\n- **BFS** uses a queue!')
})

test('preview renders the markdown', async () => {
  render(<NotesScreen />)
  await userEvent.click(screen.getByRole('radio', { name: 'Preview' }))
  expect(screen.getByText('BFS').tagName).toBe('STRONG')
  expect(screen.queryByRole('textbox', { name: 'Note' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('radio', { name: 'Edit' }))
  expect(screen.getByRole('textbox', { name: 'Note' })).toBeInTheDocument()
})

test('the page shows the note title; the list marks it and switches notes', async () => {
  render(<NotesScreen />)
  expect(screen.getByRole('heading', { name: 'Graphs' })).toBeInTheDocument()
  const list = screen.getByRole('list', { name: 'Notes' })
  expect(within(list).getByRole('button', { name: /^Graphs/ })).toHaveAttribute('aria-current', 'true')
  await userEvent.click(within(list).getByRole('button', { name: /^DP/ }))
  expect(select).toHaveBeenCalledWith('note-2.md')
})

test('search finds a note by title', async () => {
  render(<NotesScreen />)
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search notes' }), 'dp')
  expect(within(screen.getByRole('list', { name: 'Notes' })).getAllByRole('listitem')).toHaveLength(1)
})

test('the list can be hidden from the left bar', () => {
  useSettings.setState({ listOpen: { problems: true, code: true, notes: false, dryruns: true, chats: true }, aiOpen: false })
  render(<NotesScreen />)
  expect(screen.queryByRole('list', { name: 'Notes' })).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Note' })).toBeInTheDocument()
  useSettings.getState().setListOpen('notes', true)
})

test('new note button creates one', async () => {
  render(<NotesScreen />)
  await userEvent.click(screen.getByRole('button', { name: 'New note' }))
  expect(create).toHaveBeenCalled()
})

test('deleting a note asks first', async () => {
  render(<NotesScreen />)
  await userEvent.click(screen.getByRole('button', { name: 'Actions for DP' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
  expect(remove).not.toHaveBeenCalled()
  const dialog = await screen.findByRole('alertdialog')
  expect(dialog).toHaveTextContent('DP')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
  expect(remove).toHaveBeenCalledWith('note-2.md')
})

test('shows whether the note is saved', () => {
  render(<NotesScreen />)
  expect(screen.getByTestId('note-save-status')).toHaveTextContent(/saved/i)
  act(() => useNotes.setState({ saveStatus: 'error' }))
  expect(screen.getByTestId('note-save-status')).toHaveTextContent(/couldn’t save/i)
})

test('with no notes yet, offers to create the first one', async () => {
  useNotes.setState({ notes: [], activeName: null })
  render(<NotesScreen />)
  await userEvent.click(screen.getByRole('button', { name: 'Create a note' }))
  expect(create).toHaveBeenCalled()
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
    render(<NotesScreen />)
    await userEvent.click(screen.getByRole('button', { name: 'New note' }))
    const box = screen.getByRole('textbox', { name: 'Note' }) as HTMLTextAreaElement
    await vi.waitFor(() => expect(box).toHaveFocus())
    expect(box.selectionStart).toBe(box.value.length)
  } finally {
    HTMLTextAreaElement.prototype.focus = realFocus
  }
})

test('typing that isn’t saved yet is written when you leave the Notes section', async () => {
  const sent: { url: string; body: unknown }[] = []
  configureNotes({
    delayMs: 60_000,
    fetchImpl: (async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') sent.push({ url, body: JSON.parse(init.body as string) })
      return new Response(null, { status: 204 })
    }) as typeof fetch,
  })
  const real = useNotes.getInitialState()
  useNotes.setState({ edit: real.edit, flush: real.flush })
  const { unmount } = render(<NotesScreen />)
  await userEvent.type(screen.getByRole('textbox', { name: 'Note' }), '!')
  expect(sent).toEqual([])
  unmount()
  await vi.waitFor(() => expect(sent).toEqual([{ url: '/api/notes/note-1.md', body: { content: '# Graphs\n\n- **BFS** uses a queue!' } }]))
})
