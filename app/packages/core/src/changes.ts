// A change Claude proposed, as data: shared between the server (server/src/dsa_server/changes.py applies it) and the
// browser, which keeps it with the chat. Because it is data, a proposal can still be applied after Claude
// stopped waiting for the answer (the reply was stopped, the page reloaded, or the server restarted).
import type { Problem, TestCase } from './problems.ts'

export type Change =
  | { type: 'edit_file'; name: string; oldText: string; newText: string }
  | { type: 'create_file'; name: string; content: string }
  /** linkTo: the problem that was open when Claude proposed it; the note belongs to it. */
  | { type: 'create_note'; name: string; content: string; linkTo?: string }
  | { type: 'edit_note'; name: string; oldText: string; newText: string }
  | { type: 'create_problem'; problem: Problem; starter: string; driver: string }
  | { type: 'add_test'; slug: string; test: TestCase }
  | { type: 'edit_solution'; slug: string; name: string; oldText: string; newText: string }
  | { type: 'save_code_version'; slug: string; name: string; content: string }

/** What applying a change touched, so the editor can show it (the same as the chat's events). */
export type ChangeEffect =
  | { type: 'file_changed'; file: string }
  | { type: 'note_changed'; note: string }
  | { type: 'problem_changed'; slug: string; open: boolean }
