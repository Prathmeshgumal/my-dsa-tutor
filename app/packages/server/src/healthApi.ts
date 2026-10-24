// Dev-server setup check, shown in the Setup dialog and on start-up when something is wrong.
//   GET /api/health → Health (see ../src/lib/health.ts)
import { access, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import path from 'node:path'
import type { Health } from '@dsa/core/health'

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

const ROUTE = '/api/health'

/** Piston's names for the editor's languages. */
const PISTON_LANGUAGES = { cpp: 'c++', java: 'java', python: 'python' } as const

const INSTALL_HINT = 'Run ./start.sh (or: docker compose up -d piston-setup) to install it.'

interface Options {
  pistonUrl: string
  /** The folders work is saved in, by the name the user knows them by. */
  folders: Record<string, string>
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  /** Where ~/.claude is looked for. */
  home?: string
  fetchImpl?: typeof fetch
}

async function checkPiston(pistonUrl: string, fetchImpl: typeof fetch): Promise<Health['piston']> {
  const none = { cpp: false, java: false, python: false }
  try {
    const res = await fetchImpl(`${pistonUrl}/api/v2/runtimes`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return { ok: false, languages: none, problem: `Piston answered with HTTP ${res.status}.` }
    const runtimes = (await res.json()) as { language?: string }[]
    const has = (name: string) => runtimes.some((r) => r.language === name)
    const languages = {
      cpp: has(PISTON_LANGUAGES.cpp),
      java: has(PISTON_LANGUAGES.java),
      python: has(PISTON_LANGUAGES.python),
    }
    const missing = Object.entries(languages)
      .filter(([, ok]) => !ok)
      .map(([id]) => ({ cpp: 'C++', java: 'Java', python: 'Python' })[id])
    return {
      ok: true,
      languages,
      ...(missing.length ? { problem: `${missing.join(', ')} ${missing.length === 1 ? 'isn’t' : 'aren’t'} installed yet. ${INSTALL_HINT}` } : {}),
    }
  } catch {
    return { ok: false, languages: none, problem: 'Can’t reach Piston, which runs your code. Start it with ./start.sh.' }
  }
}

async function checkClaude(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, home: string): Promise<Health['claude']> {
  if (env.CLAUDE_CODE_OAUTH_TOKEN || env.ANTHROPIC_API_KEY) return { signedIn: true }
  const configDir = env.CLAUDE_CONFIG_DIR ?? path.join(home, '.claude')
  try {
    await access(path.join(configDir, '.credentials.json'))
    return { signedIn: true }
  } catch {
    // On macOS, Claude Code keeps the login in the keychain, where the server can't look.
    if (platform === 'darwin' && !env.CLAUDE_CONFIG_DIR) return { signedIn: 'unknown' }
    return {
      signedIn: false,
      problem: 'Claude isn’t signed in. Run claude setup-token, then ./start.sh and paste the token.',
    }
  }
}

async function checkFolder(name: string, dir: string): Promise<Health['folders'][number]> {
  const probe = path.join(dir, `.write-check-${process.pid}`)
  try {
    await writeFile(probe, '')
    await rm(probe, { force: true })
    return { name, ok: true }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    const why = code === 'ENOENT' ? 'doesn’t exist' : code === 'EACCES' || code === 'EPERM' ? 'isn’t writable' : `can’t be written (${code})`
    return { name, ok: false, problem: `The ${name} folder ${why}, so work there won’t be saved.` }
  }
}

export async function checkHealth({ pistonUrl, folders, env = process.env, platform = process.platform, home = homedir(), fetchImpl = fetch }: Options): Promise<Health> {
  const [piston, claude, ...dirs] = await Promise.all([
    checkPiston(pistonUrl, fetchImpl),
    checkClaude(env, platform, home),
    ...Object.entries(folders).map(([name, dir]) => checkFolder(name, dir)),
  ])
  return { piston, claude, folders: dirs }
}

export function createHealthMiddleware(options: Options): Middleware {
  return (req, res, next) => {
    if (req.method !== 'GET' || (req.url ?? '').split('?')[0] !== ROUTE) return next()
    void checkHealth(options).then((health) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(health))
    })
  }
}
