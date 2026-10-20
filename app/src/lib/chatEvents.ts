// Shared between the dev server (server/claudeChat.ts) and the browser.
import type { DryRun } from './dryRun.ts'
import type { RunResult } from './runner/types.ts'

/** What a proposed change does: a solution file (edit/create) or a note (edit_note/create_note). */
export type ApprovalKind = 'edit' | 'create' | 'edit_note' | 'create_note'

/** One server-sent event from POST /api/claude/chat. */
export type ChatEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; detail: string }
  /** Claude wants to change a file and is waiting for the user's yes/no (POST /api/claude/approval). */
  | { type: 'approval'; id: string; kind: ApprovalKind; file: string; before: string; after: string; explanation: string }
  /** Claude ran code; the editor shows it in the output panel. */
  | { type: 'run'; file: string; result: RunResult }
  /** An approved change was written to disk; the editor reloads its files. */
  | { type: 'file_changed'; file: string }
  /** An approved change to a note was written; the notes panel reloads. */
  | { type: 'note_changed'; note: string }
  /** Claude made a dry-run visualization for the Playground. */
  | { type: 'visualization'; run: DryRun }
  | { type: 'done' }
  | { type: 'error'; message: string }

/** What the output panel shows right now. */
export type LastRun = { file: string | null; result: RunResult } | { file: string | null; error: string } | null

export interface EditorContext {
  activeFile: { name: string; content: string } | null
  openFiles: string[]
  lastRun: LastRun
  /** The note open in the Notes panel, if the panel is open. */
  openNote: { name: string; title: string } | null
}

export interface ChatRequest {
  message: string
  sessionId: string | null
  context: EditorContext
}

/** The agent's tools live on an in-process MCP server named "editor". */
export const TOOL_PREFIX = 'mcp__editor__'

/** Tools that change files on disk; after one runs, the editor reloads files. */
export const EDIT_TOOLS = new Set(['edit_file', 'create_file'])
