import { ChevronRight, Search } from 'lucide-react'
import { Kbd } from '@/components/Kbd'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Button } from '@/components/ui/button'
import { noteTitle } from '@dsa/core/noteTitle'
import { shortcut } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { activeChat, useAiChat } from '@/state/aiChat'
import { useNotes } from '@/state/notes'
import { usePlayground } from '@/state/playground'
import { activeProblem, useProblems } from '@/state/problems'
import { SECTIONS, type Section } from '@/state/sections'
import { useSettings } from '@/state/settings'
import { useWorkspace } from '@/state/workspace'

interface Props {
  narrow: boolean
  onOpenCommand(): void
}

const NOTHING_OPEN: Record<Section, string> = {
  problems: 'No problem open',
  code: 'No file open',
  notes: 'No note open',
  dryruns: 'No dry run open',
  chats: 'New chat',
}

/** The title of what's open in a section, or null. */
function useOpenTitle(section: Section): string | null {
  const file = useWorkspace((s) => s.files.find((f) => f.id === s.activeId)?.name ?? null)
  const problem = useProblems((s) => activeProblem(s)?.problem.title ?? null)
  const note = useNotes((s) => {
    const n = s.notes.find((x) => x.name === s.activeName)
    return n ? noteTitle(n.content) : null
  })
  const run = usePlayground((s) => s.runs.find((r) => r.id === s.activeId)?.title ?? null)
  const chat = useAiChat((s) => activeChat(s)?.title ?? null)
  return { problems: problem, code: file, notes: note, dryruns: run, chats: chat }[section]
}

export function TopBar({ narrow, onOpenCommand }: Props) {
  const section = useSettings((s) => s.section)
  const title = useOpenTitle(section)
  const label = SECTIONS.find((s) => s.id === section)!.label

  return (
    <header className="flex h-12 shrink-0 items-center gap-2.5 border-b px-3">
      <div className="grid size-6 place-items-center rounded-[7px] bg-gradient-to-br from-violet-500 to-cyan-400 font-mono text-xs font-bold text-white shadow-[0_0_12px_-2px_rgba(168,85,247,0.6)]">
        {'{}'}
      </div>
      <nav aria-label="You are here" className="flex min-w-0 items-center gap-1 text-sm">
        <span className="shrink-0 text-muted-foreground">{label}</span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
        <span className={cn('truncate', title ? 'font-medium' : 'text-muted-foreground', section === 'code' && title && 'font-mono')}>
          {title ?? NOTHING_OPEN[section]}
        </span>
      </nav>

      <div className="flex-1" />

      {narrow ? (
        <Button variant="ghost" size="icon" aria-label="Search or run a command" onClick={onOpenCommand}>
          <Search className="size-4" />
        </Button>
      ) : (
        <button
          type="button"
          aria-label="Search or run a command"
          onClick={onOpenCommand}
          className="flex h-8 w-60 items-center gap-2 whitespace-nowrap rounded-lg border bg-card/60 px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-violet-500/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Search className="size-3.5" aria-hidden />
          Search or run a command
          <Kbd className="ml-auto">{shortcut('K')}</Kbd>
        </button>
      )}

      <ThemeToggle />
    </header>
  )
}
