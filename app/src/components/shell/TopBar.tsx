import { FileCode2, Play, Search } from 'lucide-react'
import { ShimmerButton } from '@/components/glow/ShimmerButton'
import { Kbd } from '@/components/Kbd'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LANGUAGES, languageFromFilename, type LanguageId } from '@/lib/languages'
import { shortcut } from '@/lib/platform'
import { useWorkspace } from '@/state/workspace'

interface Props {
  narrow: boolean
  onRun(): void
  running: boolean
  canRun: boolean
  onOpenCommand(): void
}

export function TopBar({ narrow, onRun, running, canRun, onOpenCommand }: Props) {
  const file = useWorkspace((s) => s.files.find((f) => f.id === s.activeId) ?? null)
  const setActiveLanguage = useWorkspace((s) => s.setActiveLanguage)
  const language = file ? languageFromFilename(file.name) : null

  return (
    <header className="flex h-12 shrink-0 items-center gap-2.5 border-b px-3">
      <div className="grid size-6 place-items-center rounded-[7px] bg-gradient-to-br from-violet-500 to-cyan-400 font-mono text-xs font-bold text-white shadow-[0_0_12px_-2px_rgba(168,85,247,0.6)]">
        {'{}'}
      </div>
      <div className="flex min-w-0 items-center gap-1.5 text-sm" data-testid="active-file-name">
        <FileCode2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {file ? (
          <span className="truncate font-medium">{file.name}</span>
        ) : (
          <span className="text-muted-foreground">No file open</span>
        )}
      </div>

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

      <Select
        value={language?.id ?? ''}
        onValueChange={(v) => setActiveLanguage(v as LanguageId)}
        disabled={!file}
      >
        <SelectTrigger size="sm" className="w-[104px]" aria-label="Language">
          <SelectValue placeholder="Language" />
        </SelectTrigger>
        <SelectContent>
          {Object.values(LANGUAGES).map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ShimmerButton onClick={onRun} disabled={!canRun} loading={running} aria-label="Run">
        {!running && <Play className="size-3 fill-current" aria-hidden />}
        Run
        <Kbd className="border-white/20 bg-white/15 text-white">{shortcut('↵')}</Kbd>
      </ShimmerButton>

      <ThemeToggle />
    </header>
  )
}
