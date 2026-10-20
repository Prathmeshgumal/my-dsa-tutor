import { useSettings } from './settings'
import { useFilesPanel } from './filesPanel'

beforeEach(() => {
  localStorage.clear()
  useSettings.setState({ apiKey: '', theme: 'system', panelLayout: null, runner: 'piston' })
})

test('defaults', () => {
  expect(useSettings.getState()).toMatchObject({ apiKey: '', theme: 'system', panelLayout: null, runner: 'piston' })
})

test('persists theme to dsa-editor:settings', () => {
  useSettings.getState().setTheme('light')
  expect(JSON.parse(localStorage.getItem('dsa-editor:settings')!).state.theme).toBe('light')
})

test('stores api key and panel layout', () => {
  useSettings.getState().setApiKey('k')
  useSettings.getState().setPanelLayout([60, 40])
  expect(useSettings.getState()).toMatchObject({ apiKey: 'k', panelLayout: [60, 40] })
})

test('stores the runner choice', () => {
  useSettings.getState().setRunner('judge0')
  expect(JSON.parse(localStorage.getItem('dsa-editor:settings')!).state.runner).toBe('judge0')
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
