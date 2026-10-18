// Dev-server bridge to the user's local Claude Code (via the Claude Agent SDK, which uses the existing
// Claude Code login). POST /api/claude/chat streams one turn back as server-sent events.
import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { ChatEvent, EditorContext } from '../src/lib/chatEvents.ts'
import { languageFromFilename } from '../src/lib/languages.ts'

export type { ChatEvent, EditorContext }

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

export type QueryFn = (params: { prompt: string; options?: Options }) => AsyncIterable<SDKMessage>

const ROUTE = '/api/claude/chat'

const SYSTEM_APPEND = `You are helping a student practise data structures and algorithms in a small browser code editor.
The working directory is their solutions folder: every file in it is one of their solution files.
Each message starts with an <editor_context> block describing the file they are looking at right now; treat its code as the current version.
Prefer explaining and hinting over handing out full solutions unless they ask for code. When they do ask you to change a file, edit it directly; the editor reloads it afterwards.
You cannot run code or shell commands here; the editor's Run button does that.`

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
  for (const key of ['file_path', 'path', 'pattern']) {
    const value = input[key]
    if (typeof value === 'string') return key === 'pattern' ? value : path.basename(value)
  }
  return ''
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
        ? [{ type: 'tool', name: block.name, detail: describeTool(block.input as Record<string, unknown>) }]
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

function parseContext(raw: unknown): EditorContext {
  const ctx = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const file = ctx.activeFile as Record<string, unknown> | null | undefined
  const activeFile =
    file && typeof file.name === 'string' && typeof file.content === 'string' ? { name: file.name, content: file.content } : null
  const openFiles = Array.isArray(ctx.openFiles) ? ctx.openFiles.filter((n): n is string => typeof n === 'string') : []
  return { activeFile, openFiles }
}

export function createClaudeChatMiddleware({ cwd, queryImpl = query }: { cwd: string; queryImpl?: QueryFn }): Middleware {
  return (req, res, next) => {
    if ((req.url ?? '').split('?')[0] !== ROUTE || req.method !== 'POST') return next()
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

      let sessionSent = false
      try {
        const messages = queryImpl({
          prompt: buildPrompt(body.message, parseContext(body.context)),
          options: {
            cwd,
            resume: typeof body.sessionId === 'string' ? body.sessionId : undefined,
            abortController,
            includePartialMessages: true,
            systemPrompt: { type: 'preset', preset: 'claude_code', append: SYSTEM_APPEND },
            // Reads are free; edits are auto-accepted only inside the solutions folder (acceptEdits);
            // anything else would need a prompt the browser can't show, so it is denied.
            allowedTools: ['Read', 'Glob', 'Grep'],
            disallowedTools: ['Bash', 'WebFetch', 'WebSearch', 'NotebookEdit'],
            permissionMode: 'acceptEdits',
            canUseTool: async (toolName) => ({
              behavior: 'deny',
              message: `${toolName} isn't available from the editor; only reading and editing files in the solutions folder is allowed.`,
            }),
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
