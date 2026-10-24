import { Pencil, Trash2 } from 'lucide-react'
import { focusEditor } from '@/components/editor/editorFocus'
import { openDeleteDialog, openNewFileDialog, openRenameDialog } from '@/components/editor/FileDialogs'
import { LanguageIcon } from '@/components/LanguageIcon'
import { ListPane, ListRow } from '@/components/shell/ListPane'
import { useWorkspace } from '@/state/workspace'

function pick(id: string) {
  useWorkspace.getState().openFile(id)
  focusEditor()
}

/** The Code section's list: every file in the solutions folder, open in a tab or not. */
export function FilesList() {
  const files = useWorkspace((s) => s.files)
  const activeId = useWorkspace((s) => s.activeId)
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <ListPane
      title="Files"
      count={files.length}
      onNew={openNewFileDialog}
      newLabel="New file"
      search
      empty="No files yet. Files are saved in the solutions folder."
    >
      {sorted.map((file) => (
        <ListRow
          key={file.id}
          icon={<LanguageIcon fileName={file.name} />}
          title={file.name}
          active={file.id === activeId}
          onOpen={() => pick(file.id)}
          onDoubleClick={() => openRenameDialog(file.id)}
          actions={[
            { label: 'Rename', icon: <Pencil />, onSelect: () => openRenameDialog(file.id) },
            { label: 'Delete', icon: <Trash2 />, destructive: true, onSelect: () => openDeleteDialog(file.id) },
          ]}
        />
      ))}
    </ListPane>
  )
}
