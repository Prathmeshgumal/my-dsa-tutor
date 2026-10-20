// The only things the editor's Claude agent can do. Each tool works on the solutions folder or on
// what the editor sent with the message; nothing else (no shell, no web, no other folders).
import { tool } from '@anthropic-ai/claude-agent-sdk'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { ApprovalKind, EditorContext } from '../src/lib/chatEvents.ts'
import { languageFromFilename } from '../src/lib/languages.ts'
import { nextNoteName, noteTitle } from '../src/lib/noteTitle.ts'
import { dryRunProblems, MAX_STEPS, type DryRun, type DryRunStep } from '../src/lib/dryRun.ts'
import { randomUUID } from 'node:crypto'
import type { CodeRunner, RunResult } from '../src/lib/runner/types.ts'
import {
  codeOf,
  DIFFICULTIES,
  describeInput,
  isCodeName,
  SOLUTION_FILE,
  problemProblems,
  runTests,
  type Compare,
  type Difficulty,
  type Param,
  type ProblemEntry,
  type TestCase,
  type TestRun,
} from '../src/lib/problems.ts'
import { createProblem, linkNote, listAttempts, listEntries, ProblemNotFound, readEntry, writeCode, writeTests } from './problemStore.ts'

export interface ApprovalRequest {
  kind: ApprovalKind
  file: string
  before: string
  after: string
  explanation: string
}

export interface EditorToolDeps {
  dir: string
  /** Where the user's Markdown notes live. */
  notesDir: string
  /** Where dry-run visualizations are saved for the Playground. */
  playgroundDir: string
  /** Where practice problems live, one folder each. */
  problemsDir: string
  context: EditorContext
  runner: CodeRunner
  /** Shows the change to the user and resolves with their decision. */
  requestApproval(req: ApprovalRequest): Promise<boolean>
  /** Called with every run, so the editor's output panel can show it. */
  onRun(file: string, result: RunResult): void
  /** Called after an approved change is written, so the editor reloads it. */
  onFileChanged(file: string): void
  /** Called after an approved note change is written, so the notes panel reloads it. */
  onNoteChanged(note: string): void
  /** Called with a new dry run, so the Playground can show it. */
  onVisualization(run: DryRun): void
  /** Called after a problem is created or changed; open = show it on the Problem screen. */
  onProblemChanged(slug: string, open: boolean): void
}

export interface ToolText {
  text: string
  isError?: boolean
}

const MAX_OUTPUT = 8000

class ToolError extends Error {}

const fail = (text: string): ToolText => ({ text, isError: true })

function clip(text: string): string {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… (${text.length - MAX_OUTPUT} more characters cut)` : text
}

/** A plain code file name directly inside the solutions folder. */
function checkName(name: string): void {
  const ok =
    name.length > 0 &&
    name.length <= 255 &&
    !/[/\\\0]/.test(name) &&
    !name.startsWith('.') &&
    path.basename(name) === name &&
    languageFromFilename(name) !== null
  if (!ok) throw new ToolError(`"${name}" isn't a valid solution file name (use something like two_sum.cpp, Main.java or bfs.py).`)
}

const lineCount = (text: string) => (text === '' ? 0 : text.replace(/\n$/, '').split('\n').length)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function describeRun(file: string | null, result: RunResult): string {
  const stats = [result.timeMs !== null && `${result.timeMs} ms`, result.memoryKb !== null && `${result.memoryKb} KB`].filter(Boolean)
  const lines = [`File: ${file ?? '(unknown)'}`, `Result: ${result.statusText}${stats.length ? ` (${stats.join(', ')})` : ''}`]
  if (result.compileOutput) lines.push('Compiler output:', clip(result.compileOutput))
  lines.push('stdout:', result.stdout ? clip(result.stdout) : '(empty)')
  if (result.stderr) lines.push('stderr:', clip(result.stderr))
  return lines.join('\n')
}

/** A plain .md file name directly inside the notes folder. */
function checkNoteName(name: string): void {
  const ok = /^[^/\\\0]+\.md$/i.test(name) && !name.startsWith('.') && path.basename(name) === name && name.length <= 255
  if (!ok) throw new ToolError(`"${name}" isn't a note name; use list_notes to see them (e.g. note-1.md).`)
}

/** Replaces text that must appear exactly once; explains what to do otherwise. */
function uniqueCount(content: string, oldText: string, where: string): void {
  if (!oldText) throw new ToolError('old_text is empty; copy the exact lines you want to replace.')
  const count = content.split(oldText).length - 1
  if (count === 0) throw new ToolError(`old_text wasn't found in ${where}. Read it again and copy the lines exactly.`)
  if (count > 1) throw new ToolError(`old_text appears ${count} times in ${where}; include more surrounding lines so it is unique.`)
}

