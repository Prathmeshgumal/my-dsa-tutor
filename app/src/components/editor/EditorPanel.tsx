import Editor, { type OnMount } from '@monaco-editor/react'
import { Loader2 } from 'lucide-react'
import { useResolvedTheme } from '@/components/theme/ThemeProvider'
import { languageFromFilename } from '@/lib/languages'
import { useWorkspace } from '@/state/workspace'
import { EmptyState } from './EmptyState'
import { FileTabs } from './FileTabs'
import { registerGlowThemes } from './monacoThemes'

interface Props {
  onCursorChange(c: { line: number; col: number }): void
  onRunShortcut(): void
}

export function EditorPanel({ onCursorChange, onRunShortcut }: Props) {
  const file = useWorkspace((s) => s.files.find((f) => f.id === s.activeId) ?? null)
  const updateContent = useWorkspace((s) => s.updateContent)
  const theme = useResolvedTheme()

  const onMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onRunShortcut)
    editor.onDidChangeCursorPosition((e) => onCursorChange({ line: e.position.lineNumber, col: e.position.column }))
    const pos = editor.getPosition()
    if (pos) onCursorChange({ line: pos.lineNumber, col: pos.column })
    // Geist Mono loads after Monaco measures glyphs; remeasure so the cursor lines up.
    void document.fonts.ready.then(() => monaco.editor.remeasureFonts())
    editor.focus()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FileTabs />
      {file ? (
        <div className="min-h-0 flex-1 bg-card">
          <Editor
            path={file.id}
            language={languageFromFilename(file.name)?.monaco}
            value={file.content}
            onChange={(v) => updateContent(file.id, v ?? '')}
            theme={theme === 'dark' ? 'glow-dark' : 'glow-light'}
            beforeMount={registerGlowThemes}
            onMount={onMount}
            loading={<Loader2 className="size-5 animate-spin text-muted-foreground" />}
            options={{
              fontFamily: "'Geist Mono', ui-monospace, monospace",
              fontSize: 14,
              lineHeight: 1.75,
              fontLigatures: true,
              minimap: { enabled: false },
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              smoothScrolling: true,
              padding: { top: 12, bottom: 12 },
              scrollBeyondLastLine: false,
              renderLineHighlight: 'all',
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              automaticLayout: true,
              tabSize: 4,
              scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
            }}
          />
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  )
}
