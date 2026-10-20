import { useId } from 'react'
import { cn } from '@/lib/utils'
import {
  cellRef,
  formatScalar,
  type ArrayViz,
  type GraphViz,
  type GridViz,
  type LinkedListViz,
  type MapViz,
  type Scalar,
  type StackViz,
  type Structure,
  type TreeViz,
} from '@/lib/dryRun'

// Shared look for one value box, by state.
const CELL_STATE: Record<string, string> = {
  '': 'border-border bg-card text-foreground',
  highlight: 'border-violet-500 bg-violet-500/15 text-violet-700 shadow-[0_0_0_3px] shadow-violet-500/15 dark:text-violet-200',
  swapped: 'border-amber-500 bg-amber-500/15 text-amber-700 shadow-[0_0_0_3px] shadow-amber-500/15 dark:text-amber-200',
  done: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  current: 'border-violet-500 bg-violet-500 text-white shadow-[0_0_14px] shadow-violet-500/40',
}

const POINTER_COLORS = ['text-violet-600 dark:text-violet-300', 'text-cyan-600 dark:text-cyan-300', 'text-pink-600 dark:text-pink-300', 'text-amber-600 dark:text-amber-300']

function Figure({ name, kind, children }: { name: string; kind: string; children: React.ReactNode }) {
  return (
    // On steps with arrows (data-arrows on an ancestor), leave room above and below the boxes for them.
    <figure aria-label={name} className="min-w-0 in-data-[arrows=true]:pb-8">
      <figcaption className="mb-2 flex items-baseline gap-2 in-data-[arrows=true]:mb-9">
        <span className="font-mono text-[13px] font-semibold text-foreground">{name}</span>
        <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{kind.replace('_', ' ')}</span>
      </figcaption>
      <div className="overflow-x-auto pb-1">{children}</div>
    </figure>
  )
}

const CELL = 48 // px; the strip's cells touch, so this is also the step between them

/** The value a box had before this step, crossed out in its corner. */
function Ghost({ value }: { value: Scalar }) {
  return (
    <span
      data-testid="ghost"
      title="Value before this step"
      className="absolute -top-2.5 -right-1 z-10 rounded bg-background px-0.5 font-mono text-[10px] leading-tight font-medium text-red-500/80 line-through decoration-red-500/80"
    >
      {formatScalar(value)}
    </span>
  )
}

/** A faint arrow under the strip from where a pointer was to where it is now, e.g. "j +1". */
function Trail({ name, from, to, top, color }: { name: string; from: number; to: number; top: number; color: string }) {
  const delta = to - from
  const left = Math.min(from, to) * CELL + CELL / 2
  const width = Math.abs(delta) * CELL
  return (
    <div data-testid="trail" className={cn('absolute flex flex-col items-center', color)} style={{ left, top, width }}>
      <svg width={width} height={10} className="overflow-visible opacity-60" aria-hidden>
        <line x1={delta > 0 ? 0 : width} y1={5} x2={delta > 0 ? width - 4 : 4} y2={5} stroke="currentColor" strokeWidth={1.5} strokeDasharray="3 3" />
        <path d={delta > 0 ? `M ${width - 6} 1 L ${width} 5 L ${width - 6} 9` : 'M 6 1 L 0 5 L 6 9'} fill="none" stroke="currentColor" strokeWidth={1.5} />
      </svg>
      <span className="font-mono text-[10.5px] font-semibold opacity-80">{`${name} ${delta > 0 ? '+' : ''}${delta}`}</span>
    </div>
  )
}

// Tints for a strip cell; strip cells share walls, so state is shown inside the cell (fill + inner ring).
const STRIP_STATE: Record<string, string> = {
  '': 'bg-card text-foreground',
  highlight: 'bg-violet-500/15 text-violet-700 ring-2 ring-violet-500 ring-inset dark:text-violet-200',
  swapped: 'bg-amber-500/15 text-amber-700 ring-2 ring-amber-500 ring-inset dark:text-amber-200',
  done: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
}

