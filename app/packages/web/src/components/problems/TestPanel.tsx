import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { CaseResult, ProblemEntry, TestCase, TestRun } from '@dsa/core/problems'
import { cn } from '@/lib/utils'
import { useProblems } from '@/state/problems'

const ORIGIN: Record<TestCase['addedBy'], string | null> = { problem: null, user: 'yours', claude: 'Claude' }

const DOT: Record<CaseResult['status'], string> = {
  pass: 'bg-emerald-500',
  fail: 'bg-red-500',
  error: 'bg-red-500',
  not_run: 'bg-muted-foreground/40',
}

const STATUS_TEXT: Record<CaseResult['status'], string> = {
  pass: 'Passed',
  fail: 'Wrong answer',
  error: 'Crashed or timed out here',
  not_run: 'Didn’t run',
}

function resultFor(run: TestRun | null, index: number): CaseResult | null {
  if (!run) return null
  const at = run.cases.indexOf(index)
  return at === -1 ? null : run.results[at]
}

function Field({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <pre
        className={cn(
          'overflow-x-auto rounded-md border bg-muted/50 px-2.5 py-1.5 font-mono text-[12.5px] whitespace-pre-wrap',
          tone === 'good' && 'border-emerald-500/40 bg-emerald-500/5',
          tone === 'bad' && 'border-red-500/40 bg-red-500/5',
        )}
      >
        {value || ' '}
      </pre>
    </div>
  )
}

function Summary({ run, error }: { run: TestRun | null; error: string | null }) {
  if (error) return <p className="text-[12.5px] text-red-500">Couldn’t run the tests: {error}</p>
  if (!run) return null
  const accepted = run.status === 'success' && run.passed === run.total
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={cn(
            'text-[15px] font-semibold',
            accepted ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
          )}
        >
          {run.statusText}
        </span>
        {run.status !== 'compile_error' && (
          <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
            {run.passed}/{run.total} cases passed{run.timeMs !== null && ` · ${run.timeMs} ms`}
          </span>
        )}
        <span className="text-[11.5px] text-muted-foreground">{run.kind === 'submit' ? 'Submitted' : 'Run'}</span>
      </div>
      {run.errorText && (
        <pre className="max-h-48 overflow-auto rounded-md border border-red-500/40 bg-red-500/5 px-2.5 py-2 font-mono text-[12px] whitespace-pre-wrap text-red-700 dark:text-red-300">
          {run.errorText}
        </pre>
      )}
    </div>
  )
}

function AddCase({ entry, onDone }: { entry: ProblemEntry; onDone(): void }) {
  const { params } = entry.problem
  const [values, setValues] = useState<string[]>(() => params.map(() => ''))
  const [expected, setExpected] = useState('')
  const ready = values.every((v) => v.trim()) && expected.trim()
  return (
    <form
      aria-label="Add a test case"
      className="flex flex-col gap-2.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!ready) return
        void useProblems.getState().addCase({ input: values.map((v) => v.trim()), expected: expected.trim() })
        onDone()
      }}
    >
      {params.map((p, i) => (
        <label key={p.name} className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            {p.name} <span className="font-mono opacity-70">{p.type}</span>
          </span>
          <Input
            id={`case-${p.name}`}
            value={values[i]}
            onChange={(e) => setValues((vs) => vs.map((v, j) => (j === i ? e.target.value : v)))}
            placeholder={p.type.startsWith('vector') ? '[1,2,3]' : p.type === 'string' ? '"abc"' : ''}
            className="h-8 font-mono text-[12.5px]"
          />
        </label>
      ))}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Expected answer</span>
        <Input
          id="case-expected"
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
          className="h-8 font-mono text-[12.5px]"
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!ready}>
          Add case
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export function TestPanel({ entry }: { entry: ProblemEntry }) {
  const testRun = useProblems((s) => s.testRun)
  const testError = useProblems((s) => s.testError)
  const { tests, params } = entry.problem
  const [selected, setSelected] = useState(0)
  const [adding, setAdding] = useState(false)
  const index = Math.min(selected, tests.length - 1)
  const test = tests[index]
  const result = resultFor(testRun, index)

  return (
    <section aria-label="Test cases" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="text-[12.5px] font-medium">Test cases</span>
        <span className="text-[11px] text-muted-foreground">
          Run checks the examples and yours · Submit checks all {tests.length}
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1 [&>div>div]:!block">
        <div className="flex flex-col gap-3 p-3">
          <Summary run={testRun} error={testError} />
          <div role="tablist" aria-label="Cases" className="flex flex-wrap gap-1.5">
            {tests.map((t, i) => {
              const r = resultFor(testRun, i)
              const origin = ORIGIN[t.addedBy] ?? (t.example ? null : 'extra')
              return (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={!adding && i === index}
                  onClick={() => {
                    setSelected(i)
                    setAdding(false)
                  }}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-colors',
                    !adding && i === index ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  {r && (
                    <span className={cn('size-1.5 rounded-full', DOT[r.status])} aria-label={STATUS_TEXT[r.status]} />
                  )}
                  Case {i + 1}
                  {origin && <span className="text-[10.5px] opacity-70">{origin}</span>}
                </button>
              )
            })}
            <Button
              variant="ghost"
              size="sm"
              aria-label="Add a test case"
              aria-pressed={adding}
              onClick={() => setAdding(true)}
              className="h-7 px-2 text-[12px] text-muted-foreground"
            >
              <Plus /> Add
            </Button>
          </div>

          {adding ? (
            <AddCase entry={entry} onDone={() => setAdding(false)} />
          ) : test ? (
            <div className="flex flex-col gap-2.5">
              {result && (
                <span
                  className={cn(
                    'text-[12px] font-medium',
                    result.status === 'pass'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : result.status === 'not_run'
                        ? 'text-muted-foreground'
                        : 'text-red-600 dark:text-red-400',
                  )}
                >
                  {STATUS_TEXT[result.status]}
                </span>
              )}
              {test.input.map((v, i) => (
                <Field key={i} label={params[i]?.name ?? `arg${i + 1}`} value={v} />
              ))}
              {result && (result.status === 'pass' || result.status === 'fail') && (
                <Field label="Your output" value={result.output} tone={result.status === 'pass' ? 'good' : 'bad'} />
              )}
              <Field label="Expected" value={test.expected} />
              {result?.stdout && <Field label="Printed" value={result.stdout} />}
              {test.addedBy === 'user' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelected(Math.max(0, index - 1))
                    void useProblems.getState().removeCase(index)
                  }}
                  className="self-start text-muted-foreground hover:text-red-500"
                >
                  <Trash2 /> Remove this case
                </Button>
              )}
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <X className="size-3.5" aria-hidden /> This problem has no test cases.
            </p>
          )}
        </div>
      </ScrollArea>
    </section>
  )
}
