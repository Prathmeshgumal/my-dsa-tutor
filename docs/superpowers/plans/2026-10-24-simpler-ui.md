# Simpler UI and LeetCode links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every part of the editor open the same way (one list pattern, five sections, Claude as the only right
panel), and give LeetCode problems a button that opens the question on LeetCode.

**Architecture:** The page (`app/packages/web`) gets one section model: a left bar of five sections, each a shared
list (`ListPane`) beside the open item, plus the Claude panel on the right. Notes and chats move from right-side
panels to sections. The server (`app/server`, Python) only changes for the problem link: an optional `link` on
problems, set by Claude's `create_problem` or from the page.

**Tech Stack:** React 19, zustand, Tailwind, shadcn/ui, Vitest + Testing Library, Playwright; Python 3.14 server with
pytest.

**Spec:** the proposal agreed in chat on 2026-10-24 (copied under "Design" below).

## Design (agreed)

- Left bar: five sections, **Problems, Code, Notes, Dry runs, Chats**; then Claude (toggle) and Setup at the bottom.
  Every section icon does one thing: opens that section. Clicking the open section's icon again shows or hides its
  list (the same for all five).
- Every section: a list on the left (title, count, search, **+ New**, the same row look) and the picked item on the
  right. The list can be hidden.
- Claude is the only right panel and opens from anywhere. Opening it folds the section's list away; closing it
  brings the list back. On the Chats section the Claude panel isn't shown (the chat is the page).
- Problem page: tabs **Description** and **Related** (its notes, dry runs, chats and submissions, as list rows;
  clicking one opens it in its section; submissions open in place as today).
- Top bar: where you are (section › item), search, theme. Run, Submit and the language picker live next to the code
  they act on.
- LeetCode link: a problem may have a link. On the Description tab, a button **LeetCode ↗** (or the site's name for
  other sites) opens it in a new tab. Without a link: **Add link**, prefilled with a guess
  `https://leetcode.com/problems/<slugified title>/` for you to check. Claude fills the link when it creates a
  problem from a question with a known source.

## Global Constraints

- The server and your data folders keep working as they are: old `state/settings.json` values
  (`screen: 'editor' | 'problem' | 'playground'`, `notesOpen`, `problemListOpen`, `playgroundListOpen`) must load
  without errors and land on the matching section.
- Never edit the user's data folders (`solutions/ notes/ playground/ problems/ state/` at the repo root).
- No new npm or Python dependencies.
- What Claude sees changes only by the new optional `link` (tool input + one line in a problem's description when a
  link exists). Engine fixtures are re-recorded for that and the diff checked to contain only it.
