import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { focusEditor } from '@/components/editor/editorFocus'
import type { Health } from '@dsa/core/health'
import { useHealth } from '@/state/health'
import { useAccount, type ClaudeAccount } from '@/state/account'
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

const signedIn: ClaudeAccount = { signedIn: true, method: 'claude.ai', email: 'me@example.com', plan: 'pro', org: 'Me' }

/** Answers like the server: /api/health, and the account routes (null leaves the account unanswered). */
function serve(health: Health | 'down', account: ClaudeAccount | null = signedIn, routes: Record<string, () => Response> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (health === 'down') throw new TypeError('Failed to fetch')
      if (routes[url]) return routes[url]()
      if (url === '/api/claude/account') return account ? new Response(JSON.stringify(account)) : new Promise<Response>(() => {})
      if (url === '/api/claude/models') return new Response(JSON.stringify({ models: [] }))
      return new Response(JSON.stringify(health))
    }),
  )
}

const calls = (url: string) => vi.mocked(fetch).mock.calls.filter(([u]) => u === url)

beforeEach(() => {
  useSettingsDialog.setState({ open: false })
  useHealth.setState({ health: null, status: 'idle', stateSaveFailing: false })
  useAccount.setState({ account: null, status: 'idle', error: null, signIn: { step: 'off' }, signingOut: false })
})

afterEach(() => vi.unstubAllGlobals())

