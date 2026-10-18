# DSA Code Editor — Design (v1)

## Why this exists

The user is learning DSA from a video course (codehelp.in, taught mostly in C++) that has no built-in editor. Today they switch to VS Code to write and run every snippet. They want their own browser-based editor they can keep open next to the course: open the page, start typing, hit Run, see output.

They explicitly do **not** want to build a compiler. Code execution is delegated to **Judge0 CE via RapidAPI** for now; later they will self-host Judge0 (or Piston) with Docker.

Longer term they have many ideas (AI explanations, AI help via their local Claude Code sessions, tracking solved problems). **None of those are in v1**, but the UI must leave visible room for them.

The primary focus of v1 is the **UI**. It must feel like a polished, modern tool.

## Goals (v1)

1. A code editor on the left, output on the right, usable the moment the page loads.
2. Run code in C++, Java, and Python through Judge0 CE (RapidAPI) and show the result.
3. Multiple user-managed files, autosaved in the browser.
4. A rich, modern, interactive "Glow" look, in both dark and light themes.

## Non-goals (v1)

- **Stdin / test input.** The user hasn't decided how this should work. Runs send empty stdin. Don't build an input box.
- **The concept of "problems".** No problem list, no problem metadata, no tracking of solved questions. Files are just files.
- AI features of any kind, Claude Code integration, accounts, sync, a backend server, Docker / self-hosting.

## Anti-goals

- **A UI that looks dated, generic, or cheap.** The user rejected a plain wireframe-style mockup outright ("looks shitty"). Even if everything works, an unpolished UI means v1 has failed. Polish, spacing, typography, motion, and both themes matter as much as function.
- Making the execution backend hard to swap. Moving to self-hosted Judge0/Piston later must not need a UI redesign.

## Stack (builder's call, stated to the user)

