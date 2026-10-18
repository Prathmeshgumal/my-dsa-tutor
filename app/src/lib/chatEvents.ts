// Shared between the dev server (server/claudeChat.ts) and the browser.

/** One server-sent event from POST /api/claude/chat. */
export type ChatEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; detail: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface EditorContext {
  activeFile: { name: string; content: string } | null
  openFiles: string[]
}

export interface ChatRequest {
  message: string
  sessionId: string | null
  context: EditorContext
}

/** Tools that change files on disk; after one runs, the editor reloads files. */
export const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit'])
