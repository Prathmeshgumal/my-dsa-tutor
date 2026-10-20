import { useEffect, useState } from 'react'
import { AlertCircle, Clock, Cpu, Keyboard, KeyRound, Loader2, Terminal } from 'lucide-react'
import { GlowBorder } from '@/components/glow/GlowBorder'
import { Kbd } from '@/components/Kbd'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { shortcut } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { useRun } from '@/state/run'
import { useSettingsDialog } from '@/state/settingsDialog'
import { languageFromFilename } from '@/lib/languages'
import { readsInput, useStdin } from '@/state/stdin'
import { useWorkspace } from '@/state/workspace'
import { badgeFor, ToneBadge } from './ResultBadge'

function formatMemory(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`
}

function Terminalbox({ label, testId, children }: { label: string; testId: string; children: React.ReactNode }) {
  return (
    <GlowBorder className="flex min-h-0 flex-1 flex-col">
      <div className="px-3.5 pt-3 text-[11px] font-medium tracking-wider text-muted-foreground/70 uppercase">
        {label}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <pre
          data-testid={testId}
          className="px-3.5 pt-1.5 pb-3.5 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words"
        >
          {children}
        </pre>
      </ScrollArea>
    </GlowBorder>
  )
}

/** What the program reads (stdin). It's given before the run starts; the program can't wait for typing. */
function InputBox({ fileId }: { fileId: string | null }) {
  const text = useStdin((s) => (fileId ? (s.inputs[fileId] ?? '') : ''))
  if (!fileId) return <Placeholder>Open a file to give its program some input.</Placeholder>
  return (
    <GlowBorder className="flex min-h-0 flex-1 flex-col">
      <label
        htmlFor="program-input"
        className="px-3.5 pt-3 text-[11px] font-medium tracking-wider text-muted-foreground/70 uppercase"
      >
        stdin
      </label>
      <textarea
        id="program-input"
        aria-label="Program input"
        value={text}
        onChange={(e) => useStdin.getState().setInput(fileId, e.target.value)}
        spellCheck={false}
        placeholder={
          'Everything your program reads with cin goes here, before you press Run.\nFor example, for a 2 × 3 array:\n1 2 3\n4 5 6'
        }
        className="min-h-0 flex-1 resize-none bg-transparent px-3.5 pt-1.5 pb-3.5 font-mono text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
      />
    </GlowBorder>
  )
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-[13px] text-muted-foreground">
      {children}
    </div>
  )
}

export function OutputPanel() {
  const { state, result, error, lastStdin } = useRun()
  const [tab, setTab] = useState('output')
  const errorText = result ? result.compileOutput || result.stderr : ''
  const errorCount = errorText ? 1 : 0

  useEffect(() => {
    if (result) setTab(result.status === 'compile_error' || result.status === 'runtime_error' ? 'errors' : 'output')
  }, [result])

  const badge = result && badgeFor(result)
  const file = useWorkspace((s) => s.files.find((f) => f.id === s.activeId) ?? null)
  const input = useStdin((s) => (file ? (s.inputs[file.id] ?? '') : ''))
  const language = file && languageFromFilename(file.name)
  // The program reads input but got none: every read fails at once, which looks like a broken run.
  const missingInput = Boolean(file && language && !input.trim() && readsInput(file.content, language.id))

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="flex shrink-0 items-center gap-3 px-3 py-2.5">
        <TabsList className="h-8">
          <TabsTrigger value="output" className="px-3 text-[12.5px]">
            Output
          </TabsTrigger>
          <TabsTrigger value="errors" className="gap-1.5 px-3 text-[12.5px]">
            Errors
            <span
              className={cn(
                'rounded px-1.5 text-[10.5px] tabular-nums',
                errorCount ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-border text-muted-foreground',
              )}
            >
              {errorCount}
            </span>
          </TabsTrigger>
          <TabsTrigger value="input" className="gap-1.5 px-3 text-[12.5px]">
            Input
            {input.trim() && <span aria-label="has input" className="size-1.5 rounded-full bg-violet-500" />}
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
        {tab === 'input' ? (
          <InputBox fileId={file?.id ?? null} />
        ) : (
          <>
            {missingInput && state !== 'running' && (
              <div
                role="note"
                className="mb-3 flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-200"
              >
                <Keyboard className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  Your code reads input, but the Input box is empty. The program can’t wait for you to type, so give it
                  the values first.
                </span>
                <Button size="sm" variant="outline" className="h-7" onClick={() => setTab('input')}>
                  Add input
                </Button>
              </div>
            )}
            {state === 'idle' && (
              <Placeholder>
                <Terminal className="size-5 text-violet-500" aria-hidden />
                <p>
                  Press <Kbd>{shortcut('↵')}</Kbd> to run
                </p>
              </Placeholder>
            )}

            {state === 'running' && (
              <Placeholder>
                <Loader2 className="size-5 animate-spin text-violet-500" aria-hidden />
                <p>Running…</p>
              </Placeholder>
            )}

            {state === 'error' && error && (
              <Placeholder>
                <div
                  role="alert"
                  className="flex max-w-sm items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-left text-red-700 dark:text-red-300"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {error.message}
                </div>
                {(error.kind === 'no_key' || error.kind === 'auth') && (
                  <Button size="sm" variant="outline" onClick={() => useSettingsDialog.getState().show()}>
                    <KeyRound /> Open settings
                  </Button>
                )}
              </Placeholder>
            )}

            {state === 'done' && result && badge && (
              <>
                <div className="mb-3.5 flex shrink-0 flex-wrap items-center gap-2.5">
                  <ToneBadge testId="status-badge" tone={badge.tone} label={badge.label} />
                  {result.timeMs !== null && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3.5" aria-hidden />
                      <span className="font-medium text-foreground">{`${result.timeMs} ms`}</span>
                    </span>
                  )}
                  {result.memoryKb !== null && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Cpu className="size-3.5" aria-hidden />
                      <span className="font-medium text-foreground">{formatMemory(result.memoryKb)}</span>
                    </span>
                  )}
                </div>
                <TabsContent value="output" className="flex min-h-0 flex-1 flex-col">
                  {lastStdin.trim() && (
                    <p data-testid="stdin-used" className="mb-2 flex shrink-0 items-baseline gap-2 text-[12px] text-muted-foreground">
                      <span className="shrink-0" title="Input is given before the run, so it isn’t repeated in the output">
                        Input given:
                      </span>
                      <code className="min-w-0 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-foreground">
                        {lastStdin.trim().replace(/\s*\n\s*/g, ' ⏎ ')}
                      </code>
                    </p>
                  )}
                  <Terminalbox label="stdout" testId="stdout">
                    {result.stdout || <span className="text-muted-foreground italic">(no output)</span>}
                  </Terminalbox>
                </TabsContent>
                <TabsContent value="errors" className="flex min-h-0 flex-1 flex-col">
                  <Terminalbox label={result.compileOutput ? 'compiler' : 'stderr'} testId="errors">
                    {errorText ? (
                      <span className="text-red-600 dark:text-red-400">{errorText}</span>
                    ) : (
                      <span className="text-muted-foreground italic">No errors</span>
                    )}
                  </Terminalbox>
                </TabsContent>
              </>
            )}
          </>
        )}
      </div>
    </Tabs>
  )
}
