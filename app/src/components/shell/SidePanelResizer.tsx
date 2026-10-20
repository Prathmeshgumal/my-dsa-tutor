import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/state/settings'

export const SIDE_PANEL = { default: 380, min: 300, max: 900, step: 20 }

const clamp = (w: number) => Math.round(Math.min(SIDE_PANEL.max, Math.max(SIDE_PANEL.min, w)))

/** Drag handle on the left edge of the right-hand panel (Claude / Notes). Width is remembered. */
export function SidePanelResizer() {
  const width = useSettings((s) => s.sidePanelWidth)
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)
  const cleanup = useRef<() => void>(() => {})

  useEffect(() => () => cleanup.current(), [])

  const setWidth = (w: number) => useSettings.getState().setSidePanelWidth(clamp(w))

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    drag.current = { startX: e.clientX, startWidth: useSettings.getState().sidePanelWidth }
    // The panel is on the right, so moving the pointer left makes it wider.
    const move = (ev: PointerEvent) => {
      if (drag.current) setWidth(drag.current.startWidth + (drag.current.startX - ev.clientX))
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
      aria-label="Resize panel"
      aria-orientation="vertical"
      aria-valuemin={SIDE_PANEL.min}
      aria-valuemax={SIDE_PANEL.max}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={() => setWidth(SIDE_PANEL.default)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') setWidth(width + SIDE_PANEL.step)
        else if (e.key === 'ArrowRight') setWidth(width - SIDE_PANEL.step)
        else return
        e.preventDefault()
      }}
      className={cn(
        'absolute inset-y-0 -left-[3px] z-10 w-[6px] cursor-col-resize outline-none',
        'after:absolute after:inset-y-0 after:left-[2px] after:w-[2px] after:transition-colors',
        'hover:after:bg-violet-500/50 focus-visible:after:bg-violet-500 active:after:bg-violet-500',
      )}
    />
  )
}
