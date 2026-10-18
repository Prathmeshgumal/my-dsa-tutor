import { useState } from 'react'
import { EditorPanel } from '@/components/editor/EditorPanel'
import { FileDialogs } from '@/components/editor/FileDialogs'
import { AppShell } from '@/components/shell/AppShell'

export default function App() {
  const [cursor, setCursor] = useState<{ line: number; col: number } | null>(null)

  return (
    <>
      <AppShell
        editor={<EditorPanel onCursorChange={setCursor} onRunShortcut={() => {}} />}
        output={<div className="flex-1" />}
        onRun={() => {}}
        running={false}
        canRun
        connection="no_key"
        cursor={cursor}
        onOpenCommand={() => {}}
      />
      <FileDialogs />
    </>
  )
}
