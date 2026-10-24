import { create } from 'zustand'

interface FilesPanelState {
  open: boolean
  setOpen(open: boolean): void
}

/** The files drawer is transient (closes on outside click), so it is deliberately not persisted. */
export const useFilesPanel = create<FilesPanelState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