function describeProblem(entry: ProblemEntry, extras: { notes: string[]; dryRuns: string[] }): string {
  const { problem } = entry
  const lines = [
    `# ${problem.title} (${problem.difficulty}) — ${entry.slug}${entry.solved ? ', solved' : ''}`,
    '',
    problem.description,
    '',
    `Function parameters: ${problem.params.map((p) => `${p.type} ${p.name}`).join(', ')}`,
    `Answers compared: ${problem.compare}`,
    '',
    'Test cases:',
    ...problem.tests.map(
      (t, i) => `${i + 1}. ${describeInput(problem.params, t)} → ${t.expected}${t.example ? ' (example)' : ''}${t.addedBy !== 'problem' ? ` (added by ${t.addedBy})` : ''}`,
    ),
    '',
    'solution.cpp (the student\'s code, with line numbers):',
    ...entry.solution.split('\n').map((l, i) => `${i + 1}\t${l}`),
    '',
    ...entry.versions.flatMap((v) => ['', `${v.name} (another version of their code):`, ...v.content.split('\n').map((l, i) => `${i + 1}\t${l}`)]),
    '',
    `Notes linked to it: ${extras.notes.join(', ') || '(none)'}`,
    `Dry runs of it: ${extras.dryRuns.join('; ') || '(none)'}`,
    '',
    'driver.cpp (hidden from the student):',
    entry.driver,
  ]
  return clip(lines.join('\n'))
}

function describeTestRun(entry: ProblemEntry, run: TestRun): string {
  const { problem } = entry
  const lines = [`${run.statusText}: ${run.passed}/${run.total} cases passed${run.timeMs !== null ? ` (${run.timeMs} ms)` : ''}`]
  if (run.errorText) lines.push(run.status === 'compile_error' ? 'Compiler output:' : 'Error output:', clip(run.errorText))
  run.results.forEach((r, i) => {
    const test = problem.tests[run.cases[i]]
    lines.push(
      `Case ${run.cases[i] + 1} [${r.status}]: ${describeInput(problem.params, test)} → expected ${test.expected}${r.status === 'pass' || r.status === 'fail' ? `, got ${r.output}` : ''}`,
    )
    if (r.stdout) lines.push(`  printed: ${clip(r.stdout)}`)
  })
  return lines.join('\n')
}

