import { MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/state/workspace'
import { focusEditor } from './editorFocus'
import { openDeleteDialog, openNewFileDialog, openRenameDialog } from './FileDialogs'

export function FileTabs() {
  const files = useWorkspace((s) => s.files)
  const openIds = useWorkspace((s) => s.openIds)
  const activeId = useWorkspace((s) => s.activeId)
  const { setActive, closeTab } = useWorkspace.getState()
  const tabs = openIds.flatMap((id) => files.filter((f) => f.id === id))

  return (
    <div className="flex h-[38px] shrink-0 items-end gap-0.5 border-b px-2">
      <div role="tablist" aria-label="Open files" className="flex min-w-0 items-end gap-0.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
        {tabs.map((file) => {
          const active = file.id === activeId
          return (
            <div
              key={file.id}
              className={cn(
                'group/tab -mb-px flex h-[30px] shrink-0 items-center rounded-t-lg border border-transparent pr-1 pl-3 text-[12.5px] transition-colors',
                active
                  ? 'border-border border-b-card bg-card text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setActive(file.id)
                  focusEditor()
                }}
                onDoubleClick={() => openRenameDialog(file.id)}
                className="flex items-center gap-2 outline-none focus-visible:underline"
              >
                {active && (
                  <span
                    data-testid="active-dot"
                    className="size-1.5 rounded-full bg-violet-500 shadow-[0_0_6px] shadow-violet-500"
                    aria-hidden
                  />
                )}
                <span className="font-mono">{file.name}</span>
              </button>
              <button
                type="button"
                aria-label={`Close ${file.name}`}
                onClick={() => closeTab(file.id)}
                className={cn(
                  'ml-1 grid size-5 place-items-center rounded text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100',
                  active ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
                )}
              >
                <X className="size-3" />
              </button>
            </div>
          )
        })}
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="New file"
        onClick={openNewFileDialog}
        className="mb-1 text-muted-foreground"
      >
        <Plus />
      </Button>

      <div className="flex-1" />

      {activeId && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="File actions" className="mb-1 text-muted-foreground">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => openRenameDialog(activeId)}>
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => openDeleteDialog(activeId)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
