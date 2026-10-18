import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { EDIT_TOOLS, type ChatEvent, type ChatRequest } from '@/lib/chatEvents'
import { streamChat } from '@/lib/claudeClient'
import { flushAutosave } from './autosave'
import { refreshFromDisk } from './hydrate'
import { useWorkspace } from './workspace'

export interface ToolActivity {
  name: string
  detail: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  tools: ToolActivity[]
  error?: string
}

type StreamFn = (
  request: ChatRequest,
  onEvent: (event: ChatEvent) => void,
  opts?: { signal?: AbortSignal },
) => Promise<void>

/** Seams for tests; the defaults talk to the dev server and the editor. */
interface SendDeps {
  stream?: StreamFn
  /** Make sure Claude reads the latest code from disk. */
  beforeSend?: () => Promise<void>
  /** Pull Claude's file edits back into the editor. */
  afterEdits?: () => Promise<void>
}

interface AiChatState {
  /** Claude Code session to resume, so follow-up questions keep the conversation's context. */
  sessionId: string | null
  messages: ChatMessage[]
  status: 'idle' | 'streaming'
  send(text: string, deps?: SendDeps): Promise<void>
  stop(): void
  newChat(): void
}

let controller: AbortController | null = null

function editorContext(): ChatRequest['context'] {
  const { files, openIds } = useWorkspace.getState()
  const active = useWorkspace.getState().activeFile()
  return {
    activeFile: active ? { name: active.name, content: active.content } : null,
    openFiles: openIds.flatMap((id) => files.filter((f) => f.id === id).map((f) => f.name)),
  }
}

export const useAiChat = create<AiChatState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      messages: [],
      status: 'idle',

      async send(text, { stream = streamChat, beforeSend = flushAutosave, afterEdits = refreshFromDisk } = {}) {
        const message = text.trim()
        if (!message || get().status === 'streaming') return

        const replyId = crypto.randomUUID()
        set((s) => ({
          status: 'streaming',
          messages: [
            ...s.messages,
            { id: crypto.randomUUID(), role: 'user', text: message, tools: [] },
            { id: replyId, role: 'assistant', text: '', tools: [] },
          ],
        }))
        const patchReply = (patch: (m: ChatMessage) => Partial<ChatMessage>) =>
          set((s) => ({ messages: s.messages.map((m) => (m.id === replyId ? { ...m, ...patch(m) } : m)) }))

        controller = new AbortController()
        let edited = false
        try {
          await beforeSend()
          await stream(
            { message, sessionId: get().sessionId, context: editorContext() },
            (event) => {
              if (event.type === 'session') set({ sessionId: event.sessionId })
              else if (event.type === 'text') patchReply((m) => ({ text: m.text + event.text }))
              else if (event.type === 'tool') {
                if (EDIT_TOOLS.has(event.name)) edited = true
                patchReply((m) => ({ tools: [...m.tools, { name: event.name, detail: event.detail }] }))
              } else if (event.type === 'error') patchReply(() => ({ error: event.message }))
            },
            { signal: controller.signal },
          )
          if (edited) await afterEdits()
        } finally {
          controller = null
          set({ status: 'idle' })
        }
      },

      stop() {
        controller?.abort()
      },

      newChat() {
        controller?.abort()
        set({ sessionId: null, messages: [], status: 'idle' })
      },
    }),
    {
      name: 'dsa-editor:ai',
      partialize: ({ sessionId, messages }) => ({ sessionId, messages }),
    },
  ),
)
