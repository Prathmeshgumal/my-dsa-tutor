# DSA Editor

A local, browser-based code editor for practising DSA in C++, Java and Python.

## Run it

```sh
./start.sh   # starts everything, then prints: Editor ready at http://localhost:5199
```

(`./start.sh` is `docker compose up -d` plus waiting for the editor and printing its
link. It also creates the data folders first, so they belong to you; after that, plain
`docker compose up -d` works too.) That starts everything, and it all restarts by itself after a reboot:

- **editor**: the editor itself, which also saves your files and talks to Claude
  Code. It runs the built app on a small Python server; after changing anything in `app/`,
  rebuild it with `./start.sh --build`.
- **piston**: runs your code ([Piston](https://github.com/engineer-man/piston), free,
  no API key). It's pinned to one version, with a small patch (`piston/api-v2.js`) so
  **Stop** really ends a running program.
- **piston-setup**: installs C++, Java and Python into Piston. The first run takes a
  few minutes (`docker compose logs -f piston-setup` shows progress); after that it
  only checks and exits.

The Claude panel signs in with a token from your Claude subscription. The first time,
`./start.sh` asks for it: run `claude setup-token` in another terminal and paste what it
prints. It's saved in `.env`, which git ignores. The editor never sees the rest of your
`~/.claude` folder. To stop everything: `docker compose down`.

**Something not working?** The ⚙️ button in the left bar opens **Setup**. It checks that
Piston is running with C++, Java and Python, that Claude is signed in, and that your folders
can be saved to, and says how to fix whatever isn't. The editor also checks this when it opens
and warns you if something needs attention. **Copy diagnostics** copies the check plus the end
of the log file (`logs/editor.log`), ready to paste into a bug report.

Not using Docker for the editor? `docker compose up -d piston piston-setup`, then
`cd app && npm install && npm run build && npm start` (needs [uv](https://docs.astral.sh/uv/)).
Working on the editor itself? `npm run dev` instead serves the same thing with instant reloads as
you change the code, page or server. `npm test` runs the unit tests, `npm run test:e2e` the browser
tests (the first time: `npx playwright install chromium`) and `cd server && uv run pytest` the
server's tests. The code is in three parts under `app/`: `packages/web` (the page),
`packages/core` (shared by the page and Claude's tools) and `server` (the API, in Python).

Updating from a version before the editor ran on its own server? Docker's old
`project-me_editor-node-modules` volume isn't used any more; `docker volume rm
project-me_editor-node-modules` frees its space.

### Settings

The defaults need no setup. **In Docker**, the only setting is the port on your computer:
`EDITOR_PORT=5300 ./start.sh`. The rest is fixed by
`docker-compose.yml`, and a `dsa-tutor.json` isn't read.

**Without Docker**, put a `dsa-tutor.json` in the data folder (the repo root unless you set
`DATA_DIR`), for example:

```json
{ "port": 5199, "pistonUrl": "http://127.0.0.1:2000", "folders": { "notes": "my-notes" } }
```

`folders` can move `solutions`, `notes`, `playground`, `problems`, `logs` and `state`; relative
paths are inside the data folder. Environment settings win over the file: `PORT`, `HOST`,
`PISTON_URL`, `DATA_DIR`, and `SOLUTIONS_DIR`, `NOTES_DIR`, `PLAYGROUND_DIR`, `PROBLEMS_DIR`,
`LOGS_DIR`, `STATE_DIR` for single folders.

## Where your code is saved

Every file in the editor is a real file in **`solutions/`** at the repo root (set
`SOLUTIONS_DIR` to use another folder). Edits are written there half a second
after you stop typing, so you can open, back up or commit them like any other
code. Change a file outside the editor (in VS Code, with git, anything) and the editor
shows the change straight away; the same goes for notes, problems and dry runs. Saving
never leaves a half-written file behind, even if the power goes mid-save.

Your open tabs, chats, theme and settings are saved too, in **`state/`** (set `STATE_DIR` to
use another folder), so clearing the browser, switching browsers or changing the port loses
nothing. The browser keeps a copy for speed; the first time you open this version, whatever your
browser already had is moved into `state/` for you.

## Giving your program input

Programs run like they do in the VS Code terminal. When your code reads with `cin` (or `input()`,
`Scanner`), the Output tab shows what it printed so far and waits: type the answer and press Enter,
and the program carries on. What you typed stays in the output in purple. **Stop** ends a program
that's stuck waiting or looping; a run can last up to 2 minutes.

## Shortcuts

| Keys | Action |
|---|---|
| ⌘/Ctrl + Enter | On Code, run the open file; on Problems, run the test cases |
| ⌘/Ctrl + K | Search files and commands |
| ⌘/Ctrl + J | Show or hide the output |

## How the editor is laid out

The left bar has five sections: **Problems**, **Code**, **Notes**, **Dry runs** and **Chats**.
Every section looks the same: a list on the left (with a count, search, and **+** to make a new
one; each row's **⋯** menu has rename or delete) and the thing you picked beside it. Pressing the
button of the section you're on hides or shows its list. Below them, **✦ Claude** opens Claude on
the right from any section; opening it folds the list away to make room, and closing it brings
the list back. The top bar says where you are (`Problems › Two Sum`), with search and the theme.

On **Code**, the list is every file in `solutions/`, and the language picker and **Run** sit at
the end of the open-files row, next to the code. The output sits **below the
editor by default**. The small switch at the bottom-right of the status bar puts it
at the bottom, on the right, or hides it (⌘/Ctrl + J also shows or hides it).
Running code always reopens it. These choices are remembered.

## Notes

The **Notes** section (or ⌘/Ctrl + K → "Open notes") keeps Markdown notes: patterns, tricks,
mistakes to avoid. Make as many as you like (the title is the first line), pick one from the
list, and flip between Edit and Preview. Notes save themselves a moment after you stop typing
(and when you switch section), as real `.md` files in **`notes/`** at the repo root (set
`NOTES_DIR` to use another folder). Open Claude beside a note to ask about it.

## Problems (LeetCode style)

The **Problems** section lists your problems (solved ones ticked). Give Claude a question from
anywhere (paste the text from LeetCode or codehelp, or send a screenshot) and it sets it up
here: the description on the left, a `class Solution` to fill in, and test cases that check
themselves. You never write `main()` or compare output by eye.

- **Run** (or ⌘/Ctrl + Enter) checks the examples and any cases you added. Nothing is saved.
- **Submit** checks every case, including Claude's extra edge cases, and saves the attempt
  under **Submissions**. A problem is **solved** once a Submit passes every case, and it stays
  solved.
- Each case shows its input, the expected answer, your output, and anything your code printed
  with `cout`. Compiler errors point at your own line numbers.
- **+ Add** adds a case of your own. Claude can also add one when it spots an edge case you miss.
- **Reset** (the ↺ next to Run) starts over: the open file goes back to the code the problem
  started with, after a second click to confirm. Changed your mind? Ctrl+Z in the editor brings
  your code back. Problems made before Reset existed didn't keep their starting code, so for those
  it's rebuilt from yours: `class Solution` with the same function, emptied.
- **LeetCode ↗** next to the difficulty opens the question on LeetCode in a new tab (other sites
  show their own name). Claude fills the link in when it makes a problem from a question it knows
  the source of. No link yet? **Add link** suggests `https://leetcode.com/problems/<title>/` for
  you to check and save; only `https://` and `http://` addresses are accepted.
- When this section is showing, Claude knows which problem you're on. Ask it to explain the
  question, give a hint, or check your solution.

**Everything about a problem stays with it.** Notes, dry runs and chats you or Claude make while a
problem is open are linked to it automatically. They show up on its **Related** tab (with its
submissions), and are tagged with the problem's name in the Notes, Dry runs and Chats lists.
Clicking one there opens it in its own section. Opening a problem switches Claude to that
problem's latest chat (or a fresh one); every chat is in the **Chats** section. The **+** next to `solution.cpp` saves another
version of your code (say, brute force next to the optimal one). Run and Submit test whichever
version is open, and each submission remembers which one it was.

Problems are C++ for now. `ListNode` and `TreeNode` are already defined, as on LeetCode. Each
problem is a folder in **`problems/`** at the repo root (set `PROBLEMS_DIR` to use another
folder). The folder holds `problem.json` (description, tests and linked notes), `solution.cpp` and
any other versions (your code), `driver.cpp` (the hidden `main()` Claude wrote) and `attempts/`.
Notes stay in `notes/` and dry runs in `playground/`.

## Playground (dry runs)

The **Dry runs** section (the Playground) plays step-by-step dry runs of your code. Ask Claude
things like "dry run my code with input [3, 1, 2]" or "show me where my loop goes wrong". It
reads your file, runs it to check the real result, and builds a dry run that plays here: your code with the current line highlighted, a note
for each step, the variables, and the data structures drawn out (arrays with pointers,
DP tables, hash maps, stacks, queues, linked lists, binary trees, graphs). The step where
a bug shows up is marked in red. Use ← → to step, Space to play, and 0.5× / 1× / 2× for
speed. Drag the divider to resize the code and the drawing (sizes are remembered).
Variables are drawn as buckets (name on top, value inside; changed ones light up) and
arrays/vectors as one long strip of boxes, with a vector's spare capacity as empty slots.
To make each step easy to follow, Claude can add arrows for what moved where (swaps,
copies, writes into a map), the condition being checked with real values (`5 > 1 ✓`),
the line's calculation next to the code (`sum = 2 + 7 = 9`), where you are in the loops,
and the call stack for recursion. Old values show crossed out in the corner of a box that
changed, and a pointer that moved leaves a short trail (`j +1`). Marks on the timeline
above the slider jump to the bug, to moves and to new loop passes. "Watch an example" shows a bubble sort without needing Claude. 

**Fix it right there.** When a dry run shows the bug, click **Edit code**: the code panel becomes an
editor for the real file (the problem's `solution.cpp`, or the file in `solutions/`), saved as you type.
Then **Dry run again**: Claude traces your changed code on the same input and the new dry run opens
next to the old one, so you can step through both. For a problem, all its test cases run at the same
time and the result shows in the header (e.g. "Accepted · 8/8 tests").

Dry runs are saved
as JSON files in **`playground/`**; the code editor stays as you left it while you're here.

## Ask Claude

Click **✦ Claude** in the left bar (or ⌘/Ctrl + K → "Ask Claude") to chat with a Claude
agent built for this editor. The panel shows the open chat; **All chats** opens the **Chats**
section, where every conversation is listed and can be continued full width. A reply keeps
going while you switch between the two. It runs on this machine with your Claude subscription
(no API key), and every message includes the file you have open with its latest code.

Claude's reply runs on the server, not in the page. If the connection drops, or you reload
or close the page, the reply carries on, and the page picks it up again where it left off.
**Stop** ends it. A change Claude proposed can still be applied after it stopped waiting for
your answer: the card shows **Apply anyway**, which applies it only if the code it changes is
still there.

**Model and effort**: the chip at the top right of the message box (e.g. `Default` or
`Opus · High`) picks which model replies and how hard it thinks, like on claude.ai. The list of
models and the effort levels each one supports come from the Claude Code engine for your login.
Until you pick something, Claude Code's own defaults are used, exactly as before; **Reset to
default** goes back to that. Your choice is remembered and applies from your next message.

It can only act through these tools:

| Tool | What it does | Asks you first? |
|---|---|---|
| `get_editor_state` | Which file is open, which tabs are open | No |
| `list_files` | Your solution files | No |
| `read_file` | A file with line numbers (or some of its lines) | No |
| `get_last_run` | What the output panel shows: result, output, compiler errors | No |
| `run_code` | Runs a file, optionally with input, to test it; the result shows in your output panel | No |
| `edit_file` | Replaces one exact piece of a file | **Yes**: you see the change and click Apply or Reject |
| `create_file` | Creates a new solution file | **Yes** |
| `list_notes` / `read_note` | Your Markdown notes | No |
| `create_note` / `edit_note` | Saves a new note, or changes one (e.g. "add this to my notes") | **Yes** |
| `create_visualization` | Makes a step-by-step dry run of your code for the Playground | No |
| `create_problem` | Sets up a question you shared as a problem on the Problems screen | **Yes** |
| `list_problems` / `get_problem` / `list_attempts` | Your problems, one problem with its tests and your solution, your past submissions | No |
| `run_tests` | Runs a problem's test cases against your solution (doesn't count as a submission) | No |
| `add_test_case` | Adds an edge case to a problem | **Yes** |
| `set_problem_link` | Saves where a problem's question lives (e.g. its LeetCode page), shown as the LeetCode logo | No |
| `edit_solution` | Replaces one exact piece of a problem's solution (or another version) | **Yes** |
| `save_code_version` | Saves another version of a problem's code, e.g. a brute-force one | **Yes** |

You can also send it images (up to 5 per message, PNG/JPEG/GIF/WebP, under 5 MB each):
click 📎, paste a screenshot into the message box, or drop images on the panel. Chats keep
only a small thumbnail of each image.

Claude Code's own tools (shell, web, other folders) and your personal Claude Code
settings, CLAUDE.md, plugins and MCP servers are all switched off for it. You can keep
several chats: "New chat" starts a fresh one, and clicking the chat title at the top lists
them so you can switch back or delete one.

## Develop

```sh
cd app
npm test                       # unit tests (page and core)
npm run build                  # type-check and production build
cd server && uv run pytest     # the server's tests
```
