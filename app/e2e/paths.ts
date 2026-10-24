// Where the browser tests' editor keeps its data. It's wiped and refilled every time the tests start.
import path from 'node:path'

export const E2E_PORT = 5399
export const DATA_DIR = path.resolve(import.meta.dirname, '.data')
export const SOLUTIONS = path.join(DATA_DIR, 'solutions')
export const STATE = path.join(DATA_DIR, 'state')
export const PROBLEMS = path.join(DATA_DIR, 'problems')
