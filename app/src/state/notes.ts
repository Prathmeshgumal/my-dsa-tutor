import { create } from 'zustand'
import { nextNoteName, noteTitle } from '@/lib/noteTitle'
import { useProblems } from './problems'
import { useSettings } from './settings'

export { noteTitle }

/** Markdown notes, stored as .md files in the notes folder via /api/notes. Disk is the only copy. */
export interface Note {
  name: string
  content: string
}

interface NotesState {
  notes: Note[]
  activeName: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** pending = typed but not written yet. */
  saveStatus: 'saved' | 'pending' | 'saving' | 'error'
  load(): Promise<void>
  create(): Promise<void>
  select(name: string): Promise<void>
  edit(content: string): void
  remove(name: string): Promise<void>
  /** Writes any pending edit now (switching notes, closing the page). */
  flush(): Promise<void>
}

const API = '/api/notes'
const NEW_NOTE = '# Untitled note\n\n'

let deps = { fetchImpl: ((...args: Parameters<typeof fetch>) => fetch(...args)) as typeof fetch, delayMs: 800 }

/** Test seam: swap the fetch used and the autosave delay. */
export function configureNotes(next: Partial<typeof deps>) {
  deps = { ...deps, ...next }
}

const noteUrl = (name: string) => `${API}/${encodeURIComponent(name)}`

async function request(url: string, init?: RequestInit, keepalive = false): Promise<Response> {
  const res = await deps.fetchImpl(url, keepalive ? { ...init, keepalive } : init)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res
}

const writeNote = (note: Note, keepalive = false) =>
  request(
    noteUrl(note.name),
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: note.content }) },
    keepalive,
  )

const nextName = (notes: Note[]) => nextNoteName(notes.map((n) => n.name))

// The note waiting to be written, and its timer.
let pending: Note | null = null
let timer: ReturnType<typeof setTimeout> | null = null

export const useNotes = create<NotesState>()((set, get) => {
  async function save(note: Note, keepalive = false) {
    set({ saveStatus: 'saving' })
    try {
      await writeNote(note, keepalive)
      // A newer edit may have been queued while this one was in flight.
      if (!pending) set({ saveStatus: 'saved' })
    } catch {
      set({ saveStatus: 'error' })
    }
  }

  return {
    notes: [],
    activeName: null,
    status: 'idle',
    saveStatus: 'saved',

    async load() {
      set({ status: 'loading' })
      try {
        const res = await request(API)
        const notes = ((await res.json()) as Note[]).sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true }),
        )
        const active = notes.some((n) => n.name === get().activeName) ? get().activeName : (notes[0]?.name ?? null)
        set({ notes, activeName: active, status: 'ready' })
      } catch {
        set({ status: 'error' })
      }
    },

    async create() {
      await get().flush()
      const note = { name: nextName(get().notes), content: NEW_NOTE }
      set((s) => ({ notes: [...s.notes, note], activeName: note.name }))
      await save(note)
      // A note started while a problem is open belongs to that problem.
      if (useSettings.getState().screen === 'problem') await useProblems.getState().linkNote(note.name).catch(() => {})
    },

    async select(name) {
      await get().flush()
      set({ activeName: name })
    },

    edit(content) {
      const name = get().activeName
      if (!name) return
      set((s) => ({ notes: s.notes.map((n) => (n.name === name ? { ...n, content } : n)), saveStatus: 'pending' }))
      pending = { name, content }
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void get().flush(), deps.delayMs)
    },

    async remove(name) {
      if (pending?.name === name) {
        pending = null
        if (timer) clearTimeout(timer)
      } else {
        await get().flush()
      }
      try {
        await request(noteUrl(name), { method: 'DELETE' })
      } catch {
        set({ saveStatus: 'error' })
        return
      }
      set((s) => {
        const notes = s.notes.filter((n) => n.name !== name)
        return { notes, activeName: s.activeName === name ? (notes[0]?.name ?? null) : s.activeName, saveStatus: 'saved' }
      })
    },

    async flush() {
      if (timer) clearTimeout(timer)
      timer = null
      const note = pending
      pending = null
      if (note) await save(note)
    },
  }
})

/** Last chance to write an unsaved edit when the tab closes. */
export function flushNotesOnUnload() {
  if (timer) clearTimeout(timer)
  if (pending) void writeNote(pending, true).catch(() => {})
  pending = null
}
