// The Setup dialog (⚙️ in the left bar): checks everything the editor needs and says how to fix what isn't working.
import { useEffect, useState } from 'react'
import { AlertTriangle, Check, ClipboardCopy, HelpCircle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { focusEditor } from '@/components/editor/editorFocus'
import { copyDiagnostics } from '@/lib/diagnostics'
import type { Health } from '@dsa/core/health'
import { cn } from '@/lib/utils'
import { useHealth } from '@/state/health'
import { useSettingsDialog } from '@/state/settingsDialog'
import { describeAccount, useAccount } from '@/state/account'
import { ClaudeAccountControls } from './ClaudeAccount'

export { useSettingsDialog }

type Tone = 'ok' | 'problem' | 'unknown'

const ICON = { ok: Check, problem: AlertTriangle, unknown: HelpCircle } as const

function Row({ label, tone, detail, children }: { label: string; tone: Tone; detail?: string; children?: React.ReactNode }) {
  const Icon = ICON[tone]
  return (
    <li className="flex gap-3 py-2.5">
      <Icon
        aria-hidden
        className={cn(
          'mt-0.5 size-4 shrink-0',
          tone === 'ok' ? 'text-emerald-500' : tone === 'problem' ? 'text-amber-500' : 'text-muted-foreground',
        )}
      />
      <div className="grid min-w-0 gap-1">
        <span className="text-sm font-medium">{label}</span>
        {detail && <span className="text-[12.5px] text-muted-foreground">{detail}</span>}
        {children}
      </div>
    </li>
  )
}

const STATE_NOT_SAVED =
  'Your open tabs, chats and settings couldn’t be saved to disk just now. They’re kept in this browser, and saving keeps retrying.'

function Checks({ health, stateSaveFailing }: { health: Health; stateSaveFailing: boolean }) {
  const { piston, claude, folders } = health
  const account = useAccount((s) => s.account)
  const langs = [
    ['C++', piston.languages.cpp],
    ['Java', piston.languages.java],
    ['Python', piston.languages.python],
  ] as const
  const allLangs = langs.every(([, ok]) => ok)
  const badFolders = folders.filter((f) => !f.ok)
  return (
    <ul aria-label="Setup checks" className="divide-y">
      <Row
        label="Running code (Piston)"
        tone={piston.ok && allLangs ? 'ok' : 'problem'}
        detail={piston.problem ?? 'Running, with every language installed.'}
      >
        {piston.ok && (
          <span className="flex gap-1.5">
            {langs.map(([name, ok]) => (
              <span
                key={name}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium',
                  ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
                )}
              >
                {name} {ok ? '✓' : 'missing'}
              </span>
            ))}
          </span>
        )}
      </Row>
      <Row
        label="Claude"
        tone={
          account
            ? account.signedIn
              ? 'ok'
              : 'problem'
            : claude.signedIn === true
              ? 'ok'
              : claude.signedIn === 'unknown'
                ? 'unknown'
                : 'problem'
        }
        detail={
          account
            ? account.signedIn
              ? `Signed in as ${describeAccount(account)}`
              : 'Not signed in. Sign in with your Claude account to use the Claude panel.'
            : (claude.problem ??
              (claude.signedIn === 'unknown'
                ? 'Your login is kept in the system keychain, so it can’t be checked from here. Ask Claude something to try it.'
                : 'Signed in.'))
        }
      >
        <ClaudeAccountControls />
      </Row>
      <Row
        label="Saving your work"
        tone={badFolders.length || stateSaveFailing ? 'problem' : 'ok'}
        detail={
          badFolders.length || stateSaveFailing
            ? [...badFolders.map((f) => f.problem), stateSaveFailing ? STATE_NOT_SAVED : ''].filter(Boolean).join(' ')
            : `${folders.map((f) => f.name).join(', ')}: all writable.`
        }
      />
    </ul>
  )
}

function SetupPanel() {
  const health = useHealth((s) => s.health)
  const status = useHealth((s) => s.status)
  const stateSaveFailing = useHealth((s) => s.stateSaveFailing)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void useHealth.getState().check()
  }, [])

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Setup</DialogTitle>
        <DialogDescription>Everything the editor needs, and how to fix what isn’t working.</DialogDescription>
      </DialogHeader>

      {status === 'error' ? (
        <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">
          Couldn’t reach the editor server. Start it with ./start.sh.
        </p>
      ) : health ? (
        <Checks health={health} stateSaveFailing={stateSaveFailing} />
      ) : (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Checking…
        </p>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            void copyDiagnostics().then((ok) => {
              setCopied(ok)
              setTimeout(() => setCopied(false), 2000)
            })
          }
        >
          {copied ? <Check /> : <ClipboardCopy />} {copied ? 'Copied' : 'Copy diagnostics'}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={status === 'checking'} onClick={() => void useHealth.getState().check()}>
          <RefreshCw className={cn(status === 'checking' && 'animate-spin')} /> Check again
        </Button>
      </DialogFooter>
    </div>
  )
}

export function SettingsDialog() {
  const open = useSettingsDialog((s) => s.open)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && useSettingsDialog.getState().hide()}>
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          focusEditor()
        }}
      >
        {open && <SetupPanel />}
      </DialogContent>
    </Dialog>
  )
}
