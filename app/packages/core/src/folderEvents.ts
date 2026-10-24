// Shared between the server (server/src/dsa_server/folder_events.py) and the browser: GET /api/events.

/** Which data folder changed outside the editor. */
export type FolderArea = 'files' | 'notes' | 'playground' | 'problems'

export interface FolderEvent {
  area: FolderArea
}
