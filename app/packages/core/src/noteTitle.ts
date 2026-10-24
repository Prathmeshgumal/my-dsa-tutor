/** A note's title is its first non-empty line, without Markdown heading marks. */
export function noteTitle(content: string): string {
  const first = content
    .split('\n')
    .map((l) => l.replace(/^\s*#+\s*/, '').trim())
    .find(Boolean)
  return first ?? 'Untitled note'
}

/** note-1.md, note-2.md, … : the first one not taken. */
export function nextNoteName(names: string[]): string {
  const taken = new Set(names.map((n) => n.toLowerCase()))
  let i = 1
  while (taken.has(`note-${i}.md`)) i++
  return `note-${i}.md`
}