/** An array or vector as one long strip of joined boxes: indices above, pointers below. */
function ArrayView({ s, prev }: { s: ArrayViz; prev?: ArrayViz }) {
  const state = (i: number) =>
    s.swapped?.includes(i) ? 'swapped' : s.highlight?.includes(i) ? 'highlight' : s.done?.includes(i) ? 'done' : ''
  const spare = Math.max(0, (s.capacity ?? s.values.length) - s.values.length)
  const slots = s.values.length + spare
  // Pointers at the same index stack under it.
  const byIndex = new Map<number, string[]>()
  for (const [p, i] of Object.entries(s.pointers ?? {})) byIndex.set(i, [...(byIndex.get(i) ?? []), p])
  const pointerNames = Object.keys(s.pointers ?? {})
  const depth = Math.max(0, ...[...byIndex.values()].map((v) => v.length))
  const moved = Object.entries(s.pointers ?? {}).flatMap(([p, i]) => {
    const was = prev?.pointers?.[p]
    return was !== undefined && was !== i ? [{ p, from: was, to: i }] : []
  })
  const trailsTop = 70 + depth * 18 + 4
  const wall = 'border-y-2 border-r-2 border-muted-foreground/35 first:rounded-l-lg first:border-l-2 last:rounded-r-lg'

  return (
    <Figure name={s.name} kind={s.capacity !== undefined ? 'vector' : 'array'}>
      {s.capacity !== undefined && (
        <p className="-mt-1 mb-2 font-mono text-[11px] text-muted-foreground">{`size ${s.values.length} · capacity ${s.capacity}`}</p>
      )}
      {slots === 0 ? (
        <div className="flex items-center gap-2">
          <div className="h-12 w-12 rounded-lg border-2 border-dashed border-muted-foreground/35" />
          <span className="text-[12px] text-muted-foreground italic">empty</span>
        </div>
      ) : (
        <div className="relative w-max" style={{ paddingBottom: (depth ? depth * 18 + 14 : 0) + moved.length * 28 }}>
          <div className="flex">
            {Array.from({ length: slots }, (_, i) => (
              <span key={i} className="w-12 pb-1 text-center font-mono text-[10px] text-muted-foreground">
                {i}
              </span>
            ))}
          </div>
          <div className="flex">
            {s.values.map((v, i) => (
              <div
                key={i}
                data-testid="cell"
                data-state={state(i)}
                data-ref={cellRef(s.name, i)}
                className={cn(
                  'relative grid h-12 w-12 place-items-center font-mono text-[15px] font-semibold transition-all duration-300',
                  wall,
                  STRIP_STATE[state(i)],
                )}
              >
                {formatScalar(v)}
                {prev && i < prev.values.length && prev.values[i] !== v && <Ghost value={prev.values[i]} />}
              </div>
            ))}
            {Array.from({ length: spare }, (_, k) => (
              <div
                key={`spare-${k}`}
                data-testid="spare"
                title="Allocated but not used yet"
                className={cn('h-12 w-12 bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--border)_6px_7px)]', wall, 'border-dashed')}
              />
            ))}
          </div>
          {[...byIndex.entries()].map(([i, names]) =>
            names.map((p, k) => (
              <div
                key={p}
                className={cn(
                  'absolute flex w-12 flex-col items-center font-mono text-[12px] font-bold transition-[left] duration-300 ease-out',
                  POINTER_COLORS[pointerNames.indexOf(p) % POINTER_COLORS.length],
                )}
                style={{ left: i * CELL, top: 70 + k * 18 }}
              >
                {k === 0 && <span aria-hidden className="-mb-1 leading-none">▲</span>}
                <span>{p}</span>
              </div>
            )),
          )}
          {moved.map(({ p, from, to }, k) => (
            <Trail
              key={p}
              name={p}
              from={from}
              to={to}
              top={trailsTop + k * 28}
              color={POINTER_COLORS[pointerNames.indexOf(p) % POINTER_COLORS.length]}
            />
          ))}
        </div>
      )}
    </Figure>
  )
}

