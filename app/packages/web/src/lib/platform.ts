const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

/** Display label for a shortcut with the platform's main modifier, e.g. "⌘K" on macOS, "Ctrl K" elsewhere. */
export function shortcut(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl ${key}`
}
