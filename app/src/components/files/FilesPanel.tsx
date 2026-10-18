import { FolderOpen, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { openDeleteDialog, openNewFileDialog, openRenameDialog } from '@/components/editor/FileDialogs'
import { LanguageIcon } from '@/components/LanguageIcon'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/state/workspace'

/** Explorer listing every file in the solutions folder, open in a tab or not. */
export function FilesPanel() {
  const files = useWorkspace((s) => s.files)
  const activeId = useWorkspace((s) => s.activeId)
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <aside aria-label="Files" className="flex w-56 shrink-0 flex-col border-r bg-card/30">
      <div className="flex h-[38px] shrink-0 items-center gap-2 border-b pr-1.5 pl-3">
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Files</span>
        <span className="text-[11px] text-muted-foreground/70 tabular-nums">
          {files.length} {files.length === 1 ? 'file' : 'files'}
        </span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" aria-label="New file" onClick={openNewFileDialog} className="text-muted-foreground">
          <Plus />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-[13px] text-muted-foreground">
            <p>No files yet.</p>
            <Button size="sm" variant="outline" onClick={openNewFileDialog}>
              <Plus /> New file
            </Button>
          </div>
        ) : (
          <ul aria-label="All files" className="grid gap-px p-1.5">
            {sorted.map((file) => {
              const active = file.id === activeId
              return (
                <li
                  key={file.id}
                  className={cn(
                    'group/row flex items-center rounded-md transition-colors',
                    active ? 'bg-violet-500/12 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <button
                    type="button"
                    aria-current={active || undefined}
                    onClick={() => useWorkspace.getState().openFile(file.id)}
                    onDoubleClick={() => openRenameDialog(file.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 text-left outline-none focus-visible:underline"
                  >
                    <LanguageIcon fileName={file.name} className="size-3.5 shrink-0" />
                    <span className="truncate font-mono text-[12.5px]">{file.name}</span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Actions for ${file.name}`}
                        className="mr-1 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="right">
                      <DropdownMenuItem onSelect={() => openRenameDialog(file.id)}>
                        <Pencil /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => openDeleteDialog(file.id)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>

      <div className="flex h-7 shrink-0 items-center gap-1.5 border-t px-3 text-[11px] text-muted-foreground" title="Files are saved as real files in this folder">
        <FolderOpen className="size-3" aria-hidden />
        <span className="font-mono">solutions/</span>
      </div>
    </aside>
  )
}
