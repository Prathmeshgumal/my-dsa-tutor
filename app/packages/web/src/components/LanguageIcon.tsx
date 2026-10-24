import { FileCode2 } from 'lucide-react'
import { languageFromFilename, type LanguageId } from '@dsa/core/languages'
import { cn } from '@/lib/utils'

const LANGUAGE_COLOR: Record<LanguageId, string> = {
  cpp: 'text-blue-500',
  java: 'text-orange-500',
  python: 'text-yellow-500',
}

/** File icon tinted by the language its extension maps to. */
export function LanguageIcon({ fileName, className }: { fileName: string; className?: string }) {
  const lang = languageFromFilename(fileName)
  return <FileCode2 className={cn(lang ? LANGUAGE_COLOR[lang.id] : 'text-muted-foreground', className)} aria-hidden />
}
