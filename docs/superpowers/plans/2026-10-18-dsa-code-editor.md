# DSA Code Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local, browser-based code editor in the "Glow" style: Monaco on the left and output on the right. It runs C++/Java/Python through Judge0 CE on RapidAPI and autosaves user-managed files.

**Architecture:** A client-only React SPA. Pure logic sits behind small, tested modules: languages, a runner adapter, storage, and a workspace store. Thin UI components built on shadcn/ui consume them. Code execution goes through a `CodeRunner` interface, so a self-hosted Judge0/Piston adapter can replace it later without touching the UI.

**Tech Stack:** Vite + React + TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui (zinc base), lucide-react, `@monaco-editor/react`, zustand, sonner (via shadcn), Geist + Geist Mono (`geist` npm package or Google Fonts), Vitest + @testing-library/react + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-18-dsa-code-editor-design.md` (read it before starting any task).

## Global Constraints

- The project lives at `/home/prathmesh/project-me/app/`. Every path below is relative to `app/`.
- Client-only. No backend, no deploy step. It runs with `npm run dev` on localhost.
- Judge0 endpoint: `POST https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=true&wait=true`, headers `X-RapidAPI-Key: <key>` and `X-RapidAPI-Host: judge0-ce.p.rapidapi.com`.
- Language IDs: C++ `54`, Java `62`, Python 3 `71`. Extensions: `.cpp`, `.java`, `.py`.
- Stdin is always `""` in v1. Do not build an input box.
- The RapidAPI key is stored only in `localStorage`. It never goes in source code or `.env` files that get committed.
- Accent colours: violet `#a855f7` / `#7c3aed`, cyan `#22d3ee`, on the shadcn **zinc** base. Fonts: Geist (UI) and Geist Mono (code).
- All motion (shimmer, rotating border) stops under `prefers-reduced-motion: reduce`.
- The primary design size is a **1280×1400** window. Below **900px** wide, the output stacks under the editor.
- Autosave debounce: **500 ms**. Also flush on `visibilitychange` (hidden) and `beforeunload`.
- localStorage keys: `dsa-editor:workspace` and `dsa-editor:settings`.
- Git commit messages: a single line of at most 10 plain words, with no body and no attribution or co-author trailer. Never push.

## Review Focus

1. **Bad or exhausted API key:** a 401/403 or 429 from RapidAPI must show a specific message ("Invalid API key" / "Daily quota used up") in the output panel and a toast. It must never fail silently or show a generic error. *(Tests in Task 3.)*
2. **Corrupt or missing localStorage:** invalid JSON, the wrong shape, or a `localStorage` that throws must still load the app with the default `main.cpp`, never a blank screen. *(Tests in Task 4.)*
3. **Bad file names:** an empty name, a duplicate (case-insensitive), an unsupported extension such as `.txt`, or a name containing `/` is rejected inline with a reason, and the old name is kept. *(Tests in Tasks 2 and 4.)*
4. **Deleting or closing the last file:** the editor shows an empty state with a "New file" button. Run is disabled, and nothing crashes. *(Tests in Tasks 4, 5 and 6.)*
5. **Infinite loops and non-ASCII output:** Judge0 status 5 shows an amber "Time limit exceeded" badge. stdout containing Unicode (for example `→`, `é`) decodes correctly from base64, and long output scrolls inside the panel. *(Tests in Task 3.)*

---

## File Structure

