# Python server: replace the Node server with FastAPI

## Goal
Rewrite `app/packages/server` in Python (FastAPI), because Python is what you prefer to read and write. The
page (`app/packages/web`) stays as it is. When the Python server passes everything below, the Node server is
deleted (it stays in git history).

## The rule: nothing you can notice changes
You asked for no change in how the editor works, how fast it is, or the quality of Claude's answers. Each of
the three is checked by tests, not by eye:

### 1. It works the same
- **Contract tests, written first and run against the Node server.** One pytest suite talks to a running
  server over HTTP, SSE and WebSockets. It covers every route: status codes, JSON bodies, error messages
  word for word, and headers such as `Cache-Control` and `Content-Type`. It has to pass against today's Node
  server before any Python is written. Then it has to pass, unchanged, against the Python server.
- **The ~160 server unit tests are ported** to pytest, case for case.
- **The 7 browser tests** (`app/e2e`) run against the Python server, and so do the web unit tests, which
  don't change.

### 2. Claude answers the same
Claude's answers depend on what it is sent and which engine runs it. All of that is kept identical, and
fixtures recorded from the Node server prove it:
- **The same engine:** Claude Code **2.1.302**, the version the Node SDK uses today. The Python SDK bundles
  a different version (2.1.310), so it's pointed at a pinned 2.1.302 with `cli_path`. A test checks the
  version.
- **The same system prompt**, byte for byte. A fixture is recorded from Node.
- **The same tools:** all 20 editor tools with identical names, descriptions and input schemas. Fixture:
  Node's tool definitions as JSON. The Python ones must match exactly.
- **The same message to Claude.** The prompt built from your question plus what's on screen is recorded
  from Node for a set of cases (file open, note open, problem open, last run, images), and Python must
  produce identical text.
- **The same options:** no built-in tools, no settings sources, `maxTurns` 30, partial messages, and every
  other tool denied.
- **The same events back to the page.** Recorded SDK messages go through Node's event mapper, and Python's
  mapper must produce identical events.
- **The same tool results:** for example `run_tests` text and the C++ test harness. The harness also runs in
  the browser, so its Python copy is checked against outputs recorded from the TypeScript one.

### 3. It's as fast
A benchmark script (`app/server/bench`) measures a running server:
- p50 and p95 for listing files, saving a file, `GET /api/state`, saving a 1 MB chat state, and a static
  asset.
- The extra time `/piston` adds over calling Piston directly, both HTTP and WebSocket. That's the time to
  first output and the round trip of a line of typed input.
- How long an outside edit takes to reach the page (SSE).
- Startup time and memory at idle.

The Node numbers are recorded first and kept in this plan. The Python server must be within
**max(+10 %, +2 ms)** of Node on every timing. Startup and memory are reported side by side, and anything
worse is fixed or brought back to you before the switch.

## Decisions (my calls; say if any is wrong)
1. **Where:** a new Python project at `app/server/`: `pyproject.toml`, `src/dsa_server/`, `tests/`,
   `bench/`. It's managed with `uv` and has a lockfile. It isn't an npm package, so it sits next to
   `packages/` instead of inside it.
2. **Libraries:**
   - `fastapi` and `uvicorn`
   - `pydantic` for checking input
   - `httpx` and `websockets` for Piston
   - `watchfiles` for outside edits
   - `claude-agent-sdk`
   - for tests: `pytest`, `pytest-asyncio`
3. **No shared code generator.** The Python server keeps its own copy of the shapes the page relies on.
   Drift is caught by the contract tests and the recorded fixtures, not by tooling.
4. **Same behaviour first, Python idioms second.** Each module mirrors its Node file (`routes`, `app`,
   `stateApi`, …), so the two can be compared side by side during the port. No feature changes or
   "improvements" ride along.
5. **Dev:** `npm run dev` starts uvicorn (with reload) and Vite together. Vite forwards `/api` and
   `/piston` to it. `npm start` runs the Python server on the built page.
6. **Docker:** the page is built in a Node stage. The image runs Python 3.14 slim with uvicorn, plus Claude
   Code 2.1.302.
