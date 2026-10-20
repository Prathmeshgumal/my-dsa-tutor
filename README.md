# DSA Editor

A local, browser-based code editor for practising DSA in C++, Java and Python.

## Run it

```sh
./start.sh   # starts everything, then prints: Editor ready at http://localhost:5199
```

(`./start.sh` is `docker compose up -d` plus waiting for the editor and printing its
link; plain `docker compose up -d` works too.) That starts everything, and it all restarts by itself after a reboot:

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

## Notes

Click the notebook button in the left bar (or ⌘/Ctrl + K → "Open notes") to keep
Markdown notes next to your code: patterns, tricks, mistakes to avoid. Make as many
as you like (the title is the first line), switch between them from the title at
the top, and flip between Edit and Preview. Notes save themselves a moment after you
stop typing, as real `.md` files in **`notes/`** at the repo root (set `NOTES_DIR`
to use another folder). Notes and the Claude panel share the right side, so opening
one closes the other.

## Ask Claude

Click the ✦ button in the left bar (or ⌘/Ctrl + K → "Ask Claude") to chat with a Claude
agent built for this editor. It runs on this machine with your existing Claude Code login
(no API key), and every message includes the file you have open with its latest code.

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

Claude Code's own tools (shell, web, other folders) and your personal Claude Code
settings, CLAUDE.md, plugins and MCP servers are all switched off for it. You can keep
several chats: "New chat" starts a fresh one, and clicking the chat title at the top lists
them so you can switch back or delete one.

## Develop

```sh
cd app
npm test        # unit tests
npm run build   # type-check and production build
```
