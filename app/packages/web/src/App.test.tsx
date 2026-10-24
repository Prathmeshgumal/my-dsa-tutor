import { fireEvent, render } from '@testing-library/react'
import App from './App'
import { useCommandMenu } from '@/components/command/CommandMenu'
import { useFileDialogs } from '@/components/editor/FileDialogs'
import { useRun } from '@/state/run'
import { useSettings } from '@/state/settings'
import { useSettingsDialog } from '@/state/settingsDialog'

vi.mock('@monaco-editor/react', () => import('@/test/monacoStub'))

const runActiveFile = vi.fn(async () => {})

beforeEach(() => {
  runActiveFile.mockClear()
  useRun.setState({ state: 'idle', runActiveFile })
  useFileDialogs.setState({ kind: null, fileId: null })
  useSettingsDialog.setState({ open: false })
  useCommandMenu.setState({ open: false })
  useSettings.setState({ section: 'code' })
})

// At the page, as a browser does (the Dry runs page reads the key's target element).
const pressRun = () => fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true })

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

test.each(['notes', 'dryruns', 'chats'] as const)('Ctrl+Enter on %s doesn’t run code you can’t see', (section) => {
  useSettings.setState({ section })
  render(<App />)
  pressRun()
  expect(runActiveFile).not.toHaveBeenCalled()
})

test('Ctrl+J toggles the output', () => {
  useSettings.setState({ outputOpen: true })
  render(<App />)
  fireEvent.keyDown(window, { key: 'j', ctrlKey: true })
  expect(useSettings.getState().outputOpen).toBe(false)
  fireEvent.keyDown(window, { key: 'j', metaKey: true })
  expect(useSettings.getState().outputOpen).toBe(true)
})
