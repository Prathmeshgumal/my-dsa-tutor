import { create } from 'zustand'
import type { DryRun } from '@dsa/core/dryRun'
import { codeOf, runTests, type TestRun } from '@dsa/core/problems'
import type { CodeRunner } from '@dsa/core/runner/types'
import { useAiChat } from './aiChat'
import { usePlayground } from './playground'
import { useProblems } from './problems'
import { createRunner } from './run'
import { useWorkspace } from './workspace'

/** Where a dry run's code lives, so it can be edited from the Playground. */
export type DryRunSource = { kind: 'problem'; slug: string; file: string } | { kind: 'file'; name: string }

export function dryRunSource(run: Pick<DryRun, 'file' | 'problem'>): DryRunSource | null {
  if (!run.file) return null
  return run.problem ? { kind: 'problem', slug: run.problem, file: run.file } : { kind: 'file', name: run.file }
}

/** The code as it is now (not as it was when the dry run was made); null if it's gone. */
export function currentCode(source: DryRunSource): string | null {
  if (source.kind === 'problem') {
    const entry = useProblems.getState().entries.find((e) => e.slug === source.slug)
    return entry ? codeOf(entry, source.file) : null
  }
  return useWorkspace.getState().files.find((f) => f.name === source.name)?.content ?? null
}

/** currentCode, kept up to date as the code changes. */
export function useCurrentCode(source: DryRunSource | null): string | null {
  const fromProblem = useProblems((s) => {
    if (source?.kind !== 'problem') return null
    const entry = s.entries.find((e) => e.slug === source.slug)
    return entry ? codeOf(entry, source.file) : null
  })
  const fromFile = useWorkspace((s) =>
    source?.kind === 'file' ? (s.files.find((f) => f.name === source.name)?.content ?? null) : null,
  )
  return source?.kind === 'problem' ? fromProblem : fromFile
}

/** Saves an edit made in the Playground to the problem or solution file (after a pause, like typing anywhere). */
export function editCode(source: DryRunSource, code: string): void {
  if (source.kind === 'problem') useProblems.getState().editCode(source.slug, source.file, code)
  else {
    const file = useWorkspace.getState().files.find((f) => f.name === source.name)
    if (file) useWorkspace.getState().updateContent(file.id, code)
  }
}

/** What Claude is asked to do when the student wants the dry run again on their changed code. */
export function redoPrompt(run: Pick<DryRun, 'title' | 'input'>, source: DryRunSource): string {
  const file = source.kind === 'problem' ? source.file : source.name
  const where = source.kind === 'problem' ? `problem "${source.slug}" and file "${file}"` : `file "${file}"`
  return [
    `I changed my code after the dry run "${run.title}".`,
    `Make a new dry run of my updated ${file} with the same input${run.input ? ` (${run.input})` : ''}, using create_visualization with ${where}.`,
    "Don't edit my code. If it still goes wrong, mark the step where it does; if it works now, say so in one line.",
  ].join(' ')
}

interface DryRunFixState {
  /** The dry run Claude is redoing right now. */
  redoing: string | null
  /** Why the last redo didn't produce a dry run. */
  redoError: string | null
  /** The test cases on the changed code, for a problem's dry run. */
  tests: { forRuns: string[]; status: 'running' | 'done' | 'error'; result?: TestRun; error?: string } | null
  redo(run: DryRun, deps?: { runner?: CodeRunner }): Promise<void>
}

export const useDryRunFix = create<DryRunFixState>()((set, get) => ({
  redoing: null,
  redoError: null,
  tests: null,

  async redo(run, { runner } = {}) {
    const source = dryRunSource(run)
    const chat = useAiChat.getState()
    if (!source || get().redoing || chat.status === 'streaming') return
    set({ redoing: run.id, redoError: null })

    // A problem's dry run: check the changed code against all its tests at the same time.
    if (source.kind === 'problem') {
      const entry = useProblems.getState().entries.find((e) => e.slug === source.slug)
      const code = currentCode(source)
      if (entry && code !== null) {
        set({ tests: { forRuns: [run.id], status: 'running' } })
        void runTests(runner ?? createRunner(), { ...entry, solution: code }, 'submit')
          .then((result) => set((s) => ({ tests: s.tests && { ...s.tests, status: 'done', result } })))
          .catch((e: unknown) =>
            set((s) => ({ tests: s.tests && { ...s.tests, status: 'error', error: e instanceof Error ? e.message : String(e) } })),
          )
      }
      // Ask in that problem's chat.
      chat.followProblem(source.slug)
    }
    // send() saves every pending edit first, so Claude reads the new code.
    await useAiChat.getState().send(redoPrompt(run, source))
    // Still waiting means Claude finished without making one.
    if (get().redoing === run.id) {
      set({ redoing: null, redoError: 'Claude didn’t make a new dry run. Its reply is in the chat.' })
    }
  },
}))

// The first dry run to arrive while redoing is the new one: show it.
usePlayground.subscribe((state, prev) => {
  const { redoing } = useDryRunFix.getState()
  // One run added (not a reload of the whole list).
  if (!redoing || state.runs.length !== prev.runs.length + 1) return
  const fresh = state.runs.find((r) => !prev.runs.some((p) => p.id === r.id))
  if (!fresh) return
  useDryRunFix.setState((s) => ({
    redoing: null,
    // The test results belong to the new dry run too.
    tests: s.tests && { ...s.tests, forRuns: [...s.tests.forRuns, fresh.id] },
  }))
  usePlayground.getState().open(fresh.id)
})
