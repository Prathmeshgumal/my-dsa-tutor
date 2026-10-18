import type { ChatEvent } from '@/lib/claudeClient'
import { defaultWorkspace } from '@/lib/storage'
import { useAiChat } from './aiChat'
import { useWorkspace } from './workspace'

const chat = () => useAiChat.getState()

function fakeStream(events: ChatEvent[]) {
  return vi.fn(async (_req: unknown, onEvent: (e: ChatEvent) => void) => {
    for (const e of events) onEvent(e)
  })
}

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ ...defaultWorkspace(), ready: true })
  useAiChat.setState({ sessionId: null, messages: [], status: 'idle' })
})

test('sending adds the user message and builds the assistant reply from the stream', async () => {
  const stream = fakeStream([
    { type: 'session', sessionId: 's1' },
    { type: 'text', text: 'Use a ' },
    { type: 'tool', name: 'Read', detail: 'main.cpp' },
    { type: 'text', text: 'hash map.' },
    { type: 'done' },
  ])
  await chat().send('How do I make this faster?', { stream, beforeSend: async () => {}, afterEdits: async () => {} })
  const [user, assistant] = chat().messages
  expect(user).toMatchObject({ role: 'user', text: 'How do I make this faster?' })
  expect(assistant).toMatchObject({ role: 'assistant', text: 'Use a hash map.', tools: [{ name: 'Read', detail: 'main.cpp' }] })
  expect(chat().sessionId).toBe('s1')
  expect(chat().status).toBe('idle')
})

test('sends the open file, its code and the open tabs as context, and resumes the session', async () => {
  useAiChat.setState({ sessionId: 'old' })
  useWorkspace.getState().createFile('two.py')
  const stream = fakeStream([{ type: 'done' }])
  await chat().send('hi', { stream, beforeSend: async () => {}, afterEdits: async () => {} })
  expect(stream.mock.calls[0][0]).toEqual({
    message: 'hi',
    sessionId: 'old',
    context: {
      activeFile: { name: 'two.py', content: useWorkspace.getState().activeFile()!.content },
      openFiles: ['main.cpp', 'two.py'],
    },
  })
})

test('saves pending edits before sending so Claude reads the latest code', async () => {
  const order: string[] = []
  const stream = vi.fn(async () => {
    order.push('stream')
  })
  await chat().send('hi', { stream, beforeSend: async () => void order.push('save'), afterEdits: async () => {} })
  expect(order).toEqual(['save', 'stream'])
})

test('reloads files from disk only when Claude edited something', async () => {
  const afterEdits = vi.fn(async () => {})
  await chat().send('explain', { stream: fakeStream([{ type: 'tool', name: 'Read', detail: 'a' }, { type: 'done' }]), beforeSend: async () => {}, afterEdits })
  expect(afterEdits).not.toHaveBeenCalled()
  await chat().send('fix it', { stream: fakeStream([{ type: 'tool', name: 'Edit', detail: 'a' }, { type: 'done' }]), beforeSend: async () => {}, afterEdits })
  expect(afterEdits).toHaveBeenCalledOnce()
})

test('error events are shown on the reply', async () => {
  await chat().send('hi', { stream: fakeStream([{ type: 'error', message: 'not logged in' }]), beforeSend: async () => {}, afterEdits: async () => {} })
  expect(chat().messages[1]).toMatchObject({ role: 'assistant', error: 'not logged in' })
})

test('ignores empty messages and sends while a reply is streaming', async () => {
  const stream = fakeStream([{ type: 'done' }])
  await chat().send('   ', { stream, beforeSend: async () => {}, afterEdits: async () => {} })
  useAiChat.setState({ status: 'streaming' })
  await chat().send('hi', { stream, beforeSend: async () => {}, afterEdits: async () => {} })
  expect(stream).not.toHaveBeenCalled()
})

test('stop aborts the running request', async () => {
  let seen: AbortSignal | undefined
  const stream = vi.fn(async (_r: unknown, _e: unknown, opts?: { signal?: AbortSignal }) => {
    seen = opts?.signal
    await new Promise((r) => opts!.signal!.addEventListener('abort', r))
  })
  const pending = chat().send('hi', { stream, beforeSend: async () => {}, afterEdits: async () => {} })
  await vi.waitFor(() => expect(seen).toBeDefined())
  chat().stop()
  await pending
  expect(seen!.aborted).toBe(true)
  expect(chat().status).toBe('idle')
})

test('new chat forgets the session and messages', () => {
  useAiChat.setState({ sessionId: 's', messages: [{ id: '1', role: 'user', text: 'x', tools: [] }] })
  chat().newChat()
  expect(chat()).toMatchObject({ sessionId: null, messages: [] })
})

test('conversation survives a reload (persisted)', async () => {
  await chat().send('hi', { stream: fakeStream([{ type: 'session', sessionId: 's9' }, { type: 'text', text: 'yo' }, { type: 'done' }]), beforeSend: async () => {}, afterEdits: async () => {} })
  const saved = JSON.parse(localStorage.getItem('dsa-editor:ai')!).state
  expect(saved.sessionId).toBe('s9')
  expect(saved.messages).toHaveLength(2)
  expect(saved.status).toBeUndefined()
})