export function createEditorTools(deps: EditorToolDeps) {
  const { dir, notesDir, playgroundDir, problemsDir, context } = deps

  const problemSlug = (slug?: string) => {
    const s = slug ?? context.openProblem?.slug
    if (!s) throw new ToolError('No problem is open; pass its slug (see list_problems).')
    return s
  }

  /** Which code file of a problem a tool means: the one asked for, else the one open on screen, else solution.cpp. */
  function codeFile(entry: ProblemEntry, file?: string): { name: string; code: string } {
    const open = context.openProblem?.slug === entry.slug ? context.openProblem.file : undefined
    const name = file ?? open ?? SOLUTION_FILE
    const code = codeOf(entry, name)
    if (code === null) {
      const names = [SOLUTION_FILE, ...entry.versions.map((v) => v.name)].join(', ')
      throw new ToolError(`${entry.slug} has no ${name}; its code files are ${names}.`)
    }
    return { name, code }
  }

  async function dryRunsOf(slug: string): Promise<string[]> {
    const names = await readdir(playgroundDir).catch(() => [] as string[])
    const runs = await Promise.all(
      names
        .filter((n) => n.endsWith('.json'))
        .map(async (n) => {
          try {
            return JSON.parse(await readFile(path.join(playgroundDir, n), 'utf8')) as DryRun
          } catch {
            return null
          }
        }),
    )
    return runs.filter((r): r is DryRun => r?.problem === slug).map((r) => `"${r.title}" (${r.steps.length} steps)`)
  }

  async function problem(slug?: string): Promise<ProblemEntry> {
    try {
      return await readEntry(problemsDir, problemSlug(slug))
    } catch (e) {
      if (e instanceof ProblemNotFound) throw new ToolError(`${e.message} Use list_problems to see them.`)
      throw e
    }
  }

  async function readNote(name: string): Promise<string> {
    checkNoteName(name)
    try {
      return await readFile(path.join(notesDir, name), 'utf8')
    } catch {
      throw new ToolError(`${name} doesn't exist. Use list_notes to see the notes.`)
    }
  }

  const noteNames = async () => {
    await mkdir(notesDir, { recursive: true })
    return (await readdir(notesDir)).filter((n) => /\.md$/i.test(n) && !n.startsWith('.'))
  }

  async function readSolution(name: string): Promise<string> {
    checkName(name)
    try {
      return await readFile(path.join(dir, name), 'utf8')
    } catch {
      throw new ToolError(`${name} doesn't exist. Use list_files to see the files.`)
    }
  }

  const exists = (name: string) =>
    stat(path.join(dir, name)).then(
      () => true,
      () => false,
    )

  // Turns thrown ToolErrors (bad input) into tool errors Claude can read and recover from.
  const guard =
    <A>(fn: (args: A) => Promise<ToolText>) =>
    async (args: A): Promise<ToolText> => {
      try {
        return await fn(args)
      } catch (e) {
        if (e instanceof ToolError) return fail(e.message)
        return fail(`Something went wrong: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

  return {
    get_editor_state: guard(async (_: Record<string, never>) => {
      const active = context.activeFile
      const language = active && languageFromFilename(active.name)
      return {
        text: [
          active ? `Open file: ${active.name}${language ? ` (${language.label})` : ''}` : 'No file is open.',
          `Open tabs: ${context.openFiles.join(', ') || '(none)'}`,
          context.openProblem
            ? `On the Problem screen: ${context.openProblem.title} (${context.openProblem.slug})`
            : 'The Problem screen isn\'t showing.',
        ].join('\n'),
      }
    }),

    list_files: guard(async (_: Record<string, never>) => {
      const names = (await readdir(dir)).filter((n) => !n.startsWith('.') && languageFromFilename(n)).sort()
      if (!names.length) return { text: 'The solutions folder is empty.' }
      const rows = await Promise.all(
        names.map(async (n) => `${n} (${plural(lineCount(await readFile(path.join(dir, n), 'utf8')), 'line')})`),
      )
      return { text: rows.join('\n') }
    }),

    read_file: guard(async ({ name, start_line, end_line }: { name: string; start_line?: number; end_line?: number }) => {
      const lines = (await readSolution(name)).split('\n')
      const from = Math.max(1, start_line ?? 1)
      const to = Math.min(lines.length, end_line ?? lines.length)
      const numbered = lines.slice(from - 1, to).map((l, i) => `${from + i}\t${l}`)
      return { text: clip(numbered.join('\n')) || `${name} is empty.` }
    }),

    get_last_run: guard(async (_: Record<string, never>) => {
      const last = context.lastRun
      if (!last) return { text: 'The code hasn’t run yet in the editor (the output panel is empty).' }
      if ('error' in last) return { text: `The last run of ${last.file ?? 'the code'} failed to start: ${last.error}` }
      return { text: describeRun(last.file, last.result) }
    }),

    run_code: guard(async ({ name, stdin }: { name?: string; stdin?: string }) => {
      const file = name ?? context.activeFile?.name
      if (!file) throw new ToolError('No file is open; pass the file name to run.')
      const source = await readSolution(file)
      const language = languageFromFilename(file)!
      let result: RunResult
      try {
        result = await deps.runner.run({ language, source, stdin: stdin ?? '' })
      } catch (e) {
        return fail(`Couldn't run ${file}: ${e instanceof Error ? e.message : String(e)}`)
      }
      deps.onRun(file, result)
      return { text: describeRun(file, result) }
    }),

    edit_file: guard(
      async ({ name, old_text, new_text, explanation }: { name: string; old_text: string; new_text: string; explanation: string }) => {
        uniqueCount(await readSolution(name), old_text, name)
        const approved = await deps.requestApproval({ kind: 'edit', file: name, before: old_text, after: new_text, explanation })
        if (!approved) return { text: `The user declined this edit to ${name}. Don't apply it another way; ask what they'd prefer.` }
        // Re-read: the user may have typed while deciding.
        const latest = await readSolution(name)
        if (!latest.includes(old_text)) throw new ToolError(`${name} changed while waiting for approval; read it again.`)
        await writeFile(path.join(dir, name), latest.replace(old_text, () => new_text), 'utf8')
        deps.onFileChanged(name)
        return { text: `Applied the edit to ${name}; the editor shows the new code.` }
      },
    ),

    create_file: guard(async ({ name, content, explanation }: { name: string; content: string; explanation: string }) => {
      checkName(name)
      if (await exists(name)) throw new ToolError(`${name} already exists; use edit_file to change it.`)
      const approved = await deps.requestApproval({ kind: 'create', file: name, before: '', after: content, explanation })
      if (!approved) return { text: `The user declined creating ${name}.` }
      await writeFile(path.join(dir, name), content, { encoding: 'utf8', flag: 'wx' })
      deps.onFileChanged(name)
      return { text: `Created ${name}.` }
    }),

    list_notes: guard(async (_: Record<string, never>) => {
      const names = (await noteNames()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      if (!names.length) return { text: 'There are no notes yet.' }
      const rows = await Promise.all(names.map(async (n) => `${n}: ${noteTitle(await readFile(path.join(notesDir, n), 'utf8'))}`))
      return { text: rows.join('\n') }
    }),

    read_note: guard(async ({ name }: { name: string }) => ({ text: clip(await readNote(name)) || `${name} is empty.` })),

    create_note: guard(async ({ content, explanation }: { content: string; explanation: string }) => {
      const name = nextNoteName(await noteNames())
      const approved = await deps.requestApproval({ kind: 'create_note', file: name, before: '', after: content, explanation })
      if (!approved) return { text: 'The user declined creating this note.' }
      await writeFile(path.join(notesDir, name), content, { encoding: 'utf8', flag: 'wx' })
      deps.onNoteChanged(name)
      // A note made while a problem is open belongs to it.
      const open = context.openProblem?.slug
      if (open) {
        await linkNote(problemsDir, open, name).catch(() => {})
        deps.onProblemChanged(open, false)
        return { text: `Saved the note as ${name} and linked it to ${open}; it shows in the Notes panel and on the problem's Notes tab.` }
      }
      return { text: `Saved the note as ${name}; it shows in the Notes panel.` }
    }),

    edit_note: guard(
      async ({ name, old_text, new_text, explanation }: { name: string; old_text: string; new_text: string; explanation: string }) => {
        uniqueCount(await readNote(name), old_text, name)
        const approved = await deps.requestApproval({ kind: 'edit_note', file: name, before: old_text, after: new_text, explanation })
        if (!approved) return { text: `The user declined this change to ${name}. Ask what they'd prefer.` }
        const latest = await readNote(name)
        if (!latest.includes(old_text)) throw new ToolError(`${name} changed while waiting for approval; read it again.`)
        await writeFile(path.join(notesDir, name), latest.replace(old_text, () => new_text), 'utf8')
        deps.onNoteChanged(name)
        return { text: `Updated ${name}.` }
      },
    ),

    create_visualization: guard(
      async ({
        title,
        file,
        problem: slug,
        input,
        steps,
      }: {
        title: string
        file?: string
        problem?: string
        input?: string
        steps: DryRunStep[]
      }) => {
        // The code comes from the real file, so step line numbers match what the student sees.
        let code: string | undefined
        let shown = file
        if (slug) {
          const picked = codeFile(await problem(slug), file)
          code = picked.code
          shown = picked.name
        } else if (file) {
          code = await readSolution(file)
        }
        const problems = dryRunProblems({ code, steps })
        if (problems.length) return fail(`The visualization wasn't saved. Fix these and call create_visualization again:\n- ${problems.join('\n- ')}`)
        // A dry run made while a problem is open belongs to it.
        const belongsTo = slug ?? context.openProblem?.slug
        const run: DryRun = {
          id: randomUUID(),
          title,
          ...(shown ? { file: shown, language: languageFromFilename(shown)!.id, code } : {}),
          ...(belongsTo ? { problem: belongsTo } : {}),
          ...(input ? { input } : {}),
          createdAt: Date.now(),
          steps,
        }
        await mkdir(playgroundDir, { recursive: true })
        await writeFile(path.join(playgroundDir, `${run.id}.json`), JSON.stringify(run), 'utf8')
        deps.onVisualization(run)
        return { text: `Saved "${title}" (${steps.length} steps). The student can watch it in the Playground; a card in the chat opens it.` }
      },
    ),

    list_problems: guard(async (_: Record<string, never>) => {
      const entries = await listEntries(problemsDir)
      if (!entries.length) return { text: 'There are no practice problems yet.' }
      return {
        text: entries
          .map((e) => `${e.slug}: ${e.problem.title} (${e.problem.difficulty})${e.solved ? ' ✓ solved' : ''}, ${plural(e.attempts, 'attempt')}`)
          .join('\n'),
      }
    }),

    get_problem: guard(async ({ slug }: { slug?: string }) => {
      const entry = await problem(slug)
      const notes = await noteNames()
      const linked = (entry.problem.notes ?? []).filter((n) => notes.includes(n))
      return { text: describeProblem(entry, { notes: linked, dryRuns: await dryRunsOf(entry.slug) }) }
    }),

    create_problem: guard(
      async (args: {
        title: string
        difficulty: Difficulty
        description: string
        params: Param[]
        compare?: Compare
        tests: { input: string[]; expected: string; example: boolean }[]
        starter: string
        driver: string
        explanation: string
      }) => {
        const newProblem = {
          title: args.title,
          difficulty: args.difficulty,
          description: args.description,
          params: args.params,
          compare: args.compare ?? 'exact',
          tests: args.tests.map((t): TestCase => ({ ...t, addedBy: 'problem' })),
          createdAt: Date.now(),
        }
        const problems = problemProblems(newProblem)
        if (problems.length) return fail(`The problem wasn't created. Fix these and call create_problem again:\n- ${problems.join('\n- ')}`)
        // Make sure the driver and starter compile together before the student sees it.
        let check: TestRun
        try {
          check = await runTests(deps.runner, { problem: newProblem, solution: args.starter, driver: args.driver }, 'run')
        } catch (e) {
          return fail(`Couldn't check the driver compiles: ${e instanceof Error ? e.message : String(e)}`)
        }
        if (check.status === 'compile_error') {
          return fail(`The starter code and driver don't compile together. Fix the driver (or starter) and try again:\n${clip(check.errorText)}`)
        }
        const preview = [
          `# ${args.title} (${args.difficulty})`,
          '',
          args.description,
          '',
          '**Test cases**',
          '',
          ...newProblem.tests.map((t) => `- \`${describeInput(args.params, t)}\` → \`${t.expected}\`${t.example ? ' (example)' : ''}`),
          '',
          '**Starting code**',
          '',
          '```cpp',
          args.starter,
          '```',
        ].join('\n')
        const approved = await deps.requestApproval({ kind: 'create_problem', file: args.title, before: '', after: preview, explanation: args.explanation })
        if (!approved) return { text: 'The user declined creating this problem.' }
        const slug = await createProblem(problemsDir, { problem: newProblem, solution: args.starter, driver: args.driver })
        deps.onProblemChanged(slug, true)
        return { text: `Created ${slug}; it's open on the Problem screen.` }
      },
    ),

    add_test_case: guard(
      async ({ slug, input, expected, explanation }: { slug?: string; input: string[]; expected: string; explanation: string }) => {
        const entry = await problem(slug)
        const test: TestCase = { input, expected, example: false, addedBy: 'claude' }
        const problems = problemProblems({ params: entry.problem.params, tests: [{ ...test, example: true }] })
        if (problems.length) return fail(problems.join('\n').replaceAll('Test 1', 'This test'))
        const approved = await deps.requestApproval({
          kind: 'add_test',
          file: entry.problem.title,
          before: '',
          after: `${describeInput(entry.problem.params, test)} → ${expected}`,
          explanation,
        })
        if (!approved) return { text: 'The user declined adding this test case.' }
        const latest = await problem(entry.slug)
        await writeTests(problemsDir, entry.slug, [...latest.problem.tests, test])
        deps.onProblemChanged(entry.slug, false)
        return { text: `Added the case to ${entry.slug} (case ${latest.problem.tests.length + 1}). Submit checks it.` }
      },
    ),

    edit_solution: guard(
      async ({
        slug,
        file,
        old_text,
        new_text,
        explanation,
      }: {
        slug?: string
        file?: string
        old_text: string
        new_text: string
        explanation: string
      }) => {
        const entry = await problem(slug)
        const { name, code } = codeFile(entry, file)
        const where = `${entry.slug}/${name}`
        uniqueCount(code, old_text, where)
        const approved = await deps.requestApproval({ kind: 'edit_solution', file: where, before: old_text, after: new_text, explanation })
        if (!approved) return { text: `The user declined this edit. Don't apply it another way; ask what they'd prefer.` }
        const latest = codeOf(await problem(entry.slug), name) ?? ''
        if (!latest.includes(old_text)) throw new ToolError(`${where} changed while waiting for approval; read it again with get_problem.`)
        await writeCode(problemsDir, entry.slug, name, latest.replace(old_text, () => new_text))
        deps.onProblemChanged(entry.slug, false)
        return { text: `Applied the edit to ${where}.` }
      },
    ),

    run_tests: guard(async ({ slug, file, all }: { slug?: string; file?: string; all?: boolean }) => {
      const entry = await problem(slug)
      const { name, code } = codeFile(entry, file)
      try {
        const run = await runTests(deps.runner, { ...entry, solution: code }, all ? 'submit' : 'run')
        return { text: `${name}: ${describeTestRun(entry, run)}` }
      } catch (e) {
        return fail(`Couldn't run the tests: ${e instanceof Error ? e.message : String(e)}`)
      }
    }),

    save_code_version: guard(
      async ({ slug, name, content, explanation }: { slug?: string; name: string; content: string; explanation: string }) => {
        const entry = await problem(slug)
        if (!isCodeName(name)) throw new ToolError(`"${name}" isn't a good name; use something like brute-force.cpp.`)
        if (codeOf(entry, name) !== null) throw new ToolError(`${entry.slug} already has ${name}; use edit_solution with file "${name}" to change it.`)
        const approved = await deps.requestApproval({ kind: 'create', file: `${entry.slug}/${name}`, before: '', after: content, explanation })
        if (!approved) return { text: `The user declined saving ${name}.` }
        await writeCode(problemsDir, entry.slug, name, content)
        deps.onProblemChanged(entry.slug, false)
        return { text: `Saved ${name} next to solution.cpp; the student can switch to it above the editor.` }
      },
    ),

    list_attempts: guard(async ({ slug }: { slug?: string }) => {
      const entry = await problem(slug)
      const attempts = await listAttempts(problemsDir, entry.slug)
      if (!attempts.length) return { text: `No submissions for ${entry.slug} yet.` }
      return {
        text: clip(
          attempts
            .map((a) => `${new Date(a.at).toISOString()}: ${a.statusText} ${a.passed}/${a.total}\n${a.code}`)
            .join('\n\n---\n\n'),
        ),
      }
    }),
  }
}

