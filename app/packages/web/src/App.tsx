import { useEffect, useState } from 'react'
import { CommandMenu, useCommandMenu } from '@/components/command/CommandMenu'
import { EditorPanel } from '@/components/editor/EditorPanel'
import { FileDialogs, useFileDialogs } from '@/components/editor/FileDialogs'
import { OutputPanel } from '@/components/output/OutputPanel'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { AppShell } from '@/components/shell/AppShell'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { healthy } from '@dsa/core/health'
import { useAiChat } from '@/state/aiChat'
import { startAutosave } from '@/state/autosave'
import { startFolderSync } from '@/state/folderSync'
import { useHealth } from '@/state/health'
import { hydrateFromDisk } from '@/state/hydrate'
import { useProblems } from '@/state/problems'
import { useRun } from '@/state/run'
import { useSettings } from '@/state/settings'
import { useSettingsDialog } from '@/state/settingsDialog'
import { useWorkspace } from '@/state/workspace'

// On Problems, Run checks the problem's test cases; on Code it runs the open file. Elsewhere the code and its output
// aren't on screen, so nothing runs.
const runActiveFile = () => {
  const { section } = useSettings.getState()
  if (section === 'problems') void useProblems.getState().test('run')
  else if (section === 'code') void useRun.getState().runActiveFile()
}

const modalOpen = () =>
  useFileDialogs.getState().kind !== null || useSettingsDialog.getState().open || useCommandMenu.getState().open

export default function App() {
  const [cursor, setCursor] = useState<{ line: number; col: number } | null>(null)
  const connection = useRun((s) => s.connection)
  const hasActiveFile = useWorkspace((s) => s.ready && s.activeId !== null)

  // Problems are loaded up front: notes, dry runs and chats show which problem they belong to.
  useEffect(() => {
    void useProblems.getState().load()
  }, [])

  // A reply Claude was still writing when the page was closed or reloaded carries on where it was.
  useEffect(() => {
    void useAiChat.getState().resume()
  }, [])

  // If something the editor needs isn't working, say so up front instead of failing later.
  useEffect(() => {
    void useHealth
      .getState()
      .check()
      .then((health) => {
        if (health && !healthy(health)) {
          toast.warning('Part of the setup needs attention.', {
            action: { label: 'Show me', onClick: () => useSettingsDialog.getState().show() },
            duration: 10_000,
          })
        }
      })
  }, [])

  // Load files from the solutions folder, then keep it in sync. Falls back to browser-only storage.
  useEffect(() => {
    let stop: (() => void) | undefined
    let cancelled = false
    void hydrateFromDisk().then(({ ok, synced }) => {
      if (cancelled) return
      if (!ok) toast.warning('Couldn’t reach the files folder — saving in this browser only.')
      const stopAutosave = startAutosave(ok ? { disk: { synced } } : {})
      // Edits made outside the editor (VS Code, git) show up without a reload.
      const stopSync = ok ? startFolderSync() : () => {}
      stop = () => {
        stopSync()
        stopAutosave()
      }
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
