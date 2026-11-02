import { create } from 'zustand'
import { useHealth } from './health'
import { useModels } from './models'

/** The Claude account the Claude panel uses (GET /api/claude/account), as `claude auth status` reports it. */
export interface ClaudeAccount {
  signedIn: boolean
  /** How it signed in: 'claude.ai' (a Claude plan), 'console' (API billing), … */
  method?: string
  email?: string
  /** The Claude plan, e.g. 'pro' or 'max'. */
  plan?: string
  org?: string
}

const METHOD: Record<string, string> = {
  'claude.ai': 'Claude plan',
  console: 'Anthropic Console (API billing)',
  api_key: 'API key',
  oauth_token: 'Login token',
}

/** "me@example.com · Pro plan" */
export function describeAccount(account: ClaudeAccount): string {
  const plan = account.plan ? `${account.plan[0].toUpperCase()}${account.plan.slice(1)} plan` : account.method ? (METHOD[account.method] ?? account.method) : ''
  return [account.email ?? account.org, plan].filter(Boolean).join(' · ') || 'Signed in.'
}

/**
 * Signing in has two steps: the server starts `claude auth login` and hands back its link; you approve in that
 * tab, which then shows a code, and pasting it here finishes the sign-in.
 */
export type SignIn = { step: 'off' } | { step: 'starting' } | { step: 'code'; url: string } | { step: 'checking'; url: string }

interface AccountState {
  account: ClaudeAccount | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** What went wrong with the last action, worded for the person. */
  error: string | null
  signIn: SignIn
  signingOut: boolean
  load(): Promise<void>
  /** Starts a sign-in and returns its link (null if it couldn't start). */
  startSignIn(): Promise<string | null>
  finishSignIn(code: string): Promise<boolean>
  cancelSignIn(): Promise<void>
  signOut(): Promise<boolean>
}

let deps = { fetchImpl: ((...args: Parameters<typeof fetch>) => fetch(...args)) as typeof fetch }

/** Test seam: swap the fetch used. */
export function configureAccount(next: Partial<typeof deps>) {
  deps = { ...deps, ...next }
}

async function call(path: string, init?: RequestInit): Promise<unknown> {
  let res: Response
  try {
    res = await deps.fetchImpl(path, init)
  } catch {
    throw new Error('Couldn’t reach the editor server.')
  }
  if (res.status === 204) return null
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body
}

const post = (path: string, body?: unknown) =>
  call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Another account can mean other models, and the setup check's Claude row changes too. */
function accountChanged() {
  useModels.setState({ models: [], status: 'idle', error: null })
  void useModels.getState().load()
  void useHealth.getState().check()
}

export const useAccount = create<AccountState>()((set, get) => ({
  account: null,
  status: 'idle',
  error: null,
  signIn: { step: 'off' },
  signingOut: false,

  async load() {
    set({ status: 'loading' })
    try {
      set({ account: (await call('/api/claude/account')) as ClaudeAccount, status: 'ready' })
    } catch (e) {
      set({ status: 'error', error: message(e) })
    }
  },

  async startSignIn() {
    set({ signIn: { step: 'starting' }, error: null })
    try {
      const { url } = (await post('/api/claude/account/login')) as { url: string }
      set({ signIn: { step: 'code', url } })
      return url
    } catch (e) {
      set({ signIn: { step: 'off' }, error: message(e) })
      return null
    }
  },

  async finishSignIn(code) {
    const current = get().signIn
    if (current.step !== 'code') return false
    set({ signIn: { step: 'checking', url: current.url }, error: null })
    try {
      const account = (await post('/api/claude/account/login/code', { code })) as ClaudeAccount
      set({ account, status: 'ready', signIn: { step: 'off' } })
      accountChanged()
      return true
    } catch (e) {
      // A wrong code ends that sign-in on the server: the next try needs a fresh link.
      set({ signIn: { step: 'off' }, error: message(e) })
      return false
    }
  },

  async cancelSignIn() {
    set({ signIn: { step: 'off' }, error: null })
    await post('/api/claude/account/login/cancel').catch(() => {})
  },

  async signOut() {
    set({ signingOut: true, error: null })
    try {
      const account = (await post('/api/claude/account/logout')) as ClaudeAccount
      set({ account, status: 'ready', signingOut: false })
      accountChanged()
      return true
    } catch (e) {
      set({ signingOut: false, error: message(e) })
      return false
    }
  },
}))
