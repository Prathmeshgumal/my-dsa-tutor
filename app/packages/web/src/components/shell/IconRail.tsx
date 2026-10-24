import { Clapperboard, Code2, ListChecks, MessagesSquare, NotebookPen, Settings, Sparkles } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { SECTIONS, useListVisible, type Section } from '@/state/sections'
import { useSettings } from '@/state/settings'
import { useSettingsDialog } from '@/state/settingsDialog'

const ICONS: Record<Section, typeof Code2> = {
  problems: ListChecks,
  code: Code2,
  notes: NotebookPen,
  dryruns: Clapperboard,
  chats: MessagesSquare,
}

const item = 'grid size-[34px] place-items-center rounded-[9px] transition-colors [&_svg]:size-[17px]'

export function IconRail() {
  const aiOpen = useSettings((s) => s.aiOpen)
  const section = useSettings((s) => s.section)
  const listShown = useListVisible(section)
  // On its own section, a section's button hides or shows that section's list.
  const tip = (id: Section, label: string) =>
    id !== section ? label : `${listShown ? 'Hide' : 'Show'} the ${label.toLowerCase()} list`

  return (
    <nav aria-label="Sidebar" className="flex w-[52px] shrink-0 flex-col items-center gap-1.5 border-r py-2.5">
      {SECTIONS.map(({ id, label }) => {
        const Icon = ICONS[id]
        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={label}
                aria-current={section === id ? 'page' : undefined}
                onClick={() => useSettings.getState().pressSection(id)}
                className={cn(
                  item,
                  section === id
                    ? 'bg-violet-500/15 text-violet-600 ring-1 ring-violet-500/30 ring-inset dark:text-violet-300'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{tip(id, label)}</TooltipContent>
          </Tooltip>
        )
      })}

      <div className="my-1 h-px w-6 bg-border" aria-hidden />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Claude"
            aria-pressed={aiOpen}
            onClick={() => useSettings.getState().setAiOpen(!aiOpen)}
            className={cn(
              item,
              aiOpen
                ? 'bg-violet-500/15 text-violet-600 ring-1 ring-violet-500/30 ring-inset dark:text-violet-300'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Sparkles />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{aiOpen ? 'Hide Claude' : 'Ask Claude'}</TooltipContent>
      </Tooltip>

      <div className="flex-1" />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Setup"
            onClick={() => useSettingsDialog.getState().show()}
            className={`${item} text-muted-foreground hover:bg-muted hover:text-foreground`}
          >
            <Settings />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Setup check</TooltipContent>
      </Tooltip>
    </nav>
  )
}
