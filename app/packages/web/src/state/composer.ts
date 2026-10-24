import { create } from 'zustand'
import type { Attachment } from '@/lib/images'

export type PendingImage = Attachment & { id: string }

interface ComposerState {
  /** What you've typed to Claude but not sent yet. */
  draft: string
  attachments: PendingImage[]
  setDraft(draft: string): void
  setAttachments(next: PendingImage[] | ((list: PendingImage[]) => PendingImage[])): void
}

/** The message box's contents, kept outside the box so they survive moving between the Claude panel and the Chats
 * page. Not saved: a reload starts empty, as before. */
export const useComposer = create<ComposerState>()((set) => ({
  draft: '',
  attachments: [],
  setDraft: (draft) => set({ draft }),
  setAttachments: (next) => set((s) => ({ attachments: typeof next === 'function' ? next(s.attachments) : next })),
}))
