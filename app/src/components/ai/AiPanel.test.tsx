import { act, fireEvent, render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import { defaultWorkspace } from '@/lib/storage'
import { useAiChat, type Approval, type Chat, type ChatMessage } from '@/state/aiChat'
import { useSettings } from '@/state/settings'
import { useWorkspace } from '@/state/workspace'
import { usePlayground } from '@/state/playground'
import { AiPanel } from './AiPanel'

const render = (ui: React.ReactElement) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>)
const send = vi.fn(async () => {})
const stop = vi.fn()
const newChat = vi.fn()
const selectChat = vi.fn()
const deleteChat = vi.fn()
const answerApproval = vi.fn(async () => {})

function chatWith(id: string, title: string, messages: ChatMessage[] = []): Chat {
  return { id, title, sessionId: null, messages, updatedAt: Date.now() }
}

/** Opens a chat containing these messages. */
function showMessages(messages: ChatMessage[], extra: Partial<ReturnType<typeof useAiChat.getState>> = {}) {
  useAiChat.setState({ chats: [chatWith('c1', 'hi', messages)], activeChatId: 'c1', ...extra })
}

beforeEach(() => {
  send.mockClear()
  stop.mockClear()
  newChat.mockClear()
  selectChat.mockClear()
  deleteChat.mockClear()
  answerApproval.mockClear()
  useWorkspace.setState({ ...defaultWorkspace(), ready: true })
  useSettings.setState({ aiOpen: true })
  useAiChat.setState({ chats: [], activeChatId: null, streamingChatId: null, status: 'idle', send, stop, newChat, selectChat, deleteChat, answerApproval })
})

test('is a labelled side panel', () => {
  render(<AiPanel />)
  expect(screen.getByRole('complementary', { name: 'Claude' })).toBeInTheDocument()
})

test('empty chat offers suggestions that send straight away', async () => {
  render(<AiPanel />)
  await userEvent.click(screen.getByRole('button', { name: 'Give me a hint, not the answer' }))
  expect(send).toHaveBeenCalledWith('Give me a hint, not the answer')
})

test('shows which file Claude will see', () => {
  render(<AiPanel />)
  expect(screen.getByTestId('context-chip')).toHaveTextContent('main.cpp')
})

test('Enter sends and clears; Shift+Enter makes a new line', async () => {
  render(<AiPanel />)
  const box = screen.getByRole('textbox', { name: 'Message Claude' })
  await userEvent.type(box, 'line one{Shift>}{Enter}{/Shift}line two')
  expect(send).not.toHaveBeenCalled()
  expect(box).toHaveValue('line one\nline two')
  await userEvent.keyboard('{Enter}')
  expect(send).toHaveBeenCalledWith('line one\nline two')
  expect(box).toHaveValue('')
})

test('send button sends; disabled when empty', async () => {
  render(<AiPanel />)
  const button = screen.getByRole('button', { name: 'Send' })
  expect(button).toBeDisabled()
  await userEvent.type(screen.getByRole('textbox', { name: 'Message Claude' }), 'why?')
  await userEvent.click(button)
  expect(send).toHaveBeenCalledWith('why?')
})

test('renders the conversation: user text, markdown reply with code, and tool activity', () => {
  showMessages([
      { id: '1', role: 'user', text: 'Explain', tools: [] },
      {
        id: '2',
        role: 'assistant',
        text: 'Use a **hash map**:\n\n```cpp\nunordered_map<int,int> m;\n```',
        tools: [
          { name: 'read_file', detail: 'main.cpp' },
          { name: 'run_code', detail: 'main.cpp' },
          { name: 'get_last_run', detail: '' },
          { name: 'edit_file', detail: 'main.cpp' },
        ],
      },
    ])
  render(<AiPanel />)
  expect(screen.getByText('Explain')).toBeInTheDocument()
  expect(screen.getByText('hash map').tagName).toBe('STRONG')
  expect(screen.getByText('unordered_map<int,int> m;').closest('pre')).not.toBeNull()
  const tools = screen.getByRole('list', { name: 'What Claude did' })
  expect(within(tools).getByText('Read main.cpp')).toBeInTheDocument()
  expect(within(tools).getByText('Ran main.cpp')).toBeInTheDocument()
  expect(within(tools).getByText('Checked the output')).toBeInTheDocument()
  expect(within(tools).getByText('Proposed a change to main.cpp')).toBeInTheDocument()
})

