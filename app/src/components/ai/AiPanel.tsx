import { useEffect, useRef, useState } from 'react'
import { ArrowUp, FileCode2, FileSearch, Pencil, Search, Sparkles, Square, SquarePen, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAiChat, type ChatMessage, type ToolActivity } from '@/state/aiChat'
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

/** Chat with the user's local Claude Code, which works in the solutions folder and sees the open file. */
export function AiPanel() {
  const { messages, status, send, stop, newChat } = useAiChat()
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
    void send(text)
    inputRef.current?.focus()
  }

  return (
    <aside aria-label="Claude" className="flex w-[380px] shrink-0 flex-col border-l bg-background/60">
      <div className="flex h-[38px] shrink-0 items-center gap-2 border-b pr-1.5 pl-3">
        <span className="grid size-5 place-items-center rounded-md bg-gradient-to-br from-violet-500 to-cyan-400 text-white">
          <Sparkles className="size-3" aria-hidden />
        </span>
        <span className="text-[13px] font-medium">Claude Code</span>
        <span className="text-[11px] text-muted-foreground">local</span>
        <div className="flex-1" />
        <HeaderButton label="New chat" onClick={newChat}>
          <SquarePen />
        </HeaderButton>
        <HeaderButton label="Close Claude" onClick={() => useSettings.getState().setAiOpen(false)}>
          <X />
        </HeaderButton>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {messages.length === 0 ? (
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
              <Message key={m.id} message={m} streaming={streaming && i === messages.length - 1} />
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
