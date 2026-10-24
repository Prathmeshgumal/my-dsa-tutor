// Dev-server bridge to the editor's Claude agent (Claude Agent SDK, using the existing Claude Code login).
//   POST /api/claude/chat      { message, sessionId, context } → one turn, streamed as server-sent events
//   GET  /api/claude/turns/:id?after=n                         → the same turn's events after the nth (reconnect)
//   POST /api/claude/turns/:id/stop                            → stops the turn
//   POST /api/claude/approval  { id, approved }                → the user's answer to a proposed change
//   POST /api/claude/apply     { change }                      → applies a proposal Claude stopped waiting for
// The agent can only use the editor tools in ./editorTools.ts: Claude Code's own tools, the user's
// settings, CLAUDE.md, plugins and MCP servers are all switched off.
import { createSdkMcpServer, query, type Options, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  TOOL_PREFIX,
  type ChatEvent,
  type ChatImage,
  type EditorContext,
  type LastRun,
} from '@dsa/core/chatEvents'
import { languageFromFilename } from '@dsa/core/languages'
import { createPistonRunner } from '@dsa/core/runner/piston'
import type { CodeRunner } from '@dsa/core/runner/types'
import { applyChange, changeSchema, ToolError } from './changes.ts'
import { createEditorTools, toSdkTools, TOOL_NAMES, type ApprovalRequest } from './editorTools.ts'
import type { Logger } from './log.ts'
import { createTurns, type Turns } from './turns.ts'

export type { ChatEvent, EditorContext }

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

export type QueryFn = (params: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }) => AsyncIterable<SDKMessage>

const ROUTE = '/api/claude/chat'
const APPROVAL_ROUTE = '/api/claude/approval'
const APPLY_ROUTE = '/api/claude/apply'
const TURN_ROUTE = /^\/api\/claude\/turns\/([\w-]+)(\/stop)?$/

