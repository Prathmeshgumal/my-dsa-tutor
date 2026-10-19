import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Check, ChevronDown, FileCode2, FileSearch, MessageSquare, Pencil, Search, Sparkles, Square, SquarePen, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { activeChat, useAiChat, type Chat, type ChatMessage, type ToolActivity } from '@/state/aiChat'
import { useSettings } from '@/state/settings'
import { useWorkspace } from '@/state/workspace'
import { Markdown } from './Markdown'

const SUGGESTIONS = [
  'Explain my solution',
  'What’s the time and space complexity?',
  'Give me a hint, not the answer',
  'Why might this be wrong?',
]

const TOOL_LABEL: Record<string, { verb: string; icon: typeof Pencil }> = {
  Read: { verb: 'Read', icon: FileSearch },
  Edit: { verb: 'Edited', icon: Pencil },
  MultiEdit: { verb: 'Edited', icon: Pencil },
  Write: { verb: 'Wrote', icon: Pencil },
  Glob: { verb: 'Looked for', icon: Search },
  Grep: { verb: 'Searched for', icon: Search },
}

function ToolList({ tools }: { tools: ToolActivity[] }) {
  if (!tools.length) return null
  return (
    <ul aria-label="What Claude did" className="mb-2 flex flex-wrap gap-1.5">
      {tools.map((t, i) => {
        const label = TOOL_LABEL[t.name] ?? { verb: t.name, icon: Sparkles }
        const Icon = label.icon
        return (
          <li
            key={i}
            className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
          >
            <Icon className="size-3" aria-hidden />
            <span>{`${label.verb} ${t.detail}`.trim()}</span>
          </li>
        )
      })}
    </ul>
  )
}

function Message({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="ml-8 self-end rounded-2xl rounded-br-md bg-violet-500/12 px-3.5 py-2 text-[13px] whitespace-pre-wrap text-foreground ring-1 ring-violet-500/20">
        {message.text}
      </div>
    )
  }
  return (
    <div className="text-[13px] leading-relaxed text-foreground">
      <ToolList tools={message.tools} />
      {message.text && <Markdown>{message.text}</Markdown>}
      {streaming && !message.text && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <span className="flex gap-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 animate-pulse rounded-full bg-violet-500" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </span>
          Thinking…
        </p>
      )}
      {message.error && (
        <p role="alert" className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-700 dark:text-red-300">
          {message.error}
        </p>
      )}
      {!streaming && !message.text && !message.error && <p className="text-muted-foreground italic">Stopped.</p>}
    </div>
  )
}

