import { useState } from 'react'
import { MessageSquare, Trash2 } from 'lucide-react'
import { ProblemTag } from '@/components/problems/ProblemTag'
import { ListPane, ListRow } from '@/components/shell/ListPane'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { activeChat, useAiChat, type Chat } from '@/state/aiChat'
import { useListVisible } from '@/state/sections'
import { Conversation } from './AiPanel'

function timeAgo(at: number): string {
  const minutes = Math.floor(Math.max(0, Date.now() - at) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** The Chats section: every chat with Claude on the left, the open one beside it. */
export function ChatsScreen() {
  const listShown = useListVisible('chats')
  const chats = useAiChat((s) => s.chats)
  const activeId = useAiChat((s) => s.activeChatId)
  const title = useAiChat((s) => activeChat(s)?.title ?? 'New chat')
  const [deleting, setDeleting] = useState<Chat | null>(null)

  return (
    <>
      {listShown && (
        <ListPane
          title="Chats"
          count={chats.length}
          onNew={() => useAiChat.getState().newChat()}
          newLabel="New chat"
          search
          empty="No chats yet. Ask Claude anything below."
        >
          {chats.map((c) => (
            <ListRow
              key={c.id}
              icon={<MessageSquare className={c.id === activeId ? 'text-violet-500' : undefined} />}
              title={c.title}
              meta={
                <span className="flex min-w-0 items-center gap-1.5">
                  {timeAgo(c.updatedAt)}
                  <ProblemTag slug={c.problemSlug} />
                </span>
              }
              active={c.id === activeId}
              onOpen={() => useAiChat.getState().selectChat(c.id)}
              actions={[{ label: 'Delete', icon: <Trash2 />, destructive: true, onSelect: () => setDeleting(c) }]}
            />
          ))}
        </ListPane>
      )}

      <main aria-label="Chat" className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[38px] shrink-0 items-center border-b px-4">
          <h1 className="min-w-0 truncate text-[13px] font-medium">{title}</h1>
        </div>
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
          <Conversation />
        </div>
      </main>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>The conversation is removed. You can’t undo this.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) useAiChat.getState().deleteChat(deleting.id)
                setDeleting(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
