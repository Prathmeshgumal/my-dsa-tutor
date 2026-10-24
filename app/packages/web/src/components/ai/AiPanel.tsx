import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Check, Clapperboard, ListChecks, Clock, Eye, FileCode2, FilePlus2, FileSearch, NotebookPen, Pencil, Play, Search, Sparkles, Square, SquarePen, TerminalSquare, X, Paperclip, Image as ImageIcon, MessagesSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { IMAGE_TYPES, MAX_IMAGES } from '@dsa/core/chatEvents'
import { readImage } from '@/lib/images'
import { activeChat, useAiChat, type Approval, type ChatMessage, type ToolActivity } from '@/state/aiChat'
import { useComposer } from '@/state/composer'
import { noteTitle, useNotes } from '@/state/notes'
import { useSettings } from '@/state/settings'
import { usePlayground } from '@/state/playground'
import { SidePanelResizer } from '@/components/shell/SidePanelResizer'
import { useWorkspace } from '@/state/workspace'
import { activeProblem, useProblems } from '@/state/problems'
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
  list_notes: { label: () => 'Listed notes', icon: NotebookPen },
  read_note: { label: (d) => `Read note ${d}`, icon: NotebookPen },
  create_note: { label: () => 'Proposed a new note', icon: NotebookPen },
  edit_note: { label: (d) => `Proposed a change to note ${d}`, icon: NotebookPen },
  create_visualization: { label: () => 'Made a dry run', icon: Clapperboard },
  list_problems: { label: () => 'Listed problems', icon: ListChecks },
  get_problem: { label: (d) => `Read problem ${d}`.trim(), icon: ListChecks },
  create_problem: { label: () => 'Proposed a new problem', icon: ListChecks },
  add_test_case: { label: () => 'Proposed a test case', icon: ListChecks },
  edit_solution: { label: () => 'Proposed a change to your solution', icon: Pencil },
  run_tests: { label: () => 'Ran the test cases', icon: Play },
  save_code_version: { label: () => 'Proposed another version of your code', icon: FilePlus2 },
  list_attempts: { label: () => 'Checked your submissions', icon: ListChecks },
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
  expired: { text: 'Claude stopped waiting', className: 'text-muted-foreground', icon: Clock },
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
const APPROVAL_KIND: Record<Approval['kind'], { badge: string; title: (file: string) => string; icon: typeof Pencil }> = {
  create: { badge: 'New file', title: (f) => `Proposed new file ${f}`, icon: FilePlus2 },
  edit: { badge: 'Edit', title: (f) => `Proposed change to ${f}`, icon: Pencil },
  create_note: { badge: 'New note', title: (f) => `Proposed new note ${f}`, icon: NotebookPen },
  edit_note: { badge: 'Edit note', title: (f) => `Proposed change to note ${f}`, icon: NotebookPen },
  create_problem: { badge: 'New problem', title: (f) => `Proposed new problem ${f}`, icon: ListChecks },
  add_test: { badge: 'New test case', title: (f) => `Proposed test case for ${f}`, icon: ListChecks },
  edit_solution: { badge: 'Edit', title: (f) => `Proposed change to ${f}`, icon: Pencil },
}

