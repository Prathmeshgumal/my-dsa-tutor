import type { RunResult } from '@dsa/core/runner/types'
import { cn } from '@/lib/utils'

export type Tone = 'success' | 'warning' | 'error'

export function badgeFor(result: RunResult): { tone: Tone; label: string } {
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

/** Coloured pill with a dot, e.g. "● Success". */
export function ToneBadge({
  tone,
  label,
  testId,
  className,
}: {
  tone: Tone
  label: string
  testId?: string
  className?: string
}) {
  return (
    <span
      data-testid={testId}
      data-tone={tone}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      <span>{label}</span>
    </span>
  )
}
