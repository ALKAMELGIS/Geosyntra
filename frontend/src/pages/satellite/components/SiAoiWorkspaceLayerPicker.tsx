import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../../../lib/utils'
import { siWmsSymbologySupportsLayer } from '../utils/siWmsSymbologyModel'
import './SiAoiWorkspaceLayerPicker.css'

export type SiAoiWorkspaceLayerOption = { id: string; label: string }

type LayerActionId =
  | 'symbology'
  | 'opacity'
  | 'zoom'
  | 'settings'
  | 'reclassify'
  | 'export'
  | 'remove'
  | 'rename'

type Props = {
  aoiId: string
  aoiName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  layers: SiAoiWorkspaceLayerOption[]
  visibility: Record<string, boolean>
  onVisibilityChange: (layerId: string, visible: boolean) => void
  primaryLayerId: string
  isAoiActive: boolean
  onSelectPrimaryLayer: (layerId: string) => void
  onZoomToAoi: () => void
  onSymbology: (layerId: string) => void
  onOpacity: (layerId: string) => void
}

function layerIconMeta(layerId: string): { icon: string; tone: string } {
  const u = layerId.toUpperCase()
  if (u.includes('NDVI')) return { icon: 'fa-solid fa-chart-line', tone: 'veg' }
  if (u.includes('NDWI') || u.includes('MOISTURE')) return { icon: 'fa-solid fa-droplet', tone: 'water' }
  if (u.includes('NDSI') || u.includes('SNOW')) return { icon: 'fa-solid fa-snowflake', tone: 'ice' }
  if (u.includes('FALSE')) return { icon: 'fa-solid fa-palette', tone: 'spectral' }
  if (u.includes('TRUE') || u.includes('COLOR') || u.includes('RGB')) return { icon: 'fa-solid fa-image', tone: 'rgb' }
  if (u.includes('SAR') || u.includes('DECIBEL') || u.includes('GAMMA')) return { icon: 'fa-solid fa-satellite-dish', tone: 'radar' }
  if (u.includes('SWIR') || u.includes('THERMAL')) return { icon: 'fa-solid fa-fire', tone: 'thermal' }
  return { icon: 'fa-solid fa-layer-group', tone: 'default' }
}

const LAYER_ACTIONS: {
  id: LayerActionId
  label: string
  icon: string
  section: 'view' | 'style' | 'data'
  disabled?: (layerId: string) => boolean
}[] = [
  { id: 'zoom', label: 'Zoom to layer', icon: 'fa-solid fa-crosshairs', section: 'view' },
  {
    id: 'opacity',
    label: 'Opacity',
    icon: 'fa-solid fa-droplet',
    section: 'style',
    disabled: id => !siWmsSymbologySupportsLayer(id),
  },
  {
    id: 'symbology',
    label: 'Symbology',
    icon: 'fa-solid fa-palette',
    section: 'style',
    disabled: id => !siWmsSymbologySupportsLayer(id),
  },
  {
    id: 'reclassify',
    label: 'Reclassify',
    icon: 'fa-solid fa-swatchbook',
    section: 'style',
    disabled: id => !siWmsSymbologySupportsLayer(id),
  },
  { id: 'settings', label: 'Settings', icon: 'fa-solid fa-gear', section: 'style' },
  { id: 'rename', label: 'Rename', icon: 'fa-solid fa-pen', section: 'data', disabled: () => true },
  { id: 'export', label: 'Export', icon: 'fa-solid fa-file-export', section: 'data', disabled: () => true },
  { id: 'remove', label: 'Remove from map', icon: 'fa-solid fa-eye-slash', section: 'data' },
]

