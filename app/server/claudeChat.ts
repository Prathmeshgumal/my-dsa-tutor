// Dev-server bridge to the editor's Claude agent (Claude Agent SDK, using the existing Claude Code login).
//   POST /api/claude/chat      { message, sessionId, context } → one turn, streamed as server-sent events
//   POST /api/claude/approval  { id, approved }                → the user's answer to a proposed change
// The agent can only use the editor tools in ./editorTools.ts: Claude Code's own tools, the user's
// settings, CLAUDE.md, plugins and MCP servers are all switched off.
import { createSdkMcpServer, query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { TOOL_PREFIX, type ChatEvent, type EditorContext, type LastRun } from '../src/lib/chatEvents.ts'
import { languageFromFilename } from '../src/lib/languages.ts'
import { createPistonRunner } from '../src/lib/runner/piston.ts'
import type { CodeRunner } from '../src/lib/runner/types.ts'
import { createEditorTools, toSdkTools, TOOL_NAMES, type ApprovalRequest } from './editorTools.ts'

export type { ChatEvent, EditorContext }

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

export type QueryFn = (params: { prompt: string; options?: Options }) => AsyncIterable<SDKMessage>

const ROUTE = '/api/claude/chat'
const APPROVAL_ROUTE = '/api/claude/approval'

const SYSTEM_PROMPT = `You are the coding assistant inside a small browser editor where a student practises data structures and algorithms in C++, Java and Python.

You can only act through these tools:
- get_editor_state: which file is open and which tabs are open
- list_files / read_file: the student's solution files (read_file shows line numbers)
- get_last_run: what the output panel shows (last result, output, compiler errors)
- run_code: compile and run a file, optionally with stdin, to test it; the student sees the result in their output panel
- edit_file / create_file: propose a change; the student sees it and must approve it before it is applied

How to help:
- Each message starts with an <editor_context> block naming the open file, with its current code. Treat that code as current.
- Prefer explaining and hinting over handing out full solutions, unless the student asks for code or a fix.
- Check your claims: read the code, look at the last run, and run the code (with test input when useful) before saying something is fixed or correct.
- Only change files when the student asks you to. Keep each edit small and give a one-line explanation. If an edit is declined, don't try again another way; ask what they want.
- Be concise. Use Markdown, with fenced code blocks for code.`

export function buildPrompt(message: string, context: EditorContext): string {
  const lines = ['<editor_context>']
  if (context.activeFile) {
    const { name, content } = context.activeFile
    const lang = languageFromFilename(name)?.monaco ?? ''
    lines.push(`The user is looking at \`${name}\` in the editor. Its current contents:`, '```' + lang, content, '```')
  } else {
    lines.push('No file is open in the editor right now.')
  }
  const others = context.openFiles.filter((n) => n !== context.activeFile?.name)
  if (others.length) lines.push(`Other open tabs: ${others.join(', ')}`)
  lines.push('</editor_context>', '', message)
  return lines.join('\n')
}

function describeTool(input: Record<string, unknown>): string {
  return typeof input.name === 'string' ? input.name : ''
}

/** Turns SDK messages into the few events the chat UI needs (top-level agent only). */
function toEvents(message: SDKMessage): ChatEvent[] {
  if (message.type === 'stream_event' && message.parent_tool_use_id === null) {
    const event = message.event
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') return [{ type: 'text', text: event.delta.text }]
    return []
  }
  if (message.type === 'assistant' && message.parent_tool_use_id === null) {
    return message.message.content.flatMap((block): ChatEvent[] =>
      block.type === 'tool_use'
        ? [{ type: 'tool', name: block.name.replace(TOOL_PREFIX, ''), detail: describeTool(block.input as Record<string, unknown>) }]
        : [],
    )
  }
  if (message.type === 'result') {
    if (message.subtype === 'success' && !message.is_error) return [{ type: 'done' }]
    const errors = 'errors' in message ? message.errors : []
    return [{ type: 'error', message: errors.join('\n') || 'Claude stopped with an error.' }]
  }
  return []
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function parseLastRun(raw: unknown): LastRun {
  if (typeof raw !== 'object' || raw === null) return null
  const run = raw as Record<string, unknown>
  const file = typeof run.file === 'string' ? run.file : null
  if (typeof run.error === 'string') return { file, error: run.error }
  const r = run.result as Record<string, unknown> | undefined
  if (!r || typeof r.statusText !== 'string') return null
  const text = (v: unknown) => (typeof v === 'string' ? v : '')
  const num = (v: unknown) => (typeof v === 'number' ? v : null)
  return {
    file,
    result: {
      status: (text(r.status) || 'success') as 'success',
      statusText: r.statusText,
      stdout: text(r.stdout),
      stderr: text(r.stderr),
      compileOutput: text(r.compileOutput),
      timeMs: num(r.timeMs),
      memoryKb: num(r.memoryKb),
    },
  }
}

function parseContext(raw: unknown): EditorContext {
  const ctx = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const file = ctx.activeFile as Record<string, unknown> | null | undefined
  const activeFile =
    file && typeof file.name === 'string' && typeof file.content === 'string' ? { name: file.name, content: file.content } : null
  const openFiles = Array.isArray(ctx.openFiles) ? ctx.openFiles.filter((n): n is string => typeof n === 'string') : []
  return { activeFile, openFiles, lastRun: parseLastRun(ctx.lastRun) }
}

/** Proposed changes waiting for the user's yes/no, shared between the chat stream and the approval endpoint. */
export function createApprovals() {
  const waiting = new Map<string, (approved: boolean) => void>()
  return {
    /** Sends the proposal to the browser and resolves with the decision (false if the turn is stopped). */
    request(send: (e: ChatEvent) => void, signal: AbortSignal, change: ApprovalRequest): Promise<boolean> {
      const id = randomUUID()
      return new Promise<boolean>((resolve) => {
        const finish = (approved: boolean) => {
          waiting.delete(id)
          signal.removeEventListener('abort', onAbort)
          resolve(approved)
        }
        const onAbort = () => finish(false)
        if (signal.aborted) return finish(false)
        signal.addEventListener('abort', onAbort)
        waiting.set(id, finish)
        send({ type: 'approval', id, ...change })
      })
    },
    decide(id: string, approved: boolean): boolean {
      const finish = waiting.get(id)
      finish?.(approved)
      return Boolean(finish)
    },
  }
}

export type Approvals = ReturnType<typeof createApprovals>

interface MiddlewareOptions {
  cwd: string
  queryImpl?: QueryFn
  /** Runs code for the run_code tool. */
  runner?: CodeRunner
  approvals?: Approvals
}

export function createClaudeChatMiddleware({
  cwd,
  queryImpl = query,
  runner = createPistonRunner({ baseUrl: `${process.env.PISTON_URL ?? 'http://127.0.0.1:2000'}/api/v2` }),
  approvals = createApprovals(),
}: MiddlewareOptions): Middleware {
  return (req, res, next) => {
    const route = (req.url ?? '').split('?')[0]
    if (req.method !== 'POST' || (route !== ROUTE && route !== APPROVAL_ROUTE)) return next()
    if (route === APPROVAL_ROUTE) {
      void (async () => {
        const body = await readBody(req)
        const found = body && typeof body.id === 'string' && approvals.decide(body.id, body.approved === true)
        res.statusCode = found ? 204 : 404
        res.end()
      })()
      return
    }
    void (async () => {
      const body = await readBody(req)
      if (!body || typeof body.message !== 'string' || !body.message.trim()) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: '"message" is required' }))
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      const send = (event: ChatEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`)

      const abortController = new AbortController()
      res.on('close', () => abortController.abort())

      const context = parseContext(body.context)
      const tools = createEditorTools({
        dir: cwd,
        context,
        runner,
        requestApproval: (change) => approvals.request(send, abortController.signal, change),
        onRun: (file, result) => send({ type: 'run', file, result }),
        onFileChanged: (file) => send({ type: 'file_changed', file }),
      })

      let sessionSent = false
      try {
        const messages = queryImpl({
          prompt: buildPrompt(body.message, context),
          options: {
            cwd,
            resume: typeof body.sessionId === 'string' ? body.sessionId : undefined,
            abortController,
            includePartialMessages: true,
            systemPrompt: SYSTEM_PROMPT,
            // Only the editor tools: no built-in tools, no user/project settings, CLAUDE.md, plugins or MCP servers.
            tools: [],
            settingSources: [],
            strictMcpConfig: true,
            mcpServers: { editor: createSdkMcpServer({ name: 'editor', tools: toSdkTools(tools) }) },
            // Reads and runs are harmless; edits ask the user themselves (inside the tool), so all run without a prompt.
            allowedTools: TOOL_NAMES.map((n) => `${TOOL_PREFIX}${n}`),
            canUseTool: async (toolName) => ({ behavior: 'deny', message: `${toolName} isn't available in the editor.` }),
            maxTurns: 30,
          },
        })
        for await (const message of messages) {
          if (!sessionSent && 'session_id' in message && message.session_id) {
            send({ type: 'session', sessionId: message.session_id })
            sessionSent = true
          }
          for (const event of toEvents(message)) send(event)
        }
      } catch (e) {
        if (!abortController.signal.aborted) send({ type: 'error', message: e instanceof Error ? e.message : String(e) })
      }
      res.end()
    })()
  }
}
