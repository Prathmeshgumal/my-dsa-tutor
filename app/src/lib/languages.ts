export type LanguageId = 'cpp' | 'java' | 'python'

export interface Language {
  id: LanguageId
  label: 'C++' | 'Java' | 'Python'
  ext: '.cpp' | '.java' | '.py'
  judge0Id: 54 | 62 | 71
  monaco: 'cpp' | 'java' | 'python'
  /** Piston runtime name and the file name to submit (Piston's g++ wrapper appends .cpp itself). */
  piston: { language: 'c++' | 'java' | 'python'; fileName: string }
  compilerLabel: string
  template: string
}

export const LANGUAGES: Record<LanguageId, Language> = {
  cpp: {
    id: 'cpp',
    label: 'C++',
    ext: '.cpp',
    judge0Id: 54,
    monaco: 'cpp',
    piston: { language: 'c++', fileName: 'main' },
    compilerLabel: 'C++ · GCC',
    template: `#include <bits/stdc++.h>
using namespace std;

int main() {

    return 0;
}
`,
  },
  java: {
    id: 'java',
    label: 'Java',
    ext: '.java',
    judge0Id: 62,
    monaco: 'java',
    piston: { language: 'java', fileName: 'Main.java' },
    compilerLabel: 'Java · OpenJDK',
    template: `import java.util.*;

public class Main {
    public static void main(String[] args) {

    }
}
`,
  },
  python: {
    id: 'python',
    label: 'Python',
    ext: '.py',
    judge0Id: 71,
    monaco: 'python',
    piston: { language: 'python', fileName: 'main.py' },
    compilerLabel: 'Python 3',
    template: `def main():
    pass


if __name__ == "__main__":
    main()
`,
  },
}

function splitExt(name: string): [base: string, ext: string] {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
}

export function languageFromFilename(name: string): Language | null {
  const ext = splitExt(name)[1].toLowerCase()
  return Object.values(LANGUAGES).find((l) => l.ext === ext) ?? null
}

export function withLanguage(name: string, lang: LanguageId): string {
  const [base, ext] = splitExt(name)
  return (languageFromFilename(name) || !ext ? base : name) + LANGUAGES[lang].ext
}

export function validateFileName(
  name: string,
  existing: string[],
): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Name can’t be empty' }
  if (trimmed.includes('/')) return { ok: false, error: 'Name can’t contain /' }
  if (!languageFromFilename(trimmed)) return { ok: false, error: 'Use .cpp, .java or .py' }
  const lower = trimmed.toLowerCase()
  if (existing.some((n) => n.toLowerCase() === lower))
    return { ok: false, error: 'A file with this name already exists' }
  return { ok: true, name: trimmed }
}

export function uniqueName(base: string, existing: string[]): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  const [stem, ext] = splitExt(base)
  for (let i = 1; ; i++) {
    const candidate = `${stem}-${i}${ext}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}
