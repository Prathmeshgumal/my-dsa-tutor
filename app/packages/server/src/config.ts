// Where the editor keeps its data, and how it's reached. Read once at start-up from, in order of priority:
//   1. environment settings (PORT, HOST, PISTON_URL, DATA_DIR, SOLUTIONS_DIR, NOTES_DIR, PLAYGROUND_DIR,
//      PROBLEMS_DIR, LOGS_DIR, STATE_DIR)
//   2. dsa-tutor.json in the data folder (optional), e.g. { "port": 5199, "folders": { "notes": "my-notes" } }
//   3. defaults: everything in the data folder, which is the project folder unless DATA_DIR says otherwise
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

export const CONFIG_FILE = 'dsa-tutor.json'

const FOLDERS = ['solutions', 'notes', 'playground', 'problems', 'logs', 'state'] as const
export type Folder = (typeof FOLDERS)[number]

/** The environment setting that overrides each folder. */
const FOLDER_ENV: Record<Folder, string> = {
  solutions: 'SOLUTIONS_DIR',
  notes: 'NOTES_DIR',
  playground: 'PLAYGROUND_DIR',
  problems: 'PROBLEMS_DIR',
  logs: 'LOGS_DIR',
  state: 'STATE_DIR',
}

export interface Config {
  port: number
  /** The address the server listens on: 127.0.0.1 keeps it to this computer. */
  host: string
  pistonUrl: string
  dataDir: string
  folders: Record<Folder, string>
}

export class ConfigError extends Error {}

const port = z.number().int().min(1).max(65535)

const fileSchema = z.strictObject({
  port: port.optional(),
  host: z.string().min(1).optional(),
  pistonUrl: z.url().optional(),
  folders: z.strictObject(Object.fromEntries(FOLDERS.map((f) => [f, z.string().min(1).optional()])) as Record<Folder, z.ZodOptional<z.ZodString>>).optional(),
})

function readFile(file: string): z.infer<typeof fileSchema> {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return {}
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ConfigError(`${file} isn’t valid JSON.`)
  }
  const parsed = fileSchema.safeParse(raw)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.length ? `${i.path.join('.')}: ` : ''}${i.message}`)
    throw new ConfigError(`${file} has a problem: ${problems.join('; ')}`)
  }
  return parsed.data
}

function envPort(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined
  const n = Number(value)
  if (!port.safeParse(n).success) throw new ConfigError('PORT must be a whole number from 1 to 65535.')
  return n
}

export function loadConfig({
  env = process.env,
  defaultDataDir,
}: {
  env?: Record<string, string | undefined>
  /** Where data lives when DATA_DIR isn't set: the project folder. */
  defaultDataDir: string
}): Config {
  const dataDir = path.resolve(env.DATA_DIR || defaultDataDir)
  const file = readFile(path.join(dataDir, CONFIG_FILE))
  const folders = Object.fromEntries(
    FOLDERS.map((f) => [f, path.resolve(dataDir, env[FOLDER_ENV[f]] || file.folders?.[f] || f)]),
  ) as Record<Folder, string>
  return {
    port: envPort(env.PORT) ?? file.port ?? 5199,
    host: env.HOST || file.host || '127.0.0.1',
    pistonUrl: env.PISTON_URL || file.pistonUrl || 'http://127.0.0.1:2000',
    dataDir,
    folders,
  }
}
