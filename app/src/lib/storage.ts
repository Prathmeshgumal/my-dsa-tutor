import { LANGUAGES } from './languages'
import { STATE_KEYS } from './appState'
import { stateStorage } from './stateSync'

export const WORKSPACE_KEY = STATE_KEYS.workspace

export interface CodeFile {
  id: string
  name: string
  content: string
}

export interface WorkspaceData {
  version: 1
  files: CodeFile[]
  openIds: string[]
  activeId: string | null
}

export function defaultWorkspace(): WorkspaceData {
  const file: CodeFile = { id: crypto.randomUUID(), name: 'main.cpp', content: LANGUAGES.cpp.template }
  return { version: 1, files: [file], openIds: [file.id], activeId: file.id }
}

const isString = (v: unknown): v is string => typeof v === 'string'

function isCodeFile(v: unknown): v is CodeFile {
  if (typeof v !== 'object' || v === null) return false
  const f = v as Record<string, unknown>
  return isString(f.id) && isString(f.name) && isString(f.content)
}

function parseWorkspace(raw: unknown): WorkspaceData | null {
  if (typeof raw !== 'object' || raw === null) return null
  const d = raw as Record<string, unknown>
  if (d.version !== 1 || !Array.isArray(d.files) || !d.files.every(isCodeFile)) return null
  if (!Array.isArray(d.openIds) || !d.openIds.every(isString)) return null
  if (d.activeId !== null && !isString(d.activeId)) return null

  const ids = new Set(d.files.map((f) => f.id))
  const openIds = d.openIds.filter((id) => ids.has(id))
  const activeId = d.activeId !== null && openIds.includes(d.activeId) ? d.activeId : null
  return { version: 1, files: d.files, openIds, activeId }
}

export function loadWorkspace(): WorkspaceData {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY)
    if (raw === null) return defaultWorkspace()
    return parseWorkspace(JSON.parse(raw)) ?? defaultWorkspace()
  } catch {
    return defaultWorkspace()
  }
}

export function saveWorkspace(d: WorkspaceData): boolean {
  try {
    // Kept on disk too (see stateSync).
    void stateStorage.setItem(WORKSPACE_KEY, JSON.stringify(d))
    return true
  } catch {
    return false
  }
}
