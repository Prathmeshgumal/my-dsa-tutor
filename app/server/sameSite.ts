// Only the editor's own page may use the editor's routes. Without this, any website open in the browser
// could send requests to localhost and run code, read your files, or ask Claude to change them.
import type { IncomingMessage, ServerResponse } from 'node:http'

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

/** The routes that read or change your work, run code, or talk to Claude. */
const GUARDED = /^\/(api|piston)(\/|$)/

export function fromAnotherSite(req: IncomingMessage): boolean {
  // Sent by browsers on every request: same-origin for the editor's own page, none when you type the address.
  const site = req.headers['sec-fetch-site']
  if (site && site !== 'same-origin' && site !== 'none') return true
  const origin = req.headers.origin
  if (!origin) return false
  try {
    return new URL(origin).host !== req.headers.host
  } catch {
    return true
  }
}

export function createSameSiteGuard(): Middleware {
  return (req, res, next) => {
    if (!GUARDED.test((req.url ?? '').split('?')[0]) || !fromAnotherSite(req)) return next()
    res.statusCode = 403
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Only the editor itself can use this.' }))
  }
}
