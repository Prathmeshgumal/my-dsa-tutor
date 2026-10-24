import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { useSettings } from './settings'
import { mockMatchMedia } from '@/test/matchMedia'
import { useListVisible } from './sections'

const ALL_OPEN = { problems: true, code: true, notes: true, dryruns: true, chats: true }

async function loadSaved(state: Record<string, unknown>) {
  localStorage.setItem('dsa-editor:settings', JSON.stringify({ state, version: 1 }))
  await useSettings.persist.rehydrate()
  return useSettings.getState()
}

beforeEach(() => {
  mockMatchMedia(() => false)
  localStorage.clear()
  useSettings.setState({ section: 'code', listOpen: { ...ALL_OPEN }, aiOpen: false, foldedForClaude: false })
})

describe('settings saved by the older layout land on the matching section', () => {
  test('the Problems screen with its list hidden', async () => {
    const s = await loadSaved({ screen: 'problem', problemListOpen: false, theme: 'dark' })
    expect(s.section).toBe('problems')
    expect(s.listOpen.problems).toBe(false)
    expect(s.theme).toBe('dark')
    expect(s).not.toHaveProperty('screen')
    expect(s).not.toHaveProperty('problemListOpen')
  })

  test('the Editor is now Code', async () => {
    expect((await loadSaved({ screen: 'editor' })).section).toBe('code')
  })

  test('the Playground is now Dry runs, and keeps its list setting', async () => {
    const s = await loadSaved({ screen: 'playground', playgroundListOpen: false })
    expect(s.section).toBe('dryruns')
    expect(s.listOpen).toEqual({ ...ALL_OPEN, dryruns: false })
  })

  test('notes that were open beside the editor open the Notes section', async () => {
    expect((await loadSaved({ screen: 'editor', notesOpen: true })).section).toBe('notes')
    expect((await loadSaved({ notesOpen: true })).section).toBe('notes')
  })

  test('notes open beside a problem stay on the problem', async () => {
    const s = await loadSaved({ screen: 'problem', notesOpen: true })
    expect(s.section).toBe('problems')
    expect(s).not.toHaveProperty('notesOpen')
  })
})

describe('the left bar', () => {
  test('pressing another section opens it; pressing the open one hides and shows its list', () => {
    useSettings.getState().pressSection('notes')
    expect(useSettings.getState()).toMatchObject({ section: 'notes', listOpen: ALL_OPEN })
    useSettings.getState().pressSection('notes')
    expect(useSettings.getState().listOpen.notes).toBe(false)
    useSettings.getState().pressSection('code')
    useSettings.getState().pressSection('notes')
    expect(useSettings.getState()).toMatchObject({ section: 'notes', listOpen: { ...ALL_OPEN, notes: false } })
    useSettings.getState().pressSection('notes')
    expect(useSettings.getState().listOpen.notes).toBe(true)
  })
})

describe('Claude and the list share the room', () => {
  test('opening Claude folds the list away; closing it brings the list back', () => {
    const { result } = renderHook(() => useListVisible('code'))
    expect(result.current).toBe(true)
    act(() => useSettings.getState().setAiOpen(true))
    expect(result.current).toBe(false)
    act(() => useSettings.getState().setAiOpen(false))
    expect(result.current).toBe(true)
  })

  test('the list can still be shown beside Claude, and stays hidden when you hid it yourself', () => {
    const { result } = renderHook(() => useListVisible('code'))
    act(() => useSettings.getState().setAiOpen(true))
    act(() => useSettings.getState().pressSection('code'))
    expect(result.current).toBe(true)
    act(() => useSettings.getState().pressSection('code'))
    act(() => useSettings.getState().setAiOpen(false))
    expect(result.current).toBe(false)
  })
})

describe('review fixes', () => {
  test('panel sizes from the old layout are carried over or dropped', async () => {
    const s = await loadSaved({
      playgroundLayout: {
        'list-main': { list: 18, main: 82 },
        'problem-outer': { list: 16, description: 38, work: 46 },
        'problem-outer-no-list': { description: 40, work: 60 },
        'problem-work': { editor: 70, tests: 30 },
      },
    })
    expect(s.playgroundLayout).toEqual({ 'problem-main': { description: 40, work: 60 }, 'problem-work': { editor: 70, tests: 30 } })
  })

  test('the Chats list shows even when Claude was open, since the chat is the page there', () => {
    const { result } = renderHook(() => useListVisible('chats'))
    act(() => useSettings.getState().setAiOpen(true))
    act(() => useSettings.getState().setSection('chats'))
    expect(result.current).toBe(true)
  })

  test('old settings with Claude open start with the lists folded', async () => {
    const s = await loadSaved({ screen: 'editor', aiOpen: true })
    expect(s.foldedForClaude).toBe(true)
  })

  test('on a narrow window the list never sits beside Claude, even when asked for', () => {
    mockMatchMedia(() => true)
    const { result } = renderHook(() => useListVisible('code'))
    act(() => useSettings.getState().setAiOpen(true))
    act(() => useSettings.getState().pressSection('code'))
    expect(result.current).toBe(false)
    act(() => useSettings.getState().setAiOpen(false))
    expect(result.current).toBe(true)
    mockMatchMedia(() => false)
  })
})