export type EditorTools = ReturnType<typeof createEditorTools>

export const TOOL_NAMES = [
  'get_editor_state',
  'list_files',
  'read_file',
  'get_last_run',
  'run_code',
  'edit_file',
  'create_file',
  'list_notes',
  'read_note',
  'create_note',
  'edit_note',
  'create_visualization',
  'list_problems',
  'get_problem',
  'create_problem',
  'add_test_case',
  'edit_solution',
  'run_tests',
  'save_code_version',
  'list_attempts',
] as const satisfies readonly (keyof EditorTools)[]

const asResult = (t: ToolText) => ({ content: [{ type: 'text' as const, text: t.text }], isError: t.isError })

const explanation = z.string().describe('One short sentence the user sees: why this change.')

const scalar = z.union([z.number(), z.string(), z.boolean(), z.null()])
const cell = z.tuple([z.number().int(), z.number().int()])
const structure = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('array'),
    name: z.string(),
    values: z.array(scalar),
    pointers: z.record(z.string(), z.number().int()).optional().describe('Named indices drawn as arrows, e.g. {"i":0,"j":3}'),
    highlight: z.array(z.number().int()).optional().describe('Indices being compared/read'),
    swapped: z.array(z.number().int()).optional(),
    done: z.array(z.number().int()).optional().describe('Indices already final'),
    capacity: z.number().int().optional().describe('For a vector: allocated slots; extra ones are drawn as empty spare slots'),
  }),
  z.object({
    kind: z.literal('grid'),
    name: z.string(),
    rows: z.array(z.array(scalar)).describe('A DP table or matrix'),
    rowLabels: z.array(z.string()).optional(),
    colLabels: z.array(z.string()).optional(),
    current: cell.optional().describe('[row, col] being filled'),
    highlight: z.array(cell).optional().describe('[row, col] cells it reads'),
  }),
  z.object({
    kind: z.literal('map'),
    name: z.string(),
    entries: z.array(z.tuple([scalar, scalar])),
    highlight: z.array(scalar).optional().describe('Keys just added or read'),
  }),
  z.object({
    kind: z.enum(['stack', 'queue']),
    name: z.string(),
    values: z.array(scalar).describe('Stack: bottom→top. Queue: front→back.'),
    highlight: z.array(z.number().int()).optional(),
  }),
  z.object({
    kind: z.literal('linked_list'),
    name: z.string(),
    nodes: z.array(scalar),
    pointers: z.record(z.string(), z.number().int().nullable()).optional().describe('e.g. {"slow":1,"fast":3,"prev":null}'),
    highlight: z.array(z.number().int()).optional(),
    cycleTo: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal('tree'),
    name: z.string(),
    nodes: z.array(scalar).describe('Binary tree in level order with nulls, LeetCode style'),
    highlight: z.array(z.number().int()).optional().describe('Level-order indices being visited'),
    done: z.array(z.number().int()).optional(),
    pointers: z.record(z.string(), z.number().int().nullable()).optional(),
  }),
  z.object({
    kind: z.literal('graph'),
    name: z.string(),
    nodes: z.array(z.string()),
    edges: z.array(z.union([z.tuple([z.string(), z.string()]), z.tuple([z.string(), z.string(), scalar])])),
    directed: z.boolean().optional(),
    current: z.string().optional(),
    visited: z.array(z.string()).optional(),
    activeEdges: z.array(z.tuple([z.string(), z.string()])).optional(),
  }),
])
const step = z.object({
  line: z.number().int().optional().describe('1-based line of the file that runs in this step'),
  note: z.string().describe('What happens in this step, in plain words (one or two short sentences)'),
  vars: z.record(z.string(), scalar).optional().describe('Variable values after this step'),
  structures: z.array(structure).optional().describe('Data structures after this step (repeat them every step)'),
  output: z.string().optional().describe('Everything printed so far'),
  mistake: z.boolean().optional().describe('true on the step where the bug shows up'),
  moves: z
    .array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() }))
    .optional()
    .describe('Arrows for what moved where in this step. Name boxes like "arr[3]", "seen[7]" (map key), "dp[1][2]", "st[0]", or a variable name. Both ends must be drawn in this step.'),
  check: z
    .object({ expr: z.string(), result: z.boolean() })
    .optional()
    .describe('The condition this step evaluates, with real values: {"expr":"arr[j] > arr[j+1] → 5 > 1","result":true}'),
  calc: z.string().optional().describe('The calculation on this line with real values, e.g. "sum = 2 + 7 = 9"'),
  loop: z.string().optional().describe('Where we are in the loops, e.g. "pass 2 of 3 · j = 1"'),
  callStack: z.array(z.string()).optional().describe('For recursion: calls in progress, outermost first, e.g. ["main()", "fib(4)", "fib(3)"]'),
})

