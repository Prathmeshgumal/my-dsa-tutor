import { act, render } from '@testing-library/react'
import { ThemeProvider } from './ThemeProvider'
import { useSettings } from '@/state/settings'

type Listener = (e: { matches: boolean }) => void

function mockMatchMedia(initialDark: boolean) {
  let dark = initialDark
  const listeners = new Set<Listener>()
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes('dark') ? dark : false
    },
    media: query,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia
  return (next: boolean) => {
    dark = next
    listeners.forEach((l) => l({ matches: next }))
  }
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  useSettings.setState({ theme: 'system' })
})

test('system pref follows prefers-color-scheme dark', () => {
  mockMatchMedia(true)
  render(<ThemeProvider>x</ThemeProvider>)
  expect(document.documentElement).toHaveClass('dark')
})

test('explicit light overrides a dark system', () => {
  mockMatchMedia(true)
  render(<ThemeProvider>x</ThemeProvider>)
  act(() => useSettings.getState().setTheme('light'))
  expect(document.documentElement).not.toHaveClass('dark')
})

test('reacts to system change while on system', () => {
  const fire = mockMatchMedia(false)
  render(<ThemeProvider>x</ThemeProvider>)
  expect(document.documentElement).not.toHaveClass('dark')
  act(() => fire(true))
  expect(document.documentElement).toHaveClass('dark')
  act(() => fire(false))
  expect(document.documentElement).not.toHaveClass('dark')
})
