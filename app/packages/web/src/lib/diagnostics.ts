// "Copy diagnostics" in the Setup dialog: what someone helping you needs to see what's wrong.
import type { Health } from '@dsa/core/health'

/** Sends an error from the browser to the editor's log file. Never throws. */
export function reportError(message: string, detail?: unknown): void {
  const text = detail instanceof Error ? (detail.stack ?? detail.message) : detail === undefined ? undefined : String(detail)
  void fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level: 'error', message, ...(text ? { detail: text.slice(0, 4000) } : {}) }),
    keepalive: true,
  }).catch(() => {})
}

/** The setup check, the browser, and the end of the log, as text. */
export async function collectDiagnostics(fetchImpl: typeof fetch = fetch): Promise<string> {
  const health = await fetchImpl('/api/health')
    .then((r) => r.json() as Promise<Health>)
    .catch(() => 'unreachable')
  const log = await fetchImpl('/api/logs?tail=60')
    .then((r) => r.text())
    .catch(() => 'unreachable')
  return [
    '## DSA editor diagnostics',
    `Time: ${new Date().toISOString()}`,
    `Browser: ${navigator.userAgent}`,
    `Page: ${location.href}`,
    '',
    '### Setup check',
    '```json',
    JSON.stringify(health, null, 2),
    '```',
    '',
    '### Last log lines',
    '```',
    log || '(empty)',
    '```',
  ].join('\n')
}

/** Copies the diagnostics to the clipboard; false if the browser refused. */
export async function copyDiagnostics(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(await collectDiagnostics())
    return true
  } catch {
    return false
  }
}
