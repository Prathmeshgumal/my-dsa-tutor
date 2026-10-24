import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, FilePlus2, Loader2, NotebookPen, StickyNote, Trash2 } from 'lucide-react'
import { Markdown } from '@/components/ai/Markdown'
import { ProblemTag } from '@/components/problems/ProblemTag'
import { ListPane, ListRow } from '@/components/shell/ListPane'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { flushNotesOnUnload, noteTitle, useNotes, type Note } from '@/state/notes'
import { useNoteProblem } from '@/state/problems'
import { useListVisible } from '@/state/sections'

const SAVE_LABEL = {
  saved: 'Saved',
  pending: 'Editing…',
  saving: 'Saving…',
  error: 'Couldn’t save — keep typing to retry',
} as const

/** A list row with the problem the note belongs to. Takes `title` itself, so the list's search can read it. */
function NoteRow({ note, title, active, onDelete }: { note: Note; title: string; active: boolean; onDelete(): void }) {
  const problem = useNoteProblem(note.name)
  return (
    <ListRow
      icon={<StickyNote className={active ? 'text-violet-500' : undefined} />}
      title={title}
      meta={problem ? <ProblemTag slug={problem} /> : note.name}
      active={active}
      onOpen={() => void useNotes.getState().select(note.name)}
      actions={[{ label: 'Delete', icon: <Trash2 />, destructive: true, onSelect: onDelete }]}
    />
  )
}

/** The Notes section: every note on the left, the open one beside it. Each note is a .md file in notes/. */
export function NotesScreen() {
  const listShown = useListVisible('notes')
  const { notes, activeName, status, saveStatus, create, edit } = useNotes()
  const active = notes.find((n) => n.name === activeName) ?? null
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [deleting, setDeleting] = useState<Note | null>(null)
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
      // Leaving the section shouldn't lose the last few keystrokes.
      void useNotes.getState().flush()
    }
  }, [])

  const newNote = async () => {
    setMode('edit')
    await create()
    setFocusEnd(true)
  }

  return (
    <>
      {listShown && (
        <ListPane
          title="Notes"
          count={notes.length}
          onNew={() => void newNote()}
          newLabel="New note"
          search
          empty="No notes yet."
        >
          {notes.map((n) => (
            <NoteRow
              key={n.name}
              note={n}
              title={noteTitle(n.content)}
              active={n.name === activeName}
              onDelete={() => setDeleting(n)}
            />
          ))}
        </ListPane>
      )}

      <main aria-label="Note" className="flex min-w-0 flex-1 flex-col">
        {!active ? (
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
            <div className="flex h-[38px] shrink-0 items-center gap-3 border-b px-4">
              <h1 className="min-w-0 truncate text-[13px] font-medium">{noteTitle(active.content)}</h1>
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
                  'ml-auto flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground',
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
      </main>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting ? noteTitle(deleting.content) : ''}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <span className="font-mono text-foreground">{deleting?.name}</span> from notes/. You can’t
              undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) void useNotes.getState().remove(deleting.name)
                setDeleting(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