export function SiAoiWorkspaceLayerPicker({
  aoiId,
  aoiName,
  open,
  onOpenChange,
  layers,
  visibility,
  onVisibilityChange,
  primaryLayerId,
  isAoiActive,
  onSelectPrimaryLayer,
  onZoomToAoi,
  onSymbology,
  onOpacity,
}: Props) {
  const uid = useId()
  const triggerId = `si-aoi-layer-picker-${uid}`
  const rootRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [actionMenu, setActionMenu] = useState<{ layerId: string; layerLabel: string } | null>(null)

  const layersOnCount = useMemo(
    () => layers.reduce((n, o) => n + (visibility[o.id] ? 1 : 0), 0),
    [layers, visibility],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return layers
    return layers.filter(o => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))
  }, [layers, query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActionMenu(null)
    }
  }, [open])

  useEffect(() => {
    if (!actionMenu) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target
      if (t instanceof Element && t.closest('.si-rs-aoi-layer-premium__ctx')) return
      setActionMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActionMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [actionMenu])

  const runAction = (actionId: LayerActionId, layerId: string) => {
    setActionMenu(null)
    switch (actionId) {
      case 'zoom':
        onZoomToAoi()
        break
      case 'opacity':
        onOpacity(layerId)
        break
      case 'symbology':
      case 'reclassify':
      case 'settings':
        onSymbology(layerId)
        break
      case 'remove':
        onVisibilityChange(layerId, false)
        break
      default:
        break
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn('si-rs-aoi-layer-premium', open && 'si-rs-aoi-layer-premium--open')}
    >
      <label className="si-field-analysis-kicker si-rs-aoi-stack-kicker" htmlFor={triggerId}>
        Layer list (this AOI · Sentinel Hub)
      </label>

      <button
        id={triggerId}
        type="button"
        className={cn('si-rs-aoi-layer-premium__trigger', open && 'si-rs-aoi-layer-premium__trigger--open')}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => onOpenChange(!open)}
      >
        <span className="si-rs-aoi-layer-premium__trigger-icon" aria-hidden>
          <i className="fa-solid fa-layer-group" />
        </span>
        <span className="si-rs-aoi-layer-premium__trigger-text">
          <span className="si-rs-aoi-layer-premium__trigger-title">Sentinel Hub layers</span>
          <span className="si-rs-aoi-layer-premium__trigger-meta">
            {layersOnCount} / {layers.length} visible
          </span>
        </span>
        <i className={cn('fa-solid fa-chevron-down si-rs-aoi-layer-premium__chev', open && 'si-rs-aoi-layer-premium__chev--open')} aria-hidden />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="si-rs-aoi-layer-premium__panel"
            role="listbox"
            aria-label={`Sentinel Hub layers for ${aoiName}`}
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.995 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div className="si-rs-aoi-layer-premium__search-wrap" layout={false}>
              <i className="fa-solid fa-magnifying-glass" aria-hidden />
              <input
                type="search"
                className="si-rs-aoi-layer-premium__search"
                placeholder="Filter layers…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Filter layers"
              />
            </motion.div>

            <div className="si-rs-aoi-layer-premium__scroll si-scrollbar">
              {filtered.length === 0 ? (
                <p className="si-rs-aoi-layer-premium__empty">No layers match your search.</p>
              ) : (
                filtered.map(opt => {
                  const on = !!visibility[opt.id]
                  const isPrimary = isAoiActive && primaryLayerId === opt.id
                  const meta = layerIconMeta(opt.id)
                  return (
                    <div
                      key={`${aoiId}-${opt.id}`}
                      className={cn(
                        'si-rs-aoi-layer-premium__row',
                        isPrimary && 'si-rs-aoi-layer-premium__row--primary',
                        on && 'si-rs-aoi-layer-premium__row--on',
                      )}
                      role="option"
                      aria-selected={isPrimary}
                    >
                      <button
                        type="button"
                        className="si-rs-aoi-layer-premium__row-main"
                        onClick={() => onSelectPrimaryLayer(opt.id)}
                        title={opt.label}
                      >
                        <span
                          className={cn('si-rs-aoi-layer-premium__layer-icon', `si-rs-aoi-layer-premium__layer-icon--${meta.tone}`)}
                          aria-hidden
                        >
                          <i className={meta.icon} />
                        </span>
                        <span className="si-rs-aoi-layer-premium__row-body">
                          <span className="si-rs-aoi-layer-premium__label">{opt.label}</span>
                          <span className="si-rs-aoi-layer-premium__idmono" dir="ltr">
                            {opt.id}
                          </span>
                        </span>
                        <span
                          className={cn('si-rs-aoi-layer-premium__status', on ? 'si-rs-aoi-layer-premium__status--on' : '')}
                          title={on ? 'Visible on map' : 'Hidden'}
                          aria-hidden
                        />
                      </button>

                      <div className="si-rs-aoi-layer-premium__actions">
                        <button
                          type="button"
                          className={cn(
                            'si-rs-aoi-layer-premium__vis-btn',
                            on && 'si-rs-aoi-layer-premium__vis-btn--on',
                          )}
                          aria-pressed={on}
                          aria-label={on ? `Hide ${opt.label}` : `Show ${opt.label}`}
                          title={on ? 'Hide layer' : 'Show layer'}
                          onClick={e => {
                            e.stopPropagation()
                            onVisibilityChange(opt.id, !on)
                          }}
                        >
                          <i className={cn('fa-solid', on ? 'fa-eye' : 'fa-eye-slash')} aria-hidden />
                        </button>

                        <div className="si-rs-aoi-layer-premium__ctx-wrap">
                          <button
                            type="button"
                            className={cn(
                              'si-rs-aoi-layer-premium__menu-btn',
                              actionMenu?.layerId === opt.id && 'si-rs-aoi-layer-premium__menu-btn--open',
                            )}
                            aria-expanded={actionMenu?.layerId === opt.id}
                            aria-haspopup="menu"
                            title="Layer options"
                            onClick={e => {
                              e.stopPropagation()
                              setActionMenu(prev =>
                                prev?.layerId === opt.id ? null : { layerId: opt.id, layerLabel: opt.label },
                              )
                            }}
                          >
                            <i className="fa-solid fa-ellipsis-vertical" aria-hidden />
                          </button>

                          <AnimatePresence>
                            {actionMenu?.layerId === opt.id ? (
                              <motion.div
                                className="si-rs-aoi-layer-premium__ctx"
                                role="menu"
                                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -2, scale: 0.99 }}
                                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                                onClick={e => e.stopPropagation()}
                              >
                                <p className="si-rs-aoi-layer-premium__ctx-title">{opt.label}</p>
                                {(['view', 'style', 'data'] as const).map(section => {
                                  const items = LAYER_ACTIONS.filter(a => a.section === section)
                                  if (!items.length) return null
                                  return (
                                    <motion.div key={section} className="si-rs-aoi-layer-premium__ctx-section" layout={false}>
                                      <p className="si-rs-aoi-layer-premium__ctx-k">{section}</p>
                                      {items.map(action => {
                                        const disabled = action.disabled?.(opt.id) ?? false
                                        return (
                                          <button
                                            key={action.id}
                                            type="button"
                                            role="menuitem"
                                            className={cn(
                                              'si-rs-aoi-layer-premium__ctx-item',
                                              disabled && 'si-rs-aoi-layer-premium__ctx-item--disabled',
                                              action.id === 'remove' && 'si-rs-aoi-layer-premium__ctx-item--danger',
                                            )}
                                            disabled={disabled}
                                            title={
                                              disabled && (action.id === 'rename' || action.id === 'export')
                                                ? 'Not available for Sentinel Hub WMS layers'
                                                : action.label
                                            }
                                            onClick={() => !disabled && runAction(action.id, opt.id)}
                                          >
                                            <i className={action.icon} aria-hidden />
                                            <span>{action.label}</span>
                                          </button>
                                        )
                                      })}
                                    </motion.div>
                                  )
                                })}
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
