# DSA Editor

A local, browser-based code editor for practising DSA in C++, Java and Python.

## Run it

```sh
docker compose up -d   # then open http://localhost:5199
```

That one command starts everything, and it all restarts by itself after a reboot:

- **editor**: the editor itself, which also saves your files and talks to Claude
  Code. Your edits to `app/` show up live without rebuilding.
- **piston**: runs your code ([Piston](https://github.com/engineer-man/piston), free,
  no API key).
- **piston-setup**: installs C++, Java and Python into Piston. The first run takes a
  few minutes (`docker compose logs -f piston-setup` shows progress); after that it
  only checks and exits.

The Claude panel uses your Claude Code login from `~/.claude`, so log in once with
`claude` on this machine. To stop everything: `docker compose down`. After changing
`package.json` or the Dockerfile: `docker compose up -d --build`.

Not using Docker for the editor? `docker compose up -d piston piston-setup`, then
`cd app && npm install && npm run dev`.

## Where your code is saved

Every file in the editor is a real file in **`solutions/`** at the repo root (set
`SOLUTIONS_DIR` to use another folder). Edits are written there half a second
after you stop typing, so you can open, back up or commit them like any other
code. If you change a file outside the editor (for example in VS Code), reload
the page to see the change.

The browser also keeps a backup copy, plus your open tabs, theme and settings,
in localStorage for `http://localhost:5199`. The port is fixed for that reason.

You can switch to Judge0 on RapidAPI (paid, needs an API key) in Settings (⚙️ in
the left bar).

## Shortcuts

| Keys | Action |
|---|---|
| ⌘/Ctrl + Enter | Run the current file |
| ⌘/Ctrl + K | Search files and commands |
| ⌘/Ctrl + J | Show or hide the output |

The **Files** button in the left bar opens a drawer listing every file; it closes
when you click outside it, press Escape, or pick a file. The output sits **below the
editor by default**. The small switch at the bottom-right of the status bar puts it
at the bottom, on the right, or hides it (⌘/Ctrl + J also shows or hides it).
Running code always reopens it. These choices are remembered.

## Ask Claude

Click the ✦ button in the left rail (or ⌘/Ctrl + K → "Ask Claude") to chat with
Claude Code. It runs on this machine using your existing Claude Code login (no API
key), works inside `solutions/`, and every message includes the file you have open
with its latest code. Claude can read and edit your files, and edited files reload in
the editor. It can't run shell commands; use Run for that. You can keep several chats:
"New chat" starts a fresh one, and clicking the chat title at the top lists them all
so you can switch back (each keeps its own conversation) or delete one (click the bin,
then "Delete").

## Develop

```sh
cd app
npm test        # unit tests
npm run build   # type-check and production build
```
