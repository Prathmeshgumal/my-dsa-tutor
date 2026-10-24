import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'
import './index.css'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { reportError } from '@/lib/diagnostics'
import { configureStateSync, flushState, loadSavedState, resumeState } from '@/lib/stateSync'
import { useHealth } from '@/state/health'

// Errors outside React (event handlers, promises) go to the log file too.
window.addEventListener('error', (e) => reportError(`Uncaught error: ${e.message}`, e.error))
window.addEventListener('unhandledrejection', (e) => reportError('Unhandled promise rejection', e.reason))

configureStateSync({
  onProblem: () => {
    useHealth.setState({ stateSaveFailing: true })
    toast.warning('Couldn’t save your tabs, chats and settings to disk. They’re kept in this browser, and saving keeps retrying. Setup has the details.')
  },
  onRecovered: () => useHealth.setState({ stateSaveFailing: false }),
})
// Closing or reloading the page: send what hasn't reached disk yet. Coming back to it (back button): carry on.
window.addEventListener('pagehide', flushState)
window.addEventListener('pageshow', (e) => {
  if (e.persisted) resumeState()
})

// Tabs, chats and settings come from disk first; the stores read them as they're created, so the app (and
// everything that imports a store) loads only after that.
void loadSavedState().then(async () => {
  const [{ default: App }, { ThemeProvider }] = await Promise.all([import('./App.tsx'), import('@/components/theme/ThemeProvider')])
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider>
        <ErrorBoundary name="The editor">
          <App />
        </ErrorBoundary>
      </ThemeProvider>
    </StrictMode>,
  )
})
