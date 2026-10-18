import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { languageFromFilename } from '@/lib/languages'
import { cn } from '@/lib/utils'
import type { Connection } from '@/state/run'
import { useWorkspace } from '@/state/workspace'

export type { Connection }

const CONNECTION: Record<Connection, { text: string; dot: string }> = {
  no_key: { text: 'No API key', dot: 'bg-amber-500 shadow-[0_0_8px] shadow-amber-500' },
  connected: { text: 'Judge0 connected', dot: 'bg-violet-500 shadow-[0_0_8px] shadow-violet-500' },
  failed: { text: 'Last run failed', dot: 'bg-red-500 shadow-[0_0_8px] shadow-red-500' },
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function savedLabel(lastSavedAt: number | null, now: number): string {
  if (lastSavedAt === null) return 'All changes saved'
  const minutes = Math.floor(Math.max(0, now - lastSavedAt) / 60_000)
  if (minutes < 1) return 'Saved just now'
  if (minutes < 60) return `Saved ${minutes}m ago`
  return `Saved ${Math.floor(minutes / 60)}h ago`
}

interface Props {
  connection: Connection
  cursor: { line: number; col: number } | null
}

export function StatusBar({ connection, cursor }: Props) {
  const saveStatus = useWorkspace((s) => s.saveStatus)
  const lastSavedAt = useWorkspace((s) => s.lastSavedAt)
  const fileName = useWorkspace((s) => s.files.find((f) => f.id === s.activeId)?.name)
  const language = fileName ? languageFromFilename(fileName) : null
  const now = useNow(30_000)
  const conn = CONNECTION[connection]

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t px-3.5 text-[11.5px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <i className={cn('size-1.5 rounded-full', conn.dot)} aria-hidden />
        {conn.text}
      </span>
      <span className="flex items-center gap-1.5">
        {saveStatus === 'saving' && <Loader2 className="size-3 animate-spin" aria-hidden />}
        {saveStatus === 'saved' && <Check className="size-3" aria-hidden />}
        {saveStatus === 'error' && <AlertTriangle className="size-3 text-red-500" aria-hidden />}
        {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Couldn’t save' : savedLabel(lastSavedAt, now)}
      </span>
      <span className="flex-1" />
      {cursor && <span>{`Ln ${cursor.line}, Col ${cursor.col}`}</span>}
      {language && <span>{language.compilerLabel}</span>}
    </footer>
  )
}
