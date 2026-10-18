import { Code2, FolderOpen, History, Settings, Sparkles, type LucideIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSettingsDialog } from '@/state/settingsDialog'

const PLACEHOLDERS: { label: string; icon: LucideIcon }[] = [
  { label: 'Files', icon: FolderOpen },
  { label: 'History', icon: History },
  { label: 'AI help', icon: Sparkles },
]

const item = 'grid size-[34px] place-items-center rounded-[9px] transition-colors [&_svg]:size-[17px]'

export function IconRail() {
  return (
    <nav aria-label="Sidebar" className="flex w-[52px] shrink-0 flex-col items-center gap-1.5 border-r py-2.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Editor"
            aria-current="page"
            className={`${item} bg-violet-500/15 text-violet-600 ring-1 ring-violet-500/30 ring-inset dark:text-violet-300`}
          >
            <Code2 />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Editor</TooltipContent>
      </Tooltip>

      {PLACEHOLDERS.map(({ label, icon: Icon }) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={label}
              aria-disabled="true"
              className={`${item} cursor-default text-muted-foreground/70 hover:bg-muted hover:text-muted-foreground`}
            >
              <Icon />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{label} · coming soon</TooltipContent>
        </Tooltip>
      ))}

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