function ApprovalCard({ approval }: { approval: Approval }) {
  const kind = APPROVAL_KIND[approval.kind] ?? APPROVAL_KIND.edit
  const title = kind.title(approval.file)
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
        <kind.icon className="size-3.5" aria-hidden />
        <span className="font-medium">{kind.badge}</span>
        <span className="truncate font-mono text-muted-foreground">{approval.file}</span>
        {decided && (
          <span className={cn('ml-auto flex shrink-0 items-center gap-1', decided.className)}>
            <decided.icon className="size-3.5" aria-hidden /> {decided.text}
          </span>
        )}
      </div>
      {approval.explanation && <p className="px-2.5 pt-2 text-[12.5px] text-muted-foreground">{approval.explanation}</p>}
      {approval.kind === 'create_problem' ? (
        // A whole new problem reads better as the page it will become than as added lines.
        <div className="m-2.5 max-h-80 overflow-auto rounded-md border px-3 py-2 text-[12.5px] leading-relaxed">
          <Markdown>{approval.after}</Markdown>
        </div>
      ) : (
        <div className="m-2.5 max-h-64 overflow-auto rounded-md border font-mono text-[11.5px] leading-relaxed">
          {/* min-w-max: row colours run under text that scrolls sideways */}
          <div className="min-w-max">
            <DiffLines text={approval.before} sign="-" />
            <DiffLines text={approval.after} sign="+" />
          </div>
        </div>
      )}
      {approval.error && (
        <p role="alert" className="px-2.5 pb-2 text-[12px] text-red-600 dark:text-red-400">
          Couldn’t apply it: {approval.error}
        </p>
      )}
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
      {/* Claude has moved on, but the change can still be applied as it stands, unless it no longer fits. */}
      {approval.state === 'expired' && approval.change && (
        <div className="flex items-center justify-end gap-2 px-2.5 pb-2.5">
          {!approval.noLongerFits && <span className="mr-auto text-[12px] text-muted-foreground">You can still apply it.</span>}
          <Button size="sm" variant="ghost" onClick={() => void useAiChat.getState().answerApproval(approval.id, false)}>
            Dismiss
          </Button>
          {!approval.noLongerFits && (
            <Button size="sm" variant="outline" onClick={() => void useAiChat.getState().answerApproval(approval.id, true)}>
              <Check /> Apply anyway
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** A dry run Claude made; it plays in the Playground. */
function VisualizationCard({ id, title, steps }: { id: string; title: string; steps: number }) {
  return (
    <div
      role="group"
      aria-label={title}
      className="my-2 flex items-center gap-3 rounded-lg border border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-cyan-500/5 px-3 py-2.5"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-violet-500 text-white">
        <Clapperboard className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium">{title}</span>
        <span className="block text-[11px] text-muted-foreground">{steps} steps</span>
      </span>
      <Button size="sm" onClick={() => usePlayground.getState().open(id)}>
        Open in Playground
      </Button>
    </div>
  )
}

const PROGRESS_LABEL: Record<string, string> = {
  create_visualization: 'Making a dry run',
  create_note: 'Writing a note',
  edit_note: 'Preparing a change to a note',
  create_file: 'Writing a new file',
  edit_file: 'Preparing an edit',
  create_problem: 'Setting up the problem',
  edit_solution: 'Preparing an edit',
}

const formatChars = (n: number) => (n < 1000 ? `${n} characters` : `${(n / 1000).toFixed(1)}k characters`)

/** Shows that Claude is still busy, so a long silence never looks like a freeze. */
function Working({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="mt-2 flex items-center gap-2 text-muted-foreground">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-pulse rounded-full bg-violet-500" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </span>
      {children}
    </p>
  )
}

function Message({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="ml-8 flex flex-col items-end gap-1.5 self-end">
        {message.images?.length ? (
          <div className="flex flex-wrap justify-end gap-1.5">
            {message.images.map((img, i) =>
              img.thumb ? (
                <img
                  key={i}
                  src={img.thumb}
                  alt={`Attached image ${i + 1}`}
                  className="max-h-28 max-w-40 rounded-lg object-cover ring-1 ring-violet-500/20"
                />
              ) : (
                <span key={i} className="flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-[11.5px] text-muted-foreground">
                  <ImageIcon className="size-3.5" aria-hidden /> Image {i + 1}
                </span>
              ),
            )}
          </div>
        ) : null}
        {message.text && (
          <div className="rounded-2xl rounded-br-md bg-violet-500/12 px-3.5 py-2 text-[13px] whitespace-pre-wrap text-foreground ring-1 ring-violet-500/20">
            {message.text}
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="text-[13px] leading-relaxed text-foreground">
      <ToolList tools={message.tools} />
      {message.approvals?.map((a) => <ApprovalCard key={a.id} approval={a} />)}
      {message.visualizations?.map((v) => <VisualizationCard key={v.id} {...v} />)}
      {message.text && <Markdown>{message.text}</Markdown>}
      {streaming &&
        !message.approvals?.some((a) => a.state === 'pending') &&
        (message.progress ? (
          <Working>
            {`${PROGRESS_LABEL[message.progress.name] ?? 'Preparing a tool call'}… ${message.progress.chars ? `${formatChars(message.progress.chars)} so far` : ''}`.trim()}
          </Working>
        ) : (
          <Working>{message.text ? 'Working…' : 'Thinking…'}</Working>
        ))}
      {message.error && (
        <p role="alert" className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-700 dark:text-red-300">
          {message.error}
        </p>
      )}
      {!streaming && message.stopped && <p className="mt-2 text-muted-foreground italic">Stopped by you.</p>}
      {!streaming && !message.stopped && !message.text && !message.error && !message.approvals?.length && !message.visualizations?.length && (
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

/** The open chat and the box to ask Claude: the same in the side panel and on the Chats page, so a reply keeps
 * streaming wherever you look at it. Claude runs locally, works in the solutions folder and sees what's open. */
export function Conversation() {
  const { status, send, stop } = useAiChat()
  const activeChatId = useAiChat((s) => s.activeChatId)
  const current = useAiChat(activeChat)
  const messages = current?.messages ?? []
  const replyingHere = useAiChat((s) => s.streamingChatId !== null && s.streamingChatId === s.activeChatId)
  const fileName = useWorkspace((s) => s.files.find((f) => f.id === s.activeId)?.name ?? null)
  // On the Problem screen Claude is told about the problem instead of the open file.
  const problemTitle = useProblems((s) => activeProblem(s)?.problem.title ?? null)
  const noteName = useNotes((s) => {
    const note = s.notes.find((n) => n.name === s.activeName)
    return note ? noteTitle(note.content) : null
  })
  // What Claude is told about, as the server gets it (aiChat.ts editorContext): the problem on Problems, the note on
  // Notes, and the file open in Code everywhere else.
  const section = useSettings((s) => s.section)
  const onProblem = section === 'problems'
  const onNote = section === 'notes' && noteName !== null
  const activeName = onProblem ? problemTitle : onNote ? noteName : fileName
  const chip = onProblem
    ? { icon: ListChecks, text: problemTitle ?? 'No problem open', title: 'Claude sees this problem and your solution', mono: false }
    : onNote
      ? { icon: NotebookPen, text: noteName, title: 'Claude sees this note, and the file open in Code', mono: false }
      : {
          icon: FileCode2,
          text: section === 'code' ? (fileName ?? 'No file open') : `Code: ${fileName ?? 'no file open'}`,
          title: 'Claude sees the current code of the file open in Code',
          mono: section === 'code',
        }
  const { draft, setDraft, attachments, setAttachments } = useComposer()
  const [attachError, setAttachError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const streaming = status === 'streaming'

  // Ready to type in whichever chat is open.
  useEffect(() => {
    inputRef.current?.focus()
  }, [activeChatId])
  // Braces matter: newer Chrome's scrollIntoView returns a promise, which React would treat as a cleanup.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const submit = (text: string) => {
    if ((!text.trim() && !attachments.length) || streaming) return
    setDraft('')
    if (attachments.length) {
      void send(text, { attachments: attachments.map(({ image, thumb }) => ({ image, thumb })) })
      setAttachments([])
    } else void send(text)
    setAttachError(null)
    inputRef.current?.focus()
  }

  const addFiles = async (files: File[]) => {
    if (!files.length) return
    setAttachError(null)
    const room = MAX_IMAGES - attachments.length
    if (files.length > room) setAttachError(`Up to ${MAX_IMAGES} images per message.`)
    for (const file of files.slice(0, Math.max(0, room))) {
      try {
        const read = await readImage(file)
        setAttachments((list) => [...list, { ...read, id: crypto.randomUUID() }])
      } catch (e) {
        setAttachError(e instanceof Error ? e.message : String(e))
      }
    }
    inputRef.current?.focus()
  }

  const canSend = Boolean(draft.trim() || attachments.length)

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files?.length) return
        e.preventDefault()
        setDragging(false)
        void addFiles([...e.dataTransfer.files])
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-xl border-2 border-dashed border-violet-500 bg-violet-500/10 text-[13px] font-medium text-violet-600 backdrop-blur-sm dark:text-violet-300">
          Drop images to send to Claude
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1">
        {messages.length === 0 ? (
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
          title={chip.title}
        >
          <chip.icon className="size-3 shrink-0" aria-hidden />
          <span className={cn('truncate', chip.mono && 'font-mono')}>{chip.text}</span>
        </div>
        {attachments.length > 0 && (
          <ul aria-label="Attached images" className="mb-1.5 flex flex-wrap gap-1.5">
            {attachments.map((a, i) => (
              <li key={a.id} className="group relative">
                {a.thumb ? (
                  <img src={a.thumb} alt={`Image ${i + 1}`} className="size-14 rounded-lg object-cover ring-1 ring-border" />
                ) : (
                  <span className="grid size-14 place-items-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                    <ImageIcon className="size-5" aria-hidden />
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove image ${i + 1}`}
                  onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
                  className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background shadow ring-2 ring-background"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {attachError && (
          <p role="alert" className="mb-1.5 text-[12px] text-red-600 dark:text-red-400">
            {attachError}
          </p>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_TYPES.join(',')}
            multiple
            aria-label="Attach image"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              void addFiles([...(e.target.files ?? [])])
              e.target.value = ''
            }}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Add images"
                onClick={() => fileRef.current?.click()}
                className="text-muted-foreground"
              >
                <Paperclip />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add images (or paste / drop them)</TooltipContent>
          </Tooltip>
          <textarea
            ref={inputRef}
            aria-label="Message Claude"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={(e) => {
              const files = [...(e.clipboardData?.files ?? [])]
              if (!files.length) return
              e.preventDefault()
              void addFiles(files)
            }}
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
              disabled={!canSend}
              className={cn('glow-shimmer border-white/15 text-white', !canSend && 'opacity-40')}
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

/** Claude beside any section: the open chat and a box to ask. Every chat is listed in the Chats section. */
export function AiPanel() {
  const width = useSettings((s) => s.sidePanelWidth)
  const title = useAiChat((s) => activeChat(s)?.title ?? 'New chat')
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
        <h2 className="min-w-0 flex-1 truncate px-1.5 text-[13px] font-medium">{title}</h2>
        <HeaderButton label="All chats" onClick={() => useSettings.getState().setSection('chats')}>
          <MessagesSquare />
        </HeaderButton>
        <HeaderButton label="New chat" onClick={() => useAiChat.getState().newChat()}>
          <SquarePen />
        </HeaderButton>
        <HeaderButton label="Close Claude" onClick={() => useSettings.getState().setAiOpen(false)}>
          <X />
        </HeaderButton>
      </div>
      <Conversation />
    </aside>
  )
}
