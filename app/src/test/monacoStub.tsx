// Test-only stand-in for @monaco-editor/react: a textarea that exposes the props the app passes.
interface StubProps {
  value?: string
  language?: string
  path?: string
  theme?: string
  onChange?(value: string | undefined): void
}

export default function MonacoStub({ value, language, path, theme, onChange }: StubProps) {
  return (
    <textarea
      data-testid="monaco"
      data-language={language}
      data-path={path}
      data-theme={theme}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  )
}

export const loader = { config() {}, init: async () => ({}) }
