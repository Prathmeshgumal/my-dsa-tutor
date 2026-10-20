import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Check, ChevronDown, Clock, Eye, FileCode2, FilePlus2, FileSearch, MessageSquare, Pencil, Play, Search, Sparkles, Square, SquarePen, TerminalSquare, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { activeChat, useAiChat, type Approval, type Chat, type ChatMessage, type ToolActivity } from '@/state/aiChat'
import { useSettings } from '@/state/settings'
import { SidePanelResizer } from '@/components/shell/SidePanelResizer'
import { useWorkspace } from '@/state/workspace'
import { Markdown } from './Markdown'

const SUGGESTIONS = [
  'Explain my solution',
  'What’s the time and space complexity?',
  'Give me a hint, not the answer',
  'Why might this be wrong?',
]

const TOOL_LABEL: Record<string, { label: (detail: string) => string; icon: typeof Pencil }> = {
  get_editor_state: { label: () => 'Checked the editor', icon: Eye },
  list_files: { label: () => 'Listed files', icon: Search },
  read_file: { label: (d) => `Read ${d}`, icon: FileSearch },
  get_last_run: { label: () => 'Checked the output', icon: TerminalSquare },
  run_code: { label: (d) => `Ran ${d || 'the open file'}`, icon: Play },
  edit_file: { label: (d) => `Proposed a change to ${d}`, icon: Pencil },
  create_file: { label: (d) => `Proposed new file ${d}`, icon: FilePlus2 },
}

function ToolList({ tools }: { tools: ToolActivity[] }) {
  if (!tools.length) return null
  return (
    <ul aria-label="What Claude did" className="mb-2 flex flex-wrap gap-1.5">
      {tools.map((t, i) => {
        const known = TOOL_LABEL[t.name]
        const Icon = known?.icon ?? Sparkles
        return (
          <li
            key={i}
            className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
          >
            <Icon className="size-3" aria-hidden />
            <span>{known ? known.label(t.detail) : `${t.name} ${t.detail}`.trim()}</span>
          </li>
        )
      })}
    </ul>
  )
}

const DECIDED: Record<Exclude<Approval['state'], 'pending'>, { text: string; className: string; icon: typeof Check }> = {
  approved: { text: 'Applied', className: 'text-emerald-600 dark:text-emerald-400', icon: Check },
  rejected: { text: 'Rejected', className: 'text-muted-foreground', icon: X },
  expired: { text: 'No longer waiting', className: 'text-muted-foreground', icon: Clock },
}

function DiffLines({ text, sign }: { text: string; sign: '-' | '+' }) {
  if (!text) return null
  return (
    <div
      className={cn(
        'px-2 py-1',
        sign === '-' ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      )}
    >
      {text.split('\n').map((line, i) => (
        <div key={i} className="flex gap-2 whitespace-pre">
          <span aria-hidden className="select-none opacity-60">
            {sign === '-' ? '−' : '+'}
          </span>
          <span>{line}</span>
        </div>
      ))}
    </div>
  )
}

/** A change Claude wants to make; nothing is written until the user applies it. */
function ApprovalCard({ approval }: { approval: Approval }) {
  const title = approval.kind === 'create' ? `Proposed new file ${approval.file}` : `Proposed change to ${approval.file}`
  const decided = approval.state === 'pending' ? null : DECIDED[approval.state]
  return (
    <div
      role="group"
      aria-label={title}
      className={cn(
        'my-2 overflow-hidden rounded-lg border',
        approval.state === 'pending' && 'border-violet-500/40 shadow-[0_0_0_3px] shadow-violet-500/10',
      )}
    >
      <div className="flex items-center gap-1.5 border-b bg-muted/40 px-2.5 py-1.5 text-[12px]">
        {approval.kind === 'create' ? <FilePlus2 className="size-3.5" aria-hidden /> : <Pencil className="size-3.5" aria-hidden />}
        <span className="font-medium">{approval.kind === 'create' ? 'New file' : 'Edit'}</span>
        <span className="truncate font-mono text-muted-foreground">{approval.file}</span>
        {decided && (
          <span className={cn('ml-auto flex shrink-0 items-center gap-1', decided.className)}>
            <decided.icon className="size-3.5" aria-hidden /> {decided.text}
          </span>
        )}
      </div>
      {approval.explanation && <p className="px-2.5 pt-2 text-[12.5px] text-muted-foreground">{approval.explanation}</p>}
      <div className="m-2.5 max-h-64 overflow-auto rounded-md border font-mono text-[11.5px] leading-relaxed">
        <DiffLines text={approval.before} sign="-" />
        <DiffLines text={approval.after} sign="+" />
      </div>
      {approval.state === 'pending' && (
        <div className="flex justify-end gap-2 px-2.5 pb-2.5">
          <Button size="sm" variant="ghost" onClick={() => void useAiChat.getState().answerApproval(approval.id, false)}>
            Reject
          </Button>
          <Button size="sm" onClick={() => void useAiChat.getState().answerApproval(approval.id, true)}>
            <Check /> Apply change
          </Button>
        </div>
      )}
    </div>
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
      {message.approvals?.map((a) => <ApprovalCard key={a.id} approval={a} />)}
      {message.text && <Markdown>{message.text}</Markdown>}
      {streaming && !message.text && !message.approvals?.some((a) => a.state === 'pending') && (
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
      {!streaming && !message.text && !message.error && !message.approvals?.length && (
        <p className="text-muted-foreground italic">Stopped.</p>
      )}
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
  const width = useSettings((s) => s.sidePanelWidth)
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
    <aside
      aria-label="Claude"
      style={{ width }}
      className="relative flex max-w-[70vw] shrink-0 flex-col border-l bg-background/60"
    >
      <SidePanelResizer />
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
                Claude runs on this machine with your login. It can read your files and the output, run your code to
                test it, and propose edits that you approve before anything changes.
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