function HeaderButton({ label, onClick, children }: { label: string; onClick(): void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} className="text-muted-foreground">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function timeAgo(at: number): string {
  const minutes = Math.floor(Math.max(0, Date.now() - at) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function ChatRow({ chat, active, onOpen }: { chat: Chat; active: boolean; onOpen(): void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <li
      className={cn(
        'group flex items-center gap-1 rounded-lg pr-1 transition-colors',
        active ? 'bg-violet-500/10 ring-1 ring-violet-500/25 ring-inset' : 'hover:bg-muted',
      )}
      onMouseLeave={() => setConfirming(false)}
    >
      <button type="button" aria-label={chat.title} onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left">
        <MessageSquare className={cn('size-3.5 shrink-0', active ? 'text-violet-500' : 'text-muted-foreground')} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] text-foreground">{chat.title}</span>
          <span className="block text-[11px] text-muted-foreground">
            {timeAgo(chat.updatedAt)} · {chat.messages.filter((m) => m.role === 'user').length} asked
          </span>
        </span>
      </button>
      {confirming ? (
        <Button
          size="sm"
          variant="destructive"
          aria-label={`Confirm delete chat: ${chat.title}`}
          onClick={() => useAiChat.getState().deleteChat(chat.id)}
          className="h-6 px-2 text-[11px]"
        >
          <Check /> Delete
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete chat: ${chat.title}`}
          onClick={() => setConfirming(true)}
          className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-500"
        >
          <Trash2 />
        </Button>
      )}
    </li>
  )
}

function ChatList({ onPicked }: { onPicked(): void }) {
  const chats = useAiChat((s) => s.chats)
  const activeId = useAiChat((s) => s.activeChatId)
  if (!chats.length) {
    return <p className="px-6 py-10 text-center text-[12.5px] text-muted-foreground">No chats yet</p>
  }
  return (
    <ul aria-label="Chats" className="flex flex-col gap-0.5 p-2">
      {chats.map((c) => (
        <ChatRow
          key={c.id}
          chat={c}
          active={c.id === activeId}
          onOpen={() => {
            useAiChat.getState().selectChat(c.id)
            onPicked()
          }}
        />
      ))}
    </ul>
  )
}

/** Chat with the user's local Claude Code, which works in the solutions folder and sees the open file. */
export function AiPanel() {
  const { status, send, stop, newChat } = useAiChat()
  const current = useAiChat(activeChat)
  const messages = current?.messages ?? []
  const replyingHere = useAiChat((s) => s.streamingChatId !== null && s.streamingChatId === s.activeChatId)
  const [showList, setShowList] = useState(false)
  const activeName = useWorkspace((s) => s.files.find((f) => f.id === s.activeId)?.name ?? null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const streaming = status === 'streaming'

  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  // Braces matter: newer Chrome's scrollIntoView returns a promise, which React would treat as a cleanup.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const submit = (text: string) => {
    if (!text.trim() || streaming) return
    setDraft('')
    setShowList(false)
    void send(text)
    inputRef.current?.focus()
  }

  return (
    <aside aria-label="Claude" className="flex w-[380px] shrink-0 flex-col border-l bg-background/60">
      <div className="flex h-[38px] shrink-0 items-center gap-2 border-b pr-1.5 pl-3">
        <span className="grid size-5 place-items-center rounded-md bg-gradient-to-br from-violet-500 to-cyan-400 text-white">
          <Sparkles className="size-3" aria-hidden />
        </span>
        <button
          type="button"
          aria-label="Chats"
          aria-expanded={showList}
          onClick={() => setShowList((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-left text-[13px] font-medium hover:bg-muted"
        >
          <span className="truncate">{current?.title ?? 'New chat'}</span>
          <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', showList && 'rotate-180')} aria-hidden />
        </button>
        <HeaderButton
          label="New chat"
          onClick={() => {
            newChat()
            setShowList(false)
            inputRef.current?.focus()
          }}
        >
          <SquarePen />
        </HeaderButton>
        <HeaderButton label="Close Claude" onClick={() => useSettings.getState().setAiOpen(false)}>
          <X />
        </HeaderButton>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {showList ? (
          <ChatList onPicked={() => setShowList(false)} />
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-violet-500/10 text-violet-500 ring-1 ring-violet-500/25">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium">Ask Claude about your code</p>
              <p className="text-[12.5px] text-muted-foreground">
                Claude Code runs on this machine with your login. It sees the file you have open and can read or edit
                anything in <span className="font-mono">solutions/</span>.
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-1.5 self-stretch">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-lg border px-3 py-2 text-left text-[12.5px] text-muted-foreground transition-colors hover:border-violet-500/40 hover:bg-violet-500/5 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-3.5">
            {messages.map((m, i) => (
              <Message key={m.id} message={m} streaming={replyingHere && i === messages.length - 1} />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </ScrollArea>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(draft)
        }}
        className="m-3 mt-0 rounded-xl border bg-card/60 p-2 transition-colors focus-within:border-violet-500/50"
      >
        <div
          data-testid="context-chip"
          className="mb-1.5 inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
          title="Claude sees this file’s current code"
        >
          <FileCode2 className="size-3 shrink-0" aria-hidden />
          <span className="truncate font-mono">{activeName ?? 'No file open'}</span>
        </div>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            aria-label="Message Claude"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit(draft)
              }
            }}
            placeholder={activeName ? `Ask about ${activeName}…` : 'Ask Claude…'}
            className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground"
          />
          {streaming ? (
            <Button type="button" size="icon-sm" variant="secondary" aria-label="Stop" onClick={stop}>
              <Square className="fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-sm"
              aria-label="Send"
              disabled={!draft.trim()}
              className={cn('glow-shimmer border-white/15 text-white', !draft.trim() && 'opacity-40')}
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </form>
    </aside>
  )
}