const SYSTEM_PROMPT = `You are the coding assistant inside a small browser editor where a student practises data structures and algorithms in C++, Java and Python.

You can only act through these tools:
- get_editor_state: which file is open and which tabs are open
- list_files / read_file: the student's solution files (read_file shows line numbers)
- get_last_run: what the output panel shows (last result, output, compiler errors, and the input it was given)
- run_code: compile and run a file, optionally with stdin, to test it; the student sees the result in their output panel
- edit_file / create_file: propose a change; the student sees it and must approve it before it is applied
- list_notes / read_note: the student's Markdown notes (shown in the editor's Notes panel)
- create_note / edit_note: propose a new note or a change to one; also needs approval. When the student asks you to save or add something to their notes, use these (not comments in code).
- create_visualization: show a step-by-step dry run in the Playground (code with the current line, variables, and data structures drawn as arrays with pointers, DP grids, maps, stacks, queues, linked lists, trees, graphs)
- list_problems / get_problem / create_problem / add_test_case / edit_solution / run_tests / list_attempts: practice problems on the Problem screen (LeetCode style: description, class Solution in the editor, test cases checked automatically)

Practice problems:
- When the student shares a question to solve (pasted text, a screenshot, a LeetCode or codehelp problem), create it with create_problem instead of writing a .cpp file, so they get the problem layout. Copy the statement faithfully; add a few edge cases beyond the examples, with answers you've worked out carefully.
- When the Problem screen is showing, <editor_context> names the problem; use get_problem to read it and its solution (not read_file).
- To explain the question, work from its description and examples. Don't hand out the solution unless asked.
- If their code misses an edge case, show it with add_test_case rather than putting tests in their code.
- Use run_tests to check claims about their solution. Only the student's Submit records an attempt or marks a problem solved.
- Everything about a problem belongs to it: while it's open, notes you create, dry runs (pass "problem" to create_visualization so it traces their solution) and this chat are linked to it automatically. A problem can have several versions of the code (e.g. brute force and optimal): save_code_version adds one, and edit_solution / run_tests take a "file".

Dry runs:
- When the student asks for a dry run, asks why their code is wrong, or would understand something better by seeing it, use create_visualization.
- Trace the student's actual code from their file (pass "file"), with a small input. Read the file first so every step's line number is right.
- Be faithful: show what the code really does, including the bug. Mark the step where it goes wrong with mistake: true, and explain it in that step's note.
- Before creating it, run the code with the same input (run_code) and make sure the final values and output in your trace match the real run.
- Keep it focused: one step per meaningful line, usually 10–60 steps. Afterwards, point out in chat what to watch for.
- Make each step easy to follow: add "moves" arrows when values go somewhere (swaps, copies, shifts, writes into a map), "check" on steps that evaluate a condition (with the real values and whether it's true), "calc" when a line computes something (e.g. "sum = 2 + 7 = 9"), "loop" for where you are in the loops (e.g. "pass 2 of 3 · j = 1"), and "callStack" for recursion. Old values and pointer moves are shown automatically.
- For a vector, pass its capacity so spare slots show.
- Pass "expected": the correct output for that input, printed the way the code prints it, and keep "output" up to date so the last step shows what the code really printed. The student then sees straight away whether the answer is right.
- When the algorithm has parts (e.g. "Transpose", then "Reverse each row"; or "Build the map", then "Look up pairs"), set "phase" on the first step of each part. They show as bands on the timeline.

How to help:
- When the student presses Run, the program runs like a terminal: it prints its prompts and waits while they type each answer and press Enter (get_last_run shows what they typed). run_code takes stdin up front for your own test runs.
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
  if (context.openNote) lines.push(`Open in the Notes panel: ${context.openNote.name} (${context.openNote.title})`)
  if (context.openProblem) {
    const { title, slug, file } = context.openProblem
    lines.push(
      `The Problem screen is showing "${title}" (slug ${slug})${file && file !== 'solution.cpp' ? `, with its ${file} open in the editor` : ''}; use get_problem to read it.`,
    )
  }
  lines.push('</editor_context>', '', message)
  return lines.join('\n')
}

function describeTool(input: Record<string, unknown>): string {
  return typeof input.name === 'string' ? input.name : ''
}

/** Report tool-input progress at most once per this many characters. */
const PROGRESS_EVERY = 1000

/** Turns SDK messages into the few events the chat UI needs (top-level agent only). One per reply: it keeps state. */
function createEventMapper() {
  let sentText = false
  let progress: { name: string; chars: number; reported: number } | null = null

  return function toEvents(message: SDKMessage): ChatEvent[] {
    if (message.type === 'stream_event' && message.parent_tool_use_id === null) {
      const event = message.event
      if (event.type === 'content_block_start') {
        const block = event.content_block
        // A new text block after earlier text (e.g. after a tool call) starts a new paragraph.
        if (block.type === 'text' && sentText) return [{ type: 'text', text: '\n\n' }]
        if (block.type === 'tool_use') {
          progress = { name: block.name.replace(TOOL_PREFIX, ''), chars: 0, reported: 0 }
          return [{ type: 'tool_progress', name: progress.name, chars: 0 }]
        }
        return []
      }
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          sentText = true
          return [{ type: 'text', text: event.delta.text }]
        }
        if (event.delta.type === 'input_json_delta' && progress) {
          progress.chars += event.delta.partial_json.length
          if (progress.chars - progress.reported >= PROGRESS_EVERY) {
            progress.reported = progress.chars
            return [{ type: 'tool_progress', name: progress.name, chars: progress.chars }]
          }
        }
      }
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
}

/** Images from the request, or a reason they can't be sent. */
function parseImages(raw: unknown): ChatImage[] | string {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) return '"images" must be a list'
  if (raw.length > MAX_IMAGES) return `At most ${MAX_IMAGES} images per message`
  const images: ChatImage[] = []
  for (const img of raw as Record<string, unknown>[]) {
    if (!IMAGE_TYPES.includes(img?.mediaType as ChatImage['mediaType'])) return 'Images must be PNG, JPEG, GIF or WebP'
    if (typeof img.data !== 'string' || !img.data) return 'Image data is missing'
    // base64 → bytes is 3/4 of the length
    if ((img.data.length * 3) / 4 > MAX_IMAGE_BYTES) return 'Each image must be under 5 MB'
    images.push({ mediaType: img.mediaType as ChatImage['mediaType'], data: img.data })
  }
  return images
}

/** With images, the prompt becomes one user message whose content has the images first, then the text. */
async function* withImages(text: string, images: ChatImage[]): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content: [
        ...images.map((img) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: img.mediaType, data: img.data } })),
        { type: 'text' as const, text },
      ],
    },
  }
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
  const stdin = typeof run.stdin === 'string' ? run.stdin : undefined
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
    ...(stdin !== undefined ? { stdin } : {}),
  }
}

function parseContext(raw: unknown): EditorContext {
  const ctx = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const file = ctx.activeFile as Record<string, unknown> | null | undefined
  const activeFile =
    file && typeof file.name === 'string' && typeof file.content === 'string' ? { name: file.name, content: file.content } : null
  const openFiles = Array.isArray(ctx.openFiles) ? ctx.openFiles.filter((n): n is string => typeof n === 'string') : []
  const note = ctx.openNote as Record<string, unknown> | null | undefined
  const openNote = note && typeof note.name === 'string' && typeof note.title === 'string' ? { name: note.name, title: note.title } : null
  const prob = ctx.openProblem as Record<string, unknown> | null | undefined
  const openProblem =
    prob && typeof prob.slug === 'string' && typeof prob.title === 'string'
      ? { slug: prob.slug, title: prob.title, ...(typeof prob.file === 'string' ? { file: prob.file } : {}) }
      : null
  return { activeFile, openFiles, lastRun: parseLastRun(ctx.lastRun), openNote, openProblem }
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
  /** The Markdown notes folder, for the notes tools. */
  notesDir: string
  /** Where dry-run visualizations are saved. */
  playgroundDir: string
  /** Where practice problems live. */
  problemsDir: string
  queryImpl?: QueryFn
  /** Runs code for the run_code tool. */
  runner?: CodeRunner
  approvals?: Approvals
  turns?: Turns
  /** Where failed replies are recorded. */
  logger?: Logger
}

export function createClaudeChatMiddleware({
  cwd,
  notesDir,
  playgroundDir,
  problemsDir,
  queryImpl = query,
  runner = createPistonRunner({ baseUrl: 'http://127.0.0.1:2000/api/v2' }),
  approvals = createApprovals(),
  turns = createTurns(),
  logger,
}: MiddlewareOptions): Middleware {
  return (req, res, next) => {
    const [route, query = ''] = (req.url ?? '').split('?')
    const turnRoute = TURN_ROUTE.exec(route)
    if (turnRoute) {
      const [, id, stop] = turnRoute
      if (stop && req.method === 'POST') {
        res.statusCode = turns.stop(id) ? 204 : 404
        res.end()
        return
      }
      if (!stop && req.method === 'GET') {
        const after = Number(new URLSearchParams(query).get('after') ?? 0)
        if (turns.watch(id, Number.isFinite(after) ? after : 0, res)) return
        res.statusCode = 404
        res.end(JSON.stringify({ error: 'That reply is no longer available (the editor may have restarted).' }))
        return
      }
      return next()
    }
    if (req.method !== 'POST' || (route !== ROUTE && route !== APPROVAL_ROUTE && route !== APPLY_ROUTE)) return next()
    if (route === APPLY_ROUTE) {
      void (async () => {
        const parsed = changeSchema.safeParse((await readBody(req))?.change)
        res.setHeader('Content-Type', 'application/json')
        if (!parsed.success) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'That isn’t a change the editor can apply.' }))
          return
        }
        try {
          res.end(JSON.stringify(await applyChange({ dir: cwd, notesDir, problemsDir }, parsed.data)))
        } catch (e) {
          // The change no longer fits: the file changed since, or is already there.
          res.statusCode = e instanceof ToolError ? 409 : 500
          res.end(JSON.stringify({ error: e instanceof ToolError ? e.forPerson : e instanceof Error ? e.message : String(e) }))
        }
      })()
      return
    }
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
      const images = parseImages(body?.images)
      const message = typeof body?.message === 'string' ? body.message.trim() : ''
      const problem = !body
        ? 'Expected a JSON body'
        : typeof images === 'string'
          ? images
          : !message && !images.length
            ? '"message" is required'
            : null
      if (!body || problem || typeof images === 'string') {
        res.statusCode = 400
        res.end(JSON.stringify({ error: problem }))
        return
      }

      const context = parseContext(body.context)
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined

      const runTurn = async (sendEvent: (e: ChatEvent) => void, signal: AbortSignal) => {
        const send = (e: ChatEvent) => {
          if (e.type === 'error') logger?.log('error', 'Claude reply failed', e.message)
          sendEvent(e)
        }
        const abortController = new AbortController()
        signal.addEventListener('abort', () => abortController.abort())

        const tools = createEditorTools({
          dir: cwd,
          notesDir,
          playgroundDir,
          problemsDir,
          context,
          runner,
          requestApproval: (change) => approvals.request(send, abortController.signal, change),
          onRun: (file, result, stdin) => send({ type: 'run', file, result, stdin }),
          onFileChanged: (file) => send({ type: 'file_changed', file }),
          onNoteChanged: (note) => send({ type: 'note_changed', note }),
          onVisualization: (run) => send({ type: 'visualization', run }),
          onProblemChanged: (slug, open) => send({ type: 'problem_changed', slug, open }),
        })

        const toEvents = createEventMapper()
        let sessionSent = false
        const messages = queryImpl({
          prompt: images.length
            ? withImages(buildPrompt(message || 'Have a look at this image.', context), images)
            : buildPrompt(message, context),
          options: {
            cwd,
            resume: sessionId,
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
        try {
          for await (const message of messages) {
            if (!sessionSent && 'session_id' in message && message.session_id) {
              send({ type: 'session', sessionId: message.session_id })
              sessionSent = true
            }
            for (const event of toEvents(message)) send(event)
          }
        } catch (e) {
          if (!signal.aborted) logger?.log('error', 'Claude reply failed', e)
          throw e
        }
      }

      // The reply runs on its own: closing the page doesn't stop it, and the page can reconnect to it.
      turns.watch(turns.start(runTurn), 0, res)
    })()
  }
}
