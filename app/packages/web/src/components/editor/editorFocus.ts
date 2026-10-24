// Lets anything in the app hand keyboard focus back to the code editor (after picking a file, closing a dialog, …).
interface Focusable {
  focus(): void
}

let current: Focusable | null = null

export function registerEditor(editor: Focusable): () => void {
  current = editor
  return () => {
    if (current === editor) current = null
  }
}

/** Focuses the editor on the next frame, after the click or dialog close that triggered it has settled. */
export function focusEditor(): void {
  requestAnimationFrame(() => current?.focus())
}
