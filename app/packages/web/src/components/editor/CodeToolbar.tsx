import { Play } from 'lucide-react'
import { ShimmerButton } from '@/components/glow/ShimmerButton'
import { Kbd } from '@/components/Kbd'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LANGUAGES, languageFromFilename, type LanguageId } from '@dsa/core/languages'
import { shortcut } from '@/lib/platform'
import { useRun } from '@/state/run'
import { useWorkspace } from '@/state/workspace'

/** The open file's language and Run, at the end of the open-files row: next to the code they act on. */
export function CodeToolbar() {
  const file = useWorkspace((s) => s.files.find((f) => f.id === s.activeId) ?? null)
  const canRun = useWorkspace((s) => s.ready && s.activeId !== null)
  const running = useRun((s) => s.state === 'running')
  const language = file ? languageFromFilename(file.name) : null

  return (
    <div className="mb-1 flex shrink-0 items-center gap-1.5">
      <Select value={language?.id ?? ''} onValueChange={(v) => useWorkspace.getState().setActiveLanguage(v as LanguageId)} disabled={!file}>
        <SelectTrigger size="sm" className="h-7 w-[104px]" aria-label="Language">
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
      <ShimmerButton onClick={() => void useRun.getState().runActiveFile()} disabled={!canRun} loading={running} aria-label="Run">
        {!running && <Play className="size-3 fill-current" aria-hidden />}
        Run
        <Kbd className="border-white/20 bg-white/15 text-white">{shortcut('↵')}</Kbd>
      </ShimmerButton>
    </div>
  )
}
