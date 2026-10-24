import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { reportError } from '@/lib/diagnostics'

interface Props {
  /** What this part of the screen is called, e.g. "The Playground". */
  name: string
  children: ReactNode
}

/** Keeps a crash in one panel from blanking the whole editor: the panel shows what happened and can try again. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(`${this.props.name} crashed: ${error.message}`, `${error.stack ?? ''}\n${info.componentStack ?? ''}`)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div role="alert" className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="size-6 text-amber-500" aria-hidden />
        <p className="text-sm font-medium">{this.props.name} hit a problem.</p>
        <p className="max-w-sm text-[12.5px] text-muted-foreground">
          The rest of the editor still works and your files are saved. It was written to the log; Setup → Copy diagnostics includes it.
        </p>
        <code className="max-w-sm truncate rounded bg-muted px-2 py-1 font-mono text-[11.5px]">{error.message}</code>
        <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
          <RotateCcw /> Try again
        </Button>
      </div>
    )
  }
}