- React + TypeScript + Vite, client-side only (no backend).
- **Runs locally only** in v1 (`npm run dev` on localhost). No deploy step and no hosting. *(Builder's call.)*
- Tailwind CSS + **shadcn/ui** components as the base.
- **Magic UI / Aceternity UI**-style effects for the "Glow" accents (copy-in components or equivalent hand-rolled CSS).
- **Monaco Editor** (`@monaco-editor/react`) for the editor.
- Fonts: **Geist** (UI) and **Geist Mono** (code).
- Icons: lucide-react (shadcn default).

## Layout — "C: room to grow" (approved via mockup)

Reference mockup: `.superpowers/brainstorm/*/content/layout-v2.html`, variant **2 · Glow**.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [logo] main.cpp          [⌘K Search or run a command]  [C++▾] [▶ Run ⌘↵] [☀/☾] │  top bar
├────┬──────────────────────────────────────────┬─┬────────────────────────┤
│ ⌘  │ [● main.cpp] [scratch.py] [+]             │ │ [Output] [Errors 0]    │
│ ☰  │                                           │⋮│ ● Success  12ms 3.4MB  │
│ ◷  │          Monaco editor                    │ │ ┌ stdout ───────────┐ │
│ ✦  │                                           │ │ │ 0 1               │ │
│    │                                           │ │ └───────────────────┘ │
├────┴──────────────────────────────────────────┴─┴────────────────────────┤
│ ● Judge0 connected   ✓ Saved just now                Ln 7, Col 42  C++17  │  status bar
└──────────────────────────────────────────────────────────────────────────┘
```

- **Target window size:** the user runs the app in **half of a 27" 2560×1440 monitor**, next to the course video, so about **1280×1400 px** is the main design size. The side-by-side layout must look and feel right at that size. *(Builder's call: below about 900px wide, stack the output under the editor and collapse the ⌘K bar into an icon. Narrow widths are a fallback, not the main use.)*
- **Icon rail (far left):** thin vertical rail. The first icon (code/editor) is active. The others are placeholders for future features (files, history, AI) and show a tooltip like "Coming soon". They must look deliberate, not broken.
- **Top bar:** logo, **current file name** (no "Arrays / Two Sum" breadcrumb), ⌘K search bar, language dropdown, shimmer **Run** button showing the `⌘↵` shortcut hint, and a theme toggle.
- **Editor panel (left):** a file tab strip above Monaco.
- **Resizable divider:** draggable handle between editor and output (shadcn `Resizable`).
- **Output panel (right):** segmented tabs **Output** and **Errors** (with a count badge), a status badge, and time/memory stats. stdout sits in a terminal-style box with the animated gradient border.
- **Status bar (bottom):** Judge0 connection state, save state ("Saved just now"), cursor Ln/Col, and language/compiler label.

## Look — "Glow"

- shadcn **zinc** base palette, with a **violet** accent (≈ `#a855f7` / `#7c3aed`) and a cyan secondary for gradients (≈ `#22d3ee`).
- **Shimmer Run button:** a moving violet gradient with a soft glow.
- **Animated conic-gradient border** on the output box.
- Subtle radial violet glow at the top of the app background.
- Active rail icon is tinted violet. The active file tab has a glowing violet dot.
- Respect `prefers-reduced-motion`: stop the shimmer and border animation when it's set.

### Themes

- **Dark** (as in the mockup) and **light**. The light theme must be equally polished (glow accents adapted for a light background), not an afterthought.
- Follows the system setting by default. The toggle overrides it, and the choice persists.
- The Monaco theme switches with the app theme. Use custom Monaco themes that match the palette, not stock `vs`/`vs-dark`.

## Running code

- Clicking **Run** or pressing **⌘/Ctrl+Enter** sends the active file's contents to Judge0 CE:
  `POST https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=true&wait=true`
  with headers `X-RapidAPI-Key` and `X-RapidAPI-Host: judge0-ce.p.rapidapi.com`, and body `{ source_code, language_id, stdin: "" }`.
- Language IDs: C++ (GCC) `54`, Java `62`, Python 3 `71`. The builder should confirm these against `GET /languages`.
- While a run is in progress: the Run button shows a loading state, and repeat clicks are ignored.
- Results:
  - Accepted → green **Success** badge, stdout, `time` and `memory`.
  - Compile error → red badge; switch to the **Errors** tab and show `compile_output`.
  - Runtime error or time limit → red/amber badge with the status description; show `stderr` on the Errors tab.
  - Network or API failure (bad key, quota exhausted, offline) → a clear inline error plus a toast (shadcn `Sonner`). Never fail silently.
- **The execution layer sits behind one small interface** (for example `runCode({ language, source, stdin }) → Result`) with a Judge0-RapidAPI implementation. A later self-hosted Judge0 or Piston implementation should only need a different adapter and base URL.

## API key

- There's no backend, so the key lives in the browser. A **Settings dialog** (shadcn `Dialog`) lets the user paste the RapidAPI key. It's stored in `localStorage` and never committed to source.
- If no key is set, Run opens the Settings dialog with a short explanation and a link to RapidAPI's Judge0 CE page.
- The status bar shows the connection state: no key / connected / last call failed.
- This is acceptable because the app is for personal, local use. Exposing the key if hosted publicly is a known limitation, and a later backend proxy or self-hosting fixes it.

## Files

- The user can **create, rename, and delete** files. Deleting asks for confirmation (shadcn `AlertDialog`). Open files appear as tabs, and tabs can be closed.
- **The extension sets the language:** `.cpp` → C++, `.java` → Java, `.py` → Python. The language dropdown and the extension stay in sync. Changing the dropdown renames the extension.
- The top bar shows the active file name.
- **First visit:** one file, `main.cpp`, with a starter C++ template (`#include <bits/stdc++.h>`, `using namespace std;`, an empty `main`).
- New files get a starter template for their language. Java's template uses `public class Main`, because Judge0 requires that class name.

## Autosave

- File contents save to browser storage automatically, debounced (~500 ms after typing stops), and are also flushed on `beforeunload` / `visibilitychange`.
- Open tabs, the active file, panel sizes, and the theme also persist. Reopening the app restores everything as it was left.
- The status bar shows "Saving…" and then "Saved just now".
- Storage: `localStorage` is fine for v1. The builder may choose IndexedDB.

## ⌘K command palette

- shadcn `Command` dialog, opened with ⌘/Ctrl+K or by clicking the search bar.
- v1 commands: switch to a file (fuzzy search by name), new file, run, toggle theme, open settings.

## Left to the builder

- Exact component structure, state management (React state/context or a small store such as Zustand), and folder layout.
- Exact light-theme colors, as long as the theme meets the polish bar above.
- Which Magic UI / Aceternity components to copy in versus hand-roll.
- Monaco configuration details: font size, minimap off (suggested), and so on.
- Whether to add a file-creation popover or an inline rename in the tab.

## Success looks like

The user opens the app next to their course video, starts typing C++ immediately, presses ⌘↵, and sees output on the right. They can come back the next day and find their files where they left them. They're happy to look at it, in both light and dark.

## Addendum (2026-10-18): local Piston runner

RapidAPI's Judge0 CE no longer has a free plan, so v1 now defaults to a **self-hosted Piston** runner (`docker-compose.yml` at the repo root, bound to `127.0.0.1:2000`).
- `createPistonRunner` implements the same `CodeRunner` interface. The Vite dev server proxies `/piston/*` to `http://127.0.0.1:2000/api/v2/*`, so there are no CORS issues.
- Settings has a runner choice: **Local (Piston)** (default, no key) or **Judge0 on RapidAPI** (key required). The key field and the no-key flow apply only to Judge0.
- `scripts/piston-install.sh` installs gcc 10.2.0, java 15.0.2 and python 3.12.0 once.
- Compiler labels are now generic ("C++ · GCC", "Java · OpenJDK", "Python 3") because the versions depend on the runner.
