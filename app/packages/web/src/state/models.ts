import { create } from 'zustand'

/** Effort levels, lowest first, as the Claude Code engine names them. */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type Effort = (typeof EFFORTS)[number]

export const EFFORT_LABEL: Record<Effort, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' }

/** A model the engine offers this login, from GET /api/claude/models. `efforts` is empty when it has no effort setting. */
export interface ClaudeModel {
  value: string
  displayName: string
  description: string
  efforts: Effort[]
}

interface ModelsState {
  models: ClaudeModel[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  /** Asks the server once; after a failure, the next call tries again. */
  load(): Promise<void>
}

let deps = { fetchImpl: ((...args: Parameters<typeof fetch>) => fetch(...args)) as typeof fetch }

/** Test seam: swap the fetch used. */
export function configureModels(next: Partial<typeof deps>) {
  deps = { ...deps, ...next }
}

export const useModels = create<ModelsState>()((set, get) => ({
  models: [],
  status: 'idle',
  error: null,
  async load() {
    if (get().status === 'loading' || get().status === 'ready') return
    set({ status: 'loading', error: null })
    try {
      const res = await deps.fetchImpl('/api/claude/models')
      const body = (await res.json()) as { models?: ClaudeModel[]; error?: string }
      if (!res.ok || !body.models) throw new Error(body.error ?? `HTTP ${res.status}`)
      set({ models: body.models, status: 'ready' })
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  },
}))

/** The engine names its current models by family ("default", "opus", "sonnet"…) and older ones by full id. */
export function splitModels(models: ClaudeModel[]) {
  const older = (m: ClaudeModel) => m.value.startsWith('claude-')
  return { main: models.filter((m) => !older(m)), more: models.filter(older) }
}

/** The chosen effort if the model has it, else the closest level it does have (the lower one on a tie). */
export function nearestEffort(efforts: readonly Effort[], effort: Effort | null): Effort | null {
  if (effort === null || efforts.length === 0) return null
  if (efforts.includes(effort)) return effort
  const at = EFFORTS.indexOf(effort)
  return [...efforts].sort((a, b) => Math.abs(EFFORTS.indexOf(a) - at) - Math.abs(EFFORTS.indexOf(b) - at) || EFFORTS.indexOf(a) - EFFORTS.indexOf(b))[0]
}
