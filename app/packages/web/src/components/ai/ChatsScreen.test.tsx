import { act, render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import { defaultWorkspace } from '@/lib/storage'
import { useAiChat, type Chat, type ChatMessage } from '@/state/aiChat'
import { useComposer } from '@/state/composer'
import { useSettings } from '@/state/settings'
import { useWorkspace } from '@/state/workspace'
import { AiPanel } from './AiPanel'
import { ChatsScreen } from './ChatsScreen'

const render = (ui: React.ReactElement) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>)
const send = vi.fn(async () => {})
const stop = vi.fn()
const newChat = vi.fn()
const selectChat = vi.fn()
const deleteChat = vi.fn()

function chatWith(id: string, title: string, messages: ChatMessage[] = [], extra: Partial<Chat> = {}): Chat {
  return { id, title, sessionId: null, messages, updatedAt: Date.now() - 5 * 60_000, ...extra }
}

const list = () => screen.getByRole('list', { name: 'Chats' })

beforeEach(() => {
  for (const f of [send, stop, newChat, selectChat, deleteChat]) f.mockClear()
  useComposer.setState({ draft: '', attachments: [] })
  useWorkspace.setState({ ...defaultWorkspace(), ready: true })
  useSettings.setState({ section: 'chats', aiOpen: false, listOpen: { problems: true, code: true, notes: true, dryruns: true, chats: true } })
  useAiChat.setState({
    chats: [
      chatWith('a', 'Two sum help', [{ id: '1', role: 'user', text: 'why a hash map?', tools: [] }]),
      chatWith('b', 'BFS question'),
    ],
    activeChatId: 'a',
    streamingChatId: null,
    status: 'idle',
    send,
    stop,
    newChat,
    selectChat,
    deleteChat,
  })
})

test('lists the chats beside the open conversation', () => {
  render(<ChatsScreen />)
  expect(within(list()).getAllByRole('listitem')).toHaveLength(2)
  expect(within(list()).getByRole('button', { name: /^Two sum help/ })).toHaveAttribute('aria-current', 'true')
  expect(within(list()).getAllByRole('listitem')[0]).toHaveTextContent('5m ago')
  expect(screen.getByRole('main', { name: 'Chat' })).toHaveTextContent('why a hash map?')
  expect(screen.getByRole('heading', { name: 'Two sum help' })).toBeInTheDocument()
})

test('clicking a chat opens it; New chat starts one', async () => {
  render(<ChatsScreen />)
  await userEvent.click(within(list()).getByRole('button', { name: /^BFS question/ }))
  expect(selectChat).toHaveBeenCalledWith('b')
  await userEvent.click(screen.getByRole('button', { name: 'New chat' }))
  expect(newChat).toHaveBeenCalled()
})

test('deleting a chat asks first', async () => {
  render(<ChatsScreen />)
  await userEvent.click(screen.getByRole('button', { name: 'Actions for BFS question' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
  expect(deleteChat).not.toHaveBeenCalled()
  const dialog = await screen.findByRole('alertdialog')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
  expect(deleteChat).toHaveBeenCalledWith('b')
})

test('messages typed on the Chats page go to the open chat', async () => {
  render(<ChatsScreen />)
  await userEvent.type(screen.getByRole('textbox', { name: 'Message Claude' }), 'and the space?{Enter}')
  expect(send).toHaveBeenCalledWith('and the space?')
})

test('a reply still streaming keeps going from the side panel to the Chats page and back', () => {
  const reply: ChatMessage = { id: '2', role: 'assistant', text: 'Because lookups are', tools: [] }
  act(() =>
    useAiChat.setState((s) => ({
      chats: s.chats.map((c) => (c.id === 'a' ? { ...c, messages: [...c.messages, reply] } : c)),
      streamingChatId: 'a',
      status: 'streaming',
    })),
  )
  const panel = render(<AiPanel />)
  expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
  panel.unmount()
  const page = render(<ChatsScreen />)
  expect(screen.getByRole('main', { name: 'Chat' })).toHaveTextContent('Because lookups are')
  expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
  page.unmount()
  expect(stop).not.toHaveBeenCalled()
  expect(useAiChat.getState()).toMatchObject({ status: 'streaming', streamingChatId: 'a', activeChatId: 'a' })
})

test('a half-typed message and attached images come along from the panel to the Chats page', async () => {
  const panel = render(<AiPanel />)
  await userEvent.type(screen.getByRole('textbox', { name: 'Message Claude' }), 'and the space')
  await userEvent.upload(screen.getByLabelText('Attach image'), new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' }))
  await screen.findByRole('list', { name: 'Attached images' })
  panel.unmount()
  render(<ChatsScreen />)
  expect(screen.getByRole('textbox', { name: 'Message Claude' })).toHaveValue('and the space')
  expect(within(screen.getByRole('list', { name: 'Attached images' })).getAllByRole('listitem')).toHaveLength(1)
})
