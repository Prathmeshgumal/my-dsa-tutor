// Applies a change Claude proposed and the user approved (see @dsa/core's changes.ts). Used by the editor
// tools while Claude waits for the answer, and by POST /api/claude/apply for a proposal approved later.
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { Change, ChangeEffect } from '@dsa/core/changes'
import { languageFromFilename } from '@dsa/core/languages'
import { nextNoteName } from '@dsa/core/noteTitle'
import { codeOf, isCodeName, isSlug, problemProblems, type Problem } from '@dsa/core/problems'
import { writeFileAtomic } from './atomicWrite.ts'
import { createProblem, linkNote, ProblemNotFound, readEntry, writeCode, writeTests } from './problemStore.ts'

/** A problem with the request Claude can read and act on. */
export class ToolError extends Error {
  /** The same problem in words for the person, when they apply a change themselves ("Apply anyway"). */
  readonly forPerson: string

  constructor(message: string, forPerson = message) {
    super(message)
    this.forPerson = forPerson
  }
}

/** A plain code file name directly inside the solutions folder. */
export function checkName(name: string): void {
  const ok =
    name.length > 0 &&
    name.length <= 255 &&
    !/[/\\\0]/.test(name) &&
    !name.startsWith('.') &&
    path.basename(name) === name &&
    languageFromFilename(name) !== null
  if (!ok) throw new ToolError(`"${name}" isn't a valid solution file name (use something like two_sum.cpp, Main.java or bfs.py).`)
}

/** A plain .md file name directly inside the notes folder. */
export function checkNoteName(name: string): void {
  const ok = /^[^/\\\0]+\.md$/i.test(name) && !name.startsWith('.') && path.basename(name) === name && name.length <= 255
  if (!ok) throw new ToolError(`"${name}" isn't a note name; use list_notes to see them (e.g. note-1.md).`)
}

export interface ChangeStores {
  /** The solutions folder. */
  dir: string
  notesDir: string
  problemsDir: string
}

export interface Applied {
  /** What happened, for Claude (and the user). */
  text: string
  effects: ChangeEffect[]
}

const isExisting = (e: unknown) => (e as NodeJS.ErrnoException).code === 'EEXIST'

async function readOr(file: string, missing: string): Promise<string> {
  try {
    return await readFile(file, 'utf8')
  } catch {
    throw new ToolError(missing, `${path.basename(file)} doesn't exist any more.`)
  }
}

/** Replaces old text that must still be there exactly as Claude saw it. */
function replaceOnce(content: string, oldText: string, newText: string, changed: string, where: string): string {
  if (!oldText || !content.includes(oldText)) {
    throw new ToolError(changed, `${where} has changed since Claude suggested this, so the change no longer fits.`)
  }
  return content.replace(oldText, () => newText)
}

async function problemEntry(problemsDir: string, slug: string) {
  if (!isSlug(slug)) throw new ToolError(`"${slug}" isn't a problem.`)
  try {
    return await readEntry(problemsDir, slug)
  } catch (e) {
    if (e instanceof ProblemNotFound) throw new ToolError(`${e.message} Use list_problems to see them.`, e.message)
    throw e
  }
}