```
app/
  index.html
  vite.config.ts, vitest.config.ts (or a test block in vite.config), tsconfig*.json, components.json
  src/
    main.tsx                      mounts <App/>, ThemeProvider, Toaster
    App.tsx                       composes the AppShell
    index.css                     Tailwind + theme tokens (light/dark) + glow keyframes
    lib/
      languages.ts                language table, filename ↔ language helpers, templates, name validation
      base64.ts                   UTF-8–safe encode/decode
      runner/types.ts             CodeRunner interface, RunRequest, RunResult, RunnerError
      runner/judge0.ts            Judge0 RapidAPI adapter
      storage.ts                  safe localStorage read/write + schema checks
    state/
      workspace.ts                zustand store: files, tabs, active file, save status
      settings.ts                 zustand store: apiKey, theme, panel layout
      autosave.ts                 debounced persistence subscriber + flush
      run.ts                      zustand store: run status/result, runActiveFile()
    components/
      theme/ThemeProvider.tsx, ThemeToggle.tsx
      glow/ShimmerButton.tsx, GlowBorder.tsx
      shell/AppShell.tsx, TopBar.tsx, IconRail.tsx, StatusBar.tsx
      editor/EditorPanel.tsx, FileTabs.tsx, FileDialogs.tsx, monacoThemes.ts, EmptyState.tsx
      output/OutputPanel.tsx
      settings/SettingsDialog.tsx
      command/CommandMenu.tsx
      ui/*                        shadcn-generated components (do not hand-edit beyond theming)
  src/**/*.test.ts(x)            colocated tests
```

---

### Task 1: Scaffold, theme tokens, and test harness

**Files:**
- Create: the `app/` Vite React-TS project, `src/index.css`, `src/main.tsx`, `src/App.tsx`, `src/components/theme/ThemeProvider.tsx`, `src/components/theme/ThemeToggle.tsx`, `src/state/settings.ts`
- Test: `src/components/theme/ThemeProvider.test.tsx`, `src/state/settings.test.ts`

**Interfaces:**
- Produces:
  - `type ThemePref = 'system' | 'light' | 'dark'`
  - `useSettings` (zustand, persisted under `dsa-editor:settings`): `{ apiKey: string; theme: ThemePref; panelLayout: number[] | null; setApiKey(k: string): void; setTheme(t: ThemePref): void; setPanelLayout(l: number[]): void }`
  - `useResolvedTheme(): 'light' | 'dark'` exported from ThemeProvider.tsx
  - `<ThemeProvider>` toggles the `dark` class on `<html>`

