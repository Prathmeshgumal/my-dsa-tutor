import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { runTests, type Attempt, type ProblemEntry, type TestCase, type TestRun } from '@/lib/problems'
import type { CodeRunner } from '@/lib/runner/types'
import { createRunner } from './run'
import { useSettings } from './settings'

/** Practice problems on the Problem screen; stored in problems/<slug>/ via /api/problems. Disk is the only copy. */
interface ProblemsState {
  /** Newest first */
  entries: ProblemEntry[]
  activeSlug: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** pending = typed but not written yet. */
  saveStatus: 'saved' | 'pending' | 'saving' | 'error'
  /** What Run or Submit is doing for the open problem. */
  testing: 'run' | 'submit' | null
  /** The last Run/Submit of the open problem. */
  testRun: TestRun | null
  testError: string | null
  /** Submissions of the open problem, newest first. */
  attempts: Attempt[]
  load(): Promise<void>
  /** Shows a problem, switching to the Problem screen. */
  open(slug: string): Promise<void>
  editSolution(code: string): void
  /** Writes any pending edit now. */
  flush(): Promise<void>
  test(kind: TestRun['kind'], runner?: CodeRunner): Promise<void>
  addCase(test: Pick<TestCase, 'input' | 'expected'>): Promise<void>
  /** Only the student's own cases can be removed. */
  removeCase(index: number): Promise<void>
  remove(slug: string): Promise<void>
  loadAttempts(): Promise<void>
}

const API = '/api/problems'

let deps = { fetchImpl: ((...args: Parameters<typeof fetch>) => fetch(...args)) as typeof fetch, delayMs: 800 }

/** Test seam: swap the fetch used and the autosave delay. */
export function configureProblems(next: Partial<typeof deps>) {
  deps = { ...deps, ...next }
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  const res = await deps.fetchImpl(url, init)
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      message = ((await res.json()) as { error?: string }).error ?? message
    } catch {
      // keep the status
    }
    throw new Error(message)
  }
  return res
}

const send = (url: string, method: string, body: unknown) =>
  request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

const problemUrl = (slug: string) => `${API}/${encodeURIComponent(slug)}`

// The solution waiting to be written, and its timer.
let pending: { slug: string; code: string } | null = null
let timer: ReturnType<typeof setTimeout> | null = null

