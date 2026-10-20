// A dry run: a step-by-step trace of code, drawn in the Playground. Claude writes these with the
// create_visualization tool; they're saved as JSON files in playground/. Shared by server and browser.

export type Scalar = number | string | boolean | null

export interface ArrayViz {
  kind: 'array'
  name: string
  values: Scalar[]
  /** Named indices drawn as arrows under the cells, e.g. { i: 0, j: 3 }. */
  pointers?: Record<string, number>
  /** Cells being looked at. */
  highlight?: number[]
  /** Cells just swapped. */
  swapped?: number[]
  /** Cells already in their final place. */
  done?: number[]
  /** For a vector: slots allocated so far (drawn as empty spare slots after the values). */
  capacity?: number
}

export interface GridViz {
  kind: 'grid'
  name: string
  /** e.g. a DP table or a matrix */
  rows: Scalar[][]
  rowLabels?: string[]
  colLabels?: string[]
  /** [row, col] of the cell being filled */
  current?: [number, number]
  /** [row, col] cells it reads from */
  highlight?: [number, number][]
}

export interface MapViz {
  kind: 'map'
  name: string
  entries: [Scalar, Scalar][]
  /** Keys just added or read */
  highlight?: Scalar[]
}

export interface StackViz {
  kind: 'stack' | 'queue'
  name: string
  /** Bottom→top for a stack, front→back for a queue */
  values: Scalar[]
  highlight?: number[]
}

export interface LinkedListViz {
  kind: 'linked_list'
  name: string
  nodes: Scalar[]
  /** Named node indices, e.g. { slow: 1, fast: 3, prev: null } */
  pointers?: Record<string, number | null>
  highlight?: number[]
  /** Index the last node points back to (a cycle), if any */
  cycleTo?: number
}

export interface TreeViz {
  kind: 'tree'
  name: string
  /** Binary tree in level order, LeetCode style: [3, 9, 20, null, null, 15, 7] */
  nodes: Scalar[]
  /** Level-order indices being visited */
  highlight?: number[]
  /** Level-order indices already done */
  done?: number[]
  pointers?: Record<string, number | null>
}

export interface GraphViz {
  kind: 'graph'
  name: string
  nodes: string[]
  /** [from, to] or [from, to, weight] */
  edges: ([string, string] | [string, string, Scalar])[]
  directed?: boolean
  /** Node being processed */
  current?: string
  visited?: string[]
  /** Edges being used, [from, to] */
  activeEdges?: [string, string][]
}

export type Structure = ArrayViz | GridViz | MapViz | StackViz | LinkedListViz | TreeViz | GraphViz

export interface DryRunStep {
  /** 1-based line in `code` that runs in this step */
  line?: number
  /** What happens in this step, in plain words */
  note: string
  /** Variable values after the step */
  vars?: Record<string, Scalar>
  structures?: Structure[]
  /** Everything printed so far */
  output?: string
  /** Mark the step where the bug shows up */
  mistake?: boolean
}

export interface DryRun {
  id: string
  title: string
  /** File the code came from, if any */
  file?: string
  language?: 'cpp' | 'java' | 'python'
  code?: string
  input?: string
  createdAt: number
  steps: DryRunStep[]
}

export const MAX_STEPS = 200

/** Problems with a dry run that would make it draw wrongly; empty when it's fine. */
export function dryRunProblems(run: Pick<DryRun, 'steps' | 'code'>): string[] {
  const problems: string[] = []
  if (!run.steps.length) problems.push('It needs at least one step.')
  if (run.steps.length > MAX_STEPS) problems.push(`Keep it to ${MAX_STEPS} steps or fewer (it has ${run.steps.length}).`)
  const lines = run.code ? run.code.split('\n').length : 0
  run.steps.forEach((step, i) => {
    const where = `Step ${i + 1}`
    if (step.line !== undefined && (!run.code || step.line < 1 || step.line > lines)) {
      problems.push(`${where}: line ${step.line} isn't in the code (it has ${lines} lines).`)
    }
    for (const s of step.structures ?? []) {
      if (s.kind === 'array') {
        if (s.capacity !== undefined && s.capacity < s.values.length) {
          problems.push(`${where}: ${s.name} capacity ${s.capacity} is smaller than its ${s.values.length} values.`)
        }
        for (const [p, idx] of Object.entries(s.pointers ?? {})) {
          if (idx < -1 || idx > s.values.length) problems.push(`${where}: pointer ${p}=${idx} is outside ${s.name} (length ${s.values.length}).`)
        }
      }
      if (s.kind === 'grid' && s.current) {
        const [r, c] = s.current
        if (!s.rows[r] || c < 0 || c >= s.rows[r].length) problems.push(`${where}: current cell [${r}, ${c}] is outside ${s.name}.`)
      }
      if (s.kind === 'graph') {
        const known = new Set(s.nodes)
        for (const [a, b] of s.edges) {
          if (!known.has(a) || !known.has(b)) problems.push(`${where}: edge ${a}→${b} in ${s.name} uses a node that isn't listed.`)
        }
      }
    }
  })
  return problems
}

export function formatScalar(v: Scalar): string {
  if (v === null) return 'null'
  if (typeof v === 'string') return v
  return String(v)
}