/** The same tools, described for the Agent SDK's in-process MCP server. */
export function toSdkTools(tools: EditorTools) {
  return [
    tool('get_editor_state', 'Which file is open in the editor (and its language) and which tabs are open.', {}, async () =>
      asResult(await tools.get_editor_state({})),
    ),
    tool('list_files', "List the user's solution files with their length in lines.", {}, async () =>
      asResult(await tools.list_files({})),
    ),
    tool(
      'read_file',
      'Read a solution file with line numbers. Reads the saved file, which matches what the editor shows.',
      {
        name: z.string().describe('File name, e.g. two_sum.cpp'),
        start_line: z.number().int().min(1).optional(),
        end_line: z.number().int().min(1).optional(),
      },
      async (args) => asResult(await tools.read_file(args)),
    ),
    tool(
      'get_last_run',
      "What the editor's output panel shows: the last run's result, stdout, stderr or compiler errors, time and memory.",
      {},
      async () => asResult(await tools.get_last_run({})),
    ),
    tool(
      'run_code',
      "Compile and run a solution file (defaults to the open file) with optional stdin, e.g. to test a case. The result also appears in the user's output panel. Runs the saved file.",
      {
        name: z.string().optional().describe('File to run; defaults to the open file'),
        stdin: z.string().optional().describe('Input for the program'),
      },
      async (args) => asResult(await tools.run_code(args)),
    ),
    tool(
      'edit_file',
      'Propose replacing one exact, unique piece of a file. The user sees the change and must approve it before it is applied. Keep each edit small and focused.',
      {
        name: z.string(),
        old_text: z.string().describe('Exact text to replace, copied from read_file (without line numbers); must appear exactly once'),
        new_text: z.string().describe('Replacement text'),
        explanation,
      },
      async (args) => asResult(await tools.edit_file(args)),
    ),
    tool(
      'create_file',
      'Propose a new solution file (.cpp, .java or .py). The user must approve it. Never overwrites.',
      { name: z.string(), content: z.string(), explanation },
      async (args) => asResult(await tools.create_file(args)),
    ),
    tool('list_notes', "List the user's Markdown notes (file name and title). Notes are separate from code files.", {}, async () =>
      asResult(await tools.list_notes({})),
    ),
    tool('read_note', 'Read one of the user\'s Markdown notes.', { name: z.string().describe('e.g. note-1.md') }, async (args) =>
      asResult(await tools.read_note(args)),
    ),
    tool(
      'create_note',
      'Propose a new Markdown note in the Notes panel. Start it with a "# Title" line. The user must approve it.',
      { content: z.string().describe('The whole note in Markdown, starting with a # title'), explanation },
      async (args) => asResult(await tools.create_note(args)),
    ),
    tool(
      'edit_note',
      'Propose replacing one exact, unique piece of a note (e.g. to add to it). The user must approve it.',
      {
        name: z.string(),
        old_text: z.string().describe('Exact text to replace, copied from read_note; must appear exactly once'),
        new_text: z.string(),
        explanation,
      },
      async (args) => asResult(await tools.edit_note(args)),
    ),
    tool(
      'create_visualization',
      `Show a step-by-step dry run in the Playground: the code with the current line, a note per step, variables, and data structures drawn visually (arrays with pointers, DP grids, maps, stacks/queues, linked lists, binary trees, graphs). Use it to dry run the student's code or to explain a bug or an idea. Pass "file" to show that file's code; "line" in each step refers to it. Each step is a full snapshot (repeat structures and vars every step). One step per meaningful line; at most ${MAX_STEPS} steps. Mark the step where things go wrong with mistake: true.`,
      {
        title: z.string().describe('e.g. "Dry run: twoSum on [2,7,11,15], target 9"'),
        file: z
          .string()
          .optional()
          .describe('File the steps walk through: a solutions file, or with "problem" one of its code files (default solution.cpp)'),
        problem: z.string().optional().describe("Slug of a practice problem: trace the student's code for it (solution.cpp unless file says otherwise)"),
        input: z.string().optional().describe('The input used'),
        steps: z.array(step),
      },
      async (args) => asResult(await tools.create_visualization(args)),
    ),
    tool('list_problems', 'List the practice problems (slug, title, difficulty, solved, number of submissions).', {}, async () =>
      asResult(await tools.list_problems({})),
    ),
    tool(
      'get_problem',
      "Read a practice problem: description, parameters, every test case, the student's solution.cpp with line numbers, and the hidden driver. Defaults to the problem on screen.",
      { slug: z.string().optional() },
      async (args) => asResult(await tools.get_problem(args)),
    ),
    tool(
      'create_problem',
      `Turn a question the student shares (pasted text, a screenshot, LeetCode/codehelp/anywhere) into a practice problem with LeetCode-style layout: description on the left, only class Solution in the editor, test cases checked automatically. The student approves it, then it opens on the Problem screen.

How tests run: the program is HARNESS + starter/solution + driver. The harness already includes <bits/stdc++.h>, "using namespace std", ListNode and TreeNode (LeetCode definitions), and:
- judge::read<T>() reads one input line as T: int, long long, double, bool, char ("a"), string ("abc"), vector<...> of those (nested too, e.g. [[1,2],[3]]), ListNode* ([1,2,3]) and TreeNode* (level order with null).
- judge::run(f) runs every case: f reads one case's input with judge::read and returns the answer, which is printed in LeetCode format and compared with "expected".
So a driver is usually just:
int main() {
    judge::run([] {
        auto nums = judge::read<vector<int>>();
        auto target = judge::read<int>();
        return Solution().twoSum(nums, target);
    });
}
For in-place problems (void), call the method and return the modified argument. Don't define ListNode/TreeNode or main elsewhere.`,
      {
        title: z.string().describe('e.g. "Two Sum"'),
        difficulty: z.enum(DIFFICULTIES as [Difficulty, ...Difficulty[]]),
        description: z
          .string()
          .describe('The problem statement in Markdown, with its examples (Input/Output/Explanation) and constraints, faithful to the source'),
        params: z
          .array(z.object({ name: z.string(), type: z.string().describe('C++ type, e.g. vector<int>') }))
          .describe('The function parameters, in order'),
        compare: z
          .enum(['exact', 'any_order', 'any_order_nested'])
          .optional()
          .describe('any_order when the answer list can be in any order; any_order_nested when inner lists can also be (e.g. 3Sum triplets)'),
        tests: z
          .array(
            z.object({
              input: z.array(z.string()).describe('One value per parameter, LeetCode format: "[2,7,11,15]", "9", "\\"abc\\""'),
              expected: z.string().describe('The answer in LeetCode format, e.g. "[0,1]", "true", "\\"bab\\"", "2.50000" for doubles'),
              example: z.boolean().describe('true for the examples given in the problem'),
            }),
          )
          .describe("The problem's examples, plus a few more cases covering edge cases (empty, single element, duplicates, negatives, large values)"),
        starter: z.string().describe('The class Solution { public: ... }; skeleton the student fills in (empty function body), like LeetCode'),
        driver: z.string().describe('The hidden main() using judge::run and judge::read'),
        explanation,
      },
      async (args) => asResult(await tools.create_problem(args)),
    ),
    tool(
      'add_test_case',
      "Propose an extra test case for a problem (e.g. an edge case the student's code misses). The student approves it. Defaults to the problem on screen.",
      {
        slug: z.string().optional(),
        input: z.array(z.string()).describe('One value per parameter, LeetCode format'),
        expected: z.string().describe('The correct answer, LeetCode format'),
        explanation,
      },
      async (args) => asResult(await tools.add_test_case(args)),
    ),
    tool(
      'edit_solution',
      "Propose replacing one exact, unique piece of a problem's solution.cpp. The student must approve it. Only when they ask for a change.",
      {
        slug: z.string().optional(),
        file: z.string().optional().describe('Which code file: solution.cpp (default: the one open on screen) or another version'),
        old_text: z.string().describe('Exact text to replace, copied from get_problem (without line numbers); must appear exactly once'),
        new_text: z.string(),
        explanation,
      },
      async (args) => asResult(await tools.edit_solution(args)),
    ),
    tool(
      'run_tests',
      "Run a problem's test cases against the saved solution.cpp and see each case's result and anything it printed. By default the examples and the student's own cases; all: true runs every case. Doesn't record a submission.",
      {
        slug: z.string().optional(),
        file: z.string().optional().describe('Which code file to test (default: the one open on screen, else solution.cpp)'),
        all: z.boolean().optional(),
      },
      async (args) => asResult(await tools.run_tests(args)),
    ),
    tool(
      'save_code_version',
      'Save another version of the code for a problem next to solution.cpp, e.g. brute-force.cpp to compare with the optimal one. The student approves it.',
      {
        slug: z.string().optional(),
        name: z.string().describe('e.g. brute-force.cpp'),
        content: z.string().describe('The whole file: a class Solution like solution.cpp'),
        explanation,
      },
      async (args) => asResult(await tools.save_code_version(args)),
    ),
    tool(
      'list_attempts',
      "The student's past submissions for a problem: time, result and the code they submitted.",
      { slug: z.string().optional() },
      async (args) => asResult(await tools.list_attempts(args)),
    ),
  ]
}
