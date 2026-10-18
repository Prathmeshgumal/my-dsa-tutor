import { saveWorkspace } from '@/lib/storage'
import { useWorkspace } from './workspace'

const DEBOUNCE_MS = 500

function save() {
  const { version, files, openIds, activeId } = useWorkspace.getState()
  const ok = saveWorkspace({ version, files, openIds, activeId })
  useWorkspace.setState(ok ? { saveStatus: 'saved', lastSavedAt: Date.now() } : { saveStatus: 'error' })
}

/** Persists the workspace 500 ms after the last change, and immediately when the page is hidden or closed. */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
    save()
  }

  const unsubscribe = useWorkspace.subscribe((s, prev) => {
    if (s.files === prev.files && s.openIds === prev.openIds && s.activeId === prev.activeId) return
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      save()
    }, DEBOUNCE_MS)
  })

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('beforeunload', flush)

  return () => {
    unsubscribe()
    if (timer !== null) clearTimeout(timer)
    timer = null
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('beforeunload', flush)
  }
}
