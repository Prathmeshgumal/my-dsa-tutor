import { EyeOff, PanelBottom, PanelRight } from 'lucide-react'
import { focusEditor } from '@/components/editor/editorFocus'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NARROW_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { shortcut } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { useSettings } from '@/state/settings'

type Choice = 'bottom' | 'right' | 'hidden'

const CHOICES: { value: Choice; label: string; tip: string; icon: typeof EyeOff }[] = [
  { value: 'bottom', label: 'Output at the bottom', tip: 'Output at the bottom', icon: PanelBottom },
  { value: 'right', label: 'Output on the right', tip: 'Output on the right', icon: PanelRight },
  { value: 'hidden', label: 'Hide output', tip: `Hide output (${shortcut('J')})`, icon: EyeOff },
]

/** Bottom / Right / Hidden switch for the output panel, at the right end of the status bar. */
export function LayoutSwitch() {
  const narrow = useMediaQuery(NARROW_QUERY)
  const open = useSettings((s) => s.outputOpen)
  const position = useSettings((s) => s.outputPosition)
  const current: Choice = !open ? 'hidden' : narrow ? 'bottom' : position

  const choose = (choice: Choice) => {
    const { setOutputOpen, setOutputPosition } = useSettings.getState()
    if (choice === 'hidden') setOutputOpen(false)
    else {
      setOutputPosition(choice)
      setOutputOpen(true)
    }
    focusEditor()
  }

  return (
    <div role="radiogroup" aria-label="Output layout" className="flex items-center rounded-md border p-px">
      {CHOICES.filter((c) => !(narrow && c.value === 'right')).map(({ value, label, tip, icon: Icon }) => {
        const checked = current === value
        return (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={label}
                onClick={() => choose(value)}
                className={cn(
                  'grid h-[18px] w-6 place-items-center rounded-[4px] transition-colors [&_svg]:size-3',
                  checked
                    ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{tip}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
