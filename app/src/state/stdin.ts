import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LanguageId } from '@/lib/languages'

/**
 * What each file's program gets as input (stdin), typed in the output panel's Input tab.
 * Runs happen in one go on the runner, so the program can't wait for typing: the input is given up front.
 */
interface StdinState {
  /** By file id */
  inputs: Record<string, string>
  setInput(fileId: string, text: string): void
}

export const useStdin = create<StdinState>()(
  persist(
    (set) => ({
      inputs: {},
      setInput: (fileId, text) =>
        set((s) => {
          const { [fileId]: _, ...rest } = s.inputs
          return { inputs: text ? { ...rest, [fileId]: text } : rest }
        }),
    }),
    { name: 'dsa-editor:input' },
  ),
)

// Comments and string/char literals, so `cout << "cin"` or `// cin >> x` don't count as reading input.
const NOISE = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g

const READS: Record<LanguageId, RegExp> = {
  cpp: /\bcin\s*>>|\bgetline\s*\(|\bscanf\s*\(|\bgetchar\s*\(|\bfgets\s*\(/,
  java: /\bSystem\.in\b/,
  python: /\binput\s*\(|\bsys\.stdin\b/,
}

/** Whether the code reads input, so an empty Input box is worth pointing out. */
export function readsInput(code: string, language: LanguageId): boolean {
  // Python comments start with #; C++ preprocessor lines too, and neither reads input.
  return READS[language].test(code.replace(NOISE, ' '))
}
