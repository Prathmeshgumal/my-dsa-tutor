// Things worked out from a dry run to help explain it: what each step changed, what's different from
// the start, which lines have run, whether the answer is right, and the trace table's columns.
import { cellRef, formatScalar, type DryRun, type DryRunStep, type Scalar, type Structure } from './dryRun'

export interface Change {
  /** A variable name or a box, named like arrows name them: arr[3], dp[1][2], seen[7] */
  ref: string
  /** null = it wasn't there before */
  from: string | null
  /** null = it's gone */
  to: string | null
}

/** Every box with a value in a structure, by its ref, in drawing order. */
function boxes(s: Structure): [string, Scalar][] {
  if (s.kind === 'array' || s.kind === 'stack' || s.kind === 'queue') return s.values.map((v, i) => [cellRef(s.name, i), v])
  if (s.kind === 'linked_list' || s.kind === 'tree') return s.nodes.map((v, i) => [cellRef(s.name, i), v])
  if (s.kind === 'grid') return s.rows.flatMap((row, r) => row.map((v, c): [string, Scalar] => [cellRef(s.name, r, c), v]))
  if (s.kind === 'map') return s.entries.map(([k, v]) => [cellRef(s.name, k), v])
  return []
}

function diff(before: Map<string, string>, after: Map<string, string>): Change[] {
  const changes: Change[] = []
  for (const [ref, from] of before) {
    const to = after.get(ref)
    if (to === undefined) changes.push({ ref, from, to: null })
    else if (to !== from) changes.push({ ref, from, to })
  }
  for (const [ref, to] of after) if (!before.has(ref)) changes.push({ ref, from: null, to })
  return changes
}

const asText = (entries: [string, Scalar][]) => new Map(entries.map(([k, v]) => [k, formatScalar(v)]))

/** What this step changed compared with the one before (nothing for the first step). */
export function stepChanges(prev: DryRunStep | undefined, step: DryRunStep): Change[] {
  if (!prev) return []
  // Changes in place first (old values), then what appeared, the way you'd read them.
  const vars = diff(asText(Object.entries(prev.vars ?? {})), asText(Object.entries(step.vars ?? {})))
  const order = (c: Change[]) => [...c.filter((x) => x.from !== null), ...c.filter((x) => x.from === null)]
  const cells = (step.structures ?? []).flatMap((s) => {
    const was = prev.structures?.find((p) => p.kind === s.kind && p.name === s.name)
    return was ? order(diff(asText(boxes(was)), asText(boxes(s)))) : []
  })
  return [...order(vars), ...cells]
}

/** Refs of the boxes whose value differs from the start (new boxes count as changed). */
export function cellsChangedSince(start: Structure | undefined, now: Structure): Set<string> {
  if (!start) return new Set()
  const before = asText(boxes(start))
  return new Set(boxes(now).flatMap(([ref, v]) => (before.get(ref) === formatScalar(v) ? [] : [ref])))
}

/** How many times each line has run, from the first step up to and including `upto`. */
export function lineHits(run: DryRun, upto: number): Map<number, number> {
  const hits = new Map<number, number>()
  for (const step of run.steps.slice(0, upto + 1)) if (step.line) hits.set(step.line, (hits.get(step.line) ?? 0) + 1)
  return hits
}

const normalise = (text: string) => text.trim().split(/\s+/).join(' ')

/** The final output against the expected answer, when both are known. */
export function finalCheck(run: DryRun): { expected: string; actual: string; match: boolean } | null {
  const actual = [...run.steps].reverse().find((s) => s.output !== undefined)?.output
  if (run.expected === undefined || actual === undefined) return null
  return { expected: run.expected, actual, match: normalise(actual) === normalise(run.expected) }
}

/** Runs of steps in the same phase; a step without a phase stays in the one before it. */
export function phases(run: DryRun): { name: string; from: number; to: number }[] {
  const out: { name: string; from: number; to: number }[] = []
  run.steps.forEach((step, i) => {
    const last = out.at(-1)
    if (step.phase && step.phase !== last?.name) out.push({ name: step.phase, from: i, to: i })
    else if (last) last.to = i
  })
  return out
}

/** The trace table's variable columns, in the order they first appear. */
export function traceColumns(run: DryRun): string[] {
  const seen = new Set<string>()
  for (const step of run.steps) for (const k of Object.keys(step.vars ?? {})) seen.add(k)
  return [...seen]
}

/** The name of the phase a step belongs to, if the dry run has phases. */
export function currentPhase(run: DryRun, step: number): string | null {
  return phases(run).find((p) => step >= p.from && step <= p.to)?.name ?? null
}
