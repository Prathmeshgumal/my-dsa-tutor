import type { Language } from '../languages.ts'

export interface RunRequest {
  language: Language
  source: string
  stdin: string
}

export type RunStatus = 'success' | 'compile_error' | 'runtime_error' | 'time_limit' | 'internal_error'

export interface RunResult {
  status: RunStatus
  statusText: string
  stdout: string
  stderr: string
  compileOutput: string
  timeMs: number | null
  memoryKb: number | null
}

export type RunnerErrorKind = 'network' | 'http'

export class RunnerError extends Error {
  readonly kind: RunnerErrorKind

  constructor(kind: RunnerErrorKind, message: string) {
    super(message)
    this.name = 'RunnerError'
    this.kind = kind
  }
}

export interface CodeRunner {
  run(req: RunRequest, signal?: AbortSignal): Promise<RunResult>
}
