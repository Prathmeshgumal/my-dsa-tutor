import type { ReactNode } from 'react'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NARROW_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { useSettings } from '@/state/settings'
import { IconRail } from './IconRail'
import { StatusBar, type Connection } from './StatusBar'
import { TopBar } from './TopBar'

interface Props {
  editor: ReactNode
  output: ReactNode
  onRun(): void
  running: boolean
  canRun: boolean
  connection: Connection
  cursor: { line: number; col: number } | null
  onOpenCommand(): void
}

const DEFAULT_LAYOUT = [58, 42]

export function AppShell({ editor, output, onRun, running, canRun, connection, cursor, onOpenCommand }: Props) {
  const narrow = useMediaQuery(NARROW_QUERY)
  const panelLayout = useSettings((s) => s.panelLayout)
  const setPanelLayout = useSettings((s) => s.setPanelLayout)
  const [editorSize, outputSize] = panelLayout ?? DEFAULT_LAYOUT

  return (
    <TooltipProvider delayDuration={200}>
      <div className="app-bg flex h-dvh flex-col overflow-hidden text-foreground">
        <TopBar narrow={narrow} onRun={onRun} running={running} canRun={canRun} onOpenCommand={onOpenCommand} />
        <div className="flex min-h-0 flex-1">
          <IconRail />
          <ResizablePanelGroup
            key={narrow ? 'vertical' : 'horizontal'}
            data-testid="workspace-panels"
            orientation={narrow ? 'vertical' : 'horizontal'}
            defaultLayout={{ editor: editorSize, output: outputSize }}
            onLayoutChanged={(l) => setPanelLayout([l.editor, l.output])}
            className="min-w-0 flex-1"
          >
            <ResizablePanel id="editor" minSize="25" className="flex min-h-0 min-w-0 flex-col">
              {editor}
            </ResizablePanel>
            <ResizableHandle
              withHandle
              className="transition-colors hover:bg-violet-500/50 data-[separator=active]:bg-violet-500"
            />
            <ResizablePanel id="output" minSize="25" className="flex min-h-0 min-w-0 flex-col">
              {output}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
        <StatusBar connection={connection} cursor={cursor} />
      </div>
    </TooltipProvider>
  )
}
