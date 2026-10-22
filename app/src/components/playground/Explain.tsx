// The parts of a dry run that explain it beyond the drawing: the input and expected answer, what each
// step changed, the start next to the end, the classic trace table, phases, and what the colours mean.
import { useState } from 'react'
import { CheckCircle2, ChevronDown, Palette, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatScalar, type DryRun } from '@/lib/dryRun'
import { finalCheck, phases, traceColumns, type Change } from '@/lib/dryRunInsights'
import { cn } from '@/lib/utils'
import { StructureView } from './StructureView'

const label = 'text-[11px] tracking-wide text-muted-foreground uppercase'

/** What the code is run on, and the answer it should give. */
export function InputCard({ run }: { run: DryRun }) {
  if (!run.input && run.expected === undefined) return null
  return (
    <section
      aria-label="Input and expected answer"
      className="grid w-fit max-w-full grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 rounded-xl border bg-card px-3.5 py-2.5"
    >
      {run.input && (
        <>
          <span className={label}>Input</span>
          <code className="font-mono text-[12.5px] break-all whitespace-pre-wrap">{run.input}</code>
        </>
      )}
      {run.expected !== undefined && (
        <>
          <span className={label}>Expected</span>
          <code className="font-mono text-[12.5px] break-all whitespace-pre-wrap text-emerald-700 dark:text-emerald-300">
            {run.expected || '(nothing)'}
          </code>
        </>
      )}
    </section>
  )
}

/** On the last step: does the output match the expected answer? */
export function FinalCheck({ run }: { run: DryRun }) {
  const check = finalCheck(run)
  if (!check) return null
  return (
    <div
      data-testid="final-check"
      data-match={check.match}
      className={cn(
        'flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[13px]',
        check.match
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
          : 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200',
      )}
    >
      {check.match ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />}
      {check.match ? (
        <span>The output matches the expected answer.</span>
      ) : (
        <span>
          Wrong answer: expected <code className="font-mono font-semibold">{check.expected}</code>, got{' '}
          <code className="font-mono font-semibold">{check.actual.trim() || '(nothing)'}</code>.
        </span>
      )}
    </div>
  )
}

