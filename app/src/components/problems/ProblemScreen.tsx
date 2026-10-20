import { useEffect, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Circle, CloudUpload, ListChecks, Loader2, Play, Sparkles, Trash2 } from 'lucide-react'
import { Markdown } from '@/components/ai/Markdown'
import { registerGlowThemes } from '@/components/editor/monacoThemes'
import { useResolvedTheme } from '@/components/theme/ThemeProvider'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Attempt, Difficulty, ProblemEntry } from '@/lib/problems'
import { cn } from '@/lib/utils'
import { activeProblem, flushProblemsOnUnload, useProblems } from '@/state/problems'
import { useSettings } from '@/state/settings'
import { TestPanel } from './TestPanel'

const DIFFICULTY: Record<Difficulty, { label: string; className: string }> = {
  easy: { label: 'Easy', className: 'text-emerald-600 dark:text-emerald-400' },
  medium: { label: 'Medium', className: 'text-amber-600 dark:text-amber-400' },
  hard: { label: 'Hard', className: 'text-red-600 dark:text-red-400' },
}

const handle = 'transition-colors hover:bg-violet-500/50 data-[separator=active]:bg-violet-500'

function savedLayout(area: string) {
  return useSettings.getState().playgroundLayout[area]
}
const saveLayout = (area: string) => (l: Record<string, number>) => useSettings.getState().setPlaygroundLayout(area, l)

