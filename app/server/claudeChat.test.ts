// @vitest-environment node
import { createServer, type Server } from 'node:http'
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { buildPrompt, createApprovals, createClaudeChatMiddleware, type Approvals, type ChatEvent, type QueryFn } from './claudeChat'

let server: Server
let base: string
let calls: { prompt: string; options: Options }[]

function fakeQuery(messages: SDKMessage[] | ((options: Options) => AsyncGenerator<SDKMessage>)): QueryFn {
  return ({ prompt, options }) => {
    calls.push({ prompt: prompt as string, options: options! })
    if (typeof messages === 'function') return messages(options!)
    return (async function* () {
      for (const m of messages) yield m
    })()
  }
}

async function start(queryImpl: QueryFn, approvals: Approvals = createApprovals()) {
  calls = []
  const middleware = createClaudeChatMiddleware({ cwd: '/tmp/solutions', notesDir: '/tmp/notes', playgroundDir: '/tmp/playground', queryImpl, approvals })
  server = createServer((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 418
      res.end()
    }),
  )
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
}

afterEach(async () => {
  await new Promise((r) => server.close(r))
})

async function chat(body: unknown): Promise<ChatEvent[]> {
  const res = await fetch(`${base}/api/claude/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  expect(res.headers.get('content-type')).toMatch(/text\/event-stream/)
  const text = await res.text()
  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice(6)) as ChatEvent)
}

const sid = 'session-123'
const m = (x: unknown) => x as SDKMessage

const textDelta = (text: string) =>
  m({
    type: 'stream_event',
    session_id: sid,
    parent_tool_use_id: null,
    event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  })

const toolUse = (name: string, input: Record<string, unknown>, parent: string | null = null) =>
  m({
    type: 'assistant',
    session_id: sid,
    parent_tool_use_id: parent,
    message: { content: [{ type: 'tool_use', id: `t-${name}`, name, input }] },
  })

const success = m({ type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: sid })

const body = {
  message: 'Why is this O(n^2)?',
  sessionId: null,
  context: { activeFile: { name: 'two_sum.cpp', content: 'int main(){}' }, openFiles: ['two_sum.cpp', 'bfs.py'], lastRun: null },
}

test('streams session id, text deltas, tool activity and done', async () => {
  await start(
    fakeQuery([
      m({ type: 'system', subtype: 'init', session_id: sid }),
      textDelta('Hello'),
      textDelta(' there'),
      toolUse('mcp__editor__read_file', { name: 'two_sum.cpp' }),
      success,
    ]),
  )
  expect(await chat(body)).toEqual([
    { type: 'session', sessionId: sid },
    { type: 'text', text: 'Hello' },
    { type: 'text', text: ' there' },
    { type: 'tool', name: 'read_file', detail: 'two_sum.cpp' },
    { type: 'done' },
  ])
})

test('edits are reported so the editor can reload files', async () => {
  await start(fakeQuery([toolUse('mcp__editor__edit_file', { name: 'two_sum.cpp', old_text: 'a', new_text: 'b' }), success]))
  const events = await chat(body)
  expect(events).toContainEqual({ type: 'tool', name: 'edit_file', detail: 'two_sum.cpp' })
})

test('subagent activity and non-text deltas are not forwarded', async () => {
  await start(
    fakeQuery([
      m({ type: 'stream_event', session_id: sid, parent_tool_use_id: 'x', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hidden' } } }),
      m({ type: 'stream_event', session_id: sid, parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{' } } }),
      toolUse('Grep', { pattern: 'x' }, 'parent'),
      success,
    ]),
  )
  expect(await chat(body)).toEqual([{ type: 'session', sessionId: sid }, { type: 'done' }])
})

test('the agent only gets the editor tools: no built-ins, no personal settings, plugins or MCP servers', async () => {
  await start(fakeQuery([success]))
  await chat({ ...body, sessionId: 'old-session' })
  const { options, prompt } = calls[0]
  expect(options.cwd).toBe('/tmp/solutions')
  expect(options.resume).toBe('old-session')
  expect(options.includePartialMessages).toBe(true)
  expect(options.tools).toEqual([])
  expect(options.settingSources).toEqual([])
  expect(options.strictMcpConfig).toBe(true)
  expect(Object.keys(options.mcpServers!)).toEqual(['editor'])
  expect(options.allowedTools).toEqual(
    ['get_editor_state', 'list_files', 'read_file', 'get_last_run', 'run_code', 'edit_file', 'create_file', 'list_notes', 'read_note', 'create_note', 'edit_note', 'create_visualization'].map(
      (n) => `mcp__editor__${n}`,
    ),
  )
  expect(typeof options.systemPrompt).toBe('string')
  expect(options.systemPrompt).toContain('edit_file')
  expect(options.systemPrompt).toContain('create_note')
  expect(prompt).toContain('Why is this O(n^2)?')
  expect(prompt).toContain('two_sum.cpp')
})

test('a new chat does not resume', async () => {
  await start(fakeQuery([success]))
  await chat(body)
  expect(calls[0].options.resume).toBeUndefined()
})

test('anything that would need a permission prompt is denied', async () => {
  await start(fakeQuery([success]))
  await chat(body)
  const decision = await calls[0].options.canUseTool!('Bash', { command: 'rm -rf /' }, {
    signal: new AbortController().signal,
    suggestions: [],
    toolUseID: 't1',
  } as never)
  expect(decision.behavior).toBe('deny')
})

test('error results and thrown errors become error events', async () => {
  await start(fakeQuery([m({ type: 'result', subtype: 'error_max_turns', is_error: true, errors: ['too many turns'], session_id: sid })]))
  expect((await chat(body)).at(-1)).toEqual({ type: 'error', message: 'too many turns' })
  await new Promise((r) => server.close(r))

  await start(
    fakeQuery(async function* () {
      throw new Error('Claude Code is not logged in')
    }),
  )
  expect(await chat(body)).toEqual([{ type: 'error', message: 'Claude Code is not logged in' }])
})

test('client disconnect aborts the Claude run', async () => {
  let signal: AbortSignal | undefined
  await start(
    fakeQuery(async function* (options) {
      signal = options.abortController!.signal
      yield textDelta('working…')
      await new Promise((r) => signal!.addEventListener('abort', r))
    }),
  )
  const controller = new AbortController()
  const res = await fetch(`${base}/api/claude/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
  const reader = res.body!.getReader()
  await reader.read()
  controller.abort()
  await vi.waitFor(() => expect(signal?.aborted).toBe(true))
})