- [ ] **Step 1: Scaffold.** In `/home/prathmesh/project-me`, run `git init` (the folder isn't a repo yet), add a `.gitignore` containing `node_modules`, `dist`, `.superpowers/`. Then run `npm create vite@latest app -- --template react-ts`, install Tailwind v4 with `@tailwindcss/vite`, run `npx shadcn@latest init` (base colour **zinc**, CSS variables on), and add the shadcn components `button dialog alert-dialog input tabs tooltip resizable command dropdown-menu select badge sonner scroll-area label`. Install `zustand @monaco-editor/react lucide-react geist` and the dev dependencies `vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom`. Add `"test": "vitest run"` to package.json, using the jsdom environment and a setup file that imports `@testing-library/jest-dom/vitest`.

- [ ] **Step 2: Theme tokens in `src/index.css`.** Keep shadcn's zinc `:root` (light) and `.dark` tokens. Add `--accent-violet: #a855f7`, `--accent-violet-strong: #7c3aed`, `--accent-cyan: #22d3ee` and a `--app-glow` radial gradient for each theme. In light mode the glow is a faint violet at ≈6% alpha. Add the `shimmer` keyframes and the `@property --glow-angle` / `spin` keyframes from the approved mockup (`.superpowers/brainstorm/*/content/layout-v2.html`, `.glow` rules), and disable both under `@media (prefers-reduced-motion: reduce)`. Set the Geist fonts as `--font-sans` and `--font-mono`.

- [ ] **Step 3: Write the failing tests**

```ts
// settings.test.ts
test('defaults', () => {
  expect(useSettings.getState()).toMatchObject({ apiKey: '', theme: 'system', panelLayout: null });
});
test('persists theme to dsa-editor:settings', () => {
  useSettings.getState().setTheme('light');
  expect(JSON.parse(localStorage.getItem('dsa-editor:settings')!).state.theme).toBe('light');
});

// ThemeProvider.test.tsx  (mock window.matchMedia)
test('system pref follows prefers-color-scheme dark', () => { /* matchMedia dark → html has class "dark" */ });
test('explicit light overrides a dark system', () => { /* setTheme('light') → html lacks "dark" */ });
test('reacts to system change while on system', () => { /* fire matchMedia change → class toggles */ });
```

- [ ] **Step 4: Run** `npm test`. Expected: FAIL (modules not found).

- [ ] **Step 5: Implement** `useSettings` with zustand's `persist` middleware (name `dsa-editor:settings`), and `ThemeProvider`/`useResolvedTheme` (listen to `matchMedia('(prefers-color-scheme: dark)')`). `ThemeToggle` is a shadcn ghost icon button (Sun/Moon) whose dropdown offers Light / Dark / System. `App.tsx` renders a placeholder for now.

- [ ] **Step 6: Run** `npm test`. Expected: PASS. Also run `npm run build`. Expected: builds without type errors.

- [ ] **Step 7: Commit** `git add -A && git commit -m "set up editor app with themes"`

---

### Task 2: Languages module

**Files:**
- Create: `src/lib/languages.ts`
- Test: `src/lib/languages.test.ts`

**Interfaces:**
- Produces:
  - `type LanguageId = 'cpp' | 'java' | 'python'`
  - `interface Language { id: LanguageId; label: 'C++' | 'Java' | 'Python'; ext: '.cpp' | '.java' | '.py'; judge0Id: 54 | 62 | 71; monaco: 'cpp' | 'java' | 'python'; compilerLabel: string; template: string }`
  - `LANGUAGES: Record<LanguageId, Language>`
  - `languageFromFilename(name: string): Language | null`
  - `withLanguage(name: string, lang: LanguageId): string`. Swaps or appends the extension.
  - `validateFileName(name: string, existing: string[]): { ok: true; name: string } | { ok: false; error: string }`. Returns the trimmed name.
  - `uniqueName(base: string, existing: string[]): string`. Turns `main.cpp` into `main-1.cpp`, `main-2.cpp`, and so on.

- [ ] **Step 1: Write the failing tests**

```ts
test('ids and extensions', () => {
  expect(LANGUAGES.cpp).toMatchObject({ judge0Id: 54, ext: '.cpp', monaco: 'cpp' });
  expect(LANGUAGES.java).toMatchObject({ judge0Id: 62, ext: '.java' });
  expect(LANGUAGES.python).toMatchObject({ judge0Id: 71, ext: '.py' });
});
test('cpp template', () => {
  expect(LANGUAGES.cpp.template).toContain('#include <bits/stdc++.h>');
  expect(LANGUAGES.cpp.template).toContain('using namespace std;');
  expect(LANGUAGES.cpp.template).toMatch(/int main\(\)/);
});
test('java template uses class Main', () => expect(LANGUAGES.java.template).toMatch(/public class Main\b/));
test('languageFromFilename', () => {
  expect(languageFromFilename('a.CPP')?.id).toBe('cpp');
  expect(languageFromFilename('x.py')?.id).toBe('python');
  expect(languageFromFilename('notes.txt')).toBeNull();
  expect(languageFromFilename('noext')).toBeNull();
});
test('withLanguage', () => {
  expect(withLanguage('sol.cpp', 'python')).toBe('sol.py');
  expect(withLanguage('sol', 'java')).toBe('sol.java');
});
test.each([
  ['', 'Name can’t be empty'],
  ['   ', 'Name can’t be empty'],
  ['a/b.cpp', 'Name can’t contain /'],
  ['notes.txt', 'Use .cpp, .java or .py'],
  ['Main.CPP', 'A file with this name already exists'],
])('validateFileName(%j) rejects', (name, error) => {
  expect(validateFileName(name, ['main.cpp'])).toEqual({ ok: false, error });
});
test('validateFileName trims', () => expect(validateFileName('  two.py ', [])).toEqual({ ok: true, name: 'two.py' }));
test('uniqueName', () => expect(uniqueName('main.cpp', ['main.cpp', 'main-1.cpp'])).toBe('main-2.cpp'));
```

- [ ] **Step 2: Run** `npm test -- languages`. Expected: FAIL.
- [ ] **Step 3: Implement** `src/lib/languages.ts`. `compilerLabel` values: `'C++17 · GCC 9.2'`, `'Java · OpenJDK 13'`, `'Python 3.8'`.
- [ ] **Step 4: Run** `npm test -- languages`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "add language list and file name checks"`

---

### Task 3: Runner interface and Judge0 adapter

**Files:**
- Create: `src/lib/base64.ts`, `src/lib/runner/types.ts`, `src/lib/runner/judge0.ts`
- Test: `src/lib/base64.test.ts`, `src/lib/runner/judge0.test.ts`

**Interfaces:**
- Consumes: `Language` (Task 2)
- Produces:
  - `encodeBase64(s: string): string`, `decodeBase64(s: string | null): string` (null → `''`; UTF-8 safe)
  - `interface RunRequest { language: Language; source: string; stdin: string }`
  - `type RunStatus = 'success' | 'compile_error' | 'runtime_error' | 'time_limit' | 'internal_error'`
  - `interface RunResult { status: RunStatus; statusText: string; stdout: string; stderr: string; compileOutput: string; timeMs: number | null; memoryKb: number | null }`
  - `type RunnerErrorKind = 'no_key' | 'auth' | 'quota' | 'network' | 'http'`
  - `class RunnerError extends Error { kind: RunnerErrorKind }`
  - `interface CodeRunner { run(req: RunRequest, signal?: AbortSignal): Promise<RunResult> }`
  - `createJudge0RapidApiRunner(opts: { apiKey: string; fetchImpl?: typeof fetch }): CodeRunner`

- [ ] **Step 1: Write the failing tests** (`fetchImpl` is a `vi.fn` returning `new Response(JSON.stringify(body), { status })`)

```ts
test('base64 round-trips unicode', () => expect(decodeBase64(encodeBase64('a → é ✓'))).toBe('a → é ✓'));
test('decode null', () => expect(decodeBase64(null)).toBe(''));

test('sends correct request', async () => {
  await runner.run({ language: LANGUAGES.cpp, source: 'int main(){}', stdin: '' });
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe('https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=true&wait=true');
  expect(init.method).toBe('POST');
  expect(init.headers).toMatchObject({ 'X-RapidAPI-Key': 'k', 'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com', 'Content-Type': 'application/json' });
  expect(JSON.parse(init.body)).toEqual({ source_code: encodeBase64('int main(){}'), language_id: 54, stdin: '' });
});
test('accepted → success with ms and KB', async () => {
  // body: { status:{id:3,description:'Accepted'}, stdout: b64('0 1\n'), time:'0.012', memory:3400 }
  expect(result).toMatchObject({ status: 'success', stdout: '0 1\n', timeMs: 12, memoryKb: 3400 });
});
test('status 6 → compile_error with decoded compile_output', ...);
test('status 5 → time_limit', ...);
test.each([7,8,9,10,11,12])('status %i → runtime_error with stderr', ...);
test.each([13,14])('status %i → internal_error', ...);
test('empty key → RunnerError no_key, no fetch', async () => {
  await expect(createJudge0RapidApiRunner({ apiKey: '', fetchImpl }).run(req)).rejects.toMatchObject({ kind: 'no_key' });
  expect(fetchImpl).not.toHaveBeenCalled();
});
test.each([[401,'auth'],[403,'auth'],[429,'quota'],[500,'http']])('HTTP %i → %s', ...);
test('fetch throws → network', ...);
```

- [ ] **Step 2: Run** `npm test -- runner base64`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use `TextEncoder`/`TextDecoder` with `btoa`/`atob` for base64. Convert `time` (a seconds string) to `Math.round(parseFloat*1000)`, and use null if it's missing. Use `status.description` as `statusText`. `RunnerError` messages are the user-facing copy: no_key `"Add your RapidAPI key in Settings to run code."`, auth `"Invalid API key — check it in Settings."`, quota `"Daily Judge0 quota used up. Try again tomorrow."`, network `"Couldn’t reach Judge0 — check your connection."`, http `"Judge0 error (HTTP <code>)."`
- [ ] **Step 4: Run** `npm test -- runner base64`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "run code through Judge0 api"`

---

### Task 4: Storage, workspace store, and autosave

**Files:**
- Create: `src/lib/storage.ts`, `src/state/workspace.ts`, `src/state/autosave.ts`
- Test: `src/lib/storage.test.ts`, `src/state/workspace.test.ts`, `src/state/autosave.test.ts`

**Interfaces:**
- Consumes: `LANGUAGES`, `validateFileName`, `withLanguage`, `uniqueName`, `languageFromFilename` (Task 2)
- Produces:
  - `interface CodeFile { id: string; name: string; content: string }`
  - `interface WorkspaceData { version: 1; files: CodeFile[]; openIds: string[]; activeId: string | null }`
  - `defaultWorkspace(): WorkspaceData`. One file, `main.cpp`, holding `LANGUAGES.cpp.template`, open and active.
  - `loadWorkspace(): WorkspaceData` (never throws; anything invalid → `defaultWorkspace()`), `saveWorkspace(d: WorkspaceData): boolean` (false if storage throws)
  - `type SaveStatus = 'saved' | 'saving' | 'error'`
  - `useWorkspace` (zustand): `WorkspaceData & { saveStatus: SaveStatus; lastSavedAt: number | null; createFile(name: string): Result; renameFile(id: string, name: string): Result; deleteFile(id: string): void; updateContent(id: string, content: string): void; openFile(id: string): void; closeTab(id: string): void; setActive(id: string): void; setActiveLanguage(lang: LanguageId): void; activeFile(): CodeFile | null }`, where `type Result = { ok: true } | { ok: false; error: string }`
  - `startAutosave(): () => void`. Subscribes to the store, debounces 500 ms, flushes on `visibilitychange`/`beforeunload`, and returns an unsubscribe function.

- [ ] **Step 1: Write the failing tests**

```ts
// storage.test.ts
test('missing → default', () => expect(loadWorkspace().files.map(f => f.name)).toEqual(['main.cpp']));
test('invalid JSON → default', () => { localStorage.setItem('dsa-editor:workspace', '{oops'); expect(loadWorkspace().files[0].name).toBe('main.cpp'); });
test('wrong shape → default', () => { localStorage.setItem('dsa-editor:workspace', '{"version":1,"files":"x"}'); expect(loadWorkspace().files[0].name).toBe('main.cpp'); });
test('localStorage throwing → default and save returns false', () => { /* spy getItem/setItem to throw */ });
test('round-trip', () => { const d = defaultWorkspace(); saveWorkspace(d); expect(loadWorkspace()).toEqual(d); });
test('drops dangling openIds/activeId on load', ...);

// workspace.test.ts
test('createFile adds, opens, activates with language template', () => {
  expect(ws().createFile('two.py')).toEqual({ ok: true });
  expect(ws().activeFile()).toMatchObject({ name: 'two.py', content: LANGUAGES.python.template });
});
test('createFile rejects duplicate', () => expect(ws().createFile('MAIN.cpp')).toEqual({ ok: false, error: 'A file with this name already exists' }));
test('renameFile invalid keeps old name', ...);
test('renameFile to own name with different case is allowed', ...);
test('setActiveLanguage renames extension', () => { ws().setActiveLanguage('java'); expect(ws().activeFile()!.name).toBe('main.java'); });
test('setActiveLanguage uses uniqueName on clash', ...);
test('closeTab active → activates neighbour; last → activeId null', ...);
test('deleteFile removes from files and tabs; deleting last leaves files [] and activeId null', ...);
test('updateContent sets saveStatus to saving', ...);

// autosave.test.ts (vi.useFakeTimers)
test('debounces 500ms then saves and sets saved', () => {
  startAutosave(); ws().updateContent(id, 'a'); ws().updateContent(id, 'ab');
  vi.advanceTimersByTime(499); expect(setItemSpy).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(setItemSpy).toHaveBeenCalledTimes(1); expect(ws().saveStatus).toBe('saved');
});
test('visibilitychange hidden flushes immediately', ...);
test('save failure → saveStatus error', ...);
```

- [ ] **Step 2: Run** `npm test -- storage workspace autosave`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use `crypto.randomUUID()` for ids. Initialise the store from `loadWorkspace()`. Write the schema check by hand (no zod). `closeTab` activates the tab to the right, otherwise the one to the left.
- [ ] **Step 4: Run** `npm test -- storage workspace autosave`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "save files automatically in the browser"`

---

### Task 5: Glow primitives and app shell layout

**Files:**
- Create: `src/components/glow/ShimmerButton.tsx`, `src/components/glow/GlowBorder.tsx`, `src/components/shell/AppShell.tsx`, `TopBar.tsx`, `IconRail.tsx`, `StatusBar.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/shell/AppShell.test.tsx`

**Interfaces:**
- Consumes: `useSettings` (panelLayout), `useWorkspace` (active file name, saveStatus, lastSavedAt), `LANGUAGES` (compilerLabel), `ThemeToggle`
- Produces:
  - `<ShimmerButton loading?: boolean, ...ButtonProps>`. The violet shimmer gradient from the mockup, with a spinner while loading.
  - `<GlowBorder className?>{children}</GlowBorder>`. The rotating conic border (`--glow-angle`).
  - `<AppShell editor={ReactNode} output={ReactNode} onRun={() => void} running={boolean} canRun={boolean} />`
  - `<StatusBar connection: 'no_key' | 'connected' | 'failed' cursor: { line: number; col: number } | null />`

- [ ] **Step 1: Write the failing tests**

```tsx
test('top bar shows active file name and ⌘↵ hint', ...);           // 'main.cpp', '⌘↵' (or 'Ctrl ↵' on non-mac)
test('Run button disabled when canRun=false', ...);
test('rail placeholders show "Coming soon" tooltip on hover', ...); // Files, History, AI
test('status bar shows "Saved just now" / "Saving…" / "Couldn’t save"', ...);
test('status bar shows "No API key" when connection=no_key', ...);
test('below 900px uses vertical panel direction', ...);           // mock matchMedia('(max-width: 899px)')
```

- [ ] **Step 2: Run** `npm test -- AppShell`. Expected: FAIL.
- [ ] **Step 3: Implement.** Match the approved mockup's Glow variant (layout-v2.html, variant 2): a 48px top bar, a 52px icon rail, the shadcn `ResizablePanelGroup` (default 58/42, minimum 25% each, layout saved to `useSettings.panelLayout`, `direction="vertical"` under 900px), and a 28px status bar. The ⌘K bar is a button that opens the command menu (stubbed until Task 9) and collapses into an icon under 900px. The app background uses `--app-glow`. The status bar refreshes "Saved just now" into "Saved 2m ago" via a 30s interval.
- [ ] **Step 4: Run** `npm test -- AppShell`. Expected: PASS.
- [ ] **Step 5: Visual check.** Run `npm run dev`, open it at 1280×1400 in both themes, and compare against the mockup. Fix spacing and colour drift.
- [ ] **Step 6: Commit** `git commit -am "add glow layout with top bar and status bar"`

---

### Task 6: Editor panel with Monaco and file tabs

**Files:**
- Create: `src/components/editor/EditorPanel.tsx`, `FileTabs.tsx`, `FileDialogs.tsx`, `EmptyState.tsx`, `monacoThemes.ts`
- Test: `src/components/editor/FileTabs.test.tsx`, `src/components/editor/FileDialogs.test.tsx`, `src/components/editor/EditorPanel.test.tsx`

**Interfaces:**
- Consumes: `useWorkspace` (all actions), `languageFromFilename`, `useResolvedTheme`
- Produces:
  - `<EditorPanel onCursorChange={(c: { line: number; col: number }) => void} onRunShortcut={() => void} />`
  - `registerGlowThemes(monaco): void`. Defines `glow-dark` and `glow-light`.
  - `openNewFileDialog()` / `openRenameDialog(id)` / `openDeleteDialog(id)`. Exported from FileDialogs via a small zustand UI store, so the command menu can trigger them.

- [ ] **Step 1: Write the failing tests** (mock `@monaco-editor/react` with a `<textarea>` stub that calls `onChange` and `onMount`)

```tsx
test('renders a tab per open file, active tab has the violet dot', ...);
test('clicking a tab activates it; × closes it', ...);
test('+ opens New file dialog; invalid name shows error inline and keeps dialog open', ...);
test('double-click tab opens rename; Enter saves; Escape cancels', ...);
test('delete asks for confirmation via AlertDialog', ...);
test('no active file → EmptyState with "New file" button', ...);
test('typing calls updateContent for active file', ...);
test('editor language follows file extension', ...);   // stub receives language="python" for .py
```

- [ ] **Step 2: Run** `npm test -- editor`. Expected: FAIL.
- [ ] **Step 3: Implement.** Monaco options: `fontFamily: 'Geist Mono'`, `fontSize: 14`, `minimap: { enabled: false }`, `smoothCursorBlinking`/`cursorSmoothCaretAnimation: 'on'`, `padding: { top: 12 }`, `automaticLayout: true`. Bind ⌘/Ctrl+Enter inside Monaco with `editor.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, onRunShortcut)`. Keep one model per file id (via `path={file.id}`) so undo history is kept for each file. The theme colours come from the zinc palette plus the violet/cyan/pink/lime token colours in the mockup. Tab right-click or overflow menu: Rename / Delete.
- [ ] **Step 4: Run** `npm test -- editor`. Expected: PASS.
- [ ] **Step 5: Visual check** in both themes at 1280px: the theme switch repaints Monaco, and the tabs match the mockup.
- [ ] **Step 6: Commit** `git commit -am "add code editor with file tabs"`

---

### Task 7: Run flow, output panel, and settings dialog

**Files:**
- Create: `src/state/run.ts`, `src/components/output/OutputPanel.tsx`, `src/components/settings/SettingsDialog.tsx`
- Modify: `src/App.tsx` (wire everything together and call `startAutosave()` once)
- Test: `src/state/run.test.ts`, `src/components/output/OutputPanel.test.tsx`, `src/components/settings/SettingsDialog.test.tsx`

**Interfaces:**
- Consumes: `CodeRunner`, `RunResult`, `RunnerError`, `createJudge0RapidApiRunner` (Task 3), `useWorkspace.activeFile`, `useSettings.apiKey`, `languageFromFilename`, `ShimmerButton`, `GlowBorder`
- Produces:
  - `useRun` (zustand): `{ state: 'idle' | 'running' | 'done' | 'error'; result: RunResult | null; error: RunnerError | null; connection: 'no_key' | 'connected' | 'failed'; runActiveFile(runner?: CodeRunner): Promise<void> }`
  - `useSettingsDialog` (zustand): `{ open: boolean; reason: 'manual' | 'no_key'; show(reason?): void; hide(): void }`

- [ ] **Step 1: Write the failing tests**

```ts
// run.test.ts (fake CodeRunner)
test('runs active file with its language and empty stdin', ...);
test('ignores a second call while running', ...);
test('no key → opens settings dialog with reason no_key, state error, no runner call', ...);
test('auth/quota error → state error, connection failed, toast called with error.message', ...); // mock sonner toast
test('success → connection connected', ...);
test('no active file → no-op', ...);

