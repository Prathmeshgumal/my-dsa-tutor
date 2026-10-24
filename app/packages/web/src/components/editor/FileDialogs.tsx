import { useState } from 'react'
import { create } from 'zustand'
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
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { uniqueName } from '@dsa/core/languages'
import { useWorkspace } from '@/state/workspace'
import { focusEditor } from './editorFocus'

type DialogKind = 'new' | 'rename' | 'delete'

interface FileDialogsState {
  kind: DialogKind | null
  fileId: string | null
}

export const useFileDialogs = create<FileDialogsState>()(() => ({ kind: null, fileId: null }))

export const openNewFileDialog = () => useFileDialogs.setState({ kind: 'new', fileId: null })
export const openRenameDialog = (id: string) => useFileDialogs.setState({ kind: 'rename', fileId: id })
export const openDeleteDialog = (id: string) => useFileDialogs.setState({ kind: 'delete', fileId: id })
const close = () => useFileDialogs.setState({ kind: null, fileId: null })

// Return the cursor to the code instead of the button that opened the dialog.
const backToEditor = (e: Event) => {
  e.preventDefault()
  focusEditor()
}

function NameDialog({ kind, fileId }: { kind: 'new' | 'rename'; fileId: string | null }) {
  const files = useWorkspace((s) => s.files)
  const current = files.find((f) => f.id === fileId)
  const [name, setName] = useState(() =>
    kind === 'rename' ? (current?.name ?? '') : uniqueName('main.cpp', files.map((f) => f.name)),
  )
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const { createFile, renameFile } = useWorkspace.getState()
    const result = kind === 'new' ? createFile(name) : renameFile(fileId!, name)
    if (result.ok) close()
    else setError(result.error)
  }

  return (
    <DialogContent className="sm:max-w-sm" onCloseAutoFocus={backToEditor}>
      <form onSubmit={submit} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>{kind === 'new' ? 'New file' : 'Rename file'}</DialogTitle>
          <DialogDescription>The extension picks the language: .cpp, .java or .py</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Input
            autoFocus
            aria-label="File name"
            aria-invalid={error !== null}
            className="font-mono"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            onFocus={(e) => {
              const dot = e.target.value.lastIndexOf('.')
              e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length)
            }}
          />
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit">{kind === 'new' ? 'Create' : 'Rename'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}

export function FileDialogs() {
  const { kind, fileId } = useFileDialogs()
  const file = useWorkspace((s) => s.files.find((f) => f.id === fileId))

  return (
    <>
      <Dialog open={kind === 'new' || kind === 'rename'} onOpenChange={(open) => !open && close()}>
        {(kind === 'new' || kind === 'rename') && <NameDialog key={`${kind}:${fileId}`} kind={kind} fileId={fileId} />}
      </Dialog>

      <AlertDialog open={kind === 'delete'} onOpenChange={(open) => !open && close()}>
        <AlertDialogContent onCloseAutoFocus={backToEditor}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {file?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <span className="font-mono text-foreground">{file?.name}</span> and its code. You can’t undo
              this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (fileId) useWorkspace.getState().deleteFile(fileId)
                close()
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