test('missing message → 400', async () => {
  await start(fakeQuery([success]))
  const res = await fetch(`${base}/api/claude/chat`, { method: 'POST', body: JSON.stringify({ context: {} }) })
  expect(res.status).toBe(400)
})

test('other URLs fall through', async () => {
  await start(fakeQuery([success]))
  expect((await fetch(`${base}/api/other`)).status).toBe(418)
})

describe('buildPrompt', () => {
  test('includes the open file with its code, other open files, then the question', () => {
    const p = buildPrompt('Explain this', {
      activeFile: { name: 'a.py', content: 'print(1)' },
      openFiles: ['a.py', 'b.cpp'],
    })
    expect(p).toContain('`a.py`')
    expect(p).toContain('```python\nprint(1)\n```')
    expect(p).toContain('b.cpp')
    expect(p.trimEnd().endsWith('Explain this')).toBe(true)
  })

  test('mentions the note open in the Notes panel', () => {
    expect(buildPrompt('Hi', { activeFile: null, openFiles: [], lastRun: null, openNote: { name: 'note-1.md', title: 'Two pointers' } })).toContain(
      'note-1.md (Two pointers)',
    )
  })

  test('no active file → just says so', () => {
    expect(buildPrompt('Hi', { activeFile: null, openFiles: [] })).toContain('No file is open')
  })
})

describe('approvals', () => {
  const change = { kind: 'edit' as const, file: 'a.cpp', before: 'x', after: 'y', explanation: 'why' }

  test('a change waits for the user: the browser gets an approval event, then POSTs the decision', async () => {
    const approvals = createApprovals()
    await start(fakeQuery([success]), approvals)
    const sent: ChatEvent[] = []
    const decision = approvals.request((e) => sent.push(e), new AbortController().signal, change)
    expect(sent).toEqual([{ type: 'approval', id: expect.any(String), ...change }])
    const id = (sent[0] as { id: string }).id
    const res = await fetch(`${base}/api/claude/approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, approved: true }),
    })
    expect(res.status).toBe(204)
    expect(await decision).toBe(true)
  })

  test('an unknown or already-answered approval → 404', async () => {
    await start(fakeQuery([success]))
    const res = await fetch(`${base}/api/claude/approval`, { method: 'POST', body: JSON.stringify({ id: 'nope', approved: true }) })
    expect(res.status).toBe(404)
  })

  test('if the reply is stopped while waiting, the change counts as declined', async () => {
    const approvals = createApprovals()
    const controller = new AbortController()
    const decision = approvals.request(() => {}, controller.signal, change)
    controller.abort()
    expect(await decision).toBe(false)
  })
})
