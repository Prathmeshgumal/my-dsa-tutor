import { AppShell } from '@/components/shell/AppShell'

export default function App() {
  return (
    <AppShell
      editor={<div className="flex-1 bg-card/60" />}
      output={<div className="flex-1" />}
      onRun={() => {}}
      running={false}
      canRun
      connection="no_key"
      cursor={null}
      onOpenCommand={() => {}}
    />
  )
}
