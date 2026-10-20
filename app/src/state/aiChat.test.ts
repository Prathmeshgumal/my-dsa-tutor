import type { ChatEvent } from '@/lib/claudeClient'
import type { ChatRequest } from '@/lib/chatEvents'
import { defaultWorkspace } from '@/lib/storage'
import { activeChat, useAiChat } from './aiChat'
import { useWorkspace } from './workspace'
import { useRun } from './run'
import { useSettings } from './settings'
import { useNotes } from './notes'
import { usePlayground } from './playground'
import type { RunResult } from '@/lib/runner/types'

const runResult: RunResult = { status: 'success', statusText: 'Accepted', stdout: '1', stderr: '', compileOutput: '', timeMs: 3, memoryKb: 100 }

const chat = () => useAiChat.getState()
const quiet = { beforeSend: async () => {}, afterEdits: async () => {} }

function fakeStream(events: ChatEvent[]) {
  return vi.fn(async (_req: unknown, onEvent: (e: ChatEvent) => void) => {
    for (const e of events) onEvent(e)
  })
}

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ ...defaultWorkspace(), ready: true })
  useAiChat.setState({ chats: [], activeChatId: null, streamingChatId: null, status: 'idle' })
  useRun.setState({ state: 'idle', result: null, error: null, lastFile: null })
  useSettings.setState({ notesOpen: false })
})

test('the first message starts a chat titled after it, and the reply is built from the stream', async () => {
  const stream = fakeStream([
    { type: 'session', sessionId: 's1' },
    { type: 'text', text: 'Use a ' },
    { type: 'tool', name: 'Read', detail: 'main.cpp' },
    { type: 'text', text: 'hash map.' },
    { type: 'done' },
  ])
  await chat().send('How do I make this faster?', { stream, ...quiet })
  expect(chat().chats).toHaveLength(1)
  const current = activeChat(chat())!
  expect(current).toMatchObject({ title: 'How do I make this faster?', sessionId: 's1' })
  const [user, assistant] = current.messages
  expect(user).toMatchObject({ role: 'user', text: 'How do I make this faster?' })
  expect(assistant).toMatchObject({ role: 'assistant', text: 'Use a hash map.', tools: [{ name: 'Read', detail: 'main.cpp' }] })
  expect(chat().status).toBe('idle')
})

test('long first messages make a short title', async () => {
  await chat().send('a'.repeat(100), { stream: fakeStream([{ type: 'done' }]), ...quiet })
  expect(activeChat(chat())!.title.length).toBeLessThanOrEqual(48)
})

test('follow-ups stay in the same chat and resume its session, with the open file as context', async () => {
  await chat().send('first', { stream: fakeStream([{ type: 'session', sessionId: 'old' }, { type: 'done' }]), ...quiet })
  useWorkspace.getState().createFile('two.py')
  const stream = fakeStream([{ type: 'done' }])
  await chat().send('hi', { stream, ...quiet })
  expect(chat().chats).toHaveLength(1)
  expect(stream.mock.calls[0][0]).toEqual({
    message: 'hi',
    sessionId: 'old',
    context: {
      activeFile: { name: 'two.py', content: useWorkspace.getState().activeFile()!.content },
      openFiles: ['main.cpp', 'two.py'],
      lastRun: null,
      openNote: null,
    },
  })
})

test('new chat starts fresh (no session) and keeps the old chat in the list', async () => {
  await chat().send('one', { stream: fakeStream([{ type: 'session', sessionId: 's1' }, { type: 'done' }]), ...quiet })
  chat().newChat()
  expect(activeChat(chat())).toBeNull()
  const stream = fakeStream([{ type: 'session', sessionId: 's2' }, { type: 'done' }])
  await chat().send('two', { stream, ...quiet })
  expect(stream.mock.calls[0][0]).toMatchObject({ sessionId: null })
  expect(chat().chats.map((c) => c.title)).toEqual(['two', 'one'])
})

