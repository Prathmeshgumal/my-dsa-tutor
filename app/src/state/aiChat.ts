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

export interface Chat {
  id: string
  title: string
  /** Claude Code session to resume, so follow-up questions keep this chat's context. */
  sessionId: string | null
  messages: ChatMessage[]
  updatedAt: number
}

interface AiChatState {
  /** Most recently used first. */
  chats: Chat[]
  /** null = a fresh chat that becomes a real one when its first message is sent. */
  activeChatId: string | null
  /** The chat Claude is replying in; only one reply runs at a time. */
  streamingChatId: string | null
  status: 'idle' | 'streaming'
  send(text: string, deps?: SendDeps): Promise<void>
  stop(): void
  newChat(): void
  selectChat(id: string): void
  deleteChat(id: string): void
}

const TITLE_MAX = 48

function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line
}

export function activeChat(state: Pick<AiChatState, 'chats' | 'activeChatId'>): Chat | null {
  return state.chats.find((c) => c.id === state.activeChatId) ?? null
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
      chats: [],
      activeChatId: null,
      streamingChatId: null,
      status: 'idle',

      async send(text, { stream = streamChat, beforeSend = flushAutosave, afterEdits = refreshFromDisk } = {}) {
        const message = text.trim()
        if (!message || get().status === 'streaming') return

        const existing = activeChat(get())
        const chatId = existing?.id ?? crypto.randomUUID()
        const replyId = crypto.randomUUID()
        const newMessages: ChatMessage[] = [
          { id: crypto.randomUUID(), role: 'user', text: message, tools: [] },
          { id: replyId, role: 'assistant', text: '', tools: [] },
        ]
        set((s) => {
          const base: Chat = existing ?? { id: chatId, title: titleFrom(message), sessionId: null, messages: [], updatedAt: 0 }
          const updated = { ...base, messages: [...base.messages, ...newMessages], updatedAt: Date.now() }
          return {
            status: 'streaming',
            streamingChatId: chatId,
            activeChatId: chatId,
            chats: [updated, ...s.chats.filter((c) => c.id !== chatId)],
          }
        })
        // Events always land in the chat that asked, even if the user has switched away or deleted it.
        const patchChat = (patch: (c: Chat) => Partial<Chat>) =>
          set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? { ...c, ...patch(c) } : c)) }))
        const patchReply = (patch: (m: ChatMessage) => Partial<ChatMessage>) =>
          patchChat((c) => ({ messages: c.messages.map((m) => (m.id === replyId ? { ...m, ...patch(m) } : m)) }))

        controller = new AbortController()
        let edited = false
        try {
          await beforeSend()
          await stream(
            { message, sessionId: existing?.sessionId ?? null, context: editorContext() },
            (event) => {
              if (event.type === 'session') patchChat(() => ({ sessionId: event.sessionId }))
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
          set({ status: 'idle', streamingChatId: null })
        }
      },

      stop() {
        controller?.abort()
      },

      newChat() {
        set({ activeChatId: null })
      },

      selectChat(id) {
        if (get().chats.some((c) => c.id === id)) set({ activeChatId: id })
      },

      deleteChat(id) {
        if (get().streamingChatId === id) controller?.abort()
        set((s) => {
          const chats = s.chats.filter((c) => c.id !== id)
          return { chats, activeChatId: s.activeChatId === id ? (chats[0]?.id ?? null) : s.activeChatId }
        })
      },
    }),
    {
      name: 'dsa-editor:ai',
      version: 1,
      partialize: ({ chats, activeChatId }) => ({ chats, activeChatId }),
      // v0 held a single conversation: { sessionId, messages }.
      migrate: (persisted, version) => {
        if (version === 0) {
          const old = (persisted ?? {}) as { sessionId?: string | null; messages?: ChatMessage[] }
          const messages = Array.isArray(old.messages) ? old.messages : []
          if (!messages.length) return { chats: [], activeChatId: null }
          const first = messages.find((m) => m.role === 'user')
          const chat: Chat = {
            id: crypto.randomUUID(),
            title: titleFrom(first?.text ?? 'Chat'),
            sessionId: old.sessionId ?? null,
            messages,
            updatedAt: Date.now(),
          }
          return { chats: [chat], activeChatId: chat.id }
        }
        return persisted as Pick<AiChatState, 'chats' | 'activeChatId'>
      },
    },
  ),
)