// OutputPanel.test.tsx
test('success shows green "Success" badge, stdout, "12 ms", "3.3 MB"', ...);   // 3400 KB → "3.3 MB"
test('compile_error switches to Errors tab and shows compileOutput; badge count 1', ...);
test('time_limit shows amber "Time limit exceeded"', ...);
test('runtime_error shows red badge with statusText and stderr', ...);
test('runner error shows message inline', ...);
test('idle shows hint "Press ⌘↵ to run"', ...);

// SettingsDialog.test.tsx
test('saves trimmed key to settings', ...);
test('reason no_key shows explanation and link to RapidAPI Judge0 CE', ...);  // href https://rapidapi.com/judge0-official/api/judge0-ce
test('key input is type=password with show/hide toggle', ...);
```

- [ ] **Step 2: Run** `npm test -- run OutputPanel SettingsDialog`. Expected: FAIL.
- [ ] **Step 3: Implement.** The default runner is `createJudge0RapidApiRunner({ apiKey: useSettings.getState().apiKey })`, built for each run so key changes apply immediately. The output body is a shadcn `ScrollArea` wrapped in `GlowBorder`, using `whitespace-pre-wrap font-mono`. Badge colours: success green, time_limit amber, everything else red. Add a global ⌘/Ctrl+Enter listener on `window` for when focus is outside Monaco. The settings dialog also opens from the rail's bottom cog icon.
- [ ] **Step 4: Run** `npm test`. Expected: the whole suite passes.
- [ ] **Step 5: Manual end-to-end** (needs a real RapidAPI key from the user). Paste the key, run the default `main.cpp`, then a compile error, an infinite loop (`while(true);`), and a Python file that prints `é`. Check each result renders as specified.
- [ ] **Step 6: Commit** `git commit -am "show run output and add api key settings"`

---

### Task 8: ⌘K command menu

**Files:**
- Create: `src/components/command/CommandMenu.tsx`
- Modify: `src/components/shell/TopBar.tsx` (wire the search button)
- Test: `src/components/command/CommandMenu.test.tsx`

**Interfaces:**
- Consumes: `useWorkspace`, `useRun.runActiveFile`, `useSettings.setTheme`, `useResolvedTheme`, `useSettingsDialog.show`, `openNewFileDialog`

- [ ] **Step 1: Write the failing tests**

```tsx
test('⌘K and Ctrl+K open the menu; clicking the top-bar search opens it', ...);
test('typing filters files fuzzily; Enter opens that file', ...);     // "tw" → two.py
test('commands: New file, Run, Toggle theme, Open settings — each calls its action and closes', ...);
```

- [ ] **Step 2: Run** `npm test -- CommandMenu`. Expected: FAIL.
- [ ] **Step 3: Implement** with shadcn `CommandDialog`. Groups: "Files" (each file with its language icon) and "Actions" (with shortcut hints).
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "add quick search and command menu"`

---

### Task 9: Final polish pass

**Files:**
- Modify: any component, for visual fixes only

- [ ] **Step 1:** Use Playwright to screenshot the app at **1280×1400** and **860×1000**, in dark and in light, in these states: idle, success, compile error, empty state, and with the command menu open. Compare against `layout-v2.html` variant 2 and fix any drift. The light theme must be as polished as the dark one (spec anti-goal).
- [ ] **Step 2:** Turn on reduced motion (`page.emulateMedia({ reducedMotion: 'reduce' })`) and check that the shimmer and the rotating border are static.
- [ ] **Step 3:** Check keyboard-only use: Tab reaches the Run button, the tabs, the theme toggle and settings. Focus rings are visible in both themes.
- [ ] **Step 4:** Run `npm test && npm run build`. Expected: everything passes and the build succeeds.
- [ ] **Step 5: Commit** `git commit -am "polish look in light and dark"`
