import { useState } from 'react'
import { Clapperboard, FilePlus2, MessageSquare, NotebookPen, Pencil, Unlink } from 'lucide-react'
import { Markdown } from '@/components/ai/Markdown'
import { Button } from '@/components/ui/button'
import type { ProblemEntry } from '@dsa/core/problems'
import { cn } from '@/lib/utils'
import { useAiChat } from '@/state/aiChat'
import { noteTitle, useNotes } from '@/state/notes'
import { usePlayground } from '@/state/playground'
import { useProblems } from '@/state/problems'
import { useSettings } from '@/state/settings'

const when = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function Empty({
  icon: Icon,
  children,
  action,
}: {
  icon: typeof NotebookPen
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-3 p-4">
      <p className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
        <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>{children}</span>
      </p>
      {action}
    </div>
  )
}

const row = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-muted'

/** Notes linked to the problem: read them here, edit them in the Notes panel. */
export function ProblemNotes({ entry }: { entry: ProblemEntry }) {
  const allNotes = useNotes((s) => s.notes)
  const linked = allNotes.filter((n) => entry.problem.notes?.includes(n.name))
  const [openName, setOpenName] = useState<string | null>(null)
  const open = linked.find((n) => n.name === openName) ?? null

  const newNote = async () => {
    // Linked automatically, because the Problem screen is showing.
    await useNotes.getState().create()
    useSettings.getState().setSection('notes')
  }
  const edit = (name: string) => {
    void useNotes.getState().select(name)
    useSettings.getState().setSection('notes')
  }
  const add = (
    <Button size="sm" variant="outline" onClick={() => void newNote()}>
      <FilePlus2 /> New note for this problem
    </Button>
  )

  if (open) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpenName(null)}>
            ← All notes
          </Button>
          <Button size="sm" variant="outline" onClick={() => edit(open.name)}>
            <Pencil /> Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setOpenName(null)
              void useProblems.getState().unlinkNote(open.name)
            }}
            className="text-muted-foreground"
          >
            <Unlink /> Unlink from problem
          </Button>
        </div>
        <div className="text-[13px] leading-relaxed">
          <Markdown>{open.content}</Markdown>
        </div>
      </div>
    )
  }
  if (!linked.length) {
    return (
      <Empty icon={NotebookPen} action={add}>
        No notes yet. Notes you or Claude write while this problem is open are kept here.
      </Empty>
    )
  }
  return (
    <div className="flex flex-col gap-2 p-2">
      <ul aria-label="Notes for this problem" className="flex flex-col gap-0.5">
        {linked.map((n) => (
          <li key={n.name}>
            <button type="button" className={row} onClick={() => setOpenName(n.name)}>
              <NotebookPen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{noteTitle(n.content)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="px-2 pb-2">{add}</div>
    </div>
  )
}

/** Dry runs of this problem; they play in the Playground. */
export function ProblemDryRuns({ entry }: { entry: ProblemEntry }) {
  const runs = usePlayground((s) => s.runs).filter((r) => r.problem === entry.slug)
  if (!runs.length) {
    return (
      <Empty icon={Clapperboard}>
        No dry runs yet. Ask Claude something like “dry run my solution on example 1” and it will show up here and in
        the Playground.
      </Empty>
    )
  }
  return (
    <ul aria-label="Dry runs of this problem" className="flex flex-col gap-0.5 p-2">
      {runs.map((r) => (
        <li key={r.id}>
          <button type="button" className={row} onClick={() => usePlayground.getState().open(r.id)}>
            <Clapperboard className="size-3.5 shrink-0 text-violet-500" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px]">{r.title}</span>
              <span className="block text-[11px] text-muted-foreground">
                {[`${r.steps.length} steps`, r.file, when(r.createdAt)].filter(Boolean).join(' · ')}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Chats started while this problem was open. */
export function ProblemChats({ entry }: { entry: ProblemEntry }) {
  const chats = useAiChat((s) => s.chats).filter((c) => c.problemSlug === entry.slug)
  const activeId = useAiChat((s) => s.activeChatId)
  const show = (id: string | null) => {
    if (id) useAiChat.getState().selectChat(id)
    else useAiChat.getState().newChat()
    useSettings.getState().setAiOpen(true)
  }
  const start = (
    <Button size="sm" variant="outline" onClick={() => show(null)}>
      <MessageSquare /> New chat about this problem
    </Button>
  )
  if (!chats.length) {
    return (
      <Empty icon={MessageSquare} action={start}>
        No chats yet. Chats you start while this problem is open are kept here, and opening the problem switches Claude
        to them.
      </Empty>
    )
  }
  return (
    <div className="flex flex-col gap-2 p-2">
      <ul aria-label="Chats about this problem" className="flex flex-col gap-0.5">
        {chats.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={cn(row, c.id === activeId && 'bg-violet-500/10')}
              onClick={() => show(c.id)}
            >
              <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px]">{c.title}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {c.messages.length} messages · {when(c.updatedAt)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="px-2 pb-2">{start}</div>
    </div>
  )
}