test('closed by default; show() opens it and runs the check', async () => {
  serve(allGood)
  render(<SettingsDialog />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  useSettingsDialog.getState().show()
  const checks = await screen.findByRole('list', { name: 'Setup checks' })
  expect(await within(checks).findByText('Signed in as me@example.com · Pro plan')).toBeInTheDocument()
  expect(within(checks).getByText('Running, with every language installed.')).toBeInTheDocument()
  expect(within(checks).getByText('solutions, notes: all writable.')).toBeInTheDocument()
})

test('says what is wrong and how to fix it', async () => {
  serve({
    piston: { ok: true, languages: { cpp: true, java: false, python: true }, problem: 'Java isn’t installed yet. Run ./start.sh.' },
    claude: { signedIn: false, problem: 'Claude isn’t signed in. Click Sign in below.' },
    folders: [{ name: 'notes', ok: false, problem: 'The notes folder isn’t writable.' }],
  }, null)
  useSettingsDialog.getState().show()
  render(<SettingsDialog />)
  expect(await screen.findByText('Java isn’t installed yet. Run ./start.sh.')).toBeInTheDocument()
  expect(screen.getByText('Java missing')).toBeInTheDocument()
  // Until the account answers, the quick check speaks for Claude.
  expect(screen.getByText('Claude isn’t signed in. Click Sign in below.')).toBeInTheDocument()
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
  expect(calls('/api/health')).toHaveLength(2)
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(useSettingsDialog.getState().open).toBe(false)
  expect(focusEditor).toHaveBeenCalled()
})

test('tabs, chats and settings failing to reach disk shows up here, not just in a toast', async () => {
  serve(allGood)
  useHealth.setState({ stateSaveFailing: true })
  render(<SettingsDialog />)
  useSettingsDialog.getState().show()
  const checks = await screen.findByRole('list', { name: 'Setup checks' })
  expect(await within(checks).findByText(/Your open tabs, chats and settings couldn’t be saved to disk/)).toBeInTheDocument()
  expect(within(checks).queryByText(/all writable/)).not.toBeInTheDocument()
})

describe('Claude account', () => {
  const signedOut: ClaudeAccount = { signedIn: false }
  const URL = 'https://claude.com/cai/oauth/authorize?code=true&state=s'
  const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status })

  function fakeTab() {
    const tab = { opener: {} as unknown, location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    return tab
  }

  async function openSetup() {
    useSettingsDialog.getState().show()
    render(<SettingsDialog />)
    return screen.findByRole('group', { name: 'Claude account' })
  }

  afterEach(() => vi.restoreAllMocks())

  test('signed out: Sign in opens the sign-in page, and the pasted code finishes it', async () => {
    serve(allGood, signedOut, {
      '/api/claude/account/login': json({ url: URL }),
      '/api/claude/account/login/code': json(signedIn),
    })
    const tab = fakeTab()
    const section = await openSetup()
    expect(await screen.findByText('Not signed in. Sign in with your Claude account to use the Claude panel.')).toBeInTheDocument()
    await userEvent.click(within(section).getByRole('button', { name: /sign in to claude/i }))
    expect(window.open).toHaveBeenCalledWith('', '_blank')
    expect(tab.opener).toBeNull()
    expect(tab.location.href).toBe(URL)
    expect(within(section).getByRole('link', { name: /open it again/i })).toHaveAttribute('href', URL)

    await userEvent.type(within(section).getByRole('textbox', { name: 'Sign-in code' }), '  abc#s  ')
    await userEvent.click(within(section).getByRole('button', { name: /finish signing in/i }))
    expect(await screen.findByText('Signed in as me@example.com · Pro plan')).toBeInTheDocument()
    const [, init] = calls('/api/claude/account/login/code')[0]
    expect(JSON.parse(init!.body as string)).toEqual({ code: 'abc#s' })
    // The models and the setup check are asked again for the new account.
    expect(calls('/api/claude/models').length).toBeGreaterThan(0)
    expect(calls('/api/health').length).toBeGreaterThan(1)
    expect(within(section).queryByRole('textbox')).not.toBeInTheDocument()
  })

  test('a wrong code says why and goes back to Sign in', async () => {
    serve(allGood, signedOut, {
      '/api/claude/account/login': json({ url: URL }),
      '/api/claude/account/login/code': json({ error: 'Claude didn’t accept that code.' }, 400),
    })
    fakeTab()
    const section = await openSetup()
    await userEvent.click(await within(section).findByRole('button', { name: /sign in to claude/i }))
    await userEvent.type(within(section).getByRole('textbox', { name: 'Sign-in code' }), 'nope')
    await userEvent.click(within(section).getByRole('button', { name: /finish signing in/i }))
    expect(await within(section).findByRole('alert')).toHaveTextContent('Claude didn’t accept that code.')
    expect(within(section).getByRole('button', { name: /sign in to claude/i })).toBeEnabled()
  })

  test('a sign-in that can’t start closes the empty tab and says why', async () => {
    serve(allGood, signedOut, { '/api/claude/account/login': json({ error: 'Couldn’t start Claude Code' }, 400) })
    const tab = fakeTab()
    const section = await openSetup()
    await userEvent.click(await within(section).findByRole('button', { name: /sign in to claude/i }))
    expect(await within(section).findByRole('alert')).toHaveTextContent('Couldn’t start Claude Code')
    expect(tab.close).toHaveBeenCalled()
  })

  test('Cancel drops the sign-in', async () => {
    serve(allGood, signedOut, { '/api/claude/account/login': json({ url: URL }), '/api/claude/account/login/cancel': () => new Response(null, { status: 204 }) })
    fakeTab()
    const section = await openSetup()
    await userEvent.click(await within(section).findByRole('button', { name: /sign in to claude/i }))
    await userEvent.click(within(section).getByRole('button', { name: 'Cancel' }))
    expect(calls('/api/claude/account/login/cancel')).toHaveLength(1)
    expect(within(section).getByRole('button', { name: /sign in to claude/i })).toBeInTheDocument()
  })

  test('signed in: Sign out', async () => {
    serve(allGood, signedIn, { '/api/claude/account/logout': json(signedOut) })
    const section = await openSetup()
    await userEvent.click(await within(section).findByRole('button', { name: /sign out/i }))
    expect(await screen.findByText('Not signed in. Sign in with your Claude account to use the Claude panel.')).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: /sign in to claude/i })).toBeInTheDocument()
  })

  test('Switch account signs out, then starts a sign-in', async () => {
    serve(allGood, signedIn, { '/api/claude/account/logout': json(signedOut), '/api/claude/account/login': json({ url: URL }) })
    const tab = fakeTab()
    const section = await openSetup()
    await userEvent.click(await within(section).findByRole('button', { name: /switch account/i }))
    expect(await within(section).findByRole('textbox', { name: 'Sign-in code' })).toBeInTheDocument()
    expect(calls('/api/claude/account/logout')).toHaveLength(1)
    expect(tab.location.href).toBe(URL)
  })
})
