// Shared between the server (packages/server/src/folderEvents.ts) and the browser: GET /api/events.

/** Which data folder changed outside the editor. */
export type FolderArea = 'files' | 'notes' | 'playground' | 'problems'

export interface FolderEvent {
  area: FolderArea
}