test('while Claude is replying: thinking indicator and a Stop button', async () => {
  showMessages(
    [
      { id: '1', role: 'user', text: 'hi', tools: [] },
      { id: '2', role: 'assistant', text: '', tools: [] },
    ],
    { status: 'streaming', streamingChatId: 'c1' },
  )
  render(<AiPanel />)
  expect(screen.getByText(/thinking/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
  expect(stop).toHaveBeenCalled()
})

test('errors are shown on the reply', () => {
  showMessages([
      { id: '1', role: 'user', text: 'hi', tools: [] },
      { id: '2', role: 'assistant', text: '', tools: [], error: 'Claude Code is not logged in' },
    ])
  render(<AiPanel />)
  expect(screen.getByRole('alert')).toHaveTextContent('Claude Code is not logged in')
})

test('a reply stopped before any text says so', () => {
  showMessages([
      { id: '1', role: 'user', text: 'hi', tools: [] },
      { id: '2', role: 'assistant', text: '', tools: [] },
    ])
  render(<AiPanel />)
  expect(screen.getByText('Stopped.')).toBeInTheDocument()
})

test('New chat and close buttons', async () => {
  showMessages([{ id: '1', role: 'user', text: 'hi', tools: [] }])
  render(<AiPanel />)
  await userEvent.click(screen.getByRole('button', { name: 'New chat' }))
  expect(newChat).toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Close Claude' }))
  expect(useSettings.getState().aiOpen).toBe(false)
})

test('closing the panel does not crash when scrolling returns a promise (newer Chrome)', () => {
  const original = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = () => Promise.resolve() as never
  try {
    showMessages([{ id: 'u', role: 'user', text: 'hi', tools: [] }])
    const { unmount } = render(<AiPanel />)
    expect(() => unmount()).not.toThrow()
  } finally {
    Element.prototype.scrollIntoView = original
  }
})

test('the header shows which chat is open', () => {
  render(<AiPanel />)
  expect(screen.getByRole('button', { name: 'Chats' })).toHaveTextContent('New chat')
  act(() => showMessages([{ id: '1', role: 'user', text: 'hi', tools: [] }]))
  expect(screen.getByRole('button', { name: 'Chats' })).toHaveTextContent('hi')
})

test('the chat list switches between chats', async () => {
  useAiChat.setState({ chats: [chatWith('a', 'Two sum help'), chatWith('b', 'BFS question')], activeChatId: 'a' })
  render(<AiPanel />)
  const toggle = screen.getByRole('button', { name: 'Chats' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const list = screen.getByRole('list', { name: 'Chats' })
  expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  await userEvent.click(within(list).getByRole('button', { name: 'BFS question' }))
  expect(selectChat).toHaveBeenCalledWith('b')
  expect(screen.queryByRole('list', { name: 'Chats' })).not.toBeInTheDocument()
})

test('deleting a chat asks for a second click', async () => {
  useAiChat.setState({ chats: [chatWith('a', 'Two sum help')], activeChatId: 'a' })
  render(<AiPanel />)
  await userEvent.click(screen.getByRole('button', { name: 'Chats' }))
  await userEvent.click(screen.getByRole('button', { name: 'Delete chat: Two sum help' }))
  expect(deleteChat).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Confirm delete chat: Two sum help' }))
  expect(deleteChat).toHaveBeenCalledWith('a')
})

test('new chat from the list view goes back to an empty conversation', async () => {
  render(<AiPanel />)
  await userEvent.click(screen.getByRole('button', { name: 'Chats' }))
  expect(screen.getByText('No chats yet')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'New chat' }))
  expect(newChat).toHaveBeenCalled()
  expect(screen.queryByRole('list', { name: 'Chats' })).not.toBeInTheDocument()
})

describe('proposed changes', () => {
  const proposal = (state: Approval['state']): Approval => ({
    id: 'p1',
    kind: 'edit',
    file: 'array.cpp',
    before: 'else if(arr[end] == 0 && arr[start] == 0){',
    after: 'else if(arr[end] == 0){',
    explanation: 'The first check already covers this case',
    state,
  })
  const show = (state: Approval['state']) =>
    showMessages(
      [
        { id: '1', role: 'user', text: 'simplify it', tools: [] },
        { id: '2', role: 'assistant', text: '', tools: [], approvals: [proposal(state)] },
      ],
      { status: state === 'pending' ? 'streaming' : 'idle', streamingChatId: state === 'pending' ? 'c1' : null },
    )

  test('shows what would change and lets you apply it', async () => {
    show('pending')
    render(<AiPanel />)
    const card = screen.getByRole('group', { name: 'Proposed change to array.cpp' })
    expect(within(card).getByText('The first check already covers this case')).toBeInTheDocument()
    expect(within(card).getByText('else if(arr[end] == 0 && arr[start] == 0){')).toBeInTheDocument()
    expect(within(card).getByText('else if(arr[end] == 0){')).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Apply change' }))
    expect(answerApproval).toHaveBeenCalledWith('p1', true)
  })

  test('or reject it', async () => {
    show('pending')
    render(<AiPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(answerApproval).toHaveBeenCalledWith('p1', false)
  })

  test.each([
    ['approved', 'Applied'],
    ['rejected', 'Rejected'],
    ['expired', 'No longer waiting'],
  ] as const)('a %s proposal says so and has no buttons', (state, label) => {
    show(state)
    render(<AiPanel />)
    const card = screen.getByRole('group', { name: 'Proposed change to array.cpp' })
    expect(card).toHaveTextContent(label)
    expect(within(card).queryByRole('button', { name: 'Apply change' })).not.toBeInTheDocument()
  })

  test('a new file proposal says it will create the file', () => {
    showMessages([
      {
        id: '2',
        role: 'assistant',
        text: '',
        tools: [],
        approvals: [{ id: 'p2', kind: 'create', file: 'brute.cpp', before: '', after: 'int main(){}', explanation: '', state: 'pending' }],
      },
    ], { status: 'streaming', streamingChatId: 'c1' })
    render(<AiPanel />)
    expect(screen.getByRole('group', { name: 'Proposed new file brute.cpp' })).toBeInTheDocument()
  })
})

test('note proposals and note tools are labelled as notes', () => {
  showMessages(
    [
      {
        id: '2',
        role: 'assistant',
        text: '',
        tools: [
          { name: 'list_notes', detail: '' },
          { name: 'create_note', detail: '' },
        ],
        approvals: [
          { id: 'n1', kind: 'create_note', file: 'note-2.md', before: '', after: '# Two Sum', explanation: '', state: 'pending' },
          { id: 'n2', kind: 'edit_note', file: 'note-1.md', before: 'a', after: 'b', explanation: '', state: 'pending' },
        ],
      },
    ],
    { status: 'streaming', streamingChatId: 'c1' },
  )
  render(<AiPanel />)
  expect(screen.getByRole('group', { name: 'Proposed new note note-2.md' })).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Proposed change to note note-1.md' })).toBeInTheDocument()
  const tools = screen.getByRole('list', { name: 'What Claude did' })
  expect(within(tools).getByText('Listed notes')).toBeInTheDocument()
  expect(within(tools).getByText('Proposed a new note')).toBeInTheDocument()
})

test('a dry run card opens it in the Playground', async () => {
  const open = vi.fn()
  usePlayground.setState({ open })
  showMessages([{ id: '2', role: 'assistant', text: 'Watch step 4.', tools: [{ name: 'create_visualization', detail: '' }], visualizations: [{ id: 'v1', title: 'Dry run: bubble sort', steps: 12 }] }])
  render(<AiPanel />)
  const card = screen.getByRole('group', { name: 'Dry run: bubble sort' })
  expect(card).toHaveTextContent('12 steps')
  await userEvent.click(within(card).getByRole('button', { name: 'Open in Playground' }))
  expect(open).toHaveBeenCalledWith('v1')
  expect(within(screen.getByRole('list', { name: 'What Claude did' })).getByText('Made a dry run')).toBeInTheDocument()
})

test('while Claude writes a long tool call, the reply says what it is doing', () => {
  showMessages(
    [
      { id: '1', role: 'user', text: 'dry run it', tools: [] },
      { id: '2', role: 'assistant', text: 'Here is the trace:', tools: [], progress: { name: 'create_visualization', chars: 4200 } },
    ],
    { status: 'streaming', streamingChatId: 'c1' },
  )
  render(<AiPanel />)
  expect(screen.getByRole('status')).toHaveTextContent('Making a dry run… 4.2k characters so far')
})

test('a streaming reply that already has text still shows that Claude is working', () => {
  showMessages(
    [
      { id: '1', role: 'user', text: 'hi', tools: [] },
      { id: '2', role: 'assistant', text: 'Let me check.', tools: [] },
    ],
    { status: 'streaming', streamingChatId: 'c1' },
  )
  render(<AiPanel />)
  expect(screen.getByRole('status')).toHaveTextContent(/working/i)
})

test('a stopped reply says so', () => {
  showMessages([
    { id: '1', role: 'user', text: 'hi', tools: [] },
    { id: '2', role: 'assistant', text: 'Half an answer', tools: [], stopped: true },
  ])
  render(<AiPanel />)
  expect(screen.getByText('Stopped by you.')).toBeInTheDocument()
})

describe('images', () => {
  const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' })

  test('attach an image with the button; it shows as a removable preview and is sent', async () => {
    render(<AiPanel />)
    await userEvent.upload(screen.getByLabelText('Attach image'), png())
    const previews = await screen.findByRole('list', { name: 'Attached images' })
    expect(within(previews).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(send).toHaveBeenCalledWith('', {
      attachments: [{ image: { mediaType: 'image/png', data: btoa(String.fromCharCode(137, 80, 78, 71)) }, thumb: undefined }],
    })
    expect(screen.queryByRole('list', { name: 'Attached images' })).not.toBeInTheDocument()
  })

  test('remove an attached image', async () => {
    render(<AiPanel />)
    await userEvent.upload(screen.getByLabelText('Attach image'), png())
    await userEvent.click(await screen.findByRole('button', { name: 'Remove image 1' }))
    expect(screen.queryByRole('list', { name: 'Attached images' })).not.toBeInTheDocument()
  })

  test('paste a screenshot into the message box', async () => {
    render(<AiPanel />)
    fireEvent.paste(screen.getByRole('textbox', { name: 'Message Claude' }), { clipboardData: { files: [png()], getData: () => '' } })
    expect(await screen.findByRole('list', { name: 'Attached images' })).toBeInTheDocument()
  })

  test('drop an image on the panel', async () => {
    render(<AiPanel />)
    fireEvent.drop(screen.getByRole('complementary', { name: 'Claude' }), { dataTransfer: { files: [png()], types: ['Files'] } })
    expect(await screen.findByRole('list', { name: 'Attached images' })).toBeInTheDocument()
  })

  test('other files are refused with a message', async () => {
    render(<AiPanel />)
    fireEvent.paste(screen.getByRole('textbox', { name: 'Message Claude' }), {
      clipboardData: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })], getData: () => '' },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(/PNG, JPEG, GIF or WebP/)
    expect(screen.queryByRole('list', { name: 'Attached images' })).not.toBeInTheDocument()
  })

  test('sent images show in the conversation', () => {
    showMessages([{ id: '1', role: 'user', text: 'why?', tools: [], images: [{ thumb: 'data:image/jpeg;base64,abc' }, {}] }])
    render(<AiPanel />)
    expect(screen.getByRole('img', { name: 'Attached image 1' })).toHaveAttribute('src', 'data:image/jpeg;base64,abc')
    expect(screen.getByText('Image 2')).toBeInTheDocument()
  })
})
