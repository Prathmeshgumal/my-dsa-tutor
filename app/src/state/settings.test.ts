import { useSettings } from './settings'

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