function GridView({ s, prev }: { s: GridViz; prev?: GridViz }) {
  const isCurrent = (r: number, c: number) => s.current?.[0] === r && s.current?.[1] === c
  const isHighlight = (r: number, c: number) => s.highlight?.some(([hr, hc]) => hr === r && hc === c)
  return (
    <Figure name={s.name} kind="grid">
      <table className="border-separate border-spacing-1 font-mono text-[13px]">
        {s.colLabels && (
          <thead>
            <tr>
              {s.rowLabels && <th />}
              {s.colLabels.map((l, i) => (
                <th key={i} className="px-1 text-[11px] font-normal text-muted-foreground">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {s.rows.map((row, r) => (
            <tr key={r}>
              {s.rowLabels && <th className="pr-1 text-right text-[11px] font-normal text-muted-foreground">{s.rowLabels[r]}</th>}
              {row.map((v, c) => {
                const st = isCurrent(r, c) ? 'current' : isHighlight(r, c) ? 'highlight' : ''
                return (
                  <td
                    key={c}
                    data-state={st}
                    data-ref={cellRef(s.name, r, c)}
                    className={cn('relative h-9 min-w-9 rounded-md border-2 px-1.5 text-center font-semibold transition-all duration-300', CELL_STATE[st])}
                  >
                    {formatScalar(v)}
                    {prev?.rows[r] && c < prev.rows[r].length && prev.rows[r][c] !== v && <Ghost value={prev.rows[r][c]} />}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Figure>
  )
}

function MapView({ s, prev }: { s: MapViz; prev?: MapViz }) {
  const hot = (k: Scalar) => s.highlight?.some((h) => h === k)
  const before = new Map(prev?.entries ?? [])
  return (
    <Figure name={s.name} kind="map">
      <table className="min-w-40 overflow-hidden rounded-lg border font-mono text-[13px]">
        <thead className="bg-muted/60 text-[11px] text-muted-foreground">
          <tr>
            <th className="px-3 py-1 text-left font-normal">key</th>
            <th className="px-3 py-1 text-left font-normal">value</th>
          </tr>
        </thead>
        <tbody>
          {s.entries.length === 0 && (
            <tr>
              <td colSpan={2} className="px-3 py-1.5 text-muted-foreground italic">
                empty
              </td>
            </tr>
          )}
          {s.entries.map(([k, v], i) => (
            <tr
              key={i}
              data-state={hot(k) ? 'highlight' : ''}
              data-ref={cellRef(s.name, k)}
              className={cn('border-t transition-colors duration-300', hot(k) && 'bg-violet-500/15 text-violet-700 dark:text-violet-200')}
            >
              <td className="px-3 py-1.5 font-semibold">{formatScalar(k)}</td>
              <td className="relative px-3 py-1.5">
                {formatScalar(v)}
                {before.has(k) && before.get(k) !== v && <Ghost value={before.get(k)!} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Figure>
  )
}

function StackView({ s }: { s: StackViz }) {
  const box = (v: Scalar, i: number) => (
    <div
      key={i}
      data-testid="cell"
      data-ref={cellRef(s.name, i)}
      className={cn(
        'grid h-10 min-w-12 place-items-center rounded-lg border-2 px-2 font-mono text-[14px] font-semibold transition-all duration-300',
        CELL_STATE[s.highlight?.includes(i) ? 'highlight' : ''],
      )}
    >
      {formatScalar(v)}
    </div>
  )
  if (s.kind === 'stack') {
    return (
      <Figure name={s.name} kind="stack">
        <div className="flex w-max items-start gap-2">
          <div className="flex flex-col-reverse gap-1 rounded-b-xl border-x-2 border-b-2 border-muted-foreground/30 p-1.5 pt-3">
            {s.values.length ? s.values.map(box) : <span className="px-3 py-2 text-[12px] text-muted-foreground italic">empty</span>}
          </div>
          {s.values.length > 0 && <span className="mt-4 text-[11px] font-semibold text-violet-600 dark:text-violet-300">← top</span>}
        </div>
      </Figure>
    )
  }
  return (
    <Figure name={s.name} kind="queue">
      <div className="flex w-max items-center gap-2 text-[11px] font-semibold text-muted-foreground">
        <span>front</span>
        <div className="flex gap-1 rounded-xl border-y-2 border-muted-foreground/30 px-1.5 py-1.5">
          {s.values.length ? s.values.map(box) : <span className="px-3 py-2 text-[12px] font-normal italic">empty</span>}
        </div>
        <span>back</span>
      </div>
    </Figure>
  )
}

function LinkedListView({ s }: { s: LinkedListViz }) {
  const pointers = Object.entries(s.pointers ?? {})
  const nulls = pointers.filter(([, i]) => i === null)
  return (
    <Figure name={s.name} kind="linked list">
      <div className="flex w-max items-start">
        {s.nodes.map((v, i) => {
          const here = pointers.filter(([, idx]) => idx === i)
          return (
            <div key={i} className="flex items-start">
              <div className="flex flex-col items-center gap-1">
                <div
                  data-testid="node"
                  data-ref={cellRef(s.name, i)}
                  className={cn(
                    'grid h-11 min-w-11 place-items-center rounded-full border-2 px-2 font-mono text-[14px] font-semibold transition-all duration-300',
                    CELL_STATE[s.highlight?.includes(i) ? 'highlight' : ''],
                  )}
                >
                  {formatScalar(v)}
                </div>
                {here.map(([p]) => (
                  <span key={p} className={cn('font-mono text-[12px] font-bold', POINTER_COLORS[pointers.findIndex(([n]) => n === p) % POINTER_COLORS.length])}>
                    ▲ {p}
                  </span>
                ))}
              </div>
              <span aria-hidden className="mx-1.5 mt-3 text-muted-foreground">
                →
              </span>
            </div>
          )
        })}
        <span className="mt-3 font-mono text-[12px] text-muted-foreground">
          {s.cycleTo !== undefined ? `↺ node ${s.cycleTo}` : 'null'}
        </span>
      </div>
      {nulls.length > 0 && (
        <p className="mt-1 font-mono text-[12px] text-muted-foreground">{nulls.map(([p]) => `${p} → null`).join('   ')}</p>
      )}
    </Figure>
  )
}

interface Placed {
  index: number
  value: Scalar
  x: number
  y: number
  parent: number | null
}

/** Builds a binary tree from LeetCode-style level order and lays it out (in-order x, depth y). */
function layoutTree(nodes: Scalar[]): Placed[] {
  if (!nodes.length || nodes[0] === null) return []
  type N = { index: number; left?: N; right?: N; depth: number; parent: number | null }
  const root: N = { index: 0, depth: 0, parent: null }
  const queue: N[] = [root]
  let i = 1
  while (queue.length && i < nodes.length) {
    const n = queue.shift()!
    for (const side of ['left', 'right'] as const) {
      if (i >= nodes.length) break
      if (nodes[i] !== null) {
        const child: N = { index: i, depth: n.depth + 1, parent: n.index }
        n[side] = child
        queue.push(child)
      }
      i++
    }
  }
  const placed: Placed[] = []
  let x = 0
  const walk = (n?: N) => {
    if (!n) return
    walk(n.left)
    placed.push({ index: n.index, value: nodes[n.index], x: x++, y: n.depth, parent: n.parent })
    walk(n.right)
  }
  walk(root)
  return placed.sort((a, b) => a.index - b.index)
}

function TreeView({ s }: { s: TreeViz }) {
  const placed = layoutTree(s.nodes)
  const at = new Map(placed.map((p) => [p.index, p]))
  const W = 52
  const H = 64
  const width = Math.max(1, placed.length) * W
  const height = (Math.max(0, ...placed.map((p) => p.y)) + 1) * H
  const px = (p: Placed) => p.x * W + W / 2
  const py = (p: Placed) => p.y * H + 24
  const pointerAt = (i: number) => Object.entries(s.pointers ?? {}).filter(([, idx]) => idx === i).map(([n]) => n)
  return (
    <Figure name={s.name} kind="tree">
      {placed.length === 0 ? (
        <span className="text-[12px] text-muted-foreground italic">empty tree</span>
      ) : (
        <svg width={width} height={height + 12} className="overflow-visible">
          {placed.map((p) => {
            const parent = p.parent === null ? undefined : at.get(p.parent)
            return parent ? (
              <line key={`e${p.index}`} x1={px(parent)} y1={py(parent)} x2={px(p)} y2={py(p)} className="stroke-muted-foreground/40" strokeWidth={2} />
            ) : null
          })}
          {placed.map((p) => {
            const st = s.highlight?.includes(p.index) ? 'current' : s.done?.includes(p.index) ? 'done' : ''
            const names = pointerAt(p.index)
            return (
              <g key={p.index} data-testid="node" data-ref={cellRef(s.name, p.index)} className="transition-all duration-300">
                <circle
                  cx={px(p)}
                  cy={py(p)}
                  r={18}
                  strokeWidth={2}
                  className={cn(
                    'transition-all duration-300',
                    st === 'current' ? 'fill-violet-500 stroke-violet-500' : st === 'done' ? 'fill-emerald-500/15 stroke-emerald-500' : 'fill-card stroke-border',
                  )}
                />
                <text
                  x={px(p)}
                  y={py(p) + 5}
                  textAnchor="middle"
                  className={cn('font-mono text-[13px] font-semibold', st === 'current' ? 'fill-white' : 'fill-foreground')}
                >
                  {formatScalar(p.value)}
                </text>
                {names.length > 0 && (
                  <text x={px(p) + 22} y={py(p) - 14} className="fill-pink-600 font-mono text-[11px] font-bold dark:fill-pink-300">
                    {names.join(',')}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}
    </Figure>
  )
}

function GraphView({ s }: { s: GraphViz }) {
  const markerId = useId()
  const n = s.nodes.length
  const R = Math.max(70, n * 16)
  const size = R * 2 + 60
  const pos = new Map(s.nodes.map((id, i) => {
    const a = (2 * Math.PI * i) / Math.max(1, n) - Math.PI / 2
    return [id, { x: size / 2 + R * Math.cos(a), y: size / 2 + R * Math.sin(a) }]
  }))
  const active = (a: string, b: string) => s.activeEdges?.some(([x, y]) => (x === a && y === b) || (!s.directed && x === b && y === a))
  return (
    <Figure name={s.name} kind={s.directed ? 'directed graph' : 'graph'}>
      <svg width={size} height={size}>
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
          </marker>
        </defs>
        {s.edges.map(([a, b, w], i) => {
          const p = pos.get(a)
          const q = pos.get(b)
          if (!p || !q) return null
          // Stop the line at the node's edge so arrowheads stay visible.
          const d = Math.hypot(q.x - p.x, q.y - p.y) || 1
          const ux = (q.x - p.x) / d
          const uy = (q.y - p.y) / d
          const on = active(a, b)
          return (
            <g key={i} data-testid="edge">
              <line
                x1={p.x + ux * 20}
                y1={p.y + uy * 20}
                x2={q.x - ux * 22}
                y2={q.y - uy * 22}
                strokeWidth={on ? 3 : 2}
                markerEnd={s.directed ? `url(#${markerId})` : undefined}
                className={cn('transition-all duration-300', on ? 'stroke-violet-500' : 'stroke-muted-foreground/40')}
              />
              {w !== undefined && (
                <text x={(p.x + q.x) / 2} y={(p.y + q.y) / 2 - 6} textAnchor="middle" className="fill-muted-foreground font-mono text-[11px]">
                  {formatScalar(w)}
                </text>
              )}
            </g>
          )
        })}
        {s.nodes.map((id) => {
          const p = pos.get(id)!
          const st = s.current === id ? 'current' : s.visited?.includes(id) ? 'done' : ''
          return (
            <g key={id} data-testid="node" data-ref={cellRef(s.name, id)}>
              <circle
                cx={p.x}
                cy={p.y}
                r={19}
                strokeWidth={2}
                className={cn(
                  'transition-all duration-300',
                  st === 'current' ? 'fill-violet-500 stroke-violet-500' : st === 'done' ? 'fill-emerald-500/15 stroke-emerald-500' : 'fill-card stroke-border',
                )}
              />
              <text x={p.x} y={p.y + 5} textAnchor="middle" className={cn('font-mono text-[13px] font-semibold', st === 'current' ? 'fill-white' : 'fill-foreground')}>
                {id}
              </text>
            </g>
          )
        })}
      </svg>
    </Figure>
  )
}

/** Draws one data structure from a dry-run step. */
export function StructureView({ structure: s, previous }: { structure: Structure; previous?: Structure }) {
  // The same structure in the step before, for ghosts of old values and pointer trails.
  const prev = previous?.kind === s.kind && previous.name === s.name ? previous : undefined
  switch (s.kind) {
    case 'array':
      return <ArrayView s={s} prev={prev as ArrayViz | undefined} />
    case 'grid':
      return <GridView s={s} prev={prev as GridViz | undefined} />
    case 'map':
      return <MapView s={s} prev={prev as MapViz | undefined} />
    case 'stack':
    case 'queue':
      return <StackView s={s} />
    case 'linked_list':
      return <LinkedListView s={s} />
    case 'tree':
      return <TreeView s={s} />
    case 'graph':
      return <GraphView s={s} />
  }
}
