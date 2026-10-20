# Problem view — design

Branch: `problem-view` (experiment; the user tests it and merges to `main` themselves).

## Why

Today a DSA question lives in one `.cpp` file: the problem text in a comment, the
user's function, a hand-written `main()` with test calls, and expected answers as
`// expected [0,1]` comments the user checks by eye (see `solutions/two_sum.cpp`).
The user wants to solve questions in a LeetCode-style layout instead: description on
the left, only their solution in the editor, test cases with pass/fail underneath.

## Goals

- A **Problem screen**: description panel, editor with only the solution, test panel
  with Run and Submit.
- Problems can come from anywhere (LeetCode, codehelp, a screenshot, typed text).
  **Claude creates them** from whatever the user gives it and switches to the
  Problem screen on its own. No form for the user to fill.
- Tests are checked automatically: each case shows input, expected, your output, ✓/✗.
- **Run** checks the examples only and saves nothing. **Submit** runs every case and
  saves an attempt.
- **Solved** = some Submit passed every case. It stays solved after a later failure.
- A **Problems panel** in the left rail listing every problem, difficulty, and ✓ if solved.
- **Attempt history**: each Submit keeps code, per-case results and time; old attempts
  can be opened read-only.
- Claude can work in this view: explain the problem from the description, add an edge
  case to the tests (not into the code), run the tests, edit the solution with approval.

## Non-goals

- No LeetCode/codehelp import, scraping or API (dropped earlier by the user).
- No hidden-test judging against an external site.
- Only C++ in this version; the format allows other languages later.
- No database yet; this stays file-based like notes and dry runs.

## Anti-goals

- Must not touch or break the existing Editor screen, `solutions/`, notes or Playground.
- The user should never have to write `main()`, parsing code, or expected-output comments.

## How it works

### Storage — `problems/` folder (new, next to `solutions/`)

```
problems/
  two-sum/
    problem.json      title, difficulty, description (markdown), tests, createdAt
    driver.cpp        hidden main(): reads cases from stdin, calls Solution, prints results
    solution.cpp      the user's code (what the editor shows)
    attempts/
      1729420000000.json   { code, results: [{ pass, output }], passed, total, at }
```

- `problem.json` tests: `{ input: string /* stdin for the driver */, display: string
  /* human form, e.g. "arr = [2,7,11,15], target = 9" */, expected: string,
  example: boolean, addedBy: 'problem' | 'user' | 'claude' }`.
- Folder name is a slug of the title (`two-sum`, `two-sum-2` on clash).
- `PROBLEMS_DIR` env var, default `<repo>/problems`; added to `start.sh` mkdir and as a
  bind mount in `docker-compose.yml`, same as notes.

### Running tests

- Claude writes `driver.cpp` when it creates the problem. It contains the includes and
  a `main()` that reads a case count, then each case from stdin, calls the user's
  `Solution`, and prints each result followed by a separator line.
- When order doesn't matter (e.g. "return the triplets in any order"), the driver
  normalises (sorts) before printing, so comparison stays a plain string compare.
- Source sent to Piston = `solution.cpp` + `driver.cpp`, **compiled once per Run/Submit**,
  all chosen cases in one stdin. Output is split on the separator and each piece is
  compared with `expected` after trimming trailing whitespace.
- Compile error → shown once at the top of the test panel, no per-case marks.
  Runtime error / time limit partway → cases that printed are marked, the rest show
  "not run" with the error.
- Uses the existing `CodeRunner` (Piston), no new runner.

### Screens and UI

- New **Problem** screen in the IconRail switch next to Editor and Playground.
- Layout with `react-resizable-panels` (resizable like the Playground):
  description (markdown via react-markdown, examples, constraints) | editor (Monaco,
  `solution.cpp`) over test panel (case tabs: input, expected, output, ✓/✗; Run, Submit;
  "Add case" for the user's own input + expected).
- Solution autosaves to disk with an 800 ms debounce, like notes.
- **Problems panel** (left rail, beside Files/Notes): list with difficulty and ✓,
  click opens the problem. Delete with confirmation built into the page.
- Attempts: a list in the test panel area ("Attempts" tab); clicking shows that
  attempt's code read-only and its results.

### Claude

New tools in `editorTools.ts`, same pattern as the existing 12:

| Tool | Approval | Does |
|---|---|---|
| `create_problem` | yes | title, difficulty, description, starter `solution.cpp`, `driver.cpp`, tests; then opens it |
| `get_problem` | no | description, tests, current solution, latest results |
| `list_problems` | no | names, difficulty, solved |
| `add_test_case` | yes | appends a case (`addedBy: 'claude'`) |
| `edit_solution` | yes | edits `solution.cpp` (same find/replace shape as `edit_file`) |
| `run_tests` | no | Run (examples) or all cases; never saves an attempt |
| `list_attempts` | no | attempt summaries for a problem |

- New SSE event `problem_changed { name, open?: boolean }`; the browser reloads the
  problem and, when `open` is true, switches to the Problem screen.
- `EditorContext` gains `openProblem` (name) so Claude knows which problem is on screen.
- System prompt: when the user shares a question (text, screenshot, link + text), use
  `create_problem`; put new edge cases in tests, not in code; explain from the
  description when asked.
- Only the user's Submit creates attempts; Claude can't mark a problem solved.

### Existing files in `solutions/`

Left as plain files (Claude's call; the user's answer was unclear). Claude can turn one
into a problem when asked, using `create_problem` with the file's text.

## Left to the builder

- Exact driver input format and separator string (documented in the system prompt).
- Component split and store shape (`state/problems.ts` expected).
- Test panel visuals, provided pass/fail is readable at a glance.
- Middleware shape for the nested folder (likely a new `problemsApi.ts`).

## Testing

- Unit tests: output splitting/comparison, slug naming, problem/attempt middleware,
  each new tool, store autosave.
- Real check in the browser with a real Claude turn: paste a problem, see it open,
  Run, fail a case, fix, Submit, see ✓ in the list. Probe problems deleted afterwards.

## Addition: everything linked to its problem

The user asked for each problem to hold its dry runs, notes, code files and chats.

- **Linked automatically.** Anything made while a problem is open belongs to it: notes created by the
  user or by Claude, dry runs, and chats started there. The chat that creates a problem also belongs to it.
- **Where the links live.** Notes stay in `notes/`, and `problem.json` lists their names (`notes`).
  Dry runs stay in `playground/` with a `problem` field. Chats stay in the browser with `problemSlug`.
  Code versions are extra `.cpp` files in the problem folder, next to `solution.cpp`.
- **Problem page.** Description, Notes, Dry runs, Chats and Submissions tabs. Code versions are file
  tabs above the editor rather than a left-hand tab (builder's call: switching code belongs next to the
  code). **+** copies the open version.
- **Claude panel.** Opening a different problem switches to its latest chat, or a fresh one. Any chat
  can still be picked from the list, and the pick stays until another problem is opened.
- **Elsewhere.** Notes, dry runs and chats show a tag with their problem's name.
- **Claude tools.** create_visualization takes `problem` and traces that problem's code. create_note
  links to the open problem. edit_solution and run_tests take `file`. New save_code_version.
  get_problem lists versions, linked notes and dry runs.
- **Deleting a problem** removes its folder (code, tests, attempts). Its notes, dry runs and chats are
  kept and simply lose their tag (builder's call: never delete the user's notes as a side effect).