/** Writes the change. Throws ToolError when it no longer fits (the file changed, or is already there). */
export async function applyChange({ dir, notesDir, problemsDir }: ChangeStores, change: Change): Promise<Applied> {
  switch (change.type) {
    case 'edit_file': {
      const { name } = change
      checkName(name)
      const latest = await readOr(path.join(dir, name), `${name} doesn't exist. Use list_files to see the files.`)
      const next = replaceOnce(latest, change.oldText, change.newText, `${name} changed while waiting for approval; read it again.`, name)
      await writeFileAtomic(path.join(dir, name), next)
      return { text: `Applied the edit to ${name}; the editor shows the new code.`, effects: [{ type: 'file_changed', file: name }] }
    }
    case 'create_file': {
      const { name } = change
      checkName(name)
      try {
        await writeFileAtomic(path.join(dir, name), change.content, { exclusive: true })
      } catch (e) {
        if (isExisting(e)) throw new ToolError(`${name} already exists; use edit_file to change it.`, `${name} already exists.`)
        throw e
      }
      return { text: `Created ${name}.`, effects: [{ type: 'file_changed', file: name }] }
    }
    case 'create_note': {
      checkNoteName(change.name)
      let name = change.name
      try {
        await writeFileAtomic(path.join(notesDir, name), change.content, { exclusive: true })
      } catch (e) {
        if (!isExisting(e)) throw e
        // Another note took the name meanwhile: use the next free one.
        name = nextNoteName((await readdir(notesDir)).filter((n) => /\.md$/i.test(n)))
        await writeFileAtomic(path.join(notesDir, name), change.content, { exclusive: true })
      }
      const effects: ChangeEffect[] = [{ type: 'note_changed', note: name }]
      // A note made while a problem is open belongs to it.
      if (change.linkTo && isSlug(change.linkTo)) {
        const linked = await linkNote(problemsDir, change.linkTo, name).then(
          () => true,
          () => false,
        )
        if (linked) {
          effects.push({ type: 'problem_changed', slug: change.linkTo, open: false })
          return {
            text: `Saved the note as ${name} and linked it to ${change.linkTo}; it shows in the Notes panel and on the problem's Notes tab.`,
            effects,
          }
        }
      }
      return { text: `Saved the note as ${name}; it shows in the Notes panel.`, effects }
    }
    case 'edit_note': {
      const { name } = change
      checkNoteName(name)
      const latest = await readOr(path.join(notesDir, name), `${name} doesn't exist. Use list_notes to see the notes.`)
      const next = replaceOnce(latest, change.oldText, change.newText, `${name} changed while waiting for approval; read it again.`, name)
      await writeFileAtomic(path.join(notesDir, name), next)
      return { text: `Updated ${name}.`, effects: [{ type: 'note_changed', note: name }] }
    }
    case 'create_problem': {
      const problems = problemProblems(change.problem)
      if (problems.length) throw new ToolError(`The problem isn't valid: ${problems.join('; ')}`)
      const slug = await createProblem(problemsDir, { problem: change.problem, solution: change.starter, driver: change.driver })
      return { text: `Created ${slug}; it's open on the Problem screen.`, effects: [{ type: 'problem_changed', slug, open: true }] }
    }
    case 'add_test': {
      const entry = await problemEntry(problemsDir, change.slug)
      const problems = problemProblems({ params: entry.problem.params, tests: [{ ...change.test, example: true }] })
      if (problems.length) throw new ToolError(problems.join('\n').replaceAll('Test 1', 'This test'))
      await writeTests(problemsDir, entry.slug, [...entry.problem.tests, change.test])
      return {
        text: `Added the case to ${entry.slug} (case ${entry.problem.tests.length + 1}). Submit checks it.`,
        effects: [{ type: 'problem_changed', slug: entry.slug, open: false }],
      }
    }
    case 'edit_solution': {
      const entry = await problemEntry(problemsDir, change.slug)
      const where = `${entry.slug}/${change.name}`
      const latest = codeOf(entry, change.name)
      if (latest === null) throw new ToolError(`${entry.slug} has no ${change.name}.`, `${entry.slug} has no ${change.name} any more.`)
      const next = replaceOnce(latest, change.oldText, change.newText, `${where} changed while waiting for approval; read it again with get_problem.`, where)
      await writeCode(problemsDir, entry.slug, change.name, next)
      return { text: `Applied the edit to ${where}.`, effects: [{ type: 'problem_changed', slug: entry.slug, open: false }] }
    }
    case 'save_code_version': {
      const entry = await problemEntry(problemsDir, change.slug)
      if (!isCodeName(change.name)) throw new ToolError(`"${change.name}" isn't a good name; use something like brute-force.cpp.`)
      if (codeOf(entry, change.name) !== null) {
        throw new ToolError(
          `${entry.slug} already has ${change.name}; use edit_solution with file "${change.name}" to change it.`,
          `${entry.slug} already has ${change.name}.`,
        )
      }
      await writeCode(problemsDir, entry.slug, change.name, change.content)
      return {
        text: `Saved ${change.name} next to solution.cpp; the student can switch to it above the editor.`,
        effects: [{ type: 'problem_changed', slug: entry.slug, open: false }],
      }
    }
  }
}

const text = z.string()
const testCase = z.object({
  input: z.array(z.string()),
  expected: z.string(),
  example: z.boolean(),
  addedBy: z.enum(['problem', 'claude', 'user']),
})

/** Checks a change sent back by the browser before it is applied (the problem itself is checked in applyChange). */
export const changeSchema: z.ZodType<Change> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('edit_file'), name: text, oldText: text, newText: text }),
  z.object({ type: z.literal('create_file'), name: text, content: text }),
  z.object({ type: z.literal('create_note'), name: text, content: text, linkTo: text.optional() }),
  z.object({ type: z.literal('edit_note'), name: text, oldText: text, newText: text }),
  z.object({
    type: z.literal('create_problem'),
    problem: z.custom<Problem>((p) => typeof p === 'object' && p !== null && typeof (p as Problem).title === 'string'),
    starter: text,
    driver: text,
  }),
  z.object({ type: z.literal('add_test'), slug: text, test: testCase }),
  z.object({ type: z.literal('edit_solution'), slug: text, name: text, oldText: text, newText: text }),
  z.object({ type: z.literal('save_code_version'), slug: text, name: text, content: text }),
]) as z.ZodType<Change>
