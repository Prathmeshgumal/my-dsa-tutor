import { useEffect, useState } from 'react'
import { CommandMenu, useCommandMenu } from '@/components/command/CommandMenu'
import { EditorPanel } from '@/components/editor/EditorPanel'
import { FileDialogs, useFileDialogs } from '@/components/editor/FileDialogs'
import { OutputPanel } from '@/components/output/OutputPanel'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { AppShell } from '@/components/shell/AppShell'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { startAutosave } from '@/state/autosave'
import { hydrateFromDisk } from '@/state/hydrate'
import { useRun } from '@/state/run'
import { useSettings } from '@/state/settings'
import { useSettingsDialog } from '@/state/settingsDialog'
import { useWorkspace } from '@/state/workspace'

const runActiveFile = () => void useRun.getState().runActiveFile()

const modalOpen = () =>
  useFileDialogs.getState().kind !== null || useSettingsDialog.getState().open || useCommandMenu.getState().open

export default function App() {
  const [cursor, setCursor] = useState<{ line: number; col: number } | null>(null)
  const running = useRun((s) => s.state === 'running')
  const connection = useRun((s) => s.connection)
  const hasActiveFile = useWorkspace((s) => s.ready && s.activeId !== null)

  // Load files from the solutions folder, then keep it in sync. Falls back to browser-only storage.
  useEffect(() => {
    let stop: (() => void) | undefined
    let cancelled = false
    void hydrateFromDisk().then(({ ok, synced }) => {
      if (cancelled) return
      if (!ok) toast.warning('Couldn’t reach the files folder — saving in this browser only.')
      stop = startAutosave(ok ? { disk: { synced } } : {})
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  // ⌘/Ctrl+Enter while focus is outside Monaco (Monaco handles its own copy of the shortcut).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !modalOpen()) {
        e.preventDefault()
        runActiveFile()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // ⌘/Ctrl+J shows or hides the output, as in VS Code. Capture phase so the editor can't swallow it.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j' && !modalOpen()) {
        e.preventDefault()
        const { outputOpen, setOutputOpen } = useSettings.getState()
        setOutputOpen(!outputOpen)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
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
