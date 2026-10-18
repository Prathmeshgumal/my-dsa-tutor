import { RunnerError, type CodeRunner, type RunResult, type RunStatus } from './types'

interface PistonStage {
  stdout: string
  stderr: string
  code: number | null
  signal: string | null
  status: string | null
  message: string | null
  cpu_time?: number
  memory?: number
}

interface PistonResponse {
  compile?: PistonStage
  run: PistonStage
}

// Piston's g++ wrapper chmods a.out even when compilation failed; that line is noise.
const CHMOD_NOISE = /^chmod: cannot access 'a\.out'.*\n?/m

function runStatus(run: PistonStage): { status: RunStatus; statusText: string } {
  if (run.status === 'TO') return { status: 'time_limit', statusText: 'Time limit exceeded' }
  if (run.status === 'XX' || run.status === 'IE') return { status: 'internal_error', statusText: run.message ?? 'Internal error' }
  if (run.signal) return { status: 'runtime_error', statusText: `Runtime error (${run.signal})` }
  if (run.code !== 0) return { status: 'runtime_error', statusText: `Runtime error (exit ${run.code})` }
  return { status: 'success', statusText: 'Accepted' }
}

async function httpError(res: Response): Promise<RunnerError> {
  try {
    const body = (await res.json()) as { message?: unknown }
    if (typeof body.message === 'string') return new RunnerError('http', `Piston: ${body.message}`)
  } catch {
    // not JSON — fall through to the generic message
  }
  return new RunnerError('http', `Piston error (HTTP ${res.status}).`)
}

/** Runs code on a self-hosted Piston (https://github.com/engineer-man/piston) via its v2 API. */
export function createPistonRunner(opts: { baseUrl?: string; fetchImpl?: typeof fetch } = {}): CodeRunner {
  const baseUrl = opts.baseUrl ?? '/piston'
  const fetchImpl = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  return {
    async run(req, signal) {
      let res: Response
      try {
        res = await fetchImpl(`${baseUrl}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: req.language.piston.language,
            version: '*',
            files: [{ name: req.language.piston.fileName, content: req.source }],
            stdin: req.stdin,
          }),
          signal,
        })
      } catch (e) {
        if (signal?.aborted) throw e
        throw new RunnerError('network', 'Couldn’t reach Piston — start it with “docker compose up -d”.')
      }
      if (!res.ok) throw await httpError(res)

      const { compile, run } = (await res.json()) as PistonResponse
      if (compile && compile.code !== 0) {
        return {
          status: 'compile_error',
          statusText: 'Compilation Error',
          stdout: '',
          stderr: '',
          compileOutput: compile.stderr.replace(CHMOD_NOISE, '') || compile.stdout,
          timeMs: null,
          memoryKb: null,
        }
      }
      const result: RunResult = {
        ...runStatus(run),
        stdout: run.stdout,
        stderr: run.stderr,
        compileOutput: '',
        timeMs: run.cpu_time ?? null,
        memoryKb: run.memory == null ? null : Math.round(run.memory / 1024),
      }
      return result
    },
  }
}