function ProblemRow({ entry, active }: { entry: ProblemEntry; active: boolean }) {
  const [confirming, setConfirming] = useState(false)
  const { title, difficulty } = entry.problem
  return (
    <li
      className={cn(
        'group flex items-center gap-1 rounded-lg pr-1 transition-colors',
        active ? 'bg-violet-500/10 ring-1 ring-violet-500/25 ring-inset' : 'hover:bg-muted',
      )}
      onMouseLeave={() => setConfirming(false)}
    >
      <button
        type="button"
        aria-label={title}
        aria-current={active ? 'true' : undefined}
        onClick={() => void useProblems.getState().open(entry.slug)}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left"
      >
        {entry.solved ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" aria-label="Solved" />
        ) : (
          <Circle className="size-3.5 shrink-0 text-muted-foreground/50" aria-label="Not solved yet" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] text-foreground">{title}</span>
          <span className={cn('block text-[11px]', DIFFICULTY[difficulty].className)}>{DIFFICULTY[difficulty].label}</span>
        </span>
      </button>
      {confirming ? (
        <Button
          size="sm"
          variant="destructive"
          aria-label={`Confirm delete problem: ${title}`}
          onClick={() => void useProblems.getState().remove(entry.slug)}
          className="h-6 px-2 text-[11px]"
        >
          <Check /> Delete
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete problem: ${title}`}
          onClick={() => setConfirming(true)}
          className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-500"
        >
          <Trash2 />
        </Button>
      )}
    </li>
  )
}

function ProblemList() {
  const entries = useProblems((s) => s.entries)
  const activeSlug = useProblems((s) => s.activeSlug)
  const solved = entries.filter((e) => e.solved).length
  return (
    <aside className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <ListChecks className="size-4 text-violet-500" aria-hidden />
        <span className="text-[13px] font-semibold">Problems</span>
        {entries.length > 0 && (
          <span className="ml-auto font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
            {solved}/{entries.length} solved
          </span>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {entries.length ? (
          <ul aria-label="Problems" className="flex flex-col gap-0.5 p-2 pt-0">
            {entries.map((e) => (
              <ProblemRow key={e.slug} entry={e} active={e.slug === activeSlug} />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-[12px] text-muted-foreground">No problems yet.</p>
        )}
      </ScrollArea>
    </aside>
  )
}

const timeAgo = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function AttemptView({ attempt, onBack }: { attempt: Attempt; onBack(): void }) {
  const accepted = attempt.total > 0 && attempt.passed === attempt.total
  return (
    <div className="flex flex-col gap-3 p-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="self-start">
        <ArrowLeft /> All submissions
      </Button>
      <div className="flex items-baseline gap-2">
        <span className={cn('text-[15px] font-semibold', accepted ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
          {attempt.statusText}
        </span>
        <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
          {attempt.passed}/{attempt.total} cases
        </span>
      </div>
      <span className="text-[12px] text-muted-foreground">{timeAgo(attempt.at)}</span>
      <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-[12px] leading-relaxed">{attempt.code}</pre>
    </div>
  )
}

function Submissions() {
  const attempts = useProblems((s) => s.attempts)
  const [open, setOpen] = useState<Attempt | null>(null)
  if (open) return <AttemptView attempt={open} onBack={() => setOpen(null)} />
  if (!attempts.length) {
    return <p className="p-4 text-[12.5px] text-muted-foreground">No submissions yet. Submit runs every test case and saves your code here.</p>
  }
  return (
    <ul aria-label="Submissions" className="flex flex-col gap-0.5 p-2">
      {attempts.map((a) => {
        const accepted = a.total > 0 && a.passed === a.total
        return (
          <li key={a.at}>
            <button
              type="button"
              onClick={() => setOpen(a)}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-muted"
            >
              <span className={cn('w-36 shrink-0 text-[12.5px] font-medium', accepted ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                {a.statusText}
              </span>
              <span className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
                {a.passed}/{a.total}
              </span>
              <span className="ml-auto text-[11.5px] text-muted-foreground">{timeAgo(a.at)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function DescriptionPanel({ entry }: { entry: ProblemEntry }) {
  const [tab, setTab] = useState<'description' | 'submissions'>('description')
  const attempts = useProblems((s) => s.attempts.length)
  const { problem } = entry
  return (
    <section aria-label="Problem description" className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" className="flex gap-1 border-b px-2 pt-1.5">
        {(['description', 'submissions'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              '-mb-px border-b-2 px-2.5 py-1.5 text-[12.5px] capitalize transition-colors',
              tab === t ? 'border-violet-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t}
            {t === 'submissions' && attempts > 0 && <span className="ml-1 text-muted-foreground tabular-nums">{attempts}</span>}
          </button>
        ))}
      </div>
      <ScrollArea className="min-h-0 flex-1 [&>div>div]:!block">
        {tab === 'description' ? (
          <div className="flex flex-col gap-3 p-4">
            <h1 className="text-[18px] leading-tight font-semibold text-balance">{problem.title}</h1>
            <div className="flex items-center gap-3 text-[12px]">
              <span className={cn('rounded-full bg-muted px-2 py-0.5 font-medium', DIFFICULTY[problem.difficulty].className)}>
                {DIFFICULTY[problem.difficulty].label}
              </span>
              {entry.solved && (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5" aria-hidden /> Solved
                </span>
              )}
            </div>
            <div className="text-[13.5px] leading-relaxed">
              <Markdown>{problem.description}</Markdown>
            </div>
          </div>
        ) : (
          <Submissions />
        )}
      </ScrollArea>
    </section>
  )
}

const SAVE_TEXT = { saved: 'Saved', pending: 'Saving…', saving: 'Saving…', error: 'Couldn’t save' } as const

function SolutionEditor({ entry }: { entry: ProblemEntry }) {
  const theme = useResolvedTheme()
  const saveStatus = useProblems((s) => s.saveStatus)
  const testing = useProblems((s) => s.testing)

  const onMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => void useProblems.getState().test('run'))
    void document.fonts.ready.then(() => monaco.editor.remeasureFonts())
    editor.focus()
  }

  return (
    <section aria-label="Solution" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="font-mono text-[12px]">solution.cpp</span>
        <span
          className={cn('flex items-center gap-1 text-[11px]', saveStatus === 'error' ? 'text-red-500' : 'text-muted-foreground')}
          aria-live="polite"
        >
          {saveStatus === 'error' && <AlertTriangle className="size-3" aria-hidden />}
          {SAVE_TEXT[saveStatus]}
        </span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" disabled={testing !== null} onClick={() => void useProblems.getState().test('run')}>
            {testing === 'run' ? <Loader2 className="animate-spin" /> : <Play />} Run
          </Button>
          <Button
            size="sm"
            disabled={testing !== null}
            onClick={() => void useProblems.getState().test('submit')}
            className="bg-emerald-600 text-white hover:bg-emerald-600/90"
          >
            {testing === 'submit' ? <Loader2 className="animate-spin" /> : <CloudUpload />} Submit
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 bg-card">
        <Editor
          path={`problem:${entry.slug}/solution.cpp`}
          language="cpp"
          value={entry.solution}
          onChange={(v) => useProblems.getState().editSolution(v ?? '')}
          theme={theme === 'dark' ? 'glow-dark' : 'glow-light'}
          beforeMount={registerGlowThemes}
          onMount={onMount}
          loading={<Loader2 className="size-5 animate-spin text-muted-foreground" />}
          options={{
            fontFamily: "'Geist Mono', ui-monospace, monospace",
            fontSize: 14,
            lineHeight: 0,
            fontLigatures: true,
            minimap: { enabled: false },
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            padding: { top: 12, bottom: 12 },
            scrollBeyondLastLine: false,
            renderLineHighlight: 'all',
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            automaticLayout: true,
            tabSize: 4,
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false },
          }}
        />
      </div>
    </section>
  )
}

function Empty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-violet-500/10 text-violet-500">
        <ListChecks className="size-6" aria-hidden />
      </span>
      <div className="max-w-md space-y-1.5">
        <p className="text-[15px] font-medium">Solve problems LeetCode style</p>
        <p className="text-[13px] text-muted-foreground">
          Paste a question into Claude, or send a screenshot of it, from LeetCode, codehelp or anywhere. Claude sets it up here
          with the description, a <code className="font-mono">class Solution</code> to fill in, and test cases that check
          themselves.
        </p>
      </div>
      <Button variant="outline" onClick={() => useSettings.getState().setAiOpen(true)}>
        <Sparkles /> Ask Claude
      </Button>
    </div>
  )
}

/** LeetCode-style practice: problem list, description, solution editor and test cases. */
export function ProblemScreen() {
  const entry = useProblems(activeProblem)
  const status = useProblems((s) => s.status)

  useEffect(() => {
    void useProblems.getState().load()
    window.addEventListener('beforeunload', flushProblemsOnUnload)
    return () => {
      window.removeEventListener('beforeunload', flushProblemsOnUnload)
      void useProblems.getState().flush()
    }
  }, [])

  return (
    <main aria-label="Problem" className="flex min-h-0 min-w-0 flex-1">
      {/* Remounts when a problem appears or goes, since the panels differ. */}
      <ResizablePanelGroup
        key={entry ? 'problem' : 'empty'}
        orientation="horizontal"
        defaultLayout={entry ? (savedLayout('problem-outer') ?? { list: 16, description: 38, work: 46 }) : { list: 16, empty: 84 }}
        onLayoutChanged={(l) => entry && saveLayout('problem-outer')(l)}
        className="min-h-0 min-w-0 flex-1"
      >
        <ResizablePanel id="list" minSize="10" maxSize="35" className="flex min-h-0 flex-col">
          <ProblemList />
        </ResizablePanel>
        <ResizableHandle withHandle className={handle} />
        {entry ? (
          <>
            <ResizablePanel id="description" minSize="20" className="flex min-h-0 min-w-0 flex-col">
              <DescriptionPanel key={entry.slug} entry={entry} />
            </ResizablePanel>
            <ResizableHandle withHandle className={handle} />
            <ResizablePanel id="work" minSize="25" className="flex min-h-0 min-w-0 flex-col">
              <ResizablePanelGroup
                orientation="vertical"
                defaultLayout={savedLayout('problem-work') ?? { editor: 60, tests: 40 }}
                onLayoutChanged={saveLayout('problem-work')}
                className="min-h-0 flex-1"
              >
                <ResizablePanel id="editor" minSize="20" className="flex min-h-0 flex-col">
                  <SolutionEditor entry={entry} />
                </ResizablePanel>
                <ResizableHandle withHandle className={handle} />
                <ResizablePanel id="tests" minSize="15" className="flex min-h-0 flex-col">
                  <TestPanel key={entry.slug} entry={entry} />
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </>
        ) : (
          <ResizablePanel id="empty" minSize="40" className="flex min-h-0 min-w-0 flex-col">
            {status === 'loading' ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Loading problems…
              </div>
            ) : status === 'error' ? (
              <p className="m-auto text-[13px] text-red-500">Couldn’t load the problems folder. Is the editor server running?</p>
            ) : (
              <Empty />
            )}
          </ResizablePanel>
        )}
      </ResizablePanelGroup>
    </main>
  )
}
