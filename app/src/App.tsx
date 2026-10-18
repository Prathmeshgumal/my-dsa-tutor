import { ThemeToggle } from '@/components/theme/ThemeToggle'

export default function App() {
  return (
    <div className="app-bg flex h-screen flex-col">
      <header className="flex items-center justify-end p-2">
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center text-muted-foreground">
        DSA editor
      </main>
    </div>
  )
}
