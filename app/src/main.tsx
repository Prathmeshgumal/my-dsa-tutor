import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { reportError } from '@/lib/diagnostics'

// Errors outside React (event handlers, promises) go to the log file too.
window.addEventListener('error', (e) => reportError(`Uncaught error: ${e.message}`, e.error))
window.addEventListener('unhandledrejection', (e) => reportError('Unhandled promise rejection', e.reason))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary name="The editor">
        <App />
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
)
