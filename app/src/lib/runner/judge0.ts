import { decodeBase64, encodeBase64 } from '@/lib/base64'
import { RunnerError, type CodeRunner, type RunResult, type RunStatus } from './types'

const HOST = 'judge0-ce.p.rapidapi.com'
const URL = `https://${HOST}/submissions?base64_encoded=true&wait=true`

interface Judge0Submission {
  status: { id: number; description: string }
  stdout: string | null
  stderr: string | null
  compile_output: string | null
  time: string | null
  memory: number | null
}

// Judge0 status ids: 3 accepted, 5 TLE, 6 compile error, 7–12 runtime errors, 13–14 internal.
function toRunStatus(id: number): RunStatus {
  if (id === 3) return 'success'
  if (id === 5) return 'time_limit'
  if (id === 6) return 'compile_error'
  if (id >= 7 && id <= 12) return 'runtime_error'
  return 'internal_error'
}

function httpError(status: number): RunnerError {
  if (status === 401 || status === 403) return new RunnerError('auth', 'Invalid API key — check it in Settings, and make sure you’re subscribed to Judge0 CE.')
  if (status === 429) return new RunnerError('quota', 'Daily Judge0 quota used up. Try again tomorrow.')
  return new RunnerError('http', `Judge0 error (HTTP ${status}).`)
}

export function createJudge0RapidApiRunner(opts: { apiKey: string; fetchImpl?: typeof fetch }): CodeRunner {
  const fetchImpl = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  return {
    async run(req, signal) {
      if (!opts.apiKey) throw new RunnerError('no_key', 'Add your RapidAPI key in Settings to run code.')

      let res: Response
      try {
        res = await fetchImpl(URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-RapidAPI-Key': opts.apiKey,
            'X-RapidAPI-Host': HOST,
          },
          body: JSON.stringify({
            source_code: encodeBase64(req.source),
            language_id: req.language.judge0Id,
            stdin: encodeBase64(req.stdin),
          }),
          signal,
        })
      } catch (e) {
        if (signal?.aborted) throw e
        throw new RunnerError('network', 'Couldn’t reach Judge0 — check your connection.')
      }
      if (!res.ok) throw httpError(res.status)

      const sub = (await res.json()) as Judge0Submission
      const result: RunResult = {
        status: toRunStatus(sub.status.id),
        statusText: sub.status.description,
        stdout: decodeBase64(sub.stdout),
        stderr: decodeBase64(sub.stderr),
        compileOutput: decodeBase64(sub.compile_output),
        timeMs: sub.time == null ? null : Math.round(parseFloat(sub.time) * 1000),
        memoryKb: sub.memory ?? null,
      }
      return result
    },
  }
}
