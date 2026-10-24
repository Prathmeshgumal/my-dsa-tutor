import { useEffect, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CloudUpload,
  ExternalLink,
  ListChecks,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react'
import { Markdown } from '@/components/ai/Markdown'
import { registerGlowThemes } from '@/components/editor/monacoThemes'
import { useResolvedTheme } from '@/components/theme/ThemeProvider'
import { ListPane, ListRow } from '@/components/shell/ListPane'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  codeOf,
  isWebLink,
  linkLabel,
  SOLUTION_FILE,
  starterCode,
  type Difficulty,
  type ProblemEntry,
} from '@dsa/core/problems'
import { cn } from '@/lib/utils'
import { activeProblem, flushProblemsOnUnload, useProblems } from '@/state/problems'
import { useListVisible } from '@/state/sections'
import { useSettings } from '@/state/settings'
import { useAiChat } from '@/state/aiChat'
import { useNotes } from '@/state/notes'
import { usePlayground } from '@/state/playground'
import { Related } from './Related'
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

function ProblemList() {
  const entries = useProblems((s) => s.entries)
  const newer = useProblems((s) => s.newer)
  const activeSlug = useProblems((s) => s.activeSlug)
  const [deleting, setDeleting] = useState<ProblemEntry | null>(null)
  return (
    <>
      <ListPane
        title="Problems"
        count={entries.length}
        search
        empty="No problems yet. Paste a question into the Claude panel and ask it to make a problem."
        footer={
          newer.length > 0 && (
            <p className="px-4 pb-4 text-[12px] text-amber-600 dark:text-amber-400">
              Not shown: {newer.join(', ')}. A newer version of the editor saved {newer.length === 1 ? 'it' : 'them'};
              update the editor to open {newer.length === 1 ? 'it' : 'them'}.
            </p>
          )
        }
      >
        {entries.map((e) => (
          <ListRow
            key={e.slug}
            icon={e.solved ? <CheckCircle2 className="text-emerald-500" /> : <Circle className="text-muted-foreground/50" />}
            title={e.problem.title}
            meta={
              <>
                <span className={DIFFICULTY[e.problem.difficulty].className}>{DIFFICULTY[e.problem.difficulty].label}</span>
                <span className="sr-only">{e.solved ? ', solved' : ', not solved yet'}</span>
              </>
            }
            active={e.slug === activeSlug}
            onOpen={() => void useProblems.getState().open(e.slug)}
            actions={[{ label: 'Delete', destructive: true, onSelect: () => setDeleting(e) }]}
          />
        ))}
      </ListPane>
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.problem.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the problem, its code and its submissions from problems/. You can’t undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) void useProblems.getState().remove(deleting.slug)
                setDeleting(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** An icon that opens the question on the site it came from: "LC" for LeetCode, else the site's name. Claude adds the
 * link when it knows where the question is from. Only web addresses become links, so a saved "javascript:" can't run. */
function QuestionLink({ link }: { link: string | undefined }) {
  if (!link || !isWebLink(link)) return null
  const site = linkLabel(link)
  return (
    <a
      href={link}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open on ${site}`}
      title={`Open on ${site}`}
      className={cn(
        'ml-auto flex h-6 items-center gap-1 rounded-md border px-1.5 font-semibold transition-colors hover:bg-muted',
        site === 'LeetCode' ? 'text-[#ffa116]' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {site === 'LeetCode' ? (
        'LC'
      ) : (
        <>
          {site} <ExternalLink className="size-3" aria-hidden />
        </>
      )}
    </a>
  )
}

type Tab = 'description' | 'related'

const TAB_LABEL: Record<Tab, string> = { description: 'Description', related: 'Related' }

function DescriptionPanel({ entry }: { entry: ProblemEntry }) {
  const [tab, setTab] = useState<Tab>('description')
  const attempts = useProblems((s) => s.attempts.length)
  // Selectors return numbers, not new arrays, so the panel doesn't re-render forever.
  const linkedNotes = entry.problem.notes ?? []
  const counts: Partial<Record<Tab, number>> = {
    related:
      useNotes((s) => s.notes.filter((n) => linkedNotes.includes(n.name)).length) +
      usePlayground((s) => s.runs.filter((r) => r.problem === entry.slug).length) +
      useAiChat((s) => s.chats.filter((c) => c.problemSlug === entry.slug).length) +
      attempts,
  }
  const { problem } = entry
  return (
    <section aria-label="Problem description" className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" className="flex shrink-0 overflow-x-auto border-b px-1.5 pt-1.5 [scrollbar-width:none]">
        {(['description', 'related'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-2 py-1.5 text-[12.5px] whitespace-nowrap transition-colors',
              tab === t
                ? 'border-violet-500 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {TAB_LABEL[t]}
            {!!counts[t] && <span className="ml-1 text-muted-foreground tabular-nums">{counts[t]}</span>}
          </button>
        ))}
      </div>
      <ScrollArea role="tabpanel" aria-label={TAB_LABEL[tab]} className="min-h-0 flex-1 [&>div>div]:!block">
        {tab === 'description' ? (
          <div className="flex flex-col gap-3 p-4">
            <h1 className="text-[18px] leading-tight font-semibold text-balance">{problem.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-[12px]">
              <span
                className={cn(
                  'rounded-full bg-muted px-2 py-0.5 font-medium',
                  DIFFICULTY[problem.difficulty].className,
                )}
              >
                {DIFFICULTY[problem.difficulty].label}
              </span>
              {entry.solved && (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5" aria-hidden /> Solved
                </span>
              )}
              <QuestionLink link={problem.link} />
            </div>
            <div className="text-[13.5px] leading-relaxed">
              <Markdown>{problem.description}</Markdown>
            </div>
          </div>
        ) : (
          <Related entry={entry} />
        )}
      </ScrollArea>
    </section>
  )
}

const SAVE_TEXT = { saved: 'Saved', pending: 'Saving…', saving: 'Saving…', error: 'Couldn’t save' } as const

/** solution.cpp and any other versions (brute force, optimal…); + copies the open one. */
function FileTabs({ entry }: { entry: ProblemEntry }) {
  const activeFile = useProblems((s) => s.activeFile)
  const [confirming, setConfirming] = useState<string | null>(null)
  const names = [SOLUTION_FILE, ...entry.versions.map((v) => v.name)]
  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <div
        role="tablist"
        aria-label="Code files"
        className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]"
      >
        {names.map((name) => (
          <span
            key={name}
            className={cn(
              'group flex shrink-0 items-center rounded-md',
              name === activeFile ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60',
            )}
            onMouseLeave={() => setConfirming(null)}
          >
            <button
              type="button"
              role="tab"
              aria-selected={name === activeFile}
              onClick={() => void useProblems.getState().selectFile(name)}
              className="px-2 py-0.5 font-mono text-[12px]"
            >
              {name}
            </button>
            {name !== SOLUTION_FILE &&
              (confirming === name ? (
                <button
                  type="button"
                  aria-label={`Confirm delete ${name}`}
                  onClick={() => void useProblems.getState().deleteVersion(name)}
                  className="mr-1 rounded bg-red-500 px-1.5 text-[10.5px] text-white"
                >
                  Delete
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={`Delete ${name}`}
                  onClick={() => setConfirming(name)}
                  className="mr-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:text-red-500 focus-visible:opacity-100"
                >
                  <X className="size-3" />
                </button>
              ))}
          </span>
        ))}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="New version"
            onClick={() => void useProblems.getState().newVersion()}
            className="shrink-0 text-muted-foreground"
          >
            <Plus />
          </Button>
        </TooltipTrigger>
        <TooltipContent>New version (a copy of this code, e.g. to try another approach)</TooltipContent>
      </Tooltip>
    </div>
  )
}

/** LeetCode's reset: the open file goes back to the code the problem started with, after a second click. */
function ResetCode({ entry }: { entry: ProblemEntry }) {
  const activeFile = useProblems((s) => s.activeFile)
  const [confirming, setConfirming] = useState(false)
  const canReset = starterCode(entry, activeFile) !== null
  if (confirming) {
    return (
      <Button
        size="sm"
        variant="destructive"
        aria-label="Confirm reset code"
        onMouseLeave={() => setConfirming(false)}
        onBlur={() => setConfirming(false)}
        onClick={() => {
          setConfirming(false)
          void useProblems.getState().resetCode()
        }}
      >
        <RotateCcw /> Reset {activeFile}?
      </Button>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The span keeps the tooltip working while the button is disabled. */}
        <span tabIndex={canReset ? undefined : 0}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reset code"
            disabled={!canReset}
            onClick={() => setConfirming(true)}
            className="text-muted-foreground"
          >
            <RotateCcw />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {canReset
          ? 'Reset to the starting code (Ctrl+Z in the editor undoes it)'
          : 'Can’t work out the starting code: the method the tests call isn’t in your code'}
      </TooltipContent>
    </Tooltip>
  )
}

function SolutionEditor({ entry }: { entry: ProblemEntry }) {
  const theme = useResolvedTheme()
  const activeFile = useProblems((s) => s.activeFile)
  const saveStatus = useProblems((s) => s.saveStatus)
  const testing = useProblems((s) => s.testing)

  const onMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => void useProblems.getState().test('run'))
    void document.fonts.ready.then(() => monaco.editor.remeasureFonts())
    editor.focus()
  }

  return (
    <section aria-label="Solution" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <FileTabs entry={entry} />
        <span
          className={cn(
            'flex shrink-0 items-center gap-1 text-[11px]',
            saveStatus === 'error' ? 'text-red-500' : 'text-muted-foreground',
          )}
          aria-live="polite"
        >
          {saveStatus === 'error' && <AlertTriangle className="size-3" aria-hidden />}
          {SAVE_TEXT[saveStatus]}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ResetCode key={`${entry.slug}/${activeFile}`} entry={entry} />
          <Button
            size="sm"
            variant="outline"
            disabled={testing !== null}
            onClick={() => void useProblems.getState().test('run')}
          >
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
          path={`problem:${entry.slug}/${activeFile}`}
          language="cpp"
          value={codeOf(entry, activeFile) ?? ''}
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
          Paste a question into Claude, or send a screenshot of it, from LeetCode, codehelp or anywhere. Claude sets it
          up here with the description, a <code className="font-mono">class Solution</code> to fill in, and test cases
          that check themselves.
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
  const listShown = useListVisible('problems')

  useEffect(() => {
    void useProblems.getState().load()
    // For the problem's Notes and Dry runs tabs (not reloaded if already there, so unsaved typing is kept).
    if (useNotes.getState().status === 'idle') void useNotes.getState().load()
    if (usePlayground.getState().status === 'idle') void usePlayground.getState().load()
    window.addEventListener('beforeunload', flushProblemsOnUnload)
    return () => {
      window.removeEventListener('beforeunload', flushProblemsOnUnload)
      void useProblems.getState().flush()
    }
  }, [])

  return (
    <>
      {listShown && <ProblemList />}
      <main aria-label="Problem" className="flex min-h-0 min-w-0 flex-1">
      {/* Remounts when a problem appears or goes, since the panels differ. */}
      <ResizablePanelGroup
        key={entry ? 'problem' : 'empty'}
        orientation="horizontal"
        defaultLayout={
          entry
            ? (savedLayout('problem-main') ?? { description: 45, work: 55 })
            : { empty: 100 }
        }
        onLayoutChanged={(l) => entry && saveLayout('problem-main')(l)}
        className="min-h-0 min-w-0 flex-1"
      >
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
              <p className="m-auto text-[13px] text-red-500">
                Couldn’t load the problems folder. Is the editor server running?
              </p>
            ) : (
              <Empty />
            )}
          </ResizablePanel>
        )}
      </ResizablePanelGroup>
      </main>
    </>
  )
}
