import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { focusEditor } from '@/components/editor/editorFocus'
import type { Health } from '@/lib/health'
import { useHealth } from '@/state/health'
import { SettingsDialog, useSettingsDialog } from './SettingsDialog'

vi.mock('@/components/editor/editorFocus', () => ({ focusEditor: vi.fn(), registerEditor: vi.fn(() => () => {}) }))

const allGood: Health = {
  piston: { ok: true, languages: { cpp: true, java: true, python: true } },
  claude: { signedIn: true },
  folders: [
    { name: 'solutions', ok: true },
    { name: 'notes', ok: true },
  ],
}

function serve(health: Health | 'down') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => (health === 'down' ? Promise.reject(new TypeError('Failed to fetch')) : new Response(JSON.stringify(health)))),
  )
}

beforeEach(() => {
  useSettingsDialog.setState({ open: false })
  useHealth.setState({ health: null, status: 'idle' })
})

afterEach(() => vi.unstubAllGlobals())

test('closed by default; show() opens it and runs the check', async () => {
  serve(allGood)
  render(<SettingsDialog />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  useSettingsDialog.getState().show()
  const checks = await screen.findByRole('list', { name: 'Setup checks' })
  expect(within(checks).getByText('Signed in.')).toBeInTheDocument()
  expect(within(checks).getByText('Running, with every language installed.')).toBeInTheDocument()
  expect(within(checks).getByText('solutions, notes: all writable.')).toBeInTheDocument()
})

test('says what is wrong and how to fix it', async () => {
  serve({
    piston: { ok: true, languages: { cpp: true, java: false, python: true }, problem: 'Java isn’t installed yet. Run ./start.sh.' },
    claude: { signedIn: false, problem: 'Claude isn’t signed in. Run claude setup-token.' },
    folders: [{ name: 'notes', ok: false, problem: 'The notes folder isn’t writable.' }],
  })
  useSettingsDialog.getState().show()
  render(<SettingsDialog />)
  expect(await screen.findByText('Java isn’t installed yet. Run ./start.sh.')).toBeInTheDocument()
  expect(screen.getByText('Java missing')).toBeInTheDocument()
  expect(screen.getByText('Claude isn’t signed in. Run claude setup-token.')).toBeInTheDocument()
  expect(screen.getByText('The notes folder isn’t writable.')).toBeInTheDocument()
})

test('the server being down is said plainly', async () => {
  serve('down')
  useSettingsDialog.getState().show()
  render(<SettingsDialog />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t reach the editor server')
})

test('Check again re-runs the check; closing returns focus to the editor', async () => {
  serve(allGood)
  useSettingsDialog.getState().show()
  render(<SettingsDialog />)
  await screen.findByRole('list', { name: 'Setup checks' })
  await userEvent.click(screen.getByRole('button', { name: /check again/i }))
  expect(fetch).toHaveBeenCalledTimes(2)
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(useSettingsDialog.getState().open).toBe(false)
  expect(focusEditor).toHaveBeenCalled()
})
