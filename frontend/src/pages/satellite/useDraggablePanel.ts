import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'

export type DraggablePanel = {
  /** Callback ref to attach to the panel root (so we can measure + clamp). */
  panelRef: (node: HTMLElement | null) => void
  /** Spread onto the drag handle (e.g. the panel header). */
  handleProps: {
    onPointerDown: (e: ReactPointerEvent) => void
    style: CSSProperties
  }
  /** Inline style for the panel root — only set once the user has dragged it. */
  style: CSSProperties
  dragging: boolean
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * Make a fixed/floating panel freely draggable by a handle (its header). Until
 * the user drags it the panel keeps its CSS default position (responsive); on
 * first drag we switch to absolute left/top in px, clamped inside the viewport.
 * Drags initiated on interactive controls (buttons, inputs…) are ignored so the
 * close button / tabs keep working. Re-clamps on window resize.
 */
export function useDraggablePanel(opts?: { margin?: number; minVisible?: number; handleVisible?: number }): DraggablePanel {
  const margin = opts?.margin ?? 8
  // Keep at least this much of the panel on-screen horizontally so a tall/wide
  // panel can be pushed mostly off-screen yet stay grabbable (easy to move).
  const minVisible = opts?.minVisible ?? 64
  // Always keep the top (drag handle / header) reachable, even when the panel is
  // taller than the viewport — clamp the top edge instead of the whole panel.
  const handleVisible = opts?.handleVisible ?? 44
  const panelElRef = useRef<HTMLElement | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ dx: number; dy: number; w: number; h: number } | null>(null)

  const panelRef = useCallback((node: HTMLElement | null) => {
    panelElRef.current = node
  }, [])

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    // Don't start a drag from an interactive control inside the handle.
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [role="switch"]')) {
      return
    }
    const el = panelElRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragRef.current = {
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      w: rect.width,
      h: rect.height,
    }
    setPos({ left: rect.left, top: rect.top })
    setDragging(true)
    e.preventDefault()
  }, [])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent): void => {
      const d = dragRef.current
      if (!d) return
      setPos({
        left: clamp(
          e.clientX - d.dx,
          Math.min(margin, minVisible - d.w),
          window.innerWidth - minVisible,
        ),
        top: clamp(e.clientY - d.dy, margin, Math.max(margin, window.innerHeight - handleVisible)),
      })
    }
    const onUp = (): void => {
      setDragging(false)
      dragRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragging, margin])

  // Keep the panel inside the viewport when the window shrinks.
  useEffect(() => {
    if (!pos) return
    const onResize = (): void => {
      const el = panelElRef.current
      const w = el?.offsetWidth ?? 0
      const h = el?.offsetHeight ?? 0
      setPos(p =>
        p
          ? {
              left: clamp(
                p.left,
                Math.min(margin, minVisible - w),
                Math.max(margin, window.innerWidth - minVisible),
              ),
              top: clamp(p.top, margin, Math.max(margin, window.innerHeight - handleVisible)),
            }
          : p,
      )
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [pos, margin, minVisible, handleVisible])

  const style: CSSProperties = pos
    ? { left: pos.left, top: pos.top, right: 'auto', bottom: 'auto' }
    : {}

  return {
    panelRef,
    handleProps: {
      onPointerDown,
      style: { cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' },
    },
    style,
    dragging,
  }
}

export default useDraggablePanel
