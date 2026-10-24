// Shared between the server (packages/server/src/healthApi.ts) and the browser: GET /api/health.

/** What the setup check found. Each part says whether it works and, if not, how to fix it. */
export interface Health {
  piston: {
    ok: boolean
    /** Which of the editor's languages Piston has installed. */
    languages: { cpp: boolean; java: boolean; python: boolean }
    problem?: string
  }
  claude: {
    /** 'unknown' when the login lives somewhere the server can't see (e.g. the macOS keychain). */
    signedIn: boolean | 'unknown'
    problem?: string
  }
  /** The folders your work is saved in, and whether the server can write to them. */
  folders: { name: string; ok: boolean; problem?: string }[]
}

/** True when everything works (an unknown Claude login counts as fine). */
export function healthy(h: Health): boolean {
  const langs = Object.values(h.piston.languages).every(Boolean)
  return h.piston.ok && langs && h.claude.signedIn !== false && h.folders.every((f) => f.ok)
}
