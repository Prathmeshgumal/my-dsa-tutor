import { render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import { defaultWorkspace } from '@/lib/storage'
import { useAiChat } from '@/state/aiChat'
import { useSettings } from '@/state/settings'
import { useWorkspace } from '@/state/workspace'
import { AiPanel } from './AiPanel'

const render = (ui: React.ReactElement) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>)
const send = vi.fn(async () => {})
const stop = vi.fn()
const newChat = vi.fn()

beforeEach(() => {
  send.mockClear()
  stop.mockClear()
  newChat.mockClear()
  useWorkspace.setState({ ...defaultWorkspace(), ready: true })
  useSettings.setState({ aiOpen: true })
  useAiChat.setState({ sessionId: null, messages: [], status: 'idle', send, stop, newChat })
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
  useAiChat.setState({
    messages: [
      { id: '1', role: 'user', text: 'Explain', tools: [] },
      {
        id: '2',
        role: 'assistant',
        text: 'Use a **hash map**:\n\n```cpp\nunordered_map<int,int> m;\n```',
        tools: [
          { name: 'Read', detail: 'main.cpp' },
          { name: 'Edit', detail: 'main.cpp' },
        ],
      },
    ],
  })
  render(<AiPanel />)
  expect(screen.getByText('Explain')).toBeInTheDocument()
  expect(screen.getByText('hash map').tagName).toBe('STRONG')
  expect(screen.getByText('unordered_map<int,int> m;').closest('pre')).not.toBeNull()
  const tools = screen.getByRole('list', { name: 'What Claude did' })
  expect(within(tools).getByText('Read main.cpp')).toBeInTheDocument()
  expect(within(tools).getByText('Edited main.cpp')).toBeInTheDocument()
})

test('while Claude is replying: thinking indicator and a Stop button', async () => {
  useAiChat.setState({
    status: 'streaming',
    messages: [
      { id: '1', role: 'user', text: 'hi', tools: [] },
      { id: '2', role: 'assistant', text: '', tools: [] },
    ],
  })
  render(<AiPanel />)
  expect(screen.getByText(/thinking/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
  expect(stop).toHaveBeenCalled()
})

test('errors are shown on the reply', () => {
  useAiChat.setState({
    messages: [
      { id: '1', role: 'user', text: 'hi', tools: [] },
      { id: '2', role: 'assistant', text: '', tools: [], error: 'Claude Code is not logged in' },
    ],
  })
  render(<AiPanel />)
  expect(screen.getByRole('alert')).toHaveTextContent('Claude Code is not logged in')
})

test('a reply stopped before any text says so', () => {
  useAiChat.setState({
    messages: [
      { id: '1', role: 'user', text: 'hi', tools: [] },
      { id: '2', role: 'assistant', text: '', tools: [] },
    ],
  })
  render(<AiPanel />)
  expect(screen.getByText('Stopped.')).toBeInTheDocument()
})

test('New chat and close buttons', async () => {
  useAiChat.setState({ messages: [{ id: '1', role: 'user', text: 'hi', tools: [] }] })
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
    useAiChat.setState({ messages: [{ id: 'u', role: 'user', text: 'hi', tools: [] }] })
    const { unmount } = render(<AiPanel />)
    expect(() => unmount()).not.toThrow()
  } finally {
    Element.prototype.scrollIntoView = original
  }
})