7. **Data, config and ports don't change:** the same `dsa-tutor.json`, the same environment variables and
   the same folders. Your files, chats and settings are read as they are.

## Tasks
### 0. Baseline (before any Python server code)
- Benchmark script; record the Node numbers below.
- Record fixtures from Node: system prompt, tool definitions, built prompts, event mapping, C++ harness
  output, error messages.
- Contract test suite passing against the Node server.

### 1. Skeleton
Config, Host and same-site checks, static page, `/api/health`, logging, startup and shutdown.

### 2. Files and state
Atomic writes, solutions/notes/playground, problems, `/api/state`, folder events with own-change filtering,
cleanup of leftover temp files.

### 3. Piston
`/piston` HTTP forwarding and WebSocket joining, including drops, Stop and shutdown.

### 4. Claude
Editor tools, approvals, turns that survive reconnects, chat, apply.

### 5. Switch over
- Dev setup, browser tests, Docker, README, CI.
- Benchmark against Node, then delete the Node server.

## Done means
- Every contract test, every ported unit test, the browser tests and the web tests pass against the Python
  server.
- All Claude fixtures match.
- The benchmark is within budget.
- The Docker editor runs on Python with your token, and your data is untouched.

## Baseline numbers (Node)
Median of 3 runs (`uv run python bench/bench.py node`, saved in `app/server/bench/results-node.json`).
One run's p95 moves 10–60 % from run to run on the same server, so every result is a median of 3.

| Measure | p50 ms | p95 ms |
|---|---|---|
| List files (60 files) | 2.132 | 3.598 |
| Save a file | 0.741 | 1.491 |
| GET /api/state (1 MB chats) | 4.596 | 7.459 |
| Save 1 MB chat state | 3.891 | 8.084 |
| Page (index.html) | 0.576 | 1.418 |
| Static asset (JS) | 0.938 | 1.84 |
| /api/health | 1.171 | 2.545 |
| /piston HTTP, added time | 0.502 | 1.282 |
| Interactive run, first output | 0.618 | 1.591 |
| Interactive run, typed line round trip | 0.381 | 1.191 |
| Outside edit reaches the page (incl. 300 ms settle) | 301.959 | 302.571 |

Startup 599 ms, idle memory 130.7 MB.

## How the checks work (task 0 notes)
- **Contract tests** (`app/server/tests/contract`, 186 tests) start a real server on a scratch data folder
  with a pretend Piston, and check status codes, bodies, headers, SSE, WebSockets and files on disk.
- **Claude checks** point the server at a stand-in engine (`tests/support/fake_claude.py`) through
  `DSA_CLAUDE_CLI`, a test-only setting. It records everything the SDK sends it: command line,
  environment, initialize request (system prompt and all 20 tool definitions), the prompt, and every tool
  result. Then it plays back a scripted reply. Four scenarios (reads, changes with approvals, runs and dry
  runs, images and errors) are recorded from Node in `tests/fixtures/engine`. Together with the page's events,
  what Piston was sent (the C++ harness) and the files written, they must match exactly. This replaces the
  separate prompt, tool, mapper and harness fixtures listed above, and checks them end to end instead.
- **Ruling: one known Node bug is not copied.** Node 24's recursive `fs.watch` on Linux stops reporting a file
  name after a quick save, rename and delete (reproduced with `fs.watch` alone, no editor code). You see it as
  an outside edit to a renamed-away name never showing in the editor. The test for it is marked as a known
  Node failure; the Python server must pass it. Cost if wrong: none to you, it only adds a refresh that was
  missing.
- **Ruling: the test server gets no `CLAUDE*`/`ANTHROPIC*` variables** from whoever runs the tests (a Claude
  Code session leaks `CLAUDE_EFFORT` and others). The SDK's own are recorded: `CLAUDE_AGENT_SDK_VERSION`,
  `CLAUDE_CODE_ENTRYPOINT` (`sdk-ts`) and `CLAUDE_CODE_SDK_READS_SESSION_STATE`.
