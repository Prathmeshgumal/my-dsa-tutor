// Test-only stand-in for @monaco-editor/react: a textarea that exposes the props the app passes.
interface StubProps {
  value?: string
  language?: string
  path?: string
  theme?: string
  options?: { lineHeight?: number }
  onChange?(value: string | undefined): void
}

export default function MonacoStub({ value, language, path, theme, options, onChange }: StubProps) {
  return (
    <textarea
      data-testid="monaco"
      data-language={language}
      data-path={path}
      data-theme={theme}
      data-line-height={options?.lineHeight}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  )
}

export const loader = { config() {}, init: async () => ({}) }
