import { focusEditor, registerEditor } from './editorFocus'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('focusEditor focuses the registered editor on the next frame', () => {
  const editor = { focus: vi.fn() }
  const unregister = registerEditor(editor)
  focusEditor()
  expect(editor.focus).not.toHaveBeenCalled()
  vi.advanceTimersToNextFrame()
  expect(editor.focus).toHaveBeenCalledOnce()
  unregister()
})

test('no editor registered → no-op', () => {
  expect(() => {
    focusEditor()
    vi.advanceTimersToNextFrame()
  }).not.toThrow()
})

test('unregister stops focusing that editor', () => {
  const editor = { focus: vi.fn() }
  registerEditor(editor)()
  focusEditor()
  vi.advanceTimersToNextFrame()
  expect(editor.focus).not.toHaveBeenCalled()
})
