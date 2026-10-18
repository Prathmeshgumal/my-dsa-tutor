import { ChevronUp, Loader2 } from 'lucide-react'
import { focusEditor } from '@/components/editor/editorFocus'
import { Kbd } from '@/components/Kbd'
import { shortcut } from '@/lib/platform'
import { useRun } from '@/state/run'
import { useSettings } from '@/state/settings'
import { badgeFor, ToneBadge } from './ResultBadge'

/** Thin bar left behind when the output is collapsed: shows the last result, click to expand. */
export function OutputStrip() {
  const { state, result } = useRun()
  const badge = state === 'done' && result ? badgeFor(result) : null

  return (
    <button
      type="button"
      aria-label={`Show output (${shortcut('J')})`}
      onClick={() => {
        useSettings.getState().setOutputOpen(true)
        focusEditor()
      }}
      className="group flex h-8 w-full shrink-0 items-center gap-2.5 border-t bg-background/80 px-3 text-[12.5px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted/60 focus-visible:outline-none"
    >
      <ChevronUp className="size-3.5 transition-transform group-hover:-translate-y-px" aria-hidden />
      <span className="font-medium text-foreground">Output</span>
      {state === 'running' && (
        <span className="flex items-center gap-1.5">
          <Loader2 className="size-3 animate-spin text-violet-500" aria-hidden />
          Running…
        </span>
      )}
      {badge && <ToneBadge tone={badge.tone} label={badge.label} className="py-0 text-[11px]" />}
      {badge && result?.timeMs != null && <span className="tabular-nums">{`${result.timeMs} ms`}</span>}
      {state === 'error' && <ToneBadge tone="error" label="Run failed" className="py-0 text-[11px]" />}
      {state === 'idle' && <span>No runs yet</span>}
      <Kbd className="ml-auto">{shortcut('J')}</Kbd>
    </button>
  )
}
