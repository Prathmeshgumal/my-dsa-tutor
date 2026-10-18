import { useEffect, useState } from 'react'
import { AlertCircle, Clock, Cpu, KeyRound, Loader2, Terminal } from 'lucide-react'
import { GlowBorder } from '@/components/glow/GlowBorder'
import { Kbd } from '@/components/Kbd'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { shortcut } from '@/lib/platform'
import type { RunResult } from '@/lib/runner/types'
import { cn } from '@/lib/utils'
import { useRun } from '@/state/run'
import { useSettingsDialog } from '@/state/settingsDialog'

type Tone = 'success' | 'warning' | 'error'

function badgeFor(result: RunResult): { tone: Tone; label: string } {
  switch (result.status) {
    case 'success':
      return { tone: 'success', label: 'Success' }
    case 'time_limit':
      return { tone: 'warning', label: 'Time limit exceeded' }
    case 'compile_error':
      return { tone: 'error', label: 'Compilation error' }
    default:
      return { tone: 'error', label: result.statusText }
  }
}

const TONE_CLASSES: Record<Tone, string> = {
  success: 'border-green-500/25 bg-green-500/12 text-green-600 dark:text-green-400',
  warning: 'border-amber-500/30 bg-amber-500/12 text-amber-600 dark:text-amber-400',
  error: 'border-red-500/30 bg-red-500/12 text-red-600 dark:text-red-400',
}

function formatMemory(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`
}

function Terminalbox({ label, testId, children }: { label: string; testId: string; children: React.ReactNode }) {
  return (
    <GlowBorder className="flex min-h-0 flex-1 flex-col">
      <div className="px-3.5 pt-3 text-[11px] font-medium tracking-wider text-muted-foreground/70 uppercase">{label}</div>
      <ScrollArea className="min-h-0 flex-1">
        <pre data-testid={testId} className="px-3.5 pt-1.5 pb-3.5 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words">
          {children}
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
  const { state, result, error } = useRun()
  const [tab, setTab] = useState('output')
  const errorText = result ? result.compileOutput || result.stderr : ''
  const errorCount = errorText ? 1 : 0

  useEffect(() => {
    if (result) setTab(result.status === 'compile_error' || result.status === 'runtime_error' ? 'errors' : 'output')
  }, [result])

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
              <span
                data-testid="status-badge"
                data-tone={badge.tone}
                className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', TONE_CLASSES[badge.tone])}
              >
                <span className="size-1.5 rounded-full bg-current" aria-hidden />
                {badge.label}
              </span>
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
      </div>
    </Tabs>
  )
}
