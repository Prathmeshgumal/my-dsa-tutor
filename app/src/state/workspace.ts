import { create } from 'zustand'
import {
  languageFromFilename,
  uniqueName,
  validateFileName,
  withLanguage,
  type LanguageId,
} from '@/lib/languages'
import { loadWorkspace, type CodeFile, type WorkspaceData } from '@/lib/storage'

export type SaveStatus = 'saved' | 'saving' | 'error'
export type Result = { ok: true } | { ok: false; error: string }

interface WorkspaceState extends WorkspaceData {
  /** False until files have been loaded from disk at startup. */
  ready: boolean
  saveStatus: SaveStatus
  lastSavedAt: number | null
  createFile(name: string): Result
  renameFile(id: string, name: string): Result
  deleteFile(id: string): void
  updateContent(id: string, content: string): void
  openFile(id: string): void
  closeTab(id: string): void
  setActive(id: string): void
  setActiveLanguage(lang: LanguageId): void
  activeFile(): CodeFile | null
}

// After removing `id` from the tab strip, pick the tab to its right, else its left.
function closeInTabs(openIds: string[], activeId: string | null, id: string) {
  const idx = openIds.indexOf(id)
  const next = openIds.filter((t) => t !== id)
  if (activeId !== id) return { openIds: next, activeId }
  return { openIds: next, activeId: next[idx] ?? next[idx - 1] ?? null }
}

export const useWorkspace = create<WorkspaceState>()((set, get) => ({
  ...loadWorkspace(),
  ready: false,
  saveStatus: 'saved',
  lastSavedAt: null,

  createFile(name) {
    const v = validateFileName(name, get().files.map((f) => f.name))
    if (!v.ok) return v
    const file: CodeFile = {
      id: crypto.randomUUID(),
      name: v.name,
      content: languageFromFilename(v.name)!.template,
    }
    set((s) => ({ files: [...s.files, file], openIds: [...s.openIds, file.id], activeId: file.id }))
    return { ok: true }
  },

  renameFile(id, name) {
    const others = get().files.filter((f) => f.id !== id).map((f) => f.name)
    const v = validateFileName(name, others)
    if (!v.ok) return v
    set((s) => ({ files: s.files.map((f) => (f.id === id ? { ...f, name: v.name } : f)) }))
    return { ok: true }
  },

  deleteFile(id) {
    set((s) => ({ files: s.files.filter((f) => f.id !== id), ...closeInTabs(s.openIds, s.activeId, id) }))
  },

  updateContent(id, content) {
    set((s) => ({
      files: s.files.map((f) => (f.id === id ? { ...f, content } : f)),
      saveStatus: 'saving',
    }))
  },

  openFile(id) {
    set((s) => ({ openIds: s.openIds.includes(id) ? s.openIds : [...s.openIds, id], activeId: id }))
  },

  closeTab(id) {
    set((s) => closeInTabs(s.openIds, s.activeId, id))
  },

  setActive(id) {
    set({ activeId: id })
  },

  setActiveLanguage(lang) {
    const file = get().activeFile()
    if (!file || languageFromFilename(file.name)?.id === lang) return
    const others = get().files.filter((f) => f.id !== file.id).map((f) => f.name)
    const name = uniqueName(withLanguage(file.name, lang), others)
    set((s) => ({ files: s.files.map((f) => (f.id === file.id ? { ...f, name } : f)) }))
  },

  activeFile() {
    const { files, activeId } = get()
    return files.find((f) => f.id === activeId) ?? null
  },
}))
