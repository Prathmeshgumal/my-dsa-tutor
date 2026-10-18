import { fireEvent, render } from '@testing-library/react'
import App from './App'
import { useCommandMenu } from '@/components/command/CommandMenu'
import { useFileDialogs } from '@/components/editor/FileDialogs'
import { useRun } from '@/state/run'
import { useSettingsDialog } from '@/state/settingsDialog'

vi.mock('@monaco-editor/react', () => import('@/test/monacoStub'))

const runActiveFile = vi.fn(async () => {})

beforeEach(() => {
  runActiveFile.mockClear()
  useRun.setState({ state: 'idle', runActiveFile })
  useFileDialogs.setState({ kind: null, fileId: null })
  useSettingsDialog.setState({ open: false })
  useCommandMenu.setState({ open: false })
})

const pressRun = () => fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })

test('Ctrl+Enter anywhere runs the active file', () => {
  render(<App />)
  pressRun()
  expect(runActiveFile).toHaveBeenCalledOnce()
})

test.each([
  ['file dialog', () => useFileDialogs.setState({ kind: 'new', fileId: null })],
  ['settings dialog', () => useSettingsDialog.setState({ open: true })],
  ['command menu', () => useCommandMenu.setState({ open: true })],
])('Ctrl+Enter does nothing while the %s is open', (_, open) => {
  render(<App />)
  open()
  pressRun()
  expect(runActiveFile).not.toHaveBeenCalled()
})
