// What the editor remembers between visits (tabs, chats, settings), kept on disk by the server in
// <data folder>/state/<key>.json (see server/stateApi.ts). The browser holds a copy for speed.

/** Each kind of state, with the browser storage name it has always used. */
export const STATE_KEYS = {
  settings: 'dsa-editor:settings',
  workspace: 'dsa-editor:workspace',
  ai: 'dsa-editor:ai',
  problems: 'dsa-editor:problems',
} as const

export type StateKey = keyof typeof STATE_KEYS

/** GET /api/state: each kind as the JSON text it was saved as, or null if never saved. */
export type SavedState = Record<StateKey, string | null>
