import { useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { Loader2 } from 'lucide-react'
import { useResolvedTheme } from '@/components/theme/ThemeProvider'
import { languageFromFilename } from '@dsa/core/languages'
import { useWorkspace } from '@/state/workspace'
import { registerEditor } from './editorFocus'
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
  const ready = useWorkspace((s) => s.ready)
  const theme = useResolvedTheme()
  const unregister = useRef<(() => void) | null>(null)
  useEffect(() => () => unregister.current?.(), [])

  const onMount: OnMount = (editor, monaco) => {
    unregister.current?.()
    unregister.current = registerEditor(editor)
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
      {!ready ? (
        <div className="flex flex-1 items-center justify-center gap-2 bg-card text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading files…
        </div>
      ) : file ? (
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
              // 0 = automatic, the same as VS Code: 1.35× the font size on Linux/Windows, 1.5× on Mac.
              lineHeight: 0,
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
              scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false },
            }}
          />
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  )
}
