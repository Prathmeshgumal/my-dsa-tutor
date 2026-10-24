import { useSettings } from './settings'
import { useFilesPanel } from './filesPanel'

beforeEach(() => {
  localStorage.clear()
  useSettings.setState({ theme: 'system', panelLayout: null })
})

test('defaults', () => {
  expect(useSettings.getState()).toMatchObject({ theme: 'system', panelLayout: null })
})

test('persists theme to dsa-editor:settings', () => {
  useSettings.getState().setTheme('light')
  expect(JSON.parse(localStorage.getItem('dsa-editor:settings')!).state.theme).toBe('light')
})

test('stores the panel layout', () => {
  useSettings.getState().setPanelLayout([60, 40])
  expect(useSettings.getState()).toMatchObject({ panelLayout: [60, 40] })
})

test('a RapidAPI key saved by an older version is wiped from the browser, other settings kept', async () => {
  localStorage.setItem('dsa-editor:settings', JSON.stringify({ state: { apiKey: 'secret', runner: 'judge0', theme: 'dark' }, version: 0 }))
  await useSettings.persist.rehydrate()
  const saved = localStorage.getItem('dsa-editor:settings')!
  expect(saved).not.toContain('secret')
  expect(JSON.parse(saved).state).toMatchObject({ theme: 'dark' })
  expect(JSON.parse(saved).state).not.toHaveProperty('runner')
  expect(useSettings.getState()).not.toHaveProperty('apiKey')
})


test('output sits on the right by default and the choice is remembered', () => {
  useSettings.setState({ outputPosition: 'right' })
  useSettings.getState().setOutputPosition('bottom')
  expect(JSON.parse(localStorage.getItem('dsa-editor:settings')!).state.outputPosition).toBe('bottom')
})

test('output is at the bottom and shown by default', () => {
  expect(useSettings.getInitialState()).toMatchObject({ outputPosition: 'bottom', outputOpen: true })
})

test('remembers whether the output is shown', () => {
  useSettings.getState().setOutputOpen(false)
  expect(JSON.parse(localStorage.getItem('dsa-editor:settings')!).state.outputOpen).toBe(false)
})

describe('pressing the button of the screen you are on hides or shows its list', () => {
  beforeEach(() => {
    useSettings.setState({ screen: 'editor', playgroundListOpen: true, problemListOpen: true })
    useFilesPanel.setState({ open: false })
  })

  test('Problems: opens the screen, then hides and shows the problem list', () => {
    useSettings.getState().pressScreen('problem')
    expect(useSettings.getState()).toMatchObject({ screen: 'problem', problemListOpen: true })
    useSettings.getState().pressScreen('problem')
    expect(useSettings.getState().problemListOpen).toBe(false)
    useSettings.getState().pressScreen('problem')
    expect(useSettings.getState().problemListOpen).toBe(true)
  })

  test('Editor: hides and shows the files', () => {
    useSettings.getState().pressScreen('editor')
    expect(useFilesPanel.getState().open).toBe(true)
    useSettings.getState().pressScreen('editor')
    expect(useFilesPanel.getState().open).toBe(false)
  })

  test('switching screens leaves the lists as they were', () => {
    useSettings.setState({ screen: 'problem', problemListOpen: false })
    useSettings.getState().pressScreen('editor')
    useSettings.getState().pressScreen('problem')
    expect(useSettings.getState()).toMatchObject({ screen: 'problem', problemListOpen: false })
    expect(useFilesPanel.getState().open).toBe(false)
  })
})
