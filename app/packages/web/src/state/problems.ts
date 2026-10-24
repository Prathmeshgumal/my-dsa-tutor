import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  codeOf,
  nextVersionName,
  runTests,
  SOLUTION_FILE,
  starterCode,
  type Attempt,
  type ProblemEntry,
  type TestCase,
  type TestRun,
} from '@dsa/core/problems'
import type { CodeRunner } from '@dsa/core/runner/types'
import { stateStorage } from '@/lib/stateSync'
import { createRunner } from './run'
import { useSettings } from './settings'

/** Practice problems on the Problem screen; stored in problems/<slug>/ via /api/problems. Disk is the only copy. */
interface ProblemsState {
  /** Newest first */
  entries: ProblemEntry[]
  /** Problems a newer version of the editor saved; they can't be opened here. */
  newer: string[]
  activeSlug: string | null
  /** The code file open in the editor: solution.cpp or another version. */
  activeFile: string
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
  /** Edits the open code file. */
  editSolution(code: string): void
  /** Edits any code file of any problem (e.g. from the Playground); saved after a pause like typing here. */
  editCode(slug: string, name: string, code: string): void
  /** Writes any pending edit now. */
  flush(): Promise<void>
  selectFile(name: string): Promise<void>
  /** Copies the open code into a new version and opens it. */
  newVersion(): Promise<void>
  /** Deletes a version (never solution.cpp). */
  deleteVersion(name: string): Promise<void>
  /** Puts the open file back to the code the problem started with, and saves it. */
  resetCode(): Promise<void>
  test(kind: TestRun['kind'], runner?: CodeRunner): Promise<void>
  addCase(test: Pick<TestCase, 'input' | 'expected'>): Promise<void>
  /** Only the student's own cases can be removed. */
  removeCase(index: number): Promise<void>
  /** Ties a note (file name in notes/) to the open problem. */
  linkNote(note: string): Promise<void>
  unlinkNote(note: string): Promise<void>
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
const fileUrl = (slug: string, name: string) => `${problemUrl(slug)}/files/${encodeURIComponent(name)}`

/** Puts new code into the right file of an entry. */
function withCode(entry: ProblemEntry, name: string, code: string): Partial<ProblemEntry> {
  if (name === SOLUTION_FILE) return { solution: code }
  const exists = entry.versions.some((v) => v.name === name)
  return {
    versions: exists
      ? entry.versions.map((v) => (v.name === name ? { ...v, content: code } : v))
      : [...entry.versions, { name, content: code }].sort((a, b) => a.name.localeCompare(b.name)),
  }
}

// The edit waiting to be written, and its timer.
let pending: { slug: string; name: string; code: string } | null = null
let timer: ReturnType<typeof setTimeout> | null = null

export const useProblems = create<ProblemsState>()(
  persist(
    (set, get) => {
      const active = () => get().entries.find((e) => e.slug === get().activeSlug) ?? null
      const patchEntry = (slug: string, patch: (e: ProblemEntry) => Partial<ProblemEntry>) =>
        set((s) => ({ entries: s.entries.map((e) => (e.slug === slug ? { ...e, ...patch(e) } : e)) }))
      const fresh = { testRun: null, testError: null, attempts: [] as Attempt[], activeFile: SOLUTION_FILE }

      async function saveTests(slug: string, tests: TestCase[]) {
        patchEntry(slug, (e) => ({ problem: { ...e.problem, tests } }))
        await send(`${problemUrl(slug)}/tests`, 'PUT', { tests })
      }

      async function saveNoteLinks(slug: string, notes: string[]) {
        patchEntry(slug, (e) => ({ problem: { ...e.problem, notes } }))
        await send(`${problemUrl(slug)}/notes`, 'PUT', { notes })
      }

      return {
        entries: [],
        newer: [],
        activeSlug: null,
        activeFile: SOLUTION_FILE,
        status: 'idle',
        saveStatus: 'saved',
        testing: null,
        testRun: null,
        testError: null,
        attempts: [],

        async load() {
          set({ status: 'loading' })
          try {
            const [loaded, newer] = await Promise.all([
              request(API).then((res) => res.json() as Promise<ProblemEntry[]>),
              // Only a note under the list: never let it stop the problems loading.
              request(`${API}/_newer`)
                .then((res) => res.json() as Promise<unknown>)
                .then((slugs) => (Array.isArray(slugs) ? slugs.filter((s): s is string => typeof s === 'string') : []))
                .catch(() => [] as string[]),
            ])
            // Keep what the student is typing; disk hasn't seen it yet.
            const entries = loaded.map((e) =>
              pending && e.slug === pending.slug ? { ...e, ...withCode(e, pending.name, pending.code) } : e,
            )
            const slug = entries.some((e) => e.slug === get().activeSlug)
              ? get().activeSlug
              : (entries[0]?.slug ?? null)
            const changed = slug !== get().activeSlug
            const entry = entries.find((e) => e.slug === slug)
            // The open version may have been deleted elsewhere.
            const fileGone = entry && codeOf(entry, get().activeFile) === null
            set({
              entries,
              newer,
              activeSlug: slug,
              status: 'ready',
              ...(changed ? fresh : fileGone ? { activeFile: SOLUTION_FILE } : {}),
            })
            if (slug) void get().loadAttempts()
          } catch {
            set({ status: 'error' })
          }
        },

        async open(slug) {
          useSettings.getState().setScreen('problem')
          if (slug === get().activeSlug) return
          await get().flush()
          set({ activeSlug: slug, ...fresh })
          await get().loadAttempts()
        },

        editSolution(code) {
          const slug = get().activeSlug
          if (slug) get().editCode(slug, get().activeFile, code)
        },

        editCode(slug, name, code) {
          // Only one edit waits at a time; a different file's goes out now.
          if (pending && (pending.slug !== slug || pending.name !== name)) void get().flush()
          patchEntry(slug, (e) => withCode(e, name, code))
          set({ saveStatus: 'pending' })
          pending = { slug, name, code }
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
            await send(fileUrl(edit.slug, edit.name), 'PUT', { content: edit.code })
            if (!pending) set({ saveStatus: 'saved' })
          } catch {
            set({ saveStatus: 'error' })
          }
        },

        async selectFile(name) {
          const entry = active()
          if (!entry || codeOf(entry, name) === null) return
          await get().flush()
          set({ activeFile: name, testRun: null, testError: null })
        },

        async newVersion() {
          const entry = active()
          if (!entry) return
          await get().flush()
          const name = nextVersionName(entry)
          const code = codeOf(entry, get().activeFile) ?? entry.solution
          await send(fileUrl(entry.slug, name), 'PUT', { content: code })
          patchEntry(entry.slug, (e) => withCode(e, name, code))
          set({ activeFile: name, testRun: null, testError: null })
        },

        async resetCode() {
          const entry = active()
          const starter = entry && starterCode(entry, get().activeFile)
          if (!entry || starter === null) return
          get().editCode(entry.slug, get().activeFile, starter)
          await get().flush()
        },

        async deleteVersion(name) {
          const entry = active()
          if (!entry || name === SOLUTION_FILE) return
          if (pending?.slug === entry.slug && pending.name === name) {
            pending = null
            if (timer) clearTimeout(timer)
          }
          await request(fileUrl(entry.slug, name), { method: 'DELETE' })
          patchEntry(entry.slug, (e) => ({ versions: e.versions.filter((v) => v.name !== name) }))
          if (get().activeFile === name) set({ activeFile: SOLUTION_FILE, testRun: null })
        },

        async test(kind, runner) {
          const entry = active()
          if (!entry || get().testing) return
          const file = get().activeFile
          set({ testing: kind, testError: null })
          try {
            await get().flush()
            const code = codeOf(entry, file) ?? entry.solution
            const run = await runTests(
              runner ?? createRunner(),
              { ...entry, solution: code },
              kind,
            )
            set({ testRun: run })
            if (kind === 'submit') {
              const attempt = {
                file,
                code,
                passed: run.passed,
                total: run.total,
                statusText: run.statusText,
                results: run.results,
              }
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
          await saveTests(
            entry.slug,
            entry.problem.tests.filter((_, i) => i !== index),
          )
        },

        async linkNote(note) {
          const entry = active()
          if (!entry || entry.problem.notes?.includes(note)) return
          await saveNoteLinks(entry.slug, [...(entry.problem.notes ?? []), note])
        },

        async unlinkNote(note) {
          const entry = active()
          if (!entry) return
          await saveNoteLinks(
            entry.slug,
            (entry.problem.notes ?? []).filter((n) => n !== note),
          )
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
            return { entries, activeSlug: gone ? (entries[0]?.slug ?? null) : s.activeSlug, ...(gone ? fresh : {}) }
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
    {
      name: 'dsa-editor:problems',
      partialize: (s) => ({ activeSlug: s.activeSlug }),
      // Kept on disk too (see lib/stateSync).
      storage: createJSONStorage(() => stateStorage),
    },
  ),
)

export function activeProblem(s: Pick<ProblemsState, 'entries' | 'activeSlug'>): ProblemEntry | null {
  return s.entries.find((e) => e.slug === s.activeSlug) ?? null
}

/** The problem a note is linked to, if any. */
export function useNoteProblem(note: string): string | null {
  return useProblems((s) => s.entries.find((e) => e.problem.notes?.includes(note))?.slug ?? null)
}

/** Last chance to write an unsaved edit when the tab closes. */
export function flushProblemsOnUnload() {
  if (timer) clearTimeout(timer)
  if (pending) {
    void deps
      .fetchImpl(fileUrl(pending.slug, pending.name), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: pending.code }),
        keepalive: true,
      })
      .catch(() => {})
  }
  pending = null
}
