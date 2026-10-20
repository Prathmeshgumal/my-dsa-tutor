// The only things the editor's Claude agent can do. Each tool works on the solutions folder or on
// what the editor sent with the message; nothing else (no shell, no web, no other folders).
import { tool } from '@anthropic-ai/claude-agent-sdk'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { EditorContext } from '../src/lib/chatEvents.ts'
import { languageFromFilename } from '../src/lib/languages.ts'
import type { CodeRunner, RunResult } from '../src/lib/runner/types.ts'

export interface ApprovalRequest {
  kind: 'edit' | 'create'
  file: string
  before: string
  after: string
  explanation: string
}

export interface EditorToolDeps {
  dir: string
  context: EditorContext
  runner: CodeRunner
  /** Shows the change to the user and resolves with their decision. */
  requestApproval(req: ApprovalRequest): Promise<boolean>
  /** Called with every run, so the editor's output panel can show it. */
  onRun(file: string, result: RunResult): void
  /** Called after an approved change is written, so the editor reloads it. */
  onFileChanged(file: string): void
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

export function createEditorTools(deps: EditorToolDeps) {
  const { dir, context } = deps

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
        const content = await readSolution(name)
        if (!old_text) throw new ToolError('old_text is empty; copy the exact lines you want to replace from read_file.')
        const count = content.split(old_text).length - 1
        if (count === 0) throw new ToolError(`old_text wasn't found in ${name}. Read the file again and copy the lines exactly.`)
        if (count > 1) throw new ToolError(`old_text appears ${count} times in ${name}; include more surrounding lines so it is unique.`)
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
] as const satisfies readonly (keyof EditorTools)[]

const asResult = (t: ToolText) => ({ content: [{ type: 'text' as const, text: t.text }], isError: t.isError })

const explanation = z.string().describe('One short sentence the user sees: why this change.')

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
  ]
}
