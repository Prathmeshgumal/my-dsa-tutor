import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Clock, Cpu, Loader2, Square, Terminal } from 'lucide-react'
import { GlowBorder } from '@/components/glow/GlowBorder'
import { Kbd } from '@/components/Kbd'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { shortcut } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { useRun, type TerminalChunk } from '@/state/run'
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

/**
 * The run as a terminal shows it. While the program runs, you type on its last line and Enter sends the
 * line to the program, the way the VS Code terminal does.
 */
function TerminalView({ chunks, live }: { chunks: TerminalChunk[]; live: boolean }) {
  const [line, setLine] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const end = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (live) input.current?.focus()
  }, [live])
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'nearest' })
  }, [chunks])

  return (
    <GlowBorder className="flex min-h-0 flex-1 flex-col">
      <div className="px-3.5 pt-3 text-[11px] font-medium tracking-wider text-muted-foreground/70 uppercase">
        terminal
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <pre
          data-testid="stdout"
          // Clicking anywhere in the terminal puts the cursor back on the input line.
          onClick={() => live && window.getSelection()?.isCollapsed !== false && input.current?.focus()}
          className="px-3.5 pt-1.5 pb-3.5 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words"
        >
          {chunks.map((c, i) => (
            <span
              key={i}
              data-kind={c.kind}
              className={cn(
                c.kind === 'input' && 'text-violet-600 dark:text-violet-400',
                c.kind === 'stderr' && 'text-red-600 dark:text-red-400',
              )}
            >
              {c.text}
            </span>
          ))}
          {!live && !chunks.length && <span className="text-muted-foreground italic">(no output)</span>}
          {live && (
            <input
              ref={input}
              aria-label="Type input for the program"
              value={line}
              onChange={(e) => setLine(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                useRun.getState().sendInput(line)
                setLine('')
              }}
              spellCheck={false}
              autoComplete="off"
              className="inline w-[min(100%,24ch)] bg-transparent text-violet-600 caret-violet-500 outline-none dark:text-violet-400"
            />
          )}
          <span ref={end} />
        </pre>
      </ScrollArea>
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
  const { state, result, error, phase, terminal } = useRun()
  const [tab, setTab] = useState('output')
  const errorText = result ? result.compileOutput || result.stderr : ''
  const errorCount = errorText ? 1 : 0

  useEffect(() => {
    // Failed runs open on their errors, if there are any to read (a stopped run has none).
    const failed = result?.status === 'compile_error' || result?.status === 'runtime_error'
    if (result) setTab(failed && errorText ? 'errors' : 'output')
  }, [result, errorText])
  // A new run shows its terminal, so you see what it asks for.
  useEffect(() => {
    if (state === 'running') setTab('output')
  }, [state])

  const badge = result && badgeFor(result)

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
        </TabsList>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
        {state === 'idle' && (
          <Placeholder>
            <Terminal className="size-5 text-violet-500" aria-hidden />
            <p>
              Press <Kbd>{shortcut('↵')}</Kbd> to run
            </p>
          </Placeholder>
        )}

        {state === 'running' && phase !== 'running' && (
          <Placeholder>
            <Loader2 className="size-5 animate-spin text-violet-500" aria-hidden />
            <p>{phase === 'compiling' ? 'Compiling…' : 'Running…'}</p>
          </Placeholder>
        )}

        {state === 'running' && phase === 'running' && (
          <>
            <div className="mb-3.5 flex shrink-0 items-center gap-2.5">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-violet-500" aria-hidden />
                Running — type below and press Enter when it asks for input
              </span>
              <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => useRun.getState().stop()}>
                <Square className="size-3" aria-hidden /> Stop
              </Button>
            </div>
            <TerminalView chunks={terminal} live />
          </>
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
              {terminal.length ? (
                <TerminalView chunks={terminal} live={false} />
              ) : (
                <Terminalbox label="stdout" testId="stdout">
                  {result.stdout || <span className="text-muted-foreground italic">(no output)</span>}
                </Terminalbox>
              )}
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
      </div>
    </Tabs>
  )
}
