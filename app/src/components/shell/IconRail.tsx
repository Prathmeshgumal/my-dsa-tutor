import { Clapperboard, Code2, FolderOpen, NotebookPen, Settings, Sparkles } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useFilesPanel } from '@/state/filesPanel'
import { useSettings, type Screen } from '@/state/settings'
import { useSettingsDialog } from '@/state/settingsDialog'

const SCREENS: { id: Screen; label: string; icon: typeof Code2 }[] = [
  { id: 'editor', label: 'Editor', icon: Code2 },
  { id: 'playground', label: 'Playground', icon: Clapperboard },
]

const item = 'grid size-[34px] place-items-center rounded-[9px] transition-colors [&_svg]:size-[17px]'

export function IconRail() {
  const filesOpen = useFilesPanel((s) => s.open)
  const setFilesOpen = useFilesPanel((s) => s.setOpen)
  const aiOpen = useSettings((s) => s.aiOpen)
  const notesOpen = useSettings((s) => s.notesOpen)
  const screen = useSettings((s) => s.screen)

  return (
    <nav aria-label="Sidebar" className="flex w-[52px] shrink-0 flex-col items-center gap-1.5 border-r py-2.5">
      {SCREENS.map(({ id, label, icon: Icon }) => (
        <Tooltip key={id}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={label}
              aria-current={screen === id ? 'page' : undefined}
              onClick={() => useSettings.getState().setScreen(id)}
              className={cn(
                item,
                screen === id
                  ? 'bg-violet-500/15 text-violet-600 ring-1 ring-violet-500/30 ring-inset dark:text-violet-300'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ))}

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Files"
            aria-pressed={filesOpen}
            data-files-toggle
            onClick={() => setFilesOpen(!filesOpen)}
            className={cn(
              item,
              filesOpen
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <FolderOpen />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{filesOpen ? 'Hide files' : 'Show files'}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Notes"
            aria-pressed={notesOpen}
            onClick={() => useSettings.getState().setNotesOpen(!notesOpen)}
            className={cn(
              item,
              notesOpen ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <NotebookPen />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{notesOpen ? 'Hide notes' : 'Notes'}</TooltipContent>
      </Tooltip>

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
            aria-label="Settings"
            onClick={() => useSettingsDialog.getState().show()}
            className={`${item} text-muted-foreground hover:bg-muted hover:text-foreground`}
          >
            <Settings />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Settings</TooltipContent>
      </Tooltip>
    </nav>
  )
}