/** "a[0]: 1 → 3" for everything this step changed. */
export function StepChanges({ changes }: { changes: Change[] }) {
  if (!changes.length) return null
  return (
    <div>
      <div className={cn(label, 'mb-1.5')}>What changed</div>
      <ul aria-label="What changed" className="flex flex-wrap gap-1.5">
        {changes.map((c) => (
          <li
            key={c.ref}
            className="flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/[0.07] px-2 py-0.5 font-mono text-[12px]"
          >
            <span className="font-semibold">{c.ref}</span>
            {c.from === null ? (
              <span className="text-muted-foreground">new</span>
            ) : (
              <span className="text-red-600 line-through dark:text-red-400">{c.from}</span>
            )}
            <span aria-hidden className="text-muted-foreground">
              →
            </span>
            {c.to === null ? (
              <span className="text-muted-foreground">gone</span>
            ) : (
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">{c.to}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The data as it was at the start next to how it ends; boxes that ended up different are marked. */
export function StartVsEnd({ run, isLast }: { run: DryRun; isLast: boolean }) {
  const first = run.steps[0]
  const end = run.steps.at(-1)!
  const [open, setOpen] = useState(isLast)
  if (!first.structures?.length && !end.structures?.length) return null
  const vars = (step: typeof first) =>
    Object.entries(step.vars ?? {}).map(([k, v]) => `${k} = ${formatScalar(v)}`).join(', ')
  return (
    <section aria-label="Start vs end" className="rounded-xl border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[12.5px] font-medium"
      >
        <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', !open && '-rotate-90')} aria-hidden />
        Start vs end
        <span className="font-normal text-muted-foreground">how the data began and how it finished</span>
      </button>
      {open && (
        <div className="grid gap-4 border-t p-3.5 @3xl:grid-cols-2">
          {[
            { title: 'Start', step: first, start: undefined },
            { title: 'End', step: end, start: first },
          ].map(({ title, step, start }) => (
            <div key={title} className="flex min-w-0 flex-col gap-3">
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    title === 'Start' ? 'bg-muted text-foreground' : 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
                  )}
                >
                  {title}
                </span>
                {vars(step) && <span className="truncate font-mono text-[11.5px] text-muted-foreground">{vars(step)}</span>}
              </div>
              {(step.structures ?? []).map((s, i) => (
                <StructureView
                  key={`${s.kind}-${s.name}-${i}`}
                  structure={s}
                  start={start?.structures?.find((p) => p.kind === s.kind && p.name === s.name)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** The classic dry-run table: one row per step, one column per variable. Click a row to go there. */
export function TraceTable({ run, step, onJump }: { run: DryRun; step: number; onJump(step: number): void }) {
  const columns = traceColumns(run)
  const withOutput = run.steps.some((s) => s.output !== undefined)
  const cell = 'border-b px-2.5 py-1.5 text-left whitespace-nowrap'
  return (
    <table aria-label="Trace table" className="w-max min-w-full border-separate border-spacing-0 font-mono text-[12.5px]">
      <thead className="sticky top-0 z-10 bg-background text-[11px] text-muted-foreground">
        <tr>
          <th className={cn(cell, 'font-normal')}>Step</th>
          <th className={cn(cell, 'font-normal')}>Line</th>
          {columns.map((c) => (
            <th key={c} className={cn(cell, 'font-semibold text-foreground')}>
              {c}
            </th>
          ))}
          {withOutput && <th className={cn(cell, 'font-normal')}>Output</th>}
        </tr>
      </thead>
      <tbody>
        {run.steps.map((s, i) => {
          const before = i > 0 ? run.steps[i - 1] : undefined
          return (
            <tr
              key={i}
              aria-current={i === step ? 'step' : undefined}
              title={s.note}
              onClick={() => onJump(i)}
              className={cn(
                'cursor-pointer transition-colors hover:bg-muted/60',
                i === step && 'bg-violet-500/12 hover:bg-violet-500/15',
                s.mistake && 'bg-red-500/10',
              )}
            >
              <td className={cn(cell, 'text-muted-foreground')}>{i + 1}</td>
              <td className={cn(cell, 'text-muted-foreground')}>{s.line ?? ''}</td>
              {columns.map((c) => {
                const has = s.vars && c in s.vars
                const changed = has && (!before?.vars || !(c in before.vars) || before.vars[c] !== s.vars![c])
                return (
                  <td
                    key={c}
                    className={cn(cell, changed ? 'font-semibold text-violet-700 dark:text-violet-300' : 'text-muted-foreground')}
                  >
                    {has ? formatScalar(s.vars![c]) : ''}
                  </td>
                )
              })}
              {withOutput && <td className={cn(cell, 'max-w-60 truncate')}>{s.output?.replace(/\n/g, '⏎ ') ?? ''}</td>}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Coloured bands under the step slider, one per phase. */
export function PhaseBands({ run, onJump }: { run: DryRun; onJump(step: number): void }) {
  const list = phases(run)
  if (!list.length) return null
  const total = run.steps.length
  return (
    <ul aria-label="Phases" className="relative mt-1 h-4">
      {list.map((p, i) => (
        <li
          key={`${p.name}-${p.from}`}
          className="absolute top-0 h-4 px-px"
          style={{ left: `${(p.from / total) * 100}%`, width: `${((p.to - p.from + 1) / total) * 100}%` }}
        >
          <button
            type="button"
            title={`${p.name} (steps ${p.from + 1}–${p.to + 1})`}
            onClick={() => onJump(p.from)}
            className={cn(
              'block h-full w-full truncate rounded-sm px-1 text-left text-[10px] leading-4 font-medium',
              PHASE_COLORS[i % PHASE_COLORS.length],
            )}
          >
            {p.name}
          </button>
        </li>
      ))}
    </ul>
  )
}

const PHASE_COLORS = [
  'bg-violet-500/15 text-violet-700 dark:text-violet-200',
  'bg-cyan-500/15 text-cyan-700 dark:text-cyan-200',
  'bg-pink-500/15 text-pink-700 dark:text-pink-200',
  'bg-amber-500/15 text-amber-700 dark:text-amber-200',
]

const LEGEND: { swatch: string; text: string }[] = [
  { swatch: 'border-2 border-violet-500 bg-violet-500/15', text: 'Being looked at or compared' },
  { swatch: 'border-2 border-amber-500 bg-amber-500/15', text: 'Just swapped or moved' },
  { swatch: 'border border-emerald-500/60 bg-emerald-500/10', text: 'Done: in its final place' },
  { swatch: 'bg-red-500/15 ring-1 ring-red-500/40', text: 'Old value (crossed out), from the step before' },
  { swatch: 'border bg-card after:absolute after:inset-x-0.5 after:bottom-0.5 after:h-[3px] after:rounded-full after:bg-cyan-500', text: 'Changed since the start' },
  { swatch: 'border border-red-500/40 bg-red-500/10', text: 'The step where the bug shows up' },
]

/** A small key to the colours used in the drawing. */
export function Legend() {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-label="What the colours mean"
        onClick={() => setOpen((o) => !o)}
        className="h-7 gap-1.5 text-[12px] text-muted-foreground"
      >
        <Palette className="size-3.5" aria-hidden /> Colours
      </Button>
      {open && (
        <ul
          aria-label="Colour legend"
          className="absolute top-8 right-0 z-40 grid w-72 gap-2 rounded-xl border bg-popover p-3 text-[12px] shadow-lg"
        >
          {LEGEND.map((l) => (
            <li key={l.text} className="flex items-center gap-2.5">
              <span aria-hidden className={cn('relative size-5 shrink-0 rounded', l.swatch)} />
              {l.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
