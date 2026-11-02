// The Setup dialog's Claude account section: who the Claude panel is signed in as, and signing in, out or switching.
import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, LogIn, LogOut, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAccount } from '@/state/account'

/**
 * Opens the sign-in page in a new tab. The tab is opened straight away, while the click still counts (a tab opened
 * after waiting for the server would be blocked as a pop-up), and pointed at the link once it arrives.
 */
async function signInInNewTab(start: () => Promise<string | null>) {
  const tab = window.open('', '_blank')
  if (tab) tab.opener = null
  const url = await start()
  if (!tab) return
  if (url) tab.location.href = url
  else tab.close()
}

function CodeStep({ url, checking }: { url: string; checking: boolean }) {
  const [code, setCode] = useState('')
  return (
    <form
      className="grid gap-2 rounded-md border bg-muted/40 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (code.trim()) void useAccount.getState().finishSignIn(code.trim())
      }}
    >
      <ol className="grid list-decimal gap-1 pl-4 text-[12.5px] text-muted-foreground">
        <li>
          Approve the sign-in in the tab that opened (
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-foreground underline underline-offset-2">
            open it again <ExternalLink className="size-3" aria-hidden />
          </a>
          ).
        </li>
        <li>Copy the code it shows you and paste it here.</li>
      </ol>
      <Input
        aria-label="Sign-in code"
        placeholder="Paste the code"
        autoComplete="off"
        spellCheck={false}
        autoFocus
        value={code}
        disabled={checking}
        onChange={(e) => setCode(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={checking} onClick={() => void useAccount.getState().cancelSignIn()}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={checking || !code.trim()}>
          {checking && <Loader2 className="animate-spin" aria-hidden />} Finish signing in
        </Button>
      </div>
    </form>
  )
}

/** Sits under the Claude row of the setup checks. */
export function ClaudeAccountControls() {
  const account = useAccount((s) => s.account)
  const status = useAccount((s) => s.status)
  const error = useAccount((s) => s.error)
  const signIn = useAccount((s) => s.signIn)
  const signingOut = useAccount((s) => s.signingOut)

  useEffect(() => {
    void useAccount.getState().load()
  }, [])

  const start = () => void signInInNewTab(() => useAccount.getState().startSignIn())
  const switchAccount = () =>
    void signInInNewTab(async () => ((await useAccount.getState().signOut()) ? useAccount.getState().startSignIn() : null))
  const busy = signIn.step !== 'off' || signingOut

  return (
    <div className="grid gap-2 pt-1" aria-label="Claude account" role="group">
      {status === 'loading' && !account && (
        <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Checking your Claude account…
        </span>
      )}

      {account && signIn.step === 'off' && (
        <div className="flex flex-wrap gap-2">
          {account.signedIn ? (
            <>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={switchAccount}>
                <RefreshCw aria-hidden /> Switch account
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void useAccount.getState().signOut()}>
                {signingOut ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />} Sign out
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" disabled={busy} onClick={start}>
              <LogIn aria-hidden /> Sign in to Claude
            </Button>
          )}
        </div>
      )}

      {signIn.step === 'starting' && (
        <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Opening the Claude sign-in page…
        </span>
      )}
      {(signIn.step === 'code' || signIn.step === 'checking') && <CodeStep url={signIn.url} checking={signIn.step === 'checking'} />}

      {error && (
        <p role="alert" className="text-[12.5px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
