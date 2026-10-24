import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Change, ChangeEffect } from '@dsa/core/changes'
import { EDIT_TOOLS, type ApprovalKind, type ChatRequest, type LastRun } from '@dsa/core/chatEvents'
import { resumeChat, streamChat, type OnChatEvent } from '@/lib/claudeClient'
import { stateStorage } from '@/lib/stateSync'
import { flushAutosave } from './autosave'
import { refreshFromDisk } from './hydrate'
import type { Attachment } from '@/lib/images'
import { noteTitle, useNotes } from './notes'
import { usePlayground } from './playground'
import { activeProblem, useProblems } from './problems'
import { useRun } from './run'
import { useSettings } from './settings'
import { useWorkspace } from './workspace'

export interface ToolActivity {
  name: string
  detail: string
}

/** A change Claude proposed; it is only applied if the user approves it. */
export interface Approval {
  id: string
  kind: ApprovalKind
  file: string
  before: string
  after: string
  explanation: string
  /**
   * expired = Claude stopped waiting (reply stopped, page reloaded, server restarted). It can still be
   * applied, if it has its change (chats saved before that was kept don't).
   */
  state: 'pending' | 'approved' | 'rejected' | 'expired'
  change?: Change
  /** Why applying it later didn't work (e.g. the file changed since). */
  error?: string
  /** Applying it was refused (the file changed, or is already there), so trying again won't help. */
  noLongerFits?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  tools: ToolActivity[]
  /** Images sent with a user message: small thumbnails only. */
  images?: { thumb?: string }[]
  approvals?: Approval[]
  /** Dry runs Claude made in this reply (open in the Playground). */
  visualizations?: { id: string; title: string; steps: number }[]
  /** Claude is writing a tool call's input right now. */
  progress?: { name: string; chars: number }
  /** The user pressed Stop. */
  stopped?: boolean
  error?: string
}

interface AnswerDeps {
  post?: (url: string, init: RequestInit) => Promise<Response>
  /** Save typing first, so Claude's change applies to the latest code. */
  beforeAnswer?: () => Promise<void>
  /** Show what a change applied later touched. */
  afterApply?: (effects: ChangeEffect[]) => Promise<void>
}

type StreamFn = (request: ChatRequest, onEvent: OnChatEvent, opts?: { signal?: AbortSignal }) => Promise<void>

/** Seams for tests; the defaults talk to the dev server and the editor. */
interface SendDeps {
  stream?: StreamFn
  /** Make sure Claude reads the latest code from disk. */
  beforeSend?: () => Promise<void>
  /** Pull Claude's file edits back into the editor. */
  afterEdits?: () => Promise<void>
  /** Images to send with the message. */
  attachments?: Attachment[]
}

