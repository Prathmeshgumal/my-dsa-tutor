import { create } from 'zustand'

export type SettingsDialogReason = 'manual' | 'no_key'

interface SettingsDialogState {
  open: boolean
  reason: SettingsDialogReason
  show(reason?: SettingsDialogReason): void
  hide(): void
}

export const useSettingsDialog = create<SettingsDialogState>()((set) => ({
  open: false,
  reason: 'manual',
  show: (reason = 'manual') => set({ open: true, reason }),
  hide: () => set({ open: false }),
}))
