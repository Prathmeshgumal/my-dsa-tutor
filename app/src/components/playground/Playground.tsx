import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronFirst,
  ChevronLast,
  Clapperboard,
  FileCode2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Kbd } from '@/components/Kbd'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatScalar, type DryRun } from '@/lib/dryRun'
import { cn } from '@/lib/utils'
import { usePlayground } from '@/state/playground'
import { StructureView } from './StructureView'

function timeAgo(at: number): string {
  if (!at) return 'example'
  const minutes = Math.floor(Math.max(0, Date.now() - at) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

function RunRow({ run, active }: { run: DryRun; active: boolean }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <li
      className={cn('group flex items-center gap-1 rounded-lg pr-1 transition-colors', active ? 'bg-violet-500/10 ring-1 ring-violet-500/25 ring-inset' : 'hover:bg-muted')}
      onMouseLeave={() => setConfirming(false)}
    >
      <button type="button" onClick={() => usePlayground.getState().open(run.id)} className="min-w-0 flex-1 px-2.5 py-2 text-left">
        <span className="block truncate text-[12.5px] text-foreground">{run.title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {[`${run.steps.length} steps`, run.file, timeAgo(run.createdAt)].filter(Boolean).join(' · ')}
        </span>
      </button>
      {confirming ? (
        <Button
          size="sm"
          variant="destructive"
          aria-label={`Confirm delete dry run: ${run.title}`}
          onClick={() => void usePlayground.getState().remove(run.id)}
          className="h-6 px-2 text-[11px]"
        >
          <Check /> Delete
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete dry run: ${run.title}`}
          onClick={() => setConfirming(true)}
          className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500 focus-visible:opacity-100"
        >
          <Trash2 />
        </Button>
      )}
    </li>
  )
}

function CodePanel({ code, line }: { code: string; line?: number }) {
  const currentRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [line])
  return (
    <ScrollArea className="min-h-0 flex-1">
      <ol aria-label="Code" className="py-2 font-mono text-[13px] leading-[1.6]">
        {code.split('\n').map((text, i) => {
          const current = line === i + 1
          return (
            <li
              key={i}
              ref={current ? currentRef : undefined}
              aria-current={current ? 'step' : undefined}
              className={cn(
                'flex border-l-2 pr-3 transition-colors duration-200',
                current ? 'border-violet-500 bg-violet-500/12' : 'border-transparent',
              )}
            >
              <span className={cn('w-10 shrink-0 pr-3 text-right select-none', current ? 'text-violet-500' : 'text-muted-foreground/60')}>{i + 1}</span>
              <span className="whitespace-pre">{text || ' '}</span>
            </li>
          )
        })}
      </ol>
    </ScrollArea>
  )
}

const SPEEDS = [0.5, 1, 2]

function Controls({ run }: { run: DryRun }) {
  const { step, playing, speed, next, prev, goTo, togglePlay, setSpeed } = usePlayground()
  const last = run.steps.length - 1
  const icon = (label: string, onClick: () => void, children: React.ReactNode, disabled = false) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} disabled={disabled}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-3 py-2.5">
      <div className="flex items-center gap-0.5">
        {icon('First step', () => goTo(0), <ChevronFirst />, step === 0)}
        {icon('Previous step', prev, <SkipBack />, step === 0)}
        <Button size="sm" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} className="glow-shimmer mx-1 w-20 border-white/15 text-white">
          {playing ? <Pause /> : <Play />} {playing ? 'Pause' : 'Play'}
        </Button>
        {icon('Next step', next, <SkipForward />, step === last)}
        {icon('Last step', () => goTo(last), <ChevronLast />, step === last)}
      </div>
      <input
        type="range"
        aria-label="Step"
        min={0}
        max={last}
        value={step}
        onChange={(e) => goTo(Number(e.target.value))}
        className="min-w-24 flex-1 accent-violet-500"
      />
      <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">{`Step ${step + 1} of ${run.steps.length}`}</span>
      <div role="radiogroup" aria-label="Speed" className="flex shrink-0 rounded-md bg-muted p-0.5 text-[11.5px]">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={speed === s}
            onClick={() => setSpeed(s)}
            className={cn('rounded px-2 py-0.5 tabular-nums', speed === s ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  )
}

function Viewer({ run }: { run: DryRun }) {
  const stepIndex = usePlayground((s) => s.step)
  const step = run.steps[Math.min(stepIndex, run.steps.length - 1)]
  const vars = Object.entries(step.vars ?? {})

  return (
    // A container, so the layout follows the space left by the side panels, not the window.
    <div className="@container flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-5 py-3">
        <h1 className="text-[15px] font-semibold">{run.title}</h1>
        {run.file && (
          <span className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-muted-foreground">
            <FileCode2 className="size-3" aria-hidden /> {run.file}
          </span>
        )}
        {run.input && (
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            input <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-foreground">{run.input}</code>
          </span>
        )}
      </header>

      {/* Code beside the drawing when there's room, above it when narrow. */}
      <div className="flex min-h-0 flex-1 flex-col @3xl:flex-row">
        {run.code && (
          <section
            aria-label="Code panel"
            className="flex max-h-[40%] shrink-0 flex-col border-b bg-card/30 @3xl:max-h-none @3xl:w-[40%] @3xl:max-w-[560px] @3xl:min-w-[260px] @3xl:border-r @3xl:border-b-0"
          >
            <CodePanel code={run.code} line={step.line} />
          </section>
        )}
        <ScrollArea className="min-h-0 min-w-0 flex-1">
          <div className="flex flex-col gap-5 p-4 @3xl:p-5">
            <div
              data-testid="step-note"
              aria-live="polite"
              className={cn(
                'rounded-xl border px-4 py-3 text-[13.5px] leading-relaxed transition-colors',
                step.mistake ? 'border-red-500/40 bg-red-500/10' : 'border-violet-500/25 bg-violet-500/[0.06]',
              )}
            >
              {step.mistake && (
                <span className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-red-600 dark:text-red-400">
                  <AlertTriangle className="size-3.5" aria-hidden /> Here’s the bug
                </span>
              )}
              <span className="mr-2 font-mono text-[11px] text-muted-foreground">{step.line ? `line ${step.line}` : `step ${stepIndex + 1}`}</span>
              {step.note}
            </div>

            {vars.length > 0 && (
              <ul aria-label="Variables" className="flex flex-wrap gap-2">
                {vars.map(([k, v]) => (
                  <li key={k} className="flex items-center overflow-hidden rounded-lg border font-mono text-[12.5px]">
                    <span className="bg-muted px-2 py-1 text-muted-foreground">{k}</span>
                    <span className="px-2 py-1 font-semibold">{formatScalar(v)}</span>
                  </li>
                ))}
              </ul>
            )}

            {(step.structures ?? []).map((s, i) => (
              <StructureView key={`${s.kind}-${s.name}-${i}`} structure={s} />
            ))}

            {step.output !== undefined && (
              <div>
                <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Output so far</div>
                <pre data-testid="step-output" className="rounded-lg border bg-card px-3 py-2 font-mono text-[12.5px] whitespace-pre-wrap">
                  {step.output || ' '}
                </pre>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
      <Controls run={run} />
    </div>
  )
}

function Empty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-violet-500/10 text-violet-500 ring-1 ring-violet-500/25">
        <Clapperboard className="size-6" aria-hidden />
      </span>
      <div className="max-w-md space-y-1.5">
        <p className="text-[15px] font-medium">Watch your code run, step by step</p>
        <p className="text-[13px] text-muted-foreground">
          Ask Claude something like “dry run my code with input [3, 1, 2]” or “show me where my loop goes wrong”. Its dry run
          appears here with your code, the variables and the data structures drawn out.
        </p>
      </div>
      <Button variant="outline" onClick={() => usePlayground.getState().openExample()}>
        <Sparkles /> Watch an example
      </Button>
    </div>
  )
}

/** Full-screen view of dry-run visualizations. */
export function Playground() {
  const { runs, activeId } = usePlayground()
  const run = runs.find((r) => r.id === activeId) ?? null

  useEffect(() => {
    void usePlayground.getState().load()
  }, [])

  // ← → step, space plays/pauses, unless typing somewhere or on a button (which handles space itself).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, [contenteditable="true"], .monaco-editor')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const pg = usePlayground.getState()
      if (e.key === 'ArrowRight') pg.next()
      else if (e.key === 'ArrowLeft') pg.prev()
      else if (e.key === ' ' && !t?.closest('button')) pg.togglePlay()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <main aria-label="Playground" className="flex min-h-0 min-w-0 flex-1">
      <aside className="flex w-52 shrink-0 flex-col border-r">
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <Clapperboard className="size-4 text-violet-500" aria-hidden />
          <span className="text-[13px] font-semibold">Playground</span>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {runs.length ? (
            <ul aria-label="Dry runs" className="flex flex-col gap-0.5 p-2 pt-0">
              {runs.map((r) => (
                <RunRow key={r.id} run={r} active={r.id === activeId} />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-[12px] text-muted-foreground">No dry runs yet.</p>
          )}
        </ScrollArea>
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          <Kbd>←</Kbd> <Kbd>→</Kbd> step · <Kbd>Space</Kbd> play
        </p>
      </aside>
      {run ? <Viewer run={run} /> : <Empty />}
    </main>
  )
}