export interface Chat {
  id: string
  title: string
  /** Claude Code session to resume, so follow-up questions keep this chat's context. */
  sessionId: string | null
  messages: ChatMessage[]
  updatedAt: number
  /** The practice problem this chat is about (started while it was open). */
  problemSlug?: string | null
  /** The reply Claude is still working on: its id, and how many of its events this page has shown. */
  turn?: { id: string; replyId: string; seen: number }
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
  /** Reconnects to a reply that was still running when the page was closed or reloaded. */
  resume(deps?: { resume?: typeof resumeChat }): Promise<void>
  stop(): void
  newChat(): void
  selectChat(id: string): void
  deleteChat(id: string): void
  /** Shows the latest chat about this problem (or a fresh one), unless a chat about it is already showing. */
  followProblem(slug: string): void
  answerApproval(id: string, approved: boolean, deps?: AnswerDeps): Promise<void>
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

/** The model and effort picked in the message box; whatever isn't picked is left out, so Claude Code's defaults apply. */
function claudeChoice(): Pick<ChatRequest, 'model' | 'effort'> {
  const { claudeModel, claudeEffort } = useSettings.getState()
  return { ...(claudeModel ? { model: claudeModel.value } : {}), ...(claudeEffort ? { effort: claudeEffort } : {}) }
}

function editorContext(): ChatRequest['context'] {
  const { files, openIds } = useWorkspace.getState()
  const active = useWorkspace.getState().activeFile()
  return {
    activeFile: active ? { name: active.name, content: active.content } : null,
    openFiles: openIds.flatMap((id) => files.filter((f) => f.id === id).map((f) => f.name)),
    lastRun: lastRun(),
    openNote: openNote(),
    openProblem: openProblem(),
  }
}

function openProblem(): ChatRequest['context']['openProblem'] {
  if (useSettings.getState().section !== 'problems') return null
  const state = useProblems.getState()
  const entry = activeProblem(state)
  return entry ? { slug: entry.slug, title: entry.problem.title, file: state.activeFile } : null
}

function openNote(): ChatRequest['context']['openNote'] {
  if (useSettings.getState().section !== 'notes') return null
  const { notes, activeName } = useNotes.getState()
  const note = notes.find((n) => n.name === activeName)
  return note ? { name: note.name, title: noteTitle(note.content) } : null
}

/** Save code and notes, so Claude reads what the user sees. */
async function saveEverything() {
  await Promise.all([flushAutosave(), useNotes.getState().flush(), useProblems.getState().flush()])
}

function lastRun(): LastRun {
  const { state, result, error, lastFile, lastStdin } = useRun.getState()
  if (state === 'done' && result) return { file: lastFile, result, stdin: lastStdin }
  if (state === 'error' && error) return { file: lastFile, error: error.message }
  return null
}

function patchApproval(chats: Chat[], id: string, patch: Partial<Approval>): Chat[] {
  return chats.map((c) => ({
    ...c,
    messages: c.messages.map((m) =>
      m.approvals?.some((a) => a.id === id) ? { ...m, approvals: m.approvals.map((a) => (a.id === id ? { ...a, ...patch } : a)) } : m,
    ),
  }))
}

function findApproval(chats: Chat[], id: string): Approval | undefined {
  for (const c of chats) for (const m of c.messages) for (const a of m.approvals ?? []) if (a.id === id) return a
  return undefined
}

/** Reloads what a change applied later touched (the chat's events do this while Claude is replying). */
async function showEffects(effects: ChangeEffect[]): Promise<void> {
  for (const e of effects) {
    if (e.type === 'file_changed') await refreshFromDisk()
    else if (e.type === 'note_changed') await useNotes.getState().load()
    else {
      await useProblems.getState().load()
      if (e.open) await useProblems.getState().open(e.slug)
    }
  }
}

export const useAiChat = create<AiChatState>()(
  persist(
    (set, get) => {
      /**
       * Shows a reply as its events arrive, in the chat that asked (even if the user switched away or
       * deleted it), and remembers how far it got so a reloaded page can reconnect to it (resume).
       */
      const follow = async (
        chatId: string,
        replyId: string,
        connect: (onEvent: OnChatEvent, signal: AbortSignal) => Promise<void>,
        { before = async () => {}, afterEdits = refreshFromDisk }: { before?: () => Promise<void>; afterEdits?: () => Promise<void> } = {},
      ) => {
        const patchChat = (patch: (c: Chat) => Partial<Chat>) =>
          set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? { ...c, ...patch(c) } : c)) }))
        const patchReply = (patch: (m: ChatMessage) => Partial<ChatMessage>) =>
          patchChat((c) => ({ messages: c.messages.map((m) => (m.id === replyId ? { ...m, ...patch(m) } : m)) }))

        controller = new AbortController()
        const { signal } = controller
        let edited = false
        try {
          await before()
          await connect((event, id) => {
            if (event.type === 'turn') patchChat(() => ({ turn: { id: event.turnId, replyId, seen: id ?? 1 } }))
            else if (event.type === 'session') patchChat(() => ({ sessionId: event.sessionId }))
            else if (event.type === 'text') patchReply((m) => ({ text: m.text + event.text }))
            else if (event.type === 'tool_progress') patchReply(() => ({ progress: { name: event.name, chars: event.chars } }))
            else if (event.type === 'tool') {
              if (EDIT_TOOLS.has(event.name)) edited = true
              patchReply((m) => ({ tools: [...m.tools, { name: event.name, detail: event.detail }], progress: undefined }))
            } else if (event.type === 'approval') {
              const { type: _, ...change } = event
              patchReply((m) => ({ approvals: [...(m.approvals ?? []), { ...change, state: 'pending' }] }))
            } else if (event.type === 'run') useRun.getState().showRun(event.file, event.result, event.stdin)
            else if (event.type === 'file_changed') void afterEdits()
            else if (event.type === 'note_changed') void useNotes.getState().load()
            else if (event.type === 'problem_changed') {
              const { slug, open } = event
              // The chat that set up a problem is about that problem (so it stays in view when the problem opens).
              if (open) patchChat((c) => (c.problemSlug ? {} : { problemSlug: slug }))
              void useProblems
                .getState()
                .load()
                .then(() => {
                  if (open) return useProblems.getState().open(slug)
                })
            }
            else if (event.type === 'visualization') {
              const { run } = event
              usePlayground.getState().add(run)
              patchReply((m) => ({ visualizations: [...(m.visualizations ?? []), { id: run.id, title: run.title, steps: run.steps.length }] }))
            }
            else if (event.type === 'error') patchReply(() => ({ error: event.message }))
            if (event.type !== 'turn' && typeof id === 'number') patchChat((c) => (c.turn ? { turn: { ...c.turn, seen: id } } : {}))
          }, signal)
          if (edited) await afterEdits()
        } finally {
          controller = null
          // Claude has stopped waiting for any proposal it didn't get an answer to.
          patchReply((m) => ({
            approvals: m.approvals?.map((a) => (a.state === 'pending' ? { ...a, state: 'expired' } : a)),
            progress: undefined,
            ...(signal.aborted ? { stopped: true } : {}),
          }))
          patchChat(() => ({ turn: undefined }))
          set({ status: 'idle', streamingChatId: null })
        }
      }

      return {
      chats: [],
      activeChatId: null,
      streamingChatId: null,
      status: 'idle',

      async send(text, { stream = streamChat, beforeSend = saveEverything, afterEdits = refreshFromDisk, attachments = [] } = {}) {
        const message = text.trim()
        if ((!message && !attachments.length) || get().status === 'streaming') return

        const existing = activeChat(get())
        const chatId = existing?.id ?? crypto.randomUUID()
        const replyId = crypto.randomUUID()
        const newMessages: ChatMessage[] = [
          {
            id: crypto.randomUUID(),
            role: 'user',
            text: message,
            tools: [],
            ...(attachments.length ? { images: attachments.map((a) => (a.thumb ? { thumb: a.thumb } : {})) } : {}),
          },
          { id: replyId, role: 'assistant', text: '', tools: [] },
        ]
        set((s) => {
          const base: Chat = existing ?? {
            id: chatId,
            title: titleFrom(message || 'Image'),
            sessionId: null,
            messages: [],
            updatedAt: 0,
            // A chat started while a problem is open belongs to that problem.
            problemSlug: openProblem()?.slug ?? null,
          }
          const updated = { ...base, messages: [...base.messages, ...newMessages], updatedAt: Date.now() }
          return {
            status: 'streaming',
            streamingChatId: chatId,
            activeChatId: chatId,
            chats: [updated, ...s.chats.filter((c) => c.id !== chatId)],
          }
        })
        await follow(
          chatId,
          replyId,
          (onEvent, signal) =>
            stream(
              {
                message,
                sessionId: existing?.sessionId ?? null,
                context: editorContext(),
                ...(attachments.length ? { images: attachments.map((a) => a.image) } : {}),
                ...claudeChoice(),
              },
              onEvent,
              { signal },
            ),
          { before: beforeSend, afterEdits },
        )
      },

      async resume({ resume = resumeChat } = {}) {
        if (get().status === 'streaming') return
        const chat = get().chats.find((c) => c.turn)
        if (!chat?.turn) return
        const { id, replyId, seen } = chat.turn
        set({ status: 'streaming', streamingChatId: chat.id })
        await follow(chat.id, replyId, (onEvent, signal) => resume(id, seen, onEvent, { signal }))
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

      async answerApproval(
        id,
        approved,
        { post = (url: string, init: RequestInit) => fetch(url, init), beforeAnswer = saveEverything, afterApply = showEffects } = {},
      ) {
        await beforeAnswer()
        const patch = (p: Partial<Approval>) => {
          set((s) => ({ chats: patchApproval(s.chats, id, p) }))
        }
        const approval = findApproval(get().chats, id)
        const send = (url: string, body: unknown) =>
          post(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        // While Claude is waiting, it applies the change itself and hears the answer.
        if (approval?.state === 'pending') {
          const answered = await send('/api/claude/approval', { id, approved }).then(
            (res) => res.ok,
            () => false,
          )
          if (answered) return patch({ state: approved ? 'approved' : 'rejected' })
        }
        // Claude stopped waiting: a rejection just dismisses it; an approval applies it here.
        if (!approved) return patch({ state: 'rejected', error: undefined })
        if (!approval?.change) return patch({ state: 'expired' })
        try {
          const res = await send('/api/claude/apply', { change: approval.change })
          const body = (await res.json()) as { effects?: ChangeEffect[]; error?: string }
          if (!res.ok) {
            return patch({ state: 'expired', error: body.error ?? `HTTP ${res.status}`, ...(res.status === 409 ? { noLongerFits: true } : {}) })
          }
          patch({ state: 'approved', error: undefined })
          await afterApply(body.effects ?? [])
        } catch {
          patch({ state: 'expired', error: 'Couldn’t reach the editor server. Is it running?' })
        }
      },

      followProblem(slug) {
        if (activeChat(get())?.problemSlug === slug) return
        const latest = get().chats.find((c) => c.problemSlug === slug)
        set({ activeChatId: latest?.id ?? null })
      },

      deleteChat(id) {
        if (get().streamingChatId === id) controller?.abort()
        set((s) => {
          const chats = s.chats.filter((c) => c.id !== id)
          return { chats, activeChatId: s.activeChatId === id ? (chats[0]?.id ?? null) : s.activeChatId }
        })
      },
    }
    },
    {
      name: 'dsa-editor:ai',
      // Kept on disk too (see lib/stateSync).
      storage: createJSONStorage(() => stateStorage),
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

// Opening a different problem shows its chats. The user can still pick any chat afterwards.
useProblems.subscribe((state, prev) => {
  if (state.activeSlug && state.activeSlug !== prev.activeSlug) useAiChat.getState().followProblem(state.activeSlug)
})