test('switching chats resumes that chat’s own session', async () => {
  await chat().send('one', { stream: fakeStream([{ type: 'session', sessionId: 's1' }, { type: 'done' }]), ...quiet })
  const first = chat().activeChatId!
  chat().newChat()
  await chat().send('two', { stream: fakeStream([{ type: 'session', sessionId: 's2' }, { type: 'done' }]), ...quiet })
  chat().selectChat(first)
  const stream = fakeStream([{ type: 'done' }])
  await chat().send('back to one', { stream, ...quiet })
  expect(stream.mock.calls[0][0]).toMatchObject({ sessionId: 's1' })
  expect(activeChat(chat())!.messages).toHaveLength(4)
})

test('a reply keeps going to its own chat if you switch away mid-reply', async () => {
  let emit!: (e: ChatEvent) => void
  let finish!: () => void
  const stream = vi.fn(async (_r: unknown, onEvent: (e: ChatEvent) => void) => {
    emit = onEvent
    await new Promise<void>((r) => (finish = r))
  })
  const pending = chat().send('slow one', { stream, ...quiet })
  await vi.waitFor(() => expect(emit).toBeDefined())
  const slow = chat().activeChatId!
  chat().newChat()
  emit({ type: 'text', text: 'late text' })
  finish()
  await pending
  expect(chat().chats.find((c) => c.id === slow)!.messages[1].text).toBe('late text')
  expect(activeChat(chat())).toBeNull()
})

test('deleting a chat removes it; deleting the open one opens the most recent other', async () => {
  await chat().send('one', { stream: fakeStream([{ type: 'done' }]), ...quiet })
  const first = chat().activeChatId!
  chat().newChat()
  await chat().send('two', { stream: fakeStream([{ type: 'done' }]), ...quiet })
  chat().deleteChat(chat().activeChatId!)
  expect(chat().chats.map((c) => c.title)).toEqual(['one'])
  expect(chat().activeChatId).toBe(first)
  chat().deleteChat(first)
  expect(chat().chats).toEqual([])
  expect(chat().activeChatId).toBeNull()
})

test('deleting a chat while Claude is replying in it stops the reply', async () => {
  let seen: AbortSignal | undefined
  const stream = vi.fn(async (_r: unknown, _e: unknown, opts?: { signal?: AbortSignal }) => {
    seen = opts?.signal
    await new Promise((r) => opts!.signal!.addEventListener('abort', r))
  })
  const pending = chat().send('hi', { stream, ...quiet })
  await vi.waitFor(() => expect(seen).toBeDefined())
  chat().deleteChat(chat().activeChatId!)
  await pending
  expect(seen!.aborted).toBe(true)
  expect(chat().chats).toEqual([])
  expect(chat().status).toBe('idle')
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
  await chat().send('explain', { stream: fakeStream([{ type: 'tool', name: 'read_file', detail: 'a' }, { type: 'done' }]), beforeSend: async () => {}, afterEdits })
  expect(afterEdits).not.toHaveBeenCalled()
  await chat().send('fix it', { stream: fakeStream([{ type: 'tool', name: 'edit_file', detail: 'a' }, { type: 'done' }]), beforeSend: async () => {}, afterEdits })
  expect(afterEdits).toHaveBeenCalledOnce()
})

test('error events are shown on the reply', async () => {
  await chat().send('hi', { stream: fakeStream([{ type: 'error', message: 'not logged in' }]), ...quiet })
  expect(activeChat(chat())!.messages[1]).toMatchObject({ role: 'assistant', error: 'not logged in' })
})

test('ignores empty messages and sends while a reply is streaming', async () => {
  const stream = fakeStream([{ type: 'done' }])
  await chat().send('   ', { stream, ...quiet })
  useAiChat.setState({ status: 'streaming' })
  await chat().send('hi', { stream, ...quiet })
  expect(stream).not.toHaveBeenCalled()
  expect(chat().chats).toEqual([])
})

test('stop aborts the running request', async () => {
  let seen: AbortSignal | undefined
  const stream = vi.fn(async (_r: unknown, _e: unknown, opts?: { signal?: AbortSignal }) => {
    seen = opts?.signal
    await new Promise((r) => opts!.signal!.addEventListener('abort', r))
  })
  const pending = chat().send('hi', { stream, ...quiet })
  await vi.waitFor(() => expect(seen).toBeDefined())
  chat().stop()
  await pending
  expect(seen!.aborted).toBe(true)
  expect(chat().status).toBe('idle')
})

