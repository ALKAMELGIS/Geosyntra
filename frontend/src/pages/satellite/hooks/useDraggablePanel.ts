import { useCallback, useEffect, useRef, useState } from 'react'

export type DraggablePanelPosition = { x: number; y: number }

function readStoredPos(key: string): DraggablePanelPosition | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const p = JSON.parse(raw) as { x?: number; y?: number }
    if (typeof p.x === 'number' && typeof p.y === 'number') return { x: p.x, y: p.y }
  } catch {
    /* ignore */
  }
  return null
}

function defaultPanelPosition(panelW = 340, panelH = 520): DraggablePanelPosition {
  const pad = 16
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280
  const h = typeof window !== 'undefined' ? window.innerHeight : 800
  return {
    x: Math.max(pad, w - panelW - pad),
    y: Math.max(pad, Math.round((h - panelH) / 2)),
  }
}

export function useDraggablePanel(opts?: {
  storageKey?: string
  panelWidth?: number
  panelHeight?: number
}) {
  const storageKey = opts?.storageKey
  const panelW = opts?.panelWidth ?? 340
  const panelH = opts?.panelHeight ?? 520

  const [pos, setPos] = useState<DraggablePanelPosition>(() => {
    if (storageKey) {
      const stored = readStoredPos(storageKey)
      if (stored) return stored
    }
    return defaultPanelPosition(panelW, panelH)
  })

  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button, input, select, textarea, label')) return
      e.preventDefault()
      e.stopPropagation()
      const el = e.currentTarget as HTMLElement
      el.setPointerCapture(e.pointerId)
      dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }

      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current
        if (!d) return
        const maxX = Math.max(8, window.innerWidth - panelW - 8)
        const maxY = Math.max(8, window.innerHeight - 80)
        setPos({
          x: Math.max(8, Math.min(maxX, d.origX + (ev.clientX - d.startX))),
          y: Math.max(8, Math.min(maxY, d.origY + (ev.clientY - d.startY))),
        })
      }

      const onUp = () => {
        dragRef.current = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        try {
          el.releasePointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [pos.x, pos.y, panelW],
  )

  useEffect(() => {
    if (!storageKey) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(pos))
    } catch {
      /* ignore */
    }
  }, [pos, storageKey])

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    left: pos.x,
    top: pos.y,
    zIndex: 12050,
    margin: 0,
  }

  return { pos, panelStyle, onHeaderPointerDown }
}
