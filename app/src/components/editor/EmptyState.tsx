import { FilePlus2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/Kbd'
import { shortcut } from '@/lib/platform'
import { openNewFileDialog } from './FileDialogs'

export function EmptyState() {
  return (
    <div data-testid="empty-state" className="flex flex-1 flex-col items-center justify-center gap-4 bg-card/40 p-6 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-violet-500/10 text-violet-500 ring-1 ring-violet-500/25">
        <FilePlus2 className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">No file open</p>
        <p className="text-[13px] text-muted-foreground">
          Create a file to start coding, or press <Kbd>{shortcut('K')}</Kbd> to open one.
        </p>
      </div>
      <Button size="sm" onClick={openNewFileDialog}>
        New file
      </Button>
    </div>
  )
}