- Commits: one short plain line, no attribution (user's CLAUDE.md).

## Review Focus

1. Old saved settings (screen `problem`, `notesOpen: true`) → page opens on Problems, nothing crashes; Notes opens as
   a section. Test in Task 2.
2. A link that isn't http(s) (`javascript:alert(1)`) → rejected by the server with 400 and never rendered as a link.
   Test in Task 1.
3. Claude open on a narrow window (≤ 900 px) → still at most list-less main + Claude; nothing squashed to one word
   per line. Test in Task 2 (list folds when Claude opens).
4. Unsaved typing in a note or a problem when switching sections → kept (notes/problems flush on unmount as today).
   Test in Task 4.
5. A chat that is still streaming when you switch to the Chats section or away → keeps streaming and shows the same
   turn. Test in Task 5.

---

### Task 1: LeetCode link on problems

**Files:**
- Modify: `app/packages/core/src/problems.ts` (`Problem.link?: string`, `linkLabel`, `guessLeetCodeLink`)
- Modify: `app/server/src/dsa_server/problem_store.py`, `problems_api.py`, `editor_tools.py`,
  `tool_inputs.py`, `data/editor_tools.json`, `core.py` if it validates problem keys
- Modify: `app/packages/web/src/state/problems.ts` (`setLink`), `components/problems/ProblemScreen.tsx`
- Test: `packages/core/src/problems.test.ts`, `server/tests/contract/test_problems.py`,
  `server/tests/unit/test_tool_inputs.py`, `web/src/state/problems.test.ts`, `ProblemScreen.test.tsx`

**Interfaces:**
- Produces: `Problem.link?: string`; `linkLabel(url: string): string` ("LeetCode" for leetcode.com/leetcode.cn,
  else hostname without `www.`); `guessLeetCodeLink(title: string): string`;
  `PUT /api/problems/:slug/link` body `{ "link": string | null }` → 204; store action `setLink(link: string | null)`.

- [ ] Core tests: `linkLabel('https://leetcode.com/problems/two-sum/') === 'LeetCode'`,
  `linkLabel('https://www.naukri.com/code360/x') === 'naukri.com'`,
  `guessLeetCodeLink('3Sum') === 'https://leetcode.com/problems/3sum/'`,
  `guessLeetCodeLink('Two Sum II') === 'https://leetcode.com/problems/two-sum-ii/'`. Run, see fail, implement, pass.
- [ ] Contract tests: PUT link stores `"link"` in problem.json (before `formatVersion`), `null` removes it, keeps
  `starter`/tests; `"javascript:alert(1)"`, `"leetcode.com/x"` (no scheme), non-string, and > 500 chars → 400
  `{"error": "The link must be a web address starting with https:// or http://."}`; unknown slug → 404 like the
  other problem routes. `create_problem` with `link` keeps it. Run, fail, implement, pass.
- [ ] Tool input: `create_problem` takes optional `link` (string). In `editor_tools.json` add the property with
  description "The question's web address, if it came from a site (for a LeetCode question:
  https://leetcode.com/problems/<slug>/). Leave out if unknown." `tool_inputs.py` gets `Optional(Str())` at the same
  position; a bad scheme is dropped silently by `create_problem` (the tool doesn't fail for it).
  `describe_problem` adds `Link: <url>` after the title line only when present. Existing tool-input fixture still
  passes.
- [ ] Page: Description tab shows `<a target="_blank" rel="noreferrer">` button "LeetCode ↗" only for http(s)
  links; otherwise "Add link" opens a small input prefilled with `guessLeetCodeLink(title)` with Save / Cancel and an
  "Remove link" in the link's menu. Store test: `setLink` PUTs and patches the entry. Component test: button href,
  Add link flow.
- [ ] Re-record engine fixtures (`RECORD_FIXTURES=1 uv run pytest tests/contract/test_claude_engine.py
  tests/contract/test_claude_real_engine.py`), check the diff is only the new `link` schema property, run all
  server tests.
- [ ] Commit: `add LeetCode link button to problems`

### Task 2: One section model and the shared list

**Files:**
- Create: `web/src/components/shell/ListPane.tsx` (+ test), `web/src/state/sections.ts` (+ test)
- Modify: `web/src/state/settings.ts` (remove `screen`, `notesOpen`, `problemListOpen`, `playgroundListOpen`,
  `pressScreen`; migrate old values), `components/shell/IconRail.tsx`, `AppShell.tsx`, `App.tsx`,
  `components/command/CommandMenu.tsx`, everything that called `setScreen`/`setNotesOpen`
- Delete: `web/src/state/filesPanel.ts`, `components/files/FilesPanel.tsx` (drawer; its rows move to ListPane)

**Interfaces:**
- Produces:
  - `type Section = 'problems' | 'code' | 'notes' | 'dryruns' | 'chats'`
  - settings: `section: Section`, `listOpen: Record<Section, boolean>` (default all true), `setSection(s)`,
    `pressSection(s)` (switch, or toggle that section's list when already open), `setListOpen(s, open)`
  - `useListVisible(section): boolean` = `listOpen[section] && !(aiOpen && foldedForClaude)`; opening Claude sets
    `foldedForClaude = true`; toggling a list while Claude is open sets it false.
  - `ListPane` props: `{ title: string; count?: number; onNew?(): void; newLabel?: string; search?: boolean;
    empty: ReactNode; children: ReactNode }` and `ListRow` props `{ icon: ReactNode; title: string; meta?: ReactNode;
    active?: boolean; onOpen(): void; actions?: { label: string; onSelect(): void; destructive?: boolean }[] }`.
    Search filters rows by `title` (case-insensitive); rows read the query from context.
- [ ] Tests (`sections.test.ts`): migration `{screen:'problem', problemListOpen:false}` → `section:'problems'`,
  `listOpen.problems:false`; `{screen:'editor'}` → `'code'`; `{screen:'playground'}` → `'dryruns'`;
  `{notesOpen:true}` → section `'notes'` only when the saved screen was `editor`. `pressSection` toggles list;
  opening Claude hides the list, closing brings it back.
- [ ] Tests (`ListPane.test.tsx`): search filters, empty state, row actions menu, active row `aria-current`.
- [ ] Rail: buttons `Problems, Code, Notes, Dry runs, Chats` (`aria-current="page"` on the open one), then `Claude`
  (`aria-pressed`), spacer, `Setup`. AppShell renders `<section list>` + main per section; Code section's list is
  the files (new file, rename, delete via the existing dialogs).
- [ ] Update AppShell/App/CommandMenu tests to the new names; run `npm test`, `npx tsc -b`.
- [ ] Commit: `one left bar and one kind of list for every section`

### Task 3: Code section toolbar and top bar

**Files:** `components/shell/TopBar.tsx`, `components/editor/EditorPanel.tsx` (or `FileTabs.tsx`), tests.
- [ ] Top bar: logo, breadcrumb (`Code › two_sum.cpp`, `Problems › Two Sum`, `Notes › <title>`, `Dry runs › <title>`,
  `Chats › <title>`), search, theme. No Run, no language picker.
- [ ] Code toolbar (right end of the open-files tab row): language picker and Run (Ctrl+Enter stays). Test: Run
  button runs the active file; language picker changes it.
- [ ] Commit: `move Run next to the code, simpler top bar`

### Task 4: Notes section

**Files:** Create `components/notes/NotesScreen.tsx` (+ test, replacing `NotesPanel.tsx`/test); modify `state/notes.ts`
if needed.
- [ ] List: notes with title, problem tag as `meta`, New note, delete in row actions. Main: title, Edit/Preview,
  editor, save status. Unsaved typing is flushed when leaving the section (test: type, switch section, PUT sent).
- [ ] Problem links to notes (`ProblemNotes`) open the Notes section on that note.
- [ ] Commit: `notes get their own page like files`

### Task 5: Chats section and a slimmer Claude panel

**Files:** Create `components/ai/ChatsScreen.tsx` (+ test); split `AiPanel.tsx` into `Conversation` (messages +
composer, reused) and the side panel shell.
- [ ] Chats section: list of chats (title, time ago, problem tag), New chat, delete; main shows `Conversation`.
  The right Claude panel is hidden on this section.
- [ ] Claude panel header: chat title, **All chats** (opens Chats section on this chat), New chat, close. No dropdown
  list.
- [ ] Test: a streaming turn keeps streaming when moving between panel and Chats section (same store, same chat id).
- [ ] Commit: `chats get their own page; Claude panel just talks`

### Task 6: Problems and Dry runs sections

**Files:** `components/problems/ProblemScreen.tsx`, `ProblemLinks.tsx` → `Related.tsx`, `components/playground/Playground.tsx`, tests.
- [ ] Problems list in `ListPane` (solved icon, difficulty as meta, delete action, newer-version note below).
  ProblemScreen drops its own list column.
- [ ] Tabs: Description, Related. Related groups Notes / Dry runs / Chats / Submissions with `ListRow`s and counts;
  "New note/chat about this problem" buttons stay.
- [ ] Dry runs list in `ListPane` (title, steps, problem tag, delete). Playground drops its own list column.
- [ ] Commit: `problems and dry runs use the shared list`

### Task 7: Browser tests, README, screenshots

- [ ] Update `app/e2e/editor.spec.ts` for the new names (Files → Code list, Problems section); add: every section
  opens from the left bar and shows its list; Claude opening folds the list.
- [ ] README: replace the panel descriptions with the section model; LeetCode link.
- [ ] Full checks: `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`, `cd server && uv run pytest`,
  `npm run test:e2e`. Screenshots of every section on a copy of the data, for the user.
- [ ] Commit: `browser tests and README for the new layout`
