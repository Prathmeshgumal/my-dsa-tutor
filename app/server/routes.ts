// Every route the editor serves, in order. Used by both the dev server (vite.config.ts) and the real server
// (main.ts), so they can't drift apart. Requests for anything else (the page itself) are passed on.
import { mkdirSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createPistonRunner } from '../src/lib/runner/piston.ts'
import { removeLeftoverTempFiles } from './atomicWrite.ts'
import { createClaudeChatMiddleware } from './claudeChat.ts'
import type { Config } from './config.ts'
import { createFolderEventsMiddleware } from './folderEvents.ts'
import { createHealthMiddleware } from './healthApi.ts'
import { createLogger, createLogMiddleware, type Logger } from './log.ts'
import { createProblemsMiddleware } from './problemsApi.ts'
import { createSameSiteGuard } from './sameSite.ts'
import { createNotesMiddleware, createPlaygroundMiddleware, createSolutionsMiddleware } from './solutionsApi.ts'

export type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

/** Runs the handlers in order until one answers; `next` is called if none does. */
export function chain(handlers: Middleware[]): Middleware {
  return (req, res, next) => {
    let i = 0
    const step = () => {
      const handler = handlers[i++]
      if (!handler) return next()
      try {
        handler(req, res, step)
      } catch (e) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
      }
    }
    step()
  }
}

export function createRoutes(config: Config, { logger = createLogger(config.folders.logs) }: { logger?: Logger } = {}): {
  handle: Middleware
  logger: Logger
} {
  const { solutions, notes, playground, problems } = config.folders
  // A fresh data folder (first start, or a new DATA_DIR) gets everything it needs.
  for (const folder of Object.values(config.folders)) mkdirSync(folder, { recursive: true })
  void removeLeftoverTempFiles([solutions, notes, playground, problems]).catch((e) =>
    logger.log('warn', 'Couldn’t clear temporary files left by an interrupted save', e),
  )
  const handle = chain([
    // First: other websites open in your browser may not use any of the routes below.
    createSameSiteGuard(),
    createLogMiddleware(logger),
    createHealthMiddleware({ pistonUrl: config.pistonUrl, folders: { solutions, notes, playground, problems } }),
    createFolderEventsMiddleware({ folders: { files: solutions, notes, playground, problems } }),
    createSolutionsMiddleware(solutions),
    createNotesMiddleware(notes),
    createPlaygroundMiddleware(playground),
    createProblemsMiddleware(problems),
    // Claude runs in the solutions folder, so it sees the same files the editor shows.
    createClaudeChatMiddleware({
      cwd: solutions,
      notesDir: notes,
      playgroundDir: playground,
      problemsDir: problems,
      runner: createPistonRunner({ baseUrl: `${config.pistonUrl}/api/v2` }),
      logger,
    }),
  ])
  return { handle, logger }
}
