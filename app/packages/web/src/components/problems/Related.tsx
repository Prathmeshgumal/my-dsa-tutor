import { useState } from 'react'
import { ArrowLeft, CheckCircle2, Clapperboard, FilePlus2, MessageSquare, NotebookPen, Unlink, XCircle } from 'lucide-react'
import { ListRow } from '@/components/shell/ListPane'
import { Button } from '@/components/ui/button'
import { SOLUTION_FILE, type Attempt, type ProblemEntry } from '@dsa/core/problems'
import { cn } from '@/lib/utils'
import { useAiChat } from '@/state/aiChat'
import { noteTitle, useNotes } from '@/state/notes'
import { usePlayground } from '@/state/playground'
import { useProblems } from '@/state/problems'
import { useSettings } from '@/state/settings'

const when = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function Group({
  title,
  count,
  empty,
  action,
  children,
}: {
  title: string
  count: number
  empty: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="flex items-center gap-1.5 px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {title}
        {count > 0 && <span className="text-muted-foreground/70 tabular-nums">{count}</span>}
      </h3>
      {count > 0 ? (
        <ul aria-label={`${title} for this problem`} className="grid gap-px">
          {children}
        </ul>
      ) : (
        <p className="px-2 text-[12.5px] text-muted-foreground">{empty}</p>
      )}
      {action && <div className="px-2 pt-1">{action}</div>}
    </section>
  )
}

function AttemptView({ attempt, onBack }: { attempt: Attempt; onBack(): void }) {
  const accepted = attempt.total > 0 && attempt.passed === attempt.total
  return (
    <div className="flex flex-col gap-3 p-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="self-start">
        <ArrowLeft /> Back
      </Button>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            'text-[15px] font-semibold',
            accepted ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
          )}
        >
          {attempt.statusText}
        </span>
        <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
          {attempt.passed}/{attempt.total} cases
        </span>
      </div>
      <span className="text-[12px] text-muted-foreground">
        {[attempt.file ?? SOLUTION_FILE, when(attempt.at)].join(' · ')}
      </span>
      <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-[12px] leading-relaxed">
        {attempt.code}
      </pre>
    </div>
  )
}

/** Everything that belongs to the problem: its notes, dry runs, chats and submissions. Notes, dry runs and chats open
 * in their own sections; a submission opens here. */
export function Related({ entry }: { entry: ProblemEntry }) {
  const notes = useNotes((s) => s.notes).filter((n) => entry.problem.notes?.includes(n.name))
  const runs = usePlayground((s) => s.runs).filter((r) => r.problem === entry.slug)
  const chats = useAiChat((s) => s.chats).filter((c) => c.problemSlug === entry.slug)
  const attempts = useProblems((s) => s.attempts)
  const [attempt, setAttempt] = useState<Attempt | null>(null)

  if (attempt) return <AttemptView attempt={attempt} onBack={() => setAttempt(null)} />

  const openNote = (name: string) => {
    void useNotes.getState().select(name)
    useSettings.getState().setSection('notes')
  }
  const newNote = async () => {
    // Linked automatically, because the Problems section is showing.
    await useNotes.getState().create()
    useSettings.getState().setSection('notes')
  }
  const openChat = (id: string) => {
    useAiChat.getState().selectChat(id)
    useSettings.getState().setSection('chats')
  }
  const newChat = () => {
    useAiChat.getState().newChat()
    useSettings.getState().setAiOpen(true)
  }

  return (
    <div className="flex flex-col gap-5 p-2 pt-3">
      <Group
        title="Notes"
        count={notes.length}
        empty="No notes yet. Notes you or Claude write while this problem is open are kept here."
        action={
          <Button size="sm" variant="outline" onClick={() => void newNote()}>
            <FilePlus2 /> New note for this problem
          </Button>
        }
      >
        {notes.map((n) => (
          <ListRow
            key={n.name}
            icon={<NotebookPen />}
            title={noteTitle(n.content)}
            onOpen={() => openNote(n.name)}
            actions={[{ label: 'Unlink from problem', icon: <Unlink />, onSelect: () => void useProblems.getState().unlinkNote(n.name) }]}
          />
        ))}
      </Group>

      <Group
        title="Dry runs"
        count={runs.length}
        empty="No dry runs yet. Ask Claude something like “dry run my solution on example 1”."
      >
        {runs.map((r) => (
          <ListRow
            key={r.id}
            icon={<Clapperboard className="text-violet-500" />}
            title={r.title}
            meta={[`${r.steps.length} steps`, r.file, when(r.createdAt)].filter(Boolean).join(' · ')}
            onOpen={() => usePlayground.getState().open(r.id)}
          />
        ))}
      </Group>

      <Group
        title="Chats"
        count={chats.length}
        empty="No chats yet. Chats you start while this problem is open are kept here."
        action={
          <Button size="sm" variant="outline" onClick={newChat}>
            <MessageSquare /> New chat about this problem
          </Button>
        }
      >
        {chats.map((c) => (
          <ListRow
            key={c.id}
            icon={<MessageSquare />}
            title={c.title}
            meta={`${c.messages.length} messages · ${when(c.updatedAt)}`}
            onOpen={() => openChat(c.id)}
          />
        ))}
      </Group>

      <Group
        title="Submissions"
        count={attempts.length}
        empty="No submissions yet. Submit runs every test case and saves your code here."
      >
        {attempts.map((a) => {
          const accepted = a.total > 0 && a.passed === a.total
          return (
            <ListRow
              key={a.at}
              icon={
                accepted ? <CheckCircle2 className="text-emerald-500" /> : <XCircle className="text-red-500" />
              }
              title={a.statusText}
              meta={`${a.passed}/${a.total} cases · ${when(a.at)}`}
              onOpen={() => setAttempt(a)}
            />
          )
        })}
      </Group>
    </div>
  )
}
