import { ListChecks } from 'lucide-react'
import { useProblems } from '@/state/problems'

/** Small label naming the problem something belongs to (in the notes, dry run and chat lists). */
export function ProblemTag({ slug }: { slug: string | null | undefined }) {
  const title = useProblems((s) => (slug ? s.entries.find((e) => e.slug === slug)?.problem.title : undefined))
  if (!title) return null
  return (
    <span className="inline-flex max-w-full items-center gap-1 truncate rounded bg-violet-500/10 px-1 text-[10.5px] text-violet-700 dark:text-violet-300">
      <ListChecks className="size-2.5 shrink-0" aria-hidden />
      <span className="truncate">{title}</span>
    </span>
  )
}

