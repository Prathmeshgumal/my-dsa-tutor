import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, FilePlus2, Loader2, NotebookPen, StickyNote, Trash2 } from 'lucide-react'
import { Markdown } from '@/components/ai/Markdown'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { flushNotesOnUnload, noteTitle, useNotes, type Note } from '@/state/notes'
import { useNoteProblem } from '@/state/problems'
import { useSettings } from '@/state/settings'
import { SidePanelResizer } from '@/components/shell/SidePanelResizer'
import { ProblemTag } from '@/components/problems/ProblemTag'

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

function NoteRow({ note, active, onOpen }: { note: Note; active: boolean; onOpen(): void }) {
  const [confirming, setConfirming] = useState(false)
  const title = noteTitle(note.content)
  const problem = useNoteProblem(note.name)
  return (
    <li
      className={cn(
        'group flex items-center gap-1 rounded-lg pr-1 transition-colors',
        active ? 'bg-violet-500/10 ring-1 ring-violet-500/25 ring-inset' : 'hover:bg-muted',
      )}
      onMouseLeave={() => setConfirming(false)}
    >
      <button type="button" aria-label={title} onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left">
        <StickyNote className={cn('size-3.5 shrink-0', active ? 'text-violet-500' : 'text-muted-foreground')} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] text-foreground">{title}</span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-[11px] text-muted-foreground">{note.name}</span>
            <ProblemTag slug={problem} />
          </span>
        </span>
      </button>
      {confirming ? (
        <Button
          size="sm"
          variant="destructive"
          aria-label={`Confirm delete note: ${title}`}
          onClick={() => void useNotes.getState().remove(note.name)}
          className="h-6 px-2 text-[11px]"
        >
          <Check /> Delete
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete note: ${title}`}
          onClick={() => setConfirming(true)}
          className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-500"
        >
          <Trash2 />
        </Button>
      )}
    </li>
  )
}

const SAVE_LABEL = {
  saved: 'Saved',
  pending: 'Editing…',
  saving: 'Saving…',
  error: 'Couldn’t save — keep typing to retry',
} as const

/** Markdown notes in the right-hand panel; each note is a .md file in notes/. */
/** `page`: filling a section instead of sitting on the right. */
export function NotesPanel({ page = false }: { page?: boolean }) {
  const width = useSettings((s) => s.sidePanelWidth)
  const { notes, activeName, status, saveStatus, create, select, edit } = useNotes()
  const active = notes.find((n) => n.name === activeName) ?? null
  const [showList, setShowList] = useState(false)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const [focusEnd, setFocusEnd] = useState(false)

  // After creating a note, put the cursor after its heading (browsers put it at the start).
  useEffect(() => {
    const box = boxRef.current
    if (!focusEnd || !box) return
    box.focus()
    box.setSelectionRange(box.value.length, box.value.length)
    setFocusEnd(false)
  }, [focusEnd, activeName])

  useEffect(() => {
    void useNotes.getState().load()
    window.addEventListener('beforeunload', flushNotesOnUnload)
    return () => {
      window.removeEventListener('beforeunload', flushNotesOnUnload)
      // Closing the panel shouldn't lose the last few keystrokes.
      void useNotes.getState().flush()
    }
  }, [])

  const newNote = async () => {
    setShowList(false)
    setMode('edit')
    await create()
    setFocusEnd(true)
  }

  return (
    <aside
      aria-label="Notes"
      style={page ? undefined : { width }}
      className={cn(
        'relative flex flex-col bg-background/60',
        page ? 'min-w-0 flex-1' : 'max-w-[70vw] shrink-0 border-l',
      )}
    >
      {!page && <SidePanelResizer />}
      <div className="flex h-[38px] shrink-0 items-center gap-2 border-b pr-1.5 pl-3">
        <span className="grid size-5 shrink-0 place-items-center rounded-md bg-gradient-to-br from-amber-400 to-violet-500 text-white">
          <NotebookPen className="size-3" aria-hidden />
        </span>
        <button
          type="button"
          aria-label="All notes"
          aria-expanded={showList}
          onClick={() => setShowList((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-left text-[13px] font-medium hover:bg-muted"
        >
          <span className="truncate">{active ? noteTitle(active.content) : 'Notes'}</span>
          <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', showList && 'rotate-180')} aria-hidden />
        </button>
        <HeaderButton label="New note" onClick={() => void newNote()}>
          <FilePlus2 />
        </HeaderButton>
      </div>

      {showList ? (
        <ScrollArea className="min-h-0 flex-1">
          {notes.length ? (
            <ul aria-label="Notes" className="flex flex-col gap-0.5 p-2">
              {notes.map((n) => (
                <NoteRow
                  key={n.name}
                  note={n}
                  active={n.name === activeName}
                  onOpen={() => {
                    void select(n.name)
                    setShowList(false)
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="px-6 py-10 text-center text-[12.5px] text-muted-foreground">No notes yet</p>
          )}
        </ScrollArea>
      ) : !active ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          {status === 'loading' || status === 'idle' ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
          ) : status === 'error' ? (
            <p role="alert" className="text-[12.5px] text-red-600 dark:text-red-400">
              Couldn’t load notes. Is the editor server running?
            </p>
          ) : (
            <>
              <span className="grid size-12 place-items-center rounded-2xl bg-violet-500/10 text-violet-500 ring-1 ring-violet-500/25">
                <NotebookPen className="size-5" aria-hidden />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium">Keep notes while you practise</p>
                <p className="text-[12.5px] text-muted-foreground">
                  Patterns, tricks, mistakes to avoid. Written in Markdown, saved as you type to{' '}
                  <span className="font-mono">notes/</span>.
                </p>
              </div>
              <Button size="sm" onClick={() => void newNote()}>
                <FilePlus2 /> Create a note
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-2 px-3 pt-2.5">
            <div role="radiogroup" aria-label="Note view" className="flex rounded-md bg-muted p-0.5 text-[12px]">
              {(['edit', 'preview'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'rounded px-2.5 py-0.5 capitalize transition-colors',
                    mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {m === 'edit' ? 'Edit' : 'Preview'}
                </button>
              ))}
            </div>
            <span
              data-testid="note-save-status"
              className={cn(
                'ml-auto flex items-center gap-1 text-[11px] text-muted-foreground',
                saveStatus === 'error' && 'text-red-600 dark:text-red-400',
              )}
            >
              {saveStatus === 'saving' && <Loader2 className="size-3 animate-spin" aria-hidden />}
              {saveStatus === 'saved' && <Check className="size-3" aria-hidden />}
              {saveStatus === 'error' && <AlertTriangle className="size-3" aria-hidden />}
              {SAVE_LABEL[saveStatus]}
            </span>
          </div>
          {mode === 'edit' ? (
            <textarea
              ref={boxRef}
              aria-label="Note"
              value={active.content}
              onChange={(e) => edit(e.target.value)}
              spellCheck
              placeholder="# Title&#10;&#10;Write in Markdown…"
              className="m-3 min-h-0 flex-1 resize-none rounded-lg border bg-card/40 p-3 font-mono text-[13px] leading-relaxed outline-none focus:border-violet-500/50"
            />
          ) : (
            <ScrollArea className="m-3 min-h-0 flex-1 rounded-lg border bg-card/40">
              <div className="p-3.5 text-[13px] leading-relaxed">
                <Markdown>{active.content}</Markdown>
              </div>
            </ScrollArea>
          )}
        </>
      )}
    </aside>
  )
}
