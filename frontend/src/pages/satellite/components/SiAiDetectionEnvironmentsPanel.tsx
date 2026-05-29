import { useCallback, useState, type ReactNode } from 'react'
import { useAiDetectionStore } from '../../../lib/aiDetection/store'
import type { AiExtentSource } from '../../../lib/aiDetection/environment'
import {
  boundsToCustomExtent,
  customExtentToBbox,
  type MapBounds,
} from '../../../lib/aiDetection/environment'
import type { ImageryOption } from '../../../lib/aiDetection/types'

export type SiAiDetectionEnvironmentsPanelProps = {
  imageryOptions: ImageryOption[]
  mapCrsLabel?: string
  getMapBounds: () => MapBounds | null
  onRequestDrawExtent?: () => void
}

type AccordionId = 'extent' | 'parallel' | 'raster'

const EXTENT_SOURCE_LABEL: Record<AiExtentSource, string> = {
  display: 'Map view',
  drawn: 'Drawn AOI',
  layer: 'Layer extent',
  custom: 'Custom coordinates',
  intersection: 'Intersection',
  union: 'Union',
}

const EXTENT_TOOLS: {
  id: string
  icon: string
  label: string
  match: AiExtentSource[]
}[] = [
  { id: 'display', icon: 'fa-earth-americas', label: 'Map view', match: ['display'] },
  { id: 'draw', icon: 'fa-pen-to-square', label: 'Draw AOI', match: ['drawn'] },
  { id: 'layer', icon: 'fa-layer-group', label: 'Layer', match: ['layer'] },
  { id: 'intersection', icon: 'fa-object-intersect', label: 'Intersect', match: ['intersection'] },
  { id: 'union', icon: 'fa-object-group', label: 'Union', match: ['union'] },
  { id: 'paste', icon: 'fa-clipboard', label: 'Paste', match: [] },
  { id: 'reset', icon: 'fa-rotate-left', label: 'Reset', match: [] },
]

