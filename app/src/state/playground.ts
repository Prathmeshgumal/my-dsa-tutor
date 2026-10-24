import { create } from 'zustand'
import type { DryRun } from '@/lib/dryRun'
import { exampleDryRun } from '@/lib/dryRunExample'
import { parseSaved } from '@/lib/formats'
import { useSettings } from './settings'

/** Dry-run visualizations shown in the Playground; saved as JSON files in playground/ (via /api/playground). */
interface PlaygroundState {
  /** Newest first */
  runs: DryRun[]
  activeId: string | null
  /** 0-based step being shown */
  step: number
  playing: boolean
  /** 0.5, 1 or 2 */
  speed: number
  status: 'idle' | 'loading' | 'ready' | 'error'
  load(): Promise<void>
  add(run: DryRun): void
  /** Shows a dry run from its first step, switching to the Playground screen. */
  open(id: string): void
  openExample(): void
  remove(id: string): Promise<void>
  next(): void
  prev(): void
  goTo(step: number): void
  togglePlay(): void
  setSpeed(speed: number): void
}

const API = '/api/playground'
/** Time per step at 1× speed. */
const STEP_MS = 1200

let deps = { fetchImpl: ((...args: Parameters<typeof fetch>) => fetch(...args)) as typeof fetch }

/** Test seam: swap the fetch used. */
export function configurePlayground(next: Partial<typeof deps>) {
  deps = { ...deps, ...next }
}

let timer: ReturnType<typeof setInterval> | null = null
const stopTimer = () => {
  if (timer) clearInterval(timer)
  timer = null
}

const byNewest = (a: DryRun, b: DryRun) => b.createdAt - a.createdAt

export const usePlayground = create<PlaygroundState>()((set, get) => {
  const active = () => get().runs.find((r) => r.id === get().activeId)
  const lastStep = () => Math.max(0, (active()?.steps.length ?? 1) - 1)
  const pause = () => {
    stopTimer()
    set({ playing: false })
  }
  const startTimer = () => {
    stopTimer()
    timer = setInterval(() => {
      if (get().step >= lastStep()) pause()
      else set((s) => ({ step: s.step + 1 }))
    }, STEP_MS / get().speed)
  }

  return {
    runs: [],
    activeId: null,
    step: 0,
    playing: false,
    speed: 1,
    status: 'idle',

    async load() {
      set({ status: 'loading' })
      try {
        const res = await deps.fetchImpl(API)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const files = (await res.json()) as { name: string; content: string }[]
        const saved = files.flatMap((f) => {
          try {
            const run = parseSaved<DryRun>('dryRun', f.content)
            return Array.isArray(run.steps) && typeof run.id === 'string' ? [run] : []
          } catch {
            return []
          }
        })
        set((s) => {
          // Keep anything added meanwhile (e.g. the example) that isn't on disk.
          const ids = new Set(saved.map((r) => r.id))
          const runs = [...saved, ...s.runs.filter((r) => !ids.has(r.id))].sort(byNewest)
          const activeId = runs.some((r) => r.id === s.activeId) ? s.activeId : (runs[0]?.id ?? null)
          return { runs, activeId, status: 'ready' }
        })
      } catch {
        set({ status: 'error' })
      }
    },

    add(run) {
      set((s) => ({ runs: [run, ...s.runs.filter((r) => r.id !== run.id)].sort(byNewest) }))
    },

    open(id) {
      pause()
      set({ activeId: id, step: 0 })
      useSettings.getState().setScreen('playground')
    },

    openExample() {
      get().add(exampleDryRun())
      get().open('example-bubble-sort')
    },

    async remove(id) {
      if (get().activeId === id) pause()
      if (id !== 'example-bubble-sort') {
        await deps.fetchImpl(`${API}/${encodeURIComponent(`${id}.json`)}`, { method: 'DELETE' })
      }
      set((s) => {
        const runs = s.runs.filter((r) => r.id !== id)
        return s.activeId === id ? { runs, activeId: runs[0]?.id ?? null, step: 0 } : { runs }
      })
    },

    next() {
      pause()
      set((s) => ({ step: Math.min(lastStep(), s.step + 1) }))
    },
    prev() {
      pause()
      set((s) => ({ step: Math.max(0, s.step - 1) }))
    },
    goTo(step) {
      set({ step: Math.min(lastStep(), Math.max(0, step)) })
    },

    togglePlay() {
      if (get().playing) return pause()
      if (get().step >= lastStep()) set({ step: 0 })
      set({ playing: true })
      startTimer()
    },

    setSpeed(speed) {
      set({ speed })
      if (get().playing) startTimer()
    },
  }
})