test('chats survive a reload (persisted)', async () => {
  await chat().send('hi', { stream: fakeStream([{ type: 'session', sessionId: 's9' }, { type: 'text', text: 'yo' }, { type: 'done' }]), ...quiet })
  const saved = JSON.parse(localStorage.getItem('dsa-editor:ai')!).state
  expect(saved.chats).toHaveLength(1)
  expect(saved.chats[0].sessionId).toBe('s9')
  expect(saved.activeChatId).toBe(saved.chats[0].id)
  expect(saved.status).toBeUndefined()
  expect(saved.streamingChatId).toBeUndefined()
})

test('the conversation saved before multiple chats existed becomes the first chat', async () => {
  localStorage.setItem(
    'dsa-editor:ai',
    JSON.stringify({
      version: 0,
      state: { sessionId: 'legacy', messages: [{ id: 'u', role: 'user', text: 'old question', tools: [] }] },
    }),
  )
  await useAiChat.persist.rehydrate()
  const current = activeChat(chat())!
  expect(current).toMatchObject({ title: 'old question', sessionId: 'legacy' })
  expect(current.messages).toHaveLength(1)
})

describe('agent tools', () => {
  test('sends what the output panel shows (last run) with the message', async () => {
    useRun.setState({ state: 'done', result: runResult, error: null, lastFile: 'main.cpp' })
    const stream = fakeStream([{ type: 'done' }])
    await chat().send('why?', { stream, ...quiet })
    expect((stream.mock.calls[0][0] as ChatRequest).context.lastRun).toEqual({ file: 'main.cpp', result: runResult })
  })

  test('a proposed change waits for approval while Claude waits, and expires when the reply ends', async () => {
    let finish!: () => void
    const stream = vi.fn(async (_r: unknown, onEvent: (e: ChatEvent) => void) => {
      onEvent({ type: 'approval', id: 'p1', kind: 'edit', file: 'main.cpp', before: 'a', after: 'b', explanation: 'why' })
      await new Promise<void>((r) => (finish = r))
    })
    const pending = chat().send('fix it', { stream, ...quiet })
    await vi.waitFor(() => expect(finish).toBeDefined())
    expect(activeChat(chat())!.messages[1].approvals).toEqual([
      { id: 'p1', kind: 'edit', file: 'main.cpp', before: 'a', after: 'b', explanation: 'why', state: 'pending' },
    ])
    finish()
    await pending
    expect(activeChat(chat())!.messages[1].approvals![0].state).toBe('expired')
  })

  test('answering a proposal saves the editor first, posts the decision and marks it', async () => {
    await chat().send('fix it', {
      stream: fakeStream([{ type: 'approval', id: 'p1', kind: 'edit', file: 'main.cpp', before: 'a', after: 'b', explanation: '' }]),
      ...quiet,
    })
    const order: string[] = []
    const post = vi.fn(async (url: string, init: RequestInit) => {
      order.push(`post ${url} ${init.body}`)
      return new Response(null, { status: 204 })
    })
    await chat().answerApproval('p1', true, { post, beforeAnswer: async () => void order.push('save') })
    expect(order).toEqual(['save', 'post /api/claude/approval {"id":"p1","approved":true}'])
    expect(activeChat(chat())!.messages[1].approvals![0].state).toBe('approved')
  })

  test('a proposal the server no longer waits for is marked expired', async () => {
    await chat().send('fix it', {
      stream: fakeStream([{ type: 'approval', id: 'p1', kind: 'edit', file: 'main.cpp', before: 'a', after: 'b', explanation: '' }]),
      ...quiet,
    })
    await chat().answerApproval('p1', true, { post: async () => new Response(null, { status: 404 }), beforeAnswer: async () => {} })
    expect(activeChat(chat())!.messages[1].approvals![0].state).toBe('expired')
  })

  test('runs by Claude appear in the output panel', async () => {
    useSettings.setState({ outputOpen: false })
    await chat().send('test it', { stream: fakeStream([{ type: 'run', file: 'bfs.py', result: runResult }]), ...quiet })
    expect(useRun.getState()).toMatchObject({ state: 'done', result: runResult, lastFile: 'bfs.py' })
    expect(useSettings.getState().outputOpen).toBe(true)
  })

  test('an applied note change reloads the notes panel', async () => {
    const load = vi.fn(async () => {})
    useNotes.setState({ load })
    await chat().send('save it as a note', { stream: fakeStream([{ type: 'note_changed', note: 'note-2.md' }]), ...quiet })
    expect(load).toHaveBeenCalled()
  })

  test('tells Claude which note is open in the Notes panel', async () => {
    useSettings.setState({ notesOpen: true })
    useNotes.setState({ notes: [{ name: 'note-1.md', content: '# Two pointers' }], activeName: 'note-1.md' })
    const stream = fakeStream([{ type: 'done' }])
    await chat().send('hi', { stream, ...quiet })
    expect((stream.mock.calls[0][0] as ChatRequest).context.openNote).toEqual({ name: 'note-1.md', title: 'Two pointers' })
  })

  test('a dry run from Claude is added to the Playground and linked from the reply', async () => {
    const run = { id: 'v1', title: 'Dry run', createdAt: 5, steps: [{ note: 'a' }, { note: 'b' }] }
    await chat().send('dry run it', { stream: fakeStream([{ type: 'visualization', run }]), ...quiet })
    expect(usePlayground.getState().runs[0].id).toBe('v1')
    expect(activeChat(chat())!.messages[1].visualizations).toEqual([{ id: 'v1', title: 'Dry run', steps: 2 }])
  })

  test('tool progress shows on the reply until the tool call arrives', async () => {
    let emit!: (e: ChatEvent) => void
    let finish!: () => void
    const stream = vi.fn(async (_r: unknown, onEvent: (e: ChatEvent) => void) => {
      emit = onEvent
      await new Promise<void>((r) => (finish = r))
    })
    const pending = chat().send('dry run it', { stream, ...quiet })
    await vi.waitFor(() => expect(emit).toBeDefined())
    emit({ type: 'tool_progress', name: 'create_visualization', chars: 3000 })
    expect(activeChat(chat())!.messages[1].progress).toEqual({ name: 'create_visualization', chars: 3000 })
    emit({ type: 'tool', name: 'create_visualization', detail: '' })
    expect(activeChat(chat())!.messages[1].progress).toBeUndefined()
    finish()
    await pending
  })

  test('a reply you stop is marked as stopped, even if it had text', async () => {
    let seen: AbortSignal | undefined
    const stream = vi.fn(async (_r: unknown, onEvent: (e: ChatEvent) => void, opts?: { signal?: AbortSignal }) => {
      seen = opts?.signal
      onEvent({ type: 'text', text: 'Working on it' })
      await new Promise((r) => opts!.signal!.addEventListener('abort', r))
    })
    const pending = chat().send('hi', { stream, ...quiet })
    await vi.waitFor(() => expect(seen).toBeDefined())
    chat().stop()
    await pending
    expect(activeChat(chat())!.messages[1]).toMatchObject({ text: 'Working on it', stopped: true })
  })

  test('images go to Claude with the message; the chat keeps only small thumbnails', async () => {
    const stream = fakeStream([{ type: 'done' }])
    const image = { mediaType: 'image/png' as const, data: 'AAAA'.repeat(1000) }
    await chat().send('what is wrong here?', { stream, ...quiet, attachments: [{ image, thumb: 'data:image/jpeg;base64,thumb' }] })
    expect((stream.mock.calls[0][0] as ChatRequest).images).toEqual([image])
    expect(activeChat(chat())!.messages[0].images).toEqual([{ thumb: 'data:image/jpeg;base64,thumb' }])
    expect(localStorage.getItem('dsa-editor:ai')).not.toContain('AAAA')
  })

  test('an image can be sent without any text', async () => {
    const stream = fakeStream([{ type: 'done' }])
    await chat().send('', { stream, ...quiet, attachments: [{ image: { mediaType: 'image/png', data: 'x' } }] })
    expect(stream).toHaveBeenCalled()
    expect(activeChat(chat())!.title).toBe('Image')
  })

  test('an applied change reloads the files straight away', async () => {
    const afterEdits = vi.fn(async () => {})
    await chat().send('fix it', { stream: fakeStream([{ type: 'file_changed', file: 'main.cpp' }]), beforeSend: async () => {}, afterEdits })
    expect(afterEdits).toHaveBeenCalled()
  })
})