function EnvSection({
  id,
  icon,
  title,
  open,
  onToggle,
  children,
}: {
  id: AccordionId
  icon: string
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className={`si-ai-detect-env__section${open ? ' si-ai-detect-env__section--open' : ''}`}>
      <button
        type="button"
        className="si-ai-detect-env__section-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`si-ai-env-${id}`}
      >
        <span className="si-ai-detect-env__section-icon" aria-hidden>
          <i className={`fa-solid ${icon}`} />
        </span>
        <span className="si-ai-detect-env__section-title">{title}</span>
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} si-ai-detect-env__section-chevron`} aria-hidden />
      </button>
      {open ? (
        <div id={`si-ai-env-${id}`} className="si-ai-detect-env__section-body">
          {children}
        </div>
      ) : null}
    </section>
  )
}

function EnvField({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="si-ai-detect-env__field">
      <label className="si-ai-detect-env__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  )
}

function ExtentModeGrid({
  active,
  onTool,
}: {
  active: AiExtentSource
  onTool: (tool: string) => void
}) {
  return (
    <div className="si-ai-detect-env__mode-grid" role="toolbar" aria-label="Extent mode">
      {EXTENT_TOOLS.map(t => {
        const on = t.match.includes(active)
        return (
          <button
            key={t.id}
            type="button"
            className={`si-ai-detect-env__mode-btn${on ? ' si-ai-detect-env__mode-btn--on' : ''}`}
            title={t.label}
            aria-label={t.label}
            aria-pressed={on}
            onClick={() => onTool(t.id)}
          >
            <i className={`fa-solid ${t.icon}`} aria-hidden />
            <span>{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function SiAiDetectionEnvironmentsPanel({
  imageryOptions,
  mapCrsLabel = '',
  getMapBounds,
  onRequestDrawExtent,
}: SiAiDetectionEnvironmentsPanelProps) {
  const { useGpu, setUseGpu, environment, patchEnvironment } = useAiDetectionStore()

  const [openSections, setOpenSections] = useState<Record<AccordionId, boolean>>({
    extent: true,
    parallel: true,
    raster: true,
  })

  const toggleSection = (id: AccordionId) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const applyBounds = useCallback(
    (b: MapBounds) => {
      patchEnvironment({
        customExtent: boundsToCustomExtent(b),
        extentCrs: mapCrsLabel || environment.extentCrs,
      })
    },
    [patchEnvironment, mapCrsLabel, environment.extentCrs],
  )

  const setExtentSource = (source: AiExtentSource) => {
    patchEnvironment({ extentSource: source })
    if (source === 'display') {
      const b = getMapBounds()
      if (b) applyBounds(b)
    }
  }

  const handleExtentTool = (tool: string) => {
    switch (tool) {
      case 'display':
        setExtentSource('display')
        break
      case 'draw':
        setExtentSource('drawn')
        onRequestDrawExtent?.()
        break
      case 'layer':
        setExtentSource('layer')
        if (!environment.extentLayerId && imageryOptions[0]) {
          patchEnvironment({ extentLayerId: imageryOptions[0].id })
        }
        break
      case 'intersection':
        setExtentSource('intersection')
        break
      case 'union':
        setExtentSource('union')
        break
      case 'paste':
        void navigator.clipboard.readText().then(text => {
          try {
            const parsed = JSON.parse(text) as Record<string, number>
            const b =
              parsed.west != null
                ? { west: parsed.west, south: parsed.south!, east: parsed.east!, north: parsed.north! }
                : parsed.left != null
                  ? { west: parsed.left, south: parsed.bottom!, east: parsed.right!, north: parsed.top! }
                  : null
            if (b && [b.west, b.south, b.east, b.north].every(Number.isFinite)) {
              patchEnvironment({
                extentSource: 'custom',
                customExtent: boundsToCustomExtent(b as MapBounds),
              })
            }
          } catch {
            /* ignore */
          }
        })
        break
      case 'reset':
        patchEnvironment({
          extentSource: 'drawn',
          customExtent: { top: 0, left: 0, right: 0, bottom: 0 },
          extentCrs: '',
          parallelFactor: '',
          cellSizeMode: 'default',
          cellSizeValue: '',
          maskLayerId: '',
          tileSize: 512,
        })
        break
      default:
        break
    }
  }

  const extentActive = environment.extentSource
  const bbox = customExtentToBbox(environment.customExtent)
  const crsDisplay = environment.extentCrs || mapCrsLabel || '—'

  return (
    <div className="si-ai-detect-env">
      <div className="si-ai-detect-env__gpu">
        <span className="si-ai-detect-env__gpu-label">
          <i className="fa-solid fa-microchip" aria-hidden />
          GPU acceleration
        </span>
        <label className="si-ai-detect-env__switch">
          <input
            type="checkbox"
            checked={useGpu}
            onChange={e => setUseGpu(e.target.checked)}
            aria-label="Use GPU acceleration"
          />
          <span className="si-ai-detect-env__switch-track" aria-hidden />
        </label>
      </div>

      <EnvSection
        id="extent"
        icon="fa-crop-simple"
        title="Processing extent"
        open={openSections.extent}
        onToggle={() => toggleSection('extent')}
      >
        <div className="si-ai-detect-env__active-pill" aria-live="polite">
          <span className="si-ai-detect-env__active-k">Active</span>
          <strong>{EXTENT_SOURCE_LABEL[extentActive]}</strong>
        </div>

        <EnvField label="Extent mode">
          <ExtentModeGrid active={extentActive} onTool={handleExtentTool} />
        </EnvField>

        {environment.extentSource === 'layer' ? (
          <EnvField label="Extent layer">
            <select
              className="si-ai-detect-env__input si-ai-detect-env__input--select"
              value={environment.extentLayerId}
              onChange={e => patchEnvironment({ extentLayerId: e.target.value })}
            >
              <option value="">Select layer…</option>
              {imageryOptions.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </EnvField>
        ) : null}

        <div className="si-ai-detect-env__block">
          <p className="si-ai-detect-env__block-title">Bounding box (WGS84)</p>
          <div className="si-ai-detect-env__xy-grid">
            {(
              [
                ['top', 'North (top)', 'si-ai-n'],
                ['left', 'West (left)', 'si-ai-w'],
                ['right', 'East (right)', 'si-ai-e'],
                ['bottom', 'South (bottom)', 'si-ai-s'],
              ] as const
            ).map(([key, label, id]) => (
              <div key={key} className="si-ai-detect-env__xy-cell">
                <label className="si-ai-detect-env__xy-label" htmlFor={id}>
                  {label}
                </label>
                <input
                  id={id}
                  type="number"
                  className="si-ai-detect-env__input"
                  step="any"
                  inputMode="decimal"
                  value={environment.customExtent[key]}
                  onChange={e => {
                    const v = Number(e.target.value)
                    patchEnvironment({
                      extentSource: 'custom',
                      customExtent: {
                        ...environment.customExtent,
                        [key]: Number.isFinite(v) ? v : 0,
                      },
                    })
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="si-ai-detect-env__block si-ai-detect-env__block--crs">
          <p className="si-ai-detect-env__block-title">Coordinate system</p>
          <p className="si-ai-detect-env__crs-value">{crsDisplay}</p>
        </div>

        {bbox ? (
          <div className="si-ai-detect-env__bbox-card" aria-label="Computed extent">
            <span>
              <em>W</em> {bbox.west.toFixed(5)}
            </span>
            <span>
              <em>S</em> {bbox.south.toFixed(5)}
            </span>
            <span>
              <em>E</em> {bbox.east.toFixed(5)}
            </span>
            <span>
              <em>N</em> {bbox.north.toFixed(5)}
            </span>
          </div>
        ) : null}
      </EnvSection>

      <EnvSection
        id="parallel"
        icon="fa-gauge-high"
        title="Parallel processing"
        open={openSections.parallel}
        onToggle={() => toggleSection('parallel')}
      >
        <EnvField label="Processing factor" htmlFor="si-ai-parallel">
          <input
            id="si-ai-parallel"
            className="si-ai-detect-env__input"
            value={environment.parallelFactor}
            placeholder="80% or 4"
            onChange={e => patchEnvironment({ parallelFactor: e.target.value })}
          />
        </EnvField>
      </EnvSection>

      <EnvSection
        id="raster"
        icon="fa-table-cells"
        title="Raster analysis"
        open={openSections.raster}
        onToggle={() => toggleSection('raster')}
      >
        <EnvField label="Cell size">
          <select
            className="si-ai-detect-env__input si-ai-detect-env__input--select"
            value={environment.cellSizeMode}
            onChange={e =>
              patchEnvironment({ cellSizeMode: e.target.value as typeof environment.cellSizeMode })
            }
          >
            <option value="default">Same as input raster</option>
            <option value="min">Minimum of inputs</option>
            <option value="max">Maximum of inputs</option>
            <option value="value">Custom (meters)</option>
          </select>
        </EnvField>

        {environment.cellSizeMode === 'value' ? (
          <EnvField label="Cell size (m)" htmlFor="si-ai-cellsize">
            <input
              id="si-ai-cellsize"
              className="si-ai-detect-env__input"
              value={environment.cellSizeValue}
              placeholder="Meters"
              onChange={e => patchEnvironment({ cellSizeValue: e.target.value })}
            />
          </EnvField>
        ) : null}

        <EnvField label="Analysis mask">
          <div className="si-ai-detect-env__mask-row">
            <select
              className="si-ai-detect-env__input si-ai-detect-env__input--select"
              value={environment.maskLayerId}
              onChange={e => patchEnvironment({ maskLayerId: e.target.value })}
            >
              <option value="">None</option>
              {imageryOptions.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="si-ai-detect-env__icon-btn"
              title="Clear mask"
              aria-label="Clear mask"
              onClick={() => patchEnvironment({ maskLayerId: '' })}
            >
              <i className="fa-solid fa-eraser" aria-hidden />
            </button>
          </div>
        </EnvField>

        <EnvField label="Tile size (px)" htmlFor="si-ai-tilesize">
          <input
            id="si-ai-tilesize"
            type="number"
            className="si-ai-detect-env__input"
            min={128}
            max={2048}
            step={64}
            value={environment.tileSize}
            onChange={e => patchEnvironment({ tileSize: Math.max(128, Number(e.target.value) || 512) })}
          />
        </EnvField>
      </EnvSection>
    </div>
  )
}
