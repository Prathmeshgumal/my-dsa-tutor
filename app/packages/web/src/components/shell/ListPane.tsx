import { Children, createContext, isValidElement, useContext, useState, type ReactNode } from 'react'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useSettings } from '@/state/settings'
import { EdgeResizer } from './SidePanelResizer'

export const LIST_PANE = { default: 240, min: 180, max: 480, step: 20 }

const Query = createContext('')

const matches = (title: string, query: string) => title.toLowerCase().includes(query.trim().toLowerCase())

interface ListPaneProps {
  title: string
  count?: number
  onNew?(): void
  newLabel?: string
  /** A box that keeps only the rows whose title matches. */
  search?: boolean
  /** Shown when there are no rows at all. */
  empty: ReactNode
  /** ListRows. */
  children: ReactNode
  /** A note under the rows. */
  footer?: ReactNode
}

/** The list on the left of every section: title, count, New, search, and the same rows everywhere. */
export function ListPane({ title, count, onNew, newLabel = 'New', search, empty, children, footer }: ListPaneProps) {
  const [query, setQuery] = useState('')
  const width = useSettings((s) => s.listWidth)
  const rows = Children.toArray(children)
  const titles = rows.flatMap((r) =>
    isValidElement<{ title?: unknown }>(r) && typeof r.props.title === 'string' ? [r.props.title] : [],
  )
  const noMatch = query.trim() !== '' && titles.length > 0 && !titles.some((t) => matches(t, query))

  return (
    <section aria-label={title} style={{ width }} className="relative flex shrink-0 flex-col border-r">
      <div className="flex h-[38px] shrink-0 items-center gap-2 border-b pr-1.5 pl-3">
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{title}</span>
        {count !== undefined && <span className="text-[11px] text-muted-foreground/70 tabular-nums">{count}</span>}
        <div className="flex-1" />
        {onNew && (
          <Button variant="ghost" size="icon-sm" aria-label={newLabel} onClick={onNew} className="text-muted-foreground">
            <Plus />
          </Button>
        )}
      </div>
      {search && rows.length > 0 && (
        <label className="mx-1.5 mt-1.5 flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-muted-foreground focus-within:border-violet-500">
          <Search className="size-3.5 shrink-0" aria-hidden />
          <input
            type="search"
            aria-label={`Search ${title.toLowerCase()}`}
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      )}
      <ScrollArea className="min-h-0 flex-1">
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">{empty}</div>
        ) : (
          <>
            <ul aria-label={title} className="grid grid-cols-1 gap-px p-1.5">
              <Query.Provider value={query}>{children}</Query.Provider>
            </ul>
            {noMatch && <p className="px-4 py-4 text-center text-[12.5px] text-muted-foreground">Nothing matches “{query.trim()}”.</p>}
          </>
        )}
        {footer}
      </ScrollArea>
      <EdgeResizer
        label="Resize list"
        edge="right"
        width={width}
        limits={LIST_PANE}
        onResize={(w) => useSettings.getState().setListWidth(w)}
      />
    </section>
  )
}

interface RowAction {
  label: string
  icon: ReactNode
  onSelect(): void
  destructive?: boolean
}

interface ListRowProps {
  icon: ReactNode
  title: string
  /** A second, quieter line: a tag, a date, a count. */
  meta?: ReactNode
  active?: boolean
  onOpen(): void
  onDoubleClick?(): void
  /** Small icon buttons at the end of the row (a bin for Delete), shown on hover or keyboard focus. */
  actions?: RowAction[]
}

export function ListRow({ icon, title, meta, active, onOpen, onDoubleClick, actions }: ListRowProps) {
  const query = useContext(Query)
  if (query && !matches(title, query)) return null
  return (
    <li
      // min-w-0 lets the row shrink to the list's width, so a long title ends in "…" instead of pushing past the edge.
      className={cn(
        'group/row flex min-w-0 items-center rounded-md pr-1 transition-colors',
        active ? 'bg-violet-500/12 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <button
        type="button"
        aria-current={active || undefined}
        onClick={onOpen}
        onDoubleClick={onDoubleClick}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 text-left outline-none focus-visible:underline"
      >
        <span aria-hidden className="flex shrink-0 [&_svg]:size-3.5">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px]">{title}</span>
          {meta && <span className="block truncate text-[11px] text-muted-foreground">{meta}</span>}
        </span>
      </button>
      {actions?.map((a) => (
        <Button
          key={a.label}
          variant="ghost"
          size="icon-xs"
          aria-label={`${a.label} ${title}`}
          title={a.label}
          onClick={a.onSelect}
          className={cn(
            'shrink-0 text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100',
            a.destructive ? 'hover:text-red-600 dark:hover:text-red-400' : 'hover:text-foreground',
          )}
        >
          {a.icon}
        </Button>
      ))}
    </li>
  )
}
