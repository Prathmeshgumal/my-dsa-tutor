import { useEffect, useState } from 'react'
import { CommandMenu, useCommandMenu } from '@/components/command/CommandMenu'
import { EditorPanel } from '@/components/editor/EditorPanel'
import { FileDialogs } from '@/components/editor/FileDialogs'
import { OutputPanel } from '@/components/output/OutputPanel'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { AppShell } from '@/components/shell/AppShell'
import { Toaster } from '@/components/ui/sonner'
import { startAutosave } from '@/state/autosave'
import { useRun } from '@/state/run'
import { useWorkspace } from '@/state/workspace'

const runActiveFile = () => void useRun.getState().runActiveFile()

export default function App() {
  const [cursor, setCursor] = useState<{ line: number; col: number } | null>(null)
  const running = useRun((s) => s.state === 'running')
  const connection = useRun((s) => s.connection)
  const hasActiveFile = useWorkspace((s) => s.activeId !== null)

  useEffect(() => startAutosave(), [])

  // ⌘/Ctrl+Enter while focus is outside Monaco (Monaco handles its own copy of the shortcut).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        runActiveFile()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <AppShell
        editor={<EditorPanel onCursorChange={setCursor} onRunShortcut={runActiveFile} />}
        output={<OutputPanel />}
        onRun={runActiveFile}
        running={running}
        canRun={hasActiveFile}
        connection={connection}
        cursor={hasActiveFile ? cursor : null}
        onOpenCommand={() => useCommandMenu.getState().setOpen(true)}
      />
      <FileDialogs />
      <SettingsDialog />
      <CommandMenu />
      <Toaster position="bottom-right" richColors />
    </>
  )
}
