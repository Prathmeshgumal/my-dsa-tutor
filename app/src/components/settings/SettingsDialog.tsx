import { useState } from 'react'
import { Container, Cloud, ExternalLink, Eye, EyeOff, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useSettings, type RunnerKind } from '@/state/settings'
import { useSettingsDialog } from '@/state/settingsDialog'

export { useSettingsDialog }

const RAPIDAPI_URL = 'https://rapidapi.com/judge0-official/api/judge0-ce'

const RUNNERS: { value: RunnerKind; label: string; hint: string; icon: typeof Cloud }[] = [
  { value: 'piston', label: 'Local (Piston)', hint: 'Free, runs in Docker on this machine', icon: Container },
  { value: 'judge0', label: 'Judge0 on RapidAPI', hint: 'Hosted, needs a paid API key', icon: Cloud },
]

function SettingsForm() {
  const reason = useSettingsDialog((s) => s.reason)
  const [key, setKey] = useState(() => useSettings.getState().apiKey)
  const [runner, setRunner] = useState(() => useSettings.getState().runner)
  const [visible, setVisible] = useState(false)

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    useSettings.getState().setRunner(runner)
    useSettings.getState().setApiKey(key.trim())
    useSettingsDialog.getState().hide()
  }

  return (
    <form onSubmit={save} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>Choose where your code runs.</DialogDescription>
      </DialogHeader>

      <fieldset className="grid gap-2">
        <legend className="sr-only">Code runner</legend>
        {RUNNERS.map(({ value, label, hint, icon: Icon }) => (
          <label
            key={value}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
              runner === value ? 'border-violet-500/50 bg-violet-500/10' : 'hover:bg-muted/50',
            )}
          >
            <input
              type="radio"
              name="runner"
              value={value}
              checked={runner === value}
              onChange={() => setRunner(value)}
              className="sr-only"
            />
            <Icon
              className={cn('size-4 shrink-0', runner === value ? 'text-violet-500' : 'text-muted-foreground')}
              aria-hidden
            />
            <span className="grid">
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {runner === 'piston' && (
        <p className="text-xs text-muted-foreground">
          Start it from the project folder with{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">docker compose up -d</code> (see the README for the
          one-time language install).
        </p>
      )}

      {runner === 'judge0' && reason === 'no_key' && (
        <div className="flex gap-3 rounded-lg border border-violet-500/30 bg-violet-500/10 p-3 text-[13px]">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-violet-500" aria-hidden />
          <p>
            Add your RapidAPI key to run code. Get a free key by subscribing to{' '}
            <a
              href={RAPIDAPI_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-300"
            >
              Judge0 CE on RapidAPI <ExternalLink className="size-3" aria-hidden />
            </a>
            .
          </p>
        </div>
      )}

      {runner === 'judge0' && (
        <div className="grid gap-2">
          <Label htmlFor="rapidapi-key">RapidAPI key</Label>
          <div className="relative">
            <Input
              id="rapidapi-key"
              type={visible ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              className="pr-9 font-mono"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={visible ? 'Hide key' : 'Show key'}
              onClick={() => setVisible((v) => !v)}
              className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
            >
              {visible ? <EyeOff /> : <Eye />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Stored only in this browser. It never leaves your machine except to call Judge0.
          </p>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => useSettingsDialog.getState().hide()}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  )
}

export function SettingsDialog() {
  const open = useSettingsDialog((s) => s.open)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && useSettingsDialog.getState().hide()}>
      <DialogContent className="sm:max-w-md">{open && <SettingsForm />}</DialogContent>
    </Dialog>
  )
}
