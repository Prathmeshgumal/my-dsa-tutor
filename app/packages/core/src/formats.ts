// Every JSON file the editor saves carries a format version, so a later change to a format can upgrade old
// files instead of misreading them, and an older editor refuses a newer file instead of overwriting it.

/** The current version of each saved format. Bump one, and add its step to MIGRATIONS, when it changes. */
export const FORMATS = {
  /** problems/<slug>/problem.json */
  problem: 1,
  /** problems/<slug>/attempts/<time>.json */
  attempt: 1,
  /** playground/<id>.json */
  dryRun: 1,
} as const

export type FormatKind = keyof typeof FORMATS

type Json = Record<string, unknown>

/**
 * MIGRATIONS[kind][n] turns version n into version n + 1. Version 0 is a file saved before versions
 * existed; it is already in the version 1 shape, so its step only adds the number.
 */
const MIGRATIONS: Record<FormatKind, ((data: Json) => Json)[]> = {
  problem: [(d) => d],
  attempt: [(d) => d],
  dryRun: [(d) => d],
}

export class NewerFormatError extends Error {}

/** The file's data with the current format version on it, ready to save. */
export function stamp<T extends object>(kind: FormatKind, data: T): T & { formatVersion: number } {
  return { ...data, formatVersion: FORMATS[kind] }
}

/**
 * Brings saved data up to the current format. Throws NewerFormatError for a file saved by a newer
 * version of the editor, and a plain Error for something that isn't a saved object at all.
 */
export function upgrade<T>(kind: FormatKind, raw: unknown): T {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Not a saved object')
  let data = raw as Json
  const saved = data.formatVersion === undefined ? 0 : data.formatVersion
  if (typeof saved !== 'number' || !Number.isInteger(saved) || saved < 0) throw new Error('Unreadable format version')
  if (saved > FORMATS[kind]) {
    throw new NewerFormatError('This was saved by a newer version of the editor. Update the editor to open it.')
  }
  for (let v = saved; v < FORMATS[kind]; v++) data = MIGRATIONS[kind][v](data)
  return { ...data, formatVersion: FORMATS[kind] } as T
}

/** Parses a saved JSON file and upgrades it (see upgrade). */
export function parseSaved<T>(kind: FormatKind, text: string): T {
  return upgrade<T>(kind, JSON.parse(text))
}