export const useProblems = create<ProblemsState>()(
  persist(
    (set, get) => {
      const active = () => get().entries.find((e) => e.slug === get().activeSlug) ?? null
      const patchEntry = (slug: string, patch: (e: ProblemEntry) => Partial<ProblemEntry>) =>
        set((s) => ({ entries: s.entries.map((e) => (e.slug === slug ? { ...e, ...patch(e) } : e)) }))

      async function saveTests(slug: string, tests: TestCase[]) {
        patchEntry(slug, (e) => ({ problem: { ...e.problem, tests } }))
        await send(`${problemUrl(slug)}/tests`, 'PUT', { tests })
      }

      return {
        entries: [],
        activeSlug: null,
        status: 'idle',
        saveStatus: 'saved',
        testing: null,
        testRun: null,
        testError: null,
        attempts: [],

        async load() {
          set({ status: 'loading' })
          try {
            const fresh = (await (await request(API)).json()) as ProblemEntry[]
            // Keep what the student is typing; disk hasn't seen it yet.
            const entries = pending
              ? fresh.map((e) => (e.slug === pending!.slug ? { ...e, solution: pending!.code } : e))
              : fresh
            const slug = entries.some((e) => e.slug === get().activeSlug) ? get().activeSlug : (entries[0]?.slug ?? null)
            const changed = slug !== get().activeSlug
            set({ entries, activeSlug: slug, status: 'ready', ...(changed ? { testRun: null, testError: null, attempts: [] } : {}) })
            if (slug) void get().loadAttempts()
          } catch {
            set({ status: 'error' })
          }
        },

        async open(slug) {
          useSettings.getState().setScreen('problem')
          if (slug === get().activeSlug) return
          await get().flush()
          set({ activeSlug: slug, testRun: null, testError: null, attempts: [] })
          await get().loadAttempts()
        },

        editSolution(code) {
          const slug = get().activeSlug
          if (!slug) return
          patchEntry(slug, () => ({ solution: code }))
          set({ saveStatus: 'pending' })
          pending = { slug, code }
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => void get().flush(), deps.delayMs)
        },

        async flush() {
          if (timer) clearTimeout(timer)
          timer = null
          const edit = pending
          pending = null
          if (!edit) return
          set({ saveStatus: 'saving' })
          try {
            await send(`${problemUrl(edit.slug)}/solution`, 'PUT', { content: edit.code })
            if (!pending) set({ saveStatus: 'saved' })
          } catch {
            set({ saveStatus: 'error' })
          }
        },

        async test(kind, runner) {
          const entry = active()
          if (!entry || get().testing) return
          set({ testing: kind, testError: null })
          try {
            await get().flush()
            const run = await runTests(runner ?? createRunner(useSettings.getState()), entry, kind)
            set({ testRun: run })
            if (kind === 'submit') {
              const attempt = { code: entry.solution, passed: run.passed, total: run.total, statusText: run.statusText, results: run.results }
              await send(`${problemUrl(entry.slug)}/attempts`, 'POST', { attempt })
              const solved = entry.solved || (run.total > 0 && run.passed === run.total)
              patchEntry(entry.slug, (e) => ({ solved, attempts: e.attempts + 1 }))
              await get().loadAttempts()
            }
          } catch (e) {
            set({ testError: e instanceof Error ? e.message : String(e) })
          } finally {
            set({ testing: null })
          }
        },

        async addCase({ input, expected }) {
          const entry = active()
          if (!entry) return
          await saveTests(entry.slug, [...entry.problem.tests, { input, expected, example: false, addedBy: 'user' }])
        },

        async removeCase(index) {
          const entry = active()
          if (!entry || entry.problem.tests[index]?.addedBy !== 'user') return
          // Results are per case; drop them rather than show them against the wrong cases.
          set({ testRun: null })
          await saveTests(entry.slug, entry.problem.tests.filter((_, i) => i !== index))
        },

        async remove(slug) {
          if (pending?.slug === slug) {
            pending = null
            if (timer) clearTimeout(timer)
          }
          await request(problemUrl(slug), { method: 'DELETE' })
          set((s) => {
            const entries = s.entries.filter((e) => e.slug !== slug)
            const gone = s.activeSlug === slug
            return {
              entries,
              activeSlug: gone ? (entries[0]?.slug ?? null) : s.activeSlug,
              ...(gone ? { testRun: null, testError: null, attempts: [] } : {}),
            }
          })
          if (get().activeSlug) await get().loadAttempts()
        },

        async loadAttempts() {
          const slug = get().activeSlug
          if (!slug) return
          try {
            const attempts = (await (await request(`${problemUrl(slug)}/attempts`)).json()) as Attempt[]
            if (get().activeSlug === slug) set({ attempts })
          } catch {
            // The list just stays as it was.
          }
        },
      }
    },
    { name: 'dsa-editor:problems', partialize: (s) => ({ activeSlug: s.activeSlug }) },
  ),
)

export function activeProblem(s: Pick<ProblemsState, 'entries' | 'activeSlug'>): ProblemEntry | null {
  return s.entries.find((e) => e.slug === s.activeSlug) ?? null
}

/** Last chance to write an unsaved edit when the tab closes. */
export function flushProblemsOnUnload() {
  if (timer) clearTimeout(timer)
  if (pending) {
    void deps
      .fetchImpl(`${problemUrl(pending.slug)}/solution`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: pending.code }),
        keepalive: true,
      })
      .catch(() => {})
  }
  pending = null
}
