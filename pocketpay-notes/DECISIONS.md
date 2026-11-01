# Bringing the PocketPay notes into project-me: decisions

Made on 31 Oct 2026. You asked for the notes site to live in project-me, run in Docker, start with
the same `./start.sh`, and be one click away from the DSA editor, with the PocketPay backend left
where it is. These are the choices made along the way, and why.

## 1. The notes moved here; PocketPay points back with a symlink

- **What:** `~/Desktop/my_learnings/payments-app/site/` moved to `project-me/pocketpay-notes/`.
  In its old place is a symlink, `payments-app/site → /home/prathmesh/project-me/pocketpay-notes`.
- **Why:** you wanted the notes in one place with your DSA work. There is now one real copy, so the
  notes can't drift apart. The symlink means everything in PocketPay that says `site/` still
  works: its `CLAUDE.md`, the links in its notes, and `cd site && npm run dev`. New notes written
  during PocketPay work land straight in project-me.
- **Not chosen:** a copy (two versions that drift), or a git submodule (more moving parts than one
  folder needs). Building straight from the PocketPay folder was also rejected, because then
  project-me would break if that folder moved.
- **PocketPay changes:** its `CLAUDE.md` now says where the notes really live. `site/dist/` and
  `site/.astro/` were removed from its `.gitignore`. project-me's `.gitignore` already covers
  `node_modules` and `dist`, and `*.tsbuildinfo` was added.

## 2. The notes run as a built site, not a dev server

- **What:** `pocketpay-notes/Dockerfile` builds the site with Node (`node:24-bookworm-slim`, the
  same image the editor uses), then serves the files with Caddy (`caddy:2.11.6-alpine`).
- **Why:** this matches how the editor works (built once, restarts on its own after a reboot) and
  is small and quick to start. A Vite dev server in a container would need file watching and
  `node_modules` volumes, and is meant for editing, not reading.
- **The image version is pinned** (2.11.6, released 4 Oct 2026), not `latest`, so an update can't
  change anything without you knowing. This follows the editor's own rule for Piston.
- **The `Caddyfile`** sends every unknown path to `index.html`. The site handles its routes in
  the browser, so without this, reloading `/day-1/ledger` would give a 404.
- **The cost:** after you change or add a note, run `./start.sh --build` to update the container.
  For writing notes with instant reloads, `cd pocketpay-notes && npm run dev` (port 5173) still
  works.

## 3. One more service in the existing docker-compose.yml

- **What:** a `pocketpay-notes` service, published only on this computer at
  `127.0.0.1:${NOTES_PORT:-5200}`, with `restart: unless-stopped`.
- **Why 5200:** it sits next to the editor's 5199 and nothing else was using it. Like the
  editor, it isn't reachable from other machines on your network.
- **start.sh:** unchanged in how it works (`docker compose up -d` already starts every service).
  It now also prints `Notes ready at http://localhost:5200`, or a hint if the notes aren't up.
  Its comment line was updated to match.

## 4. A link in the editor's left bar, not a new section

- **What:** a book icon (`BookOpenText`), just above the ⚙️ Setup button, labelled
  **PocketPay notes**. It opens the notes in a **new tab**.
- **Why a link, not a section inside the editor:** the notes are their own app, with their own
  sidebar and search. Squeezing them into an editor panel would cramp both. A new tab lets you
  keep a problem open while you revise.
- **Why that name:** the editor already has a section called **Notes** (your DSA notes). Calling
  this one "PocketPay notes" keeps the two apart.
- **Why near the bottom:** the top of the bar holds the editor's own sections. Links to other
  places sit with Setup.
- **How it knows the address:** the page uses the host you opened the editor on, plus the notes
  port. The port is baked in when the editor is built (`NOTES_PORT` build argument, default 5200).
  So if you change `NOTES_PORT`, run `./start.sh --build` once so the link follows.
- **Tested:** a new unit test checks the link's address and that it opens a new tab. All 537 editor
  unit tests pass, and `tsc` and `oxlint` show nothing new.

## 5. What was checked

- `./start.sh --build` built both images and printed both addresses.
- `/`, `/day-1/ledger`, `/start/python-revision` and an unknown path all return the notes page
  (HTTP 200).
- In a browser, the editor's left bar shows the book button, and clicking it opened
  `http://localhost:5200/` in a new tab.

## 6. Left for you

- **Nothing was committed.** project-me is a git repo; `pocketpay-notes/` and the edits to
  `docker-compose.yml`, `start.sh`, `app/Dockerfile`, `README.md`, `.gitignore` and the
  editor's `IconRail.tsx` and its test are waiting for you to review and commit.
- **Moving it back** is three commands: `rm payments-app/site`, then
  `mv project-me/pocketpay-notes payments-app/site`, then remove the `pocketpay-notes` service.
