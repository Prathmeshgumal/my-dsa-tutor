import { create } from 'zustand'

/** The Setup dialog (⚙️ in the left bar). */
interface SettingsDialogState {
  open: boolean
  show(): void
  hide(): void
}

export const useSettingsDialog = create<SettingsDialogState>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))
