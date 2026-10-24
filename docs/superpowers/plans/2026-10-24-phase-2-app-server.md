# Phase 2: a proper app, not a dev server

Branch `app-server`, from `main` at `04060d7` (Phase 1 merged).

## Goal

The editor runs as a real app: one small Node server that serves the built page and the API, settings in one
config, one data folder, and everything you see (tabs, chats, settings) kept on disk instead of in the browser.
Vite stays, for development only. Browser tests cover the main flows, and every test runs on each push.

## Out of scope

- Choosing how Claude runs (Agent SDK or the `claude` CLI directly): you called this future scope.
- Moving your existing data. Your `solutions/`, `notes/`, `playground/` and `problems/` folders stay where they
  are and keep working; nothing is copied or moved for you.

## Decisions (my calls; say if any is wrong)

1. **No Hono or Fastify.** The API handlers are already plain Node `(req, res, next)` handlers, so a small
   Node server can chain them, serve the built page and forward `/piston`. That's no new dependencies, and dev
   and the real server share one list of routes.
2. **No build step for the server.** Node 24 runs the TypeScript files directly. I checked: every server file
   loads in plain Node today.
3. **One data folder, defaulting to the project folder.** A checkout keeps using `solutions/`, `notes/` and the
   others where they are, so nothing moves. A later desktop app points the data folder somewhere else (e.g.
   `~/.dsa-tutor`). The old `SOLUTIONS_DIR`-style settings still work and win over the data folder.
4. **One config file**, `dsa-tutor.json` in the data folder (optional), for the port, the Piston address and
   folder paths. Environment variables override it. Defaults need no file at all.
5. **Browser state moves to `<data folder>/state/`.** That covers open tabs, chats, settings and the open
   problem. On first load, whatever this browser already has is copied over once, so nothing is lost. After
   that the port can change freely.
6. **Docker runs the real server** (`npm run build` then `npm start`) instead of the dev server. Code changes
   then need a rebuild (`./start.sh --build`). Development uses `npm run dev`.
7. **Order:** config → real server → state on disk → browser tests → package split → CI. The split comes after
   the browser tests, so moving files is checked by them.

## Tasks

### 1. Config and data folder (items 16, 18)
- `server/config.ts`: `loadConfig({ env, cwd })` returns `{ port, host, pistonUrl, dataDir, folders: {solutions,
  notes, playground, problems, logs, state} }` from defaults, then `dsa-tutor.json` in the data folder, then env.
  A bad config file gives a clear error naming the file and field.
- `vite.config.ts` and the new server both use it, which removes the scattered `process.env` reads.
- Tests: defaults, file, env overriding the file, old `*_DIR` env, a bad file.

### 2. The real server (item 14)
- `server/routes.ts`: one function that builds the full handler chain (guard, log, health, events, files,
  notes, playground, problems, state, Claude), used by both Vite and the real server.
- `server/main.ts`: Node `http` server running the chain, then the built page from `dist/` (with long caching
  for hashed assets, `index.html` for app routes), and forwarding `/piston` HTTP and WebSocket requests to Piston
  with the same-site check. It shuts down cleanly on Ctrl+C or `docker stop`.
- `npm start` runs it, `npm run build` builds the page. Docker switches to build + start.
- Tests: static files, unknown routes go to `index.html`, `/api` routes reach their handlers, Piston forwarding
  (HTTP and WebSocket), cross-site requests refused.

### 3. Browser state on disk (item 17)
- `GET/PUT /api/state/:key` stores JSON in `<data folder>/state/<key>.json` (safe saves, size limit, allowed keys
  only: `settings`, `workspace`, `ai`, `problems`).
- The browser loads the state before showing the app, and saves changes (debounced). It moves its existing
  browser data over once, then leaves the browser copy alone as a backup.
- Chats get the most care: a failed save keeps retrying and is reported in Setup.

### 4. Browser tests (item 20, part 1)
- Playwright with its own scratch data folder and a fake Piston, so it never touches your data and needs no
  Docker. Flows: open and edit a file, it survives a reload, settings survive a reload, outside edits show up,
  Setup shows problems clearly.

### 5. Package split (item 15)
- npm workspaces: `packages/core` (shared types and logic, now in `src/lib`), `packages/server`,
  `packages/web`. Behaviour stays exactly the same, checked by unit and browser tests.

### 6. CI (item 20, part 2)
- `.github/workflows/ci.yml`: install, type-check, lint, unit tests, build, browser tests on every push and
  pull request. (Only the file is written; nothing is pushed.)

## Done means
All tests pass, the Docker editor runs on the real server with your token, and your data is untouched.
