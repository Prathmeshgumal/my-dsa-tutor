import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronFirst,
  ChevronLast,
  Clapperboard,
  FileCode2,
  Loader2,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Kbd } from '@/components/Kbd'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import Editor from '@monaco-editor/react'
import { registerGlowThemes } from '@/components/editor/monacoThemes'
import { useResolvedTheme } from '@/components/theme/ThemeProvider'
import { routeArrow, type Box, type Route } from '@/lib/arrowRoute'
import { languageFromFilename } from '@/lib/languages'
import { useAiChat } from '@/state/aiChat'
import { dryRunSource, editCode, useCurrentCode, useDryRunFix, type DryRunSource } from '@/state/dryRunFix'
import { formatScalar, type DryRun, type Move } from '@/lib/dryRun'
import { cn } from '@/lib/utils'
import { ProblemTag } from '@/components/problems/ProblemTag'
import { usePlayground } from '@/state/playground'
import { useSettings } from '@/state/settings'
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
      className={cn(
        'group flex items-center gap-1 rounded-lg pr-1 transition-colors',
        active ? 'bg-violet-500/10 ring-1 ring-violet-500/25 ring-inset' : 'hover:bg-muted',
      )}
      onMouseLeave={() => setConfirming(false)}
    >
      <button
        type="button"
        onClick={() => usePlayground.getState().open(run.id)}
        className="min-w-0 flex-1 px-2.5 py-2 text-left"
      >
        <span className="block truncate text-[12.5px] text-foreground">{run.title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {[`${run.steps.length} steps`, run.file, timeAgo(run.createdAt)].filter(Boolean).join(' · ')}
        </span>
        <ProblemTag slug={run.problem} />
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

function CodePanel({ code, line, calc }: { code: string; line?: number; calc?: string }) {
  const currentRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    currentRef.current?.scrollIntoView?.({
      block: 'nearest',
      behavior: 'smooth',
    })
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
              <span
                className={cn(
                  'w-10 shrink-0 pr-3 text-right select-none',
                  current ? 'text-violet-500' : 'text-muted-foreground/60',
                )}
              >
                {i + 1}
              </span>
              <span className="whitespace-pre">{text || ' '}</span>
              {current && calc && (
                <span
                  data-testid="step-calc"
                  className="ml-4 shrink-0 self-center rounded-md bg-violet-500/15 px-1.5 py-px text-[11.5px] font-semibold whitespace-pre text-violet-700 dark:text-violet-200"
                >
                  {calc}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </ScrollArea>
  )
}

const SPEEDS = [0.5, 1, 2]

/** Steps worth jumping to: where the bug shows up, where things move, and where a new loop pass starts. */
function timelineMarks(run: DryRun) {
  return run.steps.flatMap((st, i) => {
    // Only the outer part (before " · ") counts as a new pass; inner counters change every step.
    const outer = (l?: string) => l?.split(' · ')[0]
    const newLoop = st.loop !== undefined && outer(st.loop) !== outer(run.steps[i - 1]?.loop)
    const parts = [
      st.mistake ? 'the bug' : newLoop ? st.loop : null,
      st.moves?.length && !st.mistake ? 'moves' : null,
    ].filter(Boolean)
    if (!parts.length) return []
    const kind = st.mistake ? 'bug' : st.moves?.length ? 'move' : 'loop'
    return [{ index: i, label: `Step ${i + 1}: ${parts.join(', ')}`, kind }]
  })
}

const MARK_STYLE: Record<string, string> = {
  bug: 'h-3 w-1.5 bg-red-500',
  move: 'size-2 rounded-full bg-amber-500',
  loop: 'h-2.5 w-0.5 bg-violet-500/70',
}

function Timeline({ run, onJump }: { run: DryRun; onJump(step: number): void }) {
  const marks = timelineMarks(run)
  if (!marks.length) return null
  const span = Math.max(1, run.steps.length - 1)
  return (
    <ul aria-label="Timeline" className="pointer-events-none absolute inset-x-1.5 top-0 h-3">
      {marks.map((m) => (
        <li key={m.index} className="absolute top-0 -translate-x-1/2" style={{ left: `${(m.index / span) * 100}%` }}>
          <button
            type="button"
            aria-label={m.label}
            title={m.label}
            onClick={() => onJump(m.index)}
            className={cn('pointer-events-auto block transition-transform hover:scale-150', MARK_STYLE[m.kind])}
          />
        </li>
      ))}
    </ul>
  )
}

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
        <Button
          variant="outline"
          size="sm"
          aria-label="Previous step"
          title="Previous step (←)"
          onClick={prev}
          disabled={step === 0}
          className="ml-1"
        >
          <SkipBack /> Prev
        </Button>
        <Button
          size="sm"
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          className="glow-shimmer mx-1 w-20 border-white/15 text-white"
        >
          {playing ? <Pause /> : <Play />} {playing ? 'Pause' : 'Play'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label="Next step"
          title="Next step (→)"
          onClick={next}
          disabled={step === last}
          className="mr-1"
        >
          Next <SkipForward />
        </Button>
        {icon('Last step', () => goTo(last), <ChevronLast />, step === last)}
      </div>
      <div className="relative min-w-24 flex-1 pt-3">
        <Timeline run={run} onJump={goTo} />
        <input
          type="range"
          aria-label="Step"
          min={0}
          max={last}
          value={step}
          onChange={(e) => goTo(Number(e.target.value))}
          className="w-full accent-violet-500"
        />
      </div>
      <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">{`Step ${step + 1} of ${run.steps.length}`}</span>
      <div role="radiogroup" aria-label="Speed" className="flex shrink-0 rounded-md bg-muted p-0.5 text-[11.5px]">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={speed === s}
            onClick={() => setSpeed(s)}
            className={cn(
              'rounded px-2 py-0.5 tabular-nums',
              speed === s ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  )
}

/** Width of an element, kept up to date (null until measured, e.g. in tests). */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number | null] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/** Side by side when there's room for both, stacked (code on top) when narrow. */
const SIDE_BY_SIDE_MIN = 720

function Variable({
  name,
  value,
  previous,
  changed,
}: {
  name: string
  value: string
  /** The value before this step, shown crossed out when it changed. */
  previous?: string
  changed: boolean
}) {
  return (
    <li data-testid="var-bucket" className="flex flex-col items-center gap-1">
      {/* Above the arrows layer, on the page colour, so an arrow passing by never hides the name. */}
      <span
        data-testid="var-name"
        className="relative z-30 max-w-28 truncate rounded bg-background px-1 font-mono text-[11.5px] font-semibold text-muted-foreground"
      >
        {name}
      </span>
      {/* A bucket: open at the top (|_|), value inside. Arrows between two variables run underneath. */}
      <span
        data-testid="var-value"
        data-ref={name}
        data-arrow-side="below"
        className={cn(
          'flex h-10 min-w-12 items-center justify-center gap-1.5 rounded-b-lg border-x-2 border-b-2 px-2.5 font-mono text-[14px] font-semibold transition-all duration-300',
          changed
            ? 'border-violet-500 bg-violet-500/12 text-violet-700 dark:text-violet-200'
            : 'border-muted-foreground/40 text-foreground',
        )}
      >
        {changed && previous !== undefined && (
          <span
            data-testid="ghost"
            title="Value before this step"
            className="rounded bg-red-500/15 px-1 py-px text-[12px] leading-none font-semibold text-red-600 line-through dark:bg-red-500/25 dark:text-red-300"
          >
            {previous}
          </span>
        )}
        {value}
      </span>
    </li>
  )
}

interface Arrow {
  move: Move
  route: Route | null
}

const toBox = (el: HTMLElement, origin: DOMRect): Box => {
  const r = el.getBoundingClientRect()
  return {
    left: r.left - origin.left,
    top: r.top - origin.top,
    width: r.width,
    height: r.height,
    // A cell's old value sits in its top-right corner.
    topRightTaken: el.querySelector(':scope > [data-testid="ghost"]') !== null,
  }
}

/** Curved arrows between boxes for what moved where. Positions are measured from the drawn boxes. */
function MoveArrows({ moves, stepKey }: { moves: Move[]; stepKey: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const markerId = useId()
  const [arrows, setArrows] = useState<Arrow[]>([])

  useLayoutEffect(() => {
    const svg = svgRef.current
    const host = svg?.parentElement
    if (!svg || !host) return
    const measure = () => {
      const origin = host.getBoundingClientRect()
      const find = (ref: string) => host.querySelector<HTMLElement>(`[data-ref="${CSS.escape(ref)}"]`)
      setArrows(
        moves.map((move, k) => {
          const a = find(move.from)
          const b = find(move.to)
          if (!a || !b) return { move, route: null }
          // The return half of a swap arcs below so the two don't overlap. Between two variables, arcs go
          // below the buckets too: their names are on top.
          const returning = moves.slice(0, k).some((m) => m.from === move.to && m.to === move.from)
          const bothVars = a.dataset.arrowSide === 'below' && b.dataset.arrowSide === 'below'
          return {
            move,
            route: routeArrow(toBox(a, origin), toBox(b, origin), {
              below: returning !== bothVars,
            }),
          }
        }),
      )
    }
    measure()
    // Pointer and box transitions take ~300ms; measure again once they settle, and on resize.
    const settle = setTimeout(measure, 320)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(host)
    return () => {
      clearTimeout(settle)
      ro?.disconnect()
    }
  }, [moves, stepKey])

  if (!moves.length) return null
  return (
    <svg ref={svgRef} aria-hidden className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible">
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-amber-500" />
        </marker>
      </defs>
      {arrows.map(({ move, route }, i) => (
        <g key={`${stepKey}-${i}`} data-testid="move-arrow" data-from={move.from} data-to={move.to}>
          {route && (
            <path
              d={route.path}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              markerEnd={`url(#${markerId})`}
              className="move-arrow stroke-amber-500"
            />
          )}
          {route && move.label && (
            <text
              x={route.labelX}
              y={route.labelY}
              textAnchor={route.labelAnchor}
              className="fill-amber-600 stroke-background font-mono text-[11px] font-semibold [paint-order:stroke] [stroke-width:5px] dark:fill-amber-300"
            >
              {move.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

/** Edits the dry run's real file (the problem's code or a solutions file); saved as you type. */
function CodeEditor({ source, code }: { source: DryRunSource; code: string }) {
  const theme = useResolvedTheme()
  const path = source.kind === 'problem' ? `problem:${source.slug}/${source.file}` : `playground-file:${source.name}`
  return (
    <div className="min-h-0 flex-1 bg-card">
      <Editor
        path={path}
        language={languageFromFilename(source.kind === 'problem' ? source.file : source.name)?.monaco ?? 'cpp'}
        value={code}
        onChange={(v) => editCode(source, v ?? '')}
        theme={theme === 'dark' ? 'glow-dark' : 'glow-light'}
        beforeMount={registerGlowThemes}
        onMount={(editor) => editor.focus()}
        loading={<Loader2 className="size-5 animate-spin text-muted-foreground" />}
        options={{
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          fontSize: 13,
          lineHeight: 0,
          minimap: { enabled: false },
          padding: { top: 8, bottom: 8 },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false },
        }}
      />
    </div>
  )
}

/** Edit the code here, then have Claude dry run it again on the same input (and, for a problem, run its tests). */
function FixBar({
  run,
  editing,
  onEdit,
  changed,
}: {
  run: DryRun
  editing: boolean
  onEdit(editing: boolean): void
  changed: boolean
}) {
  const redoing = useDryRunFix((s) => s.redoing === run.id)
  const redoError = useDryRunFix((s) => s.redoError)
  const tests = useDryRunFix((s) => (s.tests?.forRuns.includes(run.id) ? s.tests : null))
  const claudeBusy = useAiChat((s) => s.status === 'streaming')
  // How much of the new dry run Claude has written so far (a long one takes a minute).
  const written = useAiChat((s) => s.chats.find((c) => c.id === s.streamingChatId)?.messages.at(-1)?.progress?.chars ?? 0)
  const result = tests?.result
  const passed = result && result.status === 'success' && result.passed === result.total

  return (
    <div className="ml-auto flex flex-wrap items-center gap-2">
      {tests?.status === 'running' && (
        <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden /> Running the tests…
        </span>
      )}
      {result && (
        <span
          data-testid="fix-tests"
          className={cn(
            'rounded-full px-2 py-0.5 text-[12px] font-medium',
            passed ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' : 'bg-red-500/12 text-red-700 dark:text-red-300',
          )}
        >
          {result.statusText}
          {result.status !== 'compile_error' && ` · ${result.passed}/${result.total} tests`}
        </span>
      )}
      {tests?.status === 'error' && <span className="text-[12px] text-red-500">Couldn’t run the tests: {tests.error}</span>}
      {redoing ? (
        <span role="status" className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin text-violet-500" aria-hidden /> Claude is making a new dry run…
          {written > 0 && <span className="tabular-nums">{(written / 1000).toFixed(1)}k characters so far</span>}
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[12px]" onClick={() => useSettings.getState().setAiOpen(true)}>
            Show chat
          </Button>
        </span>
      ) : (
        <>
          {redoError && <span className="text-[12px] text-amber-600 dark:text-amber-400">{redoError}</span>}
          {changed && !editing && <span className="text-[12px] text-muted-foreground">Code changed since this dry run</span>}
          <Button size="sm" variant="outline" onClick={() => onEdit(!editing)}>
            {editing ? <Check /> : <Pencil />} {editing ? 'Done editing' : 'Edit code'}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* span: a disabled button shows no tooltip */}
              <span tabIndex={claudeBusy ? 0 : -1}>
                <Button
                  size="sm"
                  disabled={claudeBusy}
                  onClick={() => {
                    onEdit(false)
                    void useDryRunFix.getState().redo(run)
                  }}
                >
                  <RotateCcw /> Dry run again
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {claudeBusy ? 'Claude is busy with another reply' : 'Claude traces your current code on the same input'}
            </TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  )
}

function Viewer({ run }: { run: DryRun }) {
  const source = dryRunSource(run)
  const current = useCurrentCode(source)
  const [editing, setEditing] = useState(false)
  const stepIndex = usePlayground((s) => s.step)
  const step = run.steps[Math.min(stepIndex, run.steps.length - 1)]
  const before = stepIndex > 0 ? (run.steps[stepIndex - 1].vars ?? {}) : {}
  const vars = Object.entries(step.vars ?? {})
  const [ref, width] = useWidth<HTMLDivElement>()
  const sideBySide = width === null || width >= SIDE_BY_SIDE_MIN
  const area = sideBySide ? 'code-drawing' : 'code-drawing-stacked'
  const saved = useSettings((s) => s.playgroundLayout[area])

  const previousStructures = stepIndex > 0 ? (run.steps[stepIndex - 1].structures ?? []) : []

  const drawing = (
    <ScrollArea className="h-full min-h-0 min-w-0 flex-1">
      <div className="relative flex flex-col gap-5 p-4 @3xl:p-5" data-arrows={Boolean(step.moves?.length)}>
        <MoveArrows moves={step.moves ?? []} stepKey={`${run.id}:${stepIndex}`} />
        {step.loop && (
          <span
            data-testid="step-loop"
            className="-mb-2 w-fit rounded-full bg-violet-500/10 px-2.5 py-0.5 font-mono text-[11.5px] font-medium text-violet-700 ring-1 ring-violet-500/25 dark:text-violet-200"
          >
            {step.loop}
          </span>
        )}
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
          <span className="mr-2 font-mono text-[11px] text-muted-foreground">
            {step.line ? `line ${step.line}` : `step ${stepIndex + 1}`}
          </span>
          {step.note}
          {step.check && (
            <span
              data-testid="step-check"
              data-result={String(step.check.result)}
              className={cn(
                'mt-2 flex w-fit items-center gap-2 rounded-lg px-2.5 py-1 font-mono text-[12.5px] ring-1',
                step.check.result
                  ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300'
                  : 'bg-red-500/10 text-red-700 ring-red-500/30 dark:text-red-300',
              )}
            >
              <span>{step.check.expr}</span>
              <span className="font-sans text-[11.5px] font-semibold">{step.check.result ? '✓ true' : '✗ false'}</span>
            </span>
          )}
        </div>

        {vars.length > 0 && (
          <ul aria-label="Variables" className="flex flex-wrap items-end gap-x-4 gap-y-3">
            {vars.map(([k, v]) => (
              <Variable
                key={k}
                name={k}
                value={formatScalar(v)}
                previous={k in before ? formatScalar(before[k]) : undefined}
                changed={stepIndex > 0 && before[k] !== v}
              />
            ))}
          </ul>
        )}

        {step.callStack && step.callStack.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Call stack</div>
            <ul aria-label="Call stack" className="flex w-fit flex-col gap-1">
              {[...step.callStack].reverse().map((frame, i) => (
                <li
                  key={`${frame}-${i}`}
                  className={cn(
                    'rounded-md border px-2.5 py-1 font-mono text-[12.5px]',
                    i === 0
                      ? 'border-violet-500 bg-violet-500/12 font-semibold text-violet-700 dark:text-violet-200'
                      : 'text-muted-foreground',
                  )}
                >
                  {frame}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(step.structures ?? []).map((s, i) => (
          <StructureView
            key={`${s.kind}-${s.name}-${i}`}
            structure={s}
            previous={previousStructures.find((p) => p.kind === s.kind && p.name === s.name)}
          />
        ))}

        {step.output !== undefined && (
          <div>
            <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Output so far</div>
            <pre
              data-testid="step-output"
              className="rounded-lg border bg-card px-3 py-2 font-mono text-[12.5px] whitespace-pre-wrap"
            >
              {step.output || ' '}
            </pre>
          </div>
        )}
      </div>
    </ScrollArea>
  )

  return (
    // A container, so the layout follows the space left by the side panels, not the window.
    <div ref={ref} className="@container flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-5 py-3">
        <h1 className="text-[15px] font-semibold">{run.title}</h1>
        {run.file && (
          <span className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-muted-foreground">
            <FileCode2 className="size-3" aria-hidden /> {run.file}
          </span>
        )}
        {run.input && (
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            input{' '}
            <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-foreground">
              {run.input}
            </code>
          </span>
        )}
        {source && current !== null && (
          <FixBar run={run} editing={editing} onEdit={setEditing} changed={current !== run.code} />
        )}
      </header>

      {run.code ? (
        <ResizablePanelGroup
          key={area}
          orientation={sideBySide ? 'horizontal' : 'vertical'}
          defaultLayout={saved ?? (sideBySide ? { code: 42, drawing: 58 } : { code: 35, drawing: 65 })}
          onLayoutChanged={(l) => useSettings.getState().setPlaygroundLayout(area, l)}
          className="min-h-0 flex-1"
        >
          <ResizablePanel id="code" minSize="15" className="flex min-h-0 min-w-0 flex-col bg-card/30">
            <section aria-label="Code panel" className="flex min-h-0 flex-1 flex-col">
              {editing && source && current !== null ? (
                <CodeEditor source={source} code={current} />
              ) : (
                <CodePanel code={run.code} line={step.line} calc={step.calc} />
              )}
            </section>
          </ResizablePanel>
          <ResizableHandle
            withHandle
            className="transition-colors hover:bg-violet-500/50 data-[separator=active]:bg-violet-500"
          />
          <ResizablePanel id="drawing" minSize="25" className="flex min-h-0 min-w-0 flex-col">
            {drawing}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex min-h-0 flex-1">{drawing}</div>
      )}
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
          Ask Claude something like “dry run my code with input [3, 1, 2]” or “show me where my loop goes wrong”. Its
          dry run appears here with your code, the variables and the data structures drawn out.
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
  const savedOuter = useSettings((s) => s.playgroundLayout['list-main'])

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
      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={savedOuter ?? { list: 18, main: 82 }}
        onLayoutChanged={(l) => useSettings.getState().setPlaygroundLayout('list-main', l)}
        className="min-h-0 min-w-0 flex-1"
      >
        <ResizablePanel id="list" minSize="10" maxSize="40" className="flex min-h-0 flex-col">
          <aside className="flex min-h-0 flex-1 flex-col">
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
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="transition-colors hover:bg-violet-500/50 data-[separator=active]:bg-violet-500"
        />
        <ResizablePanel id="main" minSize="40" className="flex min-h-0 min-w-0 flex-col">
          {run ? <Viewer key={run.id} run={run} /> : <Empty />}
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  )
}
