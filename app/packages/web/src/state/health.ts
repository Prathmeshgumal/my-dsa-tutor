import { create } from 'zustand'
import type { Health } from '@dsa/core/health'

/** The setup check (GET /api/health): is Piston up with its languages, is Claude signed in, can work be saved. */
interface HealthState {
  health: Health | null
  status: 'idle' | 'checking' | 'done' | 'error'
  /** Saving open tabs, chats and settings to disk is failing right now (lib/stateSync.ts keeps retrying). */
  stateSaveFailing: boolean
  check(fetchImpl?: typeof fetch): Promise<Health | null>
}

export const useHealth = create<HealthState>()((set) => ({
  health: null,
  status: 'idle',
  stateSaveFailing: false,
  async check(fetchImpl = fetch) {
    set({ status: 'checking' })
    try {
      const res = await fetchImpl('/api/health')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const health = (await res.json()) as Health
      set({ health, status: 'done' })
      return health
    } catch {
      set({ status: 'error' })
      return null
    }
  },
}))
