import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { Popover, Slider } from 'radix-ui'
import { cn } from '@/lib/utils'
import { EFFORT_LABEL, EFFORTS, nearestEffort, splitModels, useModels, type ClaudeModel } from '@/state/models'
import { useSettings } from '@/state/settings'

/** The chip in the message box that picks Claude's model and effort, like claude.ai's. The list comes from the
 * Claude Code engine. Until something is picked, nothing is sent and Claude Code's defaults apply. */
export function ModelPicker() {
  const claudeModel = useSettings((s) => s.claudeModel)
  const claudeEffort = useSettings((s) => s.claudeEffort)
  const label = `${claudeModel?.name ?? 'Default'}${claudeEffort ? ` · ${EFFORT_LABEL[claudeEffort]}` : ''}`

  return (
    <Popover.Root onOpenChange={(open) => open && void useModels.getState().load()}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Model and effort: ${label}`}
          className="flex h-[22px] max-w-[60%] shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3 shrink-0" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 w-[300px] max-w-[calc(100vw-16px)] rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none"
        >
          <PickerBody />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function PickerBody() {
  const { models, status, error } = useModels()
  if (status === 'error') {
    return (
      <div className="space-y-2 p-2 text-[12px]">
        <p role="alert" className="text-red-600 dark:text-red-400">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void useModels.getState().load()}
          className="rounded-md border px-2 py-1 hover:bg-muted"
        >
          Try again
        </button>
      </div>
    )
  }
  if (status !== 'ready') {
    return (
      <p className="flex items-center gap-2 p-3 text-[12px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading models…
      </p>
    )
  }
  return <Picker models={models} />
}

function Picker({ models }: { models: ClaudeModel[] }) {
  const claudeModel = useSettings((s) => s.claudeModel)
  const claudeEffort = useSettings((s) => s.claudeEffort)
  const current = claudeModel?.value ?? 'default'
  const { main, more } = splitModels(models)
  // Older models open on their own if one of them is the current choice.
  const [showMore, setShowMore] = useState(() => more.some((m) => m.value === current))
  const row = models.find((m) => m.value === current)

  const pick = (m: ClaudeModel) =>
    useSettings
      .getState()
      .setClaudeChoice(m.value === 'default' ? null : { value: m.value, name: m.displayName }, nearestEffort(m.efforts, claudeEffort))

  const option = (m: ClaudeModel) => (
    <button
      key={m.value}
      type="button"
      role="radio"
      aria-checked={m.value === current}
      onClick={() => pick(m)}
      className={cn(
        'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted',
        m.value === current && 'bg-violet-500/10',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium">{m.displayName}</span>
        <span className="line-clamp-2 block text-[11px] leading-snug text-muted-foreground">{m.description}</span>
      </span>
      <Check className={cn('mt-0.5 size-3.5 shrink-0 text-violet-500', m.value !== current && 'invisible')} aria-hidden />
    </button>
  )

  return (
    <div className="flex flex-col gap-1">
      <div role="radiogroup" aria-label="Model" className="flex max-h-[min(50vh,320px)] flex-col gap-px overflow-y-auto">
        {main.map(option)}
        {more.length > 0 && (
          <button
            type="button"
            aria-expanded={showMore}
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className={cn('size-3 transition-transform', showMore && 'rotate-90')} aria-hidden />
            More models
          </button>
        )}
        {showMore && more.map(option)}
      </div>

      <div className="mx-1 border-t pt-2.5 pb-1">
        <EffortSlider model={row} />
      </div>

      <div className="mx-1 flex items-center gap-2 border-t pt-1.5">
        <p className="min-w-0 flex-1 text-[10.5px] leading-snug text-muted-foreground">
          Bigger models and higher effort use your plan’s limits faster.
        </p>
        <button
          type="button"
          disabled={claudeModel === null && claudeEffort === null}
          onClick={() => useSettings.getState().setClaudeChoice(null, null)}
          className="shrink-0 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          Reset to default
        </button>
      </div>
    </div>
  )
}

function EffortSlider({ model }: { model: ClaudeModel | undefined }) {
  const claudeModel = useSettings((s) => s.claudeModel)
  const effort = useSettings((s) => s.claudeEffort)
  const levels = EFFORTS.filter((e) => model?.efforts.includes(e))
  if (!model || levels.length === 0) {
    return <p className="px-1 text-[11.5px] text-muted-foreground">{model?.displayName ?? 'This model'} has no effort setting.</p>
  }
  const picked = effort !== null && levels.includes(effort)
  // With nothing picked the model decides; the thumb rests on High (or the middle) until moved.
  const at = picked ? levels.indexOf(effort) : levels.includes('high') ? levels.indexOf('high') : Math.floor(levels.length / 2)
  const set = (i: number) => useSettings.getState().setClaudeChoice(claudeModel, levels[i])

  return (
    <div className="px-1">
      <div className="mb-2 flex items-baseline justify-between text-[11.5px]">
        <span className="font-medium">Effort</span>
        <span className={picked ? 'text-violet-600 dark:text-violet-300' : 'text-muted-foreground'}>
          {picked ? EFFORT_LABEL[effort] : 'Default'}
        </span>
      </div>
      <Slider.Root
        min={0}
        max={levels.length - 1}
        step={1}
        value={[at]}
        onValueChange={([i]) => set(i)}
        className="relative flex h-4 touch-none items-center select-none"
      >
        <Slider.Track className="relative h-1 grow rounded-full bg-muted">
          <Slider.Range className={cn('absolute h-full rounded-full', picked ? 'bg-violet-500' : 'bg-muted-foreground/30')} />
        </Slider.Track>
        <Slider.Thumb
          aria-label="Effort"
          aria-valuetext={picked ? EFFORT_LABEL[effort] : 'Default'}
          className={cn(
            'block size-3.5 rounded-full border-2 bg-background shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-violet-500/40',
            picked ? 'border-violet-500' : 'border-muted-foreground/50',
          )}
        />
      </Slider.Root>
      <div data-testid="effort-stops" className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
        {levels.map((l, i) => (
          <button
            key={l}
            type="button"
            tabIndex={-1}
            onClick={() => set(i)}
            className={cn('hover:text-foreground', picked && l === effort && 'font-medium text-foreground')}
          >
            {EFFORT_LABEL[l]}
          </button>
        ))}
      </div>
    </div>
  )
}
