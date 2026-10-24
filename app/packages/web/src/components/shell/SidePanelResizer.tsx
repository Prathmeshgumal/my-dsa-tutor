import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/state/settings'

export const SIDE_PANEL = { default: 380, min: 300, max: 900, step: 20 }

interface Limits {
  default: number
  min: number
  max: number
  step: number
}

interface EdgeResizerProps {
  label: string
  /** Which edge of its panel the handle sits on. Dragging away from the panel makes it wider. */
  edge: 'left' | 'right'
  width: number
  limits: Limits
  onResize(width: number): void
}

/** Drag handle on one edge of a panel. Arrow keys nudge it, double-click resets it. */
export function EdgeResizer({ label, edge, width, limits, onResize }: EdgeResizerProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)
  const cleanup = useRef<() => void>(() => {})

  useEffect(() => () => cleanup.current(), [])

  const setWidth = (w: number) => onResize(Math.round(Math.min(limits.max, Math.max(limits.min, w))))
  // A handle on the right edge grows the panel as it moves right; one on the left, as it moves left.
  const outward = edge === 'right' ? 1 : -1

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    drag.current = { startX: e.clientX, startWidth: width }
    const move = (ev: PointerEvent) => {
      if (drag.current) setWidth(drag.current.startWidth + outward * (ev.clientX - drag.current.startX))
    }
    const up = () => cleanup.current()
    cleanup.current = () => {
      drag.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    // Keep the resize cursor and stop text selection while dragging over the editor.
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={() => setWidth(limits.default)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') setWidth(width + outward * limits.step)
        else if (e.key === 'ArrowLeft') setWidth(width - outward * limits.step)
        else return
        e.preventDefault()
      }}
      className={cn(
        'absolute inset-y-0 z-10 w-[6px] cursor-col-resize outline-none',
        edge === 'left' ? '-left-[3px]' : '-right-[3px]',
        'after:absolute after:inset-y-0 after:left-[2px] after:w-[2px] after:transition-colors',
        'hover:after:bg-violet-500/50 focus-visible:after:bg-violet-500 active:after:bg-violet-500',
      )}
    />
  )
}

/** Drag handle on the left edge of the right-hand panel (Claude). Width is remembered. */
export function SidePanelResizer() {
  const width = useSettings((s) => s.sidePanelWidth)
  return (
    <EdgeResizer
      label="Resize panel"
      edge="left"
      width={width}
      limits={SIDE_PANEL}
      onResize={(w) => useSettings.getState().setSidePanelWidth(w)}
    />
  )
}
