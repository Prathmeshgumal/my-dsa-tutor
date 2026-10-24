import type { ReactNode } from 'react'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AiPanel } from '@/components/ai/AiPanel'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { FilesPanel } from '@/components/files/FilesPanel'
import { NotesPanel } from '@/components/notes/NotesPanel'
import { Playground } from '@/components/playground/Playground'
import { ProblemScreen } from '@/components/problems/ProblemScreen'
import { NARROW_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { useFilesPanel } from '@/state/filesPanel'
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
  const filesOpen = useFilesPanel((s) => s.open)
  const outputPosition = useSettings((s) => s.outputPosition)
  const vertical = narrow || outputPosition === 'bottom'
  const outputOpen = useSettings((s) => s.outputOpen)
  const aiOpen = useSettings((s) => s.aiOpen)
  const notesOpen = useSettings((s) => s.notesOpen)
  const screen = useSettings((s) => s.screen)
  const [editorSize, outputSize] = panelLayout ?? DEFAULT_LAYOUT

  return (
    <TooltipProvider delayDuration={200}>
      <div className="app-bg flex h-dvh flex-col overflow-hidden text-foreground">
        <TopBar narrow={narrow} onRun={onRun} running={running} canRun={canRun} onOpenCommand={onOpenCommand} />
        <div className="relative flex min-h-0 flex-1">
          <IconRail />
          {filesOpen && (
            <ErrorBoundary name="The file list">
              <FilesPanel />
            </ErrorBoundary>
          )}
          {screen === 'playground' && (
            <ErrorBoundary name="The Playground">
              <Playground />
            </ErrorBoundary>
          )}
          {screen === 'problem' && (
            <ErrorBoundary name="The Problems screen">
              <ProblemScreen />
            </ErrorBoundary>
          )}
          {/* Kept mounted (just hidden) on the Playground, so Monaco keeps its cursor, scroll and undo history. */}
          <div hidden={screen !== 'editor'} className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* The editor panel stays mounted when the output is hidden, so Monaco keeps its cursor and scroll. */}
            <ResizablePanelGroup
              key={vertical ? 'vertical' : 'horizontal'}
              data-testid="workspace-panels"
              orientation={vertical ? 'vertical' : 'horizontal'}
              defaultLayout={outputOpen ? { editor: editorSize, output: outputSize } : { editor: 100 }}
              onLayoutChanged={(l) => {
                if (l.output !== undefined) setPanelLayout([l.editor, l.output])
              }}
              className="min-w-0 flex-1"
            >
              <ResizablePanel id="editor" minSize="25" className="flex min-h-0 min-w-0 flex-col">
                <ErrorBoundary name="The code editor">{editor}</ErrorBoundary>
              </ResizablePanel>
              {outputOpen && (
                <>
                  <ResizableHandle
                    withHandle
                    className="transition-colors hover:bg-violet-500/50 data-[separator=active]:bg-violet-500"
                  />
                  <ResizablePanel
                    id="output"
                    minSize="25"
                    defaultSize={`${outputSize}`}
                    className="flex min-h-0 min-w-0 flex-col"
                  >
                    <ErrorBoundary name="The output panel">{output}</ErrorBoundary>
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </div>
          {aiOpen && (
            <ErrorBoundary name="The Claude panel">
              <AiPanel />
            </ErrorBoundary>
          )}
          {notesOpen && !aiOpen && (
            <ErrorBoundary name="The Notes panel">
              <NotesPanel />
            </ErrorBoundary>
          )}
        </div>
        <StatusBar connection={connection} cursor={cursor} />
      </div>
    </TooltipProvider>
  )
}
