import { useEffect } from 'react'
import { Eye, EyeOff, FilePlus2, Moon, PanelBottom, PanelRight, NotebookPen, Play, Settings, Sparkles, Sun } from 'lucide-react'
import { create } from 'zustand'
import { focusEditor } from '@/components/editor/editorFocus'
import { openNewFileDialog } from '@/components/editor/FileDialogs'
import { LanguageIcon } from '@/components/LanguageIcon'
import { useResolvedTheme } from '@/components/theme/ThemeProvider'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { shortcut } from '@/lib/platform'
import { useRun } from '@/state/run'
import { useSettings } from '@/state/settings'
import { useSettingsDialog } from '@/state/settingsDialog'
import { useWorkspace } from '@/state/workspace'

interface CommandMenuState {
  open: boolean
  setOpen(open: boolean): void
}

export const useCommandMenu = create<CommandMenuState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

export function CommandMenu() {
  const { open, setOpen } = useCommandMenu()
  const files = useWorkspace((s) => s.files)
  const activeId = useWorkspace((s) => s.activeId)
  const theme = useResolvedTheme()
  const outputPosition = useSettings((s) => s.outputPosition)
  const outputOpen = useSettings((s) => s.outputOpen)

  // Capture phase: Monaco swallows Ctrl+K (its chord prefix) before a bubbling listener would see it.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setOpen(!useCommandMenu.getState().open)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [setOpen])

  const run = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command menu"
      description="Open a file or run a command"
      onCloseAutoFocus={(e) => {
        e.preventDefault()
        focusEditor()
      }}
    >
      <Command>
        <CommandInput placeholder="Search files and commands…" />
        <CommandList>
          <CommandEmpty>Nothing found.</CommandEmpty>
          <CommandGroup heading="Files">
            {files.map((file) => (
              <CommandItem key={file.id} value={file.name} onSelect={run(() => useWorkspace.getState().openFile(file.id))}>
                <LanguageIcon fileName={file.name} />
                <span className="font-mono">{file.name}</span>
                {file.id === activeId && <CommandShortcut>current</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem value="New file" onSelect={run(openNewFileDialog)}>
              <FilePlus2 /> New file
            </CommandItem>
            <CommandItem value="Ask Claude" onSelect={run(() => useSettings.getState().setAiOpen(true))}>
              <Sparkles /> Ask Claude
            </CommandItem>
            <CommandItem value="Open notes" onSelect={run(() => useSettings.getState().setNotesOpen(true))}>
              <NotebookPen /> Open notes
            </CommandItem>
            <CommandItem value="Run" onSelect={run(() => void useRun.getState().runActiveFile())}>
              <Play /> Run
              <CommandShortcut>{shortcut('↵')}</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="Toggle theme"
              onSelect={run(() => useSettings.getState().setTheme(theme === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? <Sun /> : <Moon />} Toggle theme
            </CommandItem>
            <CommandItem
              value={outputOpen ? 'Hide output' : 'Show output'}
              onSelect={run(() => useSettings.getState().setOutputOpen(!outputOpen))}
            >
              {outputOpen ? <EyeOff /> : <Eye />}
              {outputOpen ? 'Hide output' : 'Show output'}
              <CommandShortcut>{shortcut('J')}</CommandShortcut>
            </CommandItem>
            <CommandItem
              value={outputPosition === 'right' ? 'Move output to the bottom' : 'Move output to the right'}
              onSelect={run(() => useSettings.getState().setOutputPosition(outputPosition === 'right' ? 'bottom' : 'right'))}
            >
              {outputPosition === 'right' ? <PanelBottom /> : <PanelRight />}
              {outputPosition === 'right' ? 'Move output to the bottom' : 'Move output to the right'}
            </CommandItem>
            <CommandItem value="Open settings" onSelect={run(() => useSettingsDialog.getState().show())}>
              <Settings /> Open settings
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
